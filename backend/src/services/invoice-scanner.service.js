import crypto from 'crypto'

import { Invoice } from '../models/invoice.model.js'
import { Product } from '../models/product.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { Supplier } from '../models/supplier.model.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { blockchainService } from './blockchain.service.js'
import { accountingService } from './accounting.service.js'
import { invoiceValidationService } from './invoice-validation.service.js'
import { auditService } from './audit.service.js'
import { logger } from '../utils/logger.js'
import { canonicalizeRecord, hashRecord } from '../utils/hash-record.js'

/* ─── Helpers ──────────────────────────────────────────────────────── */

function parseNum(s) {
  if (typeof s === 'number') return s
  if (!s) return 0
  return parseFloat(String(s).replace(/[₹,\s]/g, '')) || 0
}

function normalizeDate(raw) {
  if (!raw) return null

  // Try DD/MM/YYYY, DD-MM-YYYY
  const m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = '20' + y
    const date = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
    if (!isNaN(date.getTime())) return date
  }

  // Try "DD Mon YYYY" / "DD Month YYYY" (e.g. "15 Mar 2026", "15 March, 2026")
  const monthNames = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
  const m2 = raw.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s*(\d{2,4})/i)
  if (m2) {
    let [, d, mon, y] = m2
    if (y.length === 2) y = '20' + y
    const mo = monthNames[mon.toLowerCase().slice(0, 3)]
    if (mo) {
      const date = new Date(`${y}-${mo}-${d.padStart(2, '0')}`)
      if (!isNaN(date.getTime())) return date
    }
  }

  return null
}

function fieldConfidence(value, pattern) {
  if (!value) return { value: null, confidence: 0 }
  if (pattern && pattern.test(String(value))) return { value, confidence: 0.95 }
  return { value, confidence: 0.7 }
}

/** Simple fuzzy match: Dice coefficient on bigrams */
function similarity(a, b) {
  if (!a || !b) return 0
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const an = norm(a), bn = norm(b)
  if (an === bn) return 1
  if (an.length < 2 || bn.length < 2) return 0
  const bigrams = (s) => {
    const set = new Map()
    for (let i = 0; i < s.length - 1; i++) {
      const bi = s.slice(i, i + 2)
      set.set(bi, (set.get(bi) || 0) + 1)
    }
    return set
  }
  const aB = bigrams(an), bB = bigrams(bn)
  let intersection = 0
  for (const [bi, cnt] of aB) intersection += Math.min(cnt, bB.get(bi) || 0)
  return (2 * intersection) / (an.length - 1 + bn.length - 1)
}

/* ─── Main Service ─────────────────────────────────────────────────── */

export const invoiceScannerService = {
  /**
   * Parse raw OCR text into structured fields with per-field confidence.
   */
  parseOCRText(rawText) {
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
    const text = rawText

    // GSTIN — match both strict and OCR-degraded patterns
    const gstinMatch = text.match(/\b(\d{2}[A-Za-z]{5}\d{4}[A-Za-z][\dA-Za-z][Zz][A-Za-z\d])\b/)
    const gstin = gstinMatch ? gstinMatch[1].toUpperCase() : null

    // Vendor name — first meaningful line (skip headers, numbers, dates, common labels)
    const vendorLine = lines.find(
      (l) => l.length > 3 &&
        !/^\d{2}[\/-]/.test(l) &&
        !/gstin|invoice|tax|bill|date|total|amount|qty|quantity|description|s\.?no|sr|sl/i.test(l) &&
        !/^\d+\.?\s*$/.test(l),
    )
    const vendorName = vendorLine || null

    // Invoice number — multiple patterns (expanded for OCR variations)
    const invPatterns = [
      /invoice\s*(?:no|number|#|num)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /inv[.\-]?\s*#?\s*:?\s*([A-Z0-9\-\/]+)/i,
      /bill\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /receipt\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /voucher\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    ]
    let invoiceNumber = null
    for (const p of invPatterns) {
      const m = text.match(p)
      if (m) { invoiceNumber = m[1]; break }
    }

    // Date — multiple formats (expanded for OCR variations)
    const datePatterns = [
      /(?:date|dated|dt|invoice\s*date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
      /(?:date|dated|dt|invoice\s*date)\s*[:\-]?\s*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[,.]?\s*\d{2,4})/i,
      /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
    ]
    let invoiceDate = null
    for (const p of datePatterns) {
      const m = text.match(p)
      if (m) { invoiceDate = m[1]; break }
    }

    // Amounts
    const totalPatterns = [
      /(?:grand\s*total|total\s*amount|amount\s*due|net\s*payable|invoice\s*total)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:total)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ]
    const subtotalPatterns = [
      /(?:subtotal|sub[\s\-]*total|taxable\s*(?:value|amount))\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ]
    const taxPatterns = [
      /(?:total\s*tax|tax\s*amount|gst\s*amount)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:cgst|sgst|igst)\s*(?:@?\s*\d+%?)?\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ]

    let totalAmount = 0
    for (const p of totalPatterns) {
      const m = text.match(p)
      if (m) { totalAmount = parseNum(m[1]); break }
    }

    let subtotal = 0
    for (const p of subtotalPatterns) {
      const m = text.match(p)
      if (m) { subtotal = parseNum(m[1]); break }
    }

    // Sum all tax occurrences (CGST+SGST or single IGST)
    let taxAmount = 0
    for (const p of taxPatterns) {
      let tm
      while ((tm = p.exec(text)) !== null) {
        taxAmount += parseNum(tm[1])
      }
    }

    // Fallback: pick largest amount from currency symbols
    if (!totalAmount) {
      const curPattern = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi
      const amounts = []
      let cm
      while ((cm = curPattern.exec(text)) !== null) amounts.push(parseNum(cm[1]))
      if (amounts.length) totalAmount = Math.max(...amounts)
    }

    // Line items — numbered rows with qty & price
    const lineItems = []
    const itemPatterns = [
      // sno  description  qty  unit_price  amount
      /(\d+)\s+(.+?)\s+(\d+)\s+(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)/g,
      // sno  description  qty  amount
      /(\d+)\s+(.+?)\s+(\d+)\s+(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)/g,
    ]

    for (const p of itemPatterns) {
      let im
      while ((im = p.exec(text)) !== null) {
        const qty = parseInt(im[3])
        const amount = parseNum(im[im.length === 6 ? 5 : 4])
        const unitPrice = im.length === 6 ? parseNum(im[4]) : (qty > 0 ? amount / qty : 0)
        lineItems.push({
          sno: parseInt(im[1]),
          description: im[2].trim(),
          quantity: qty,
          unitPrice: Math.round(unitPrice * 100) / 100,
          tax: 0,
          amount: Math.round(amount * 100) / 100,
        })
      }
      if (lineItems.length) break // use first pattern that works
    }

    // Per-field confidence scores
    const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/
    const fields = {
      vendorName:    fieldConfidence(vendorName, /.{3,}/),
      gstin:         fieldConfidence(gstin, GSTIN_RE),
      invoiceNumber: fieldConfidence(invoiceNumber, /[A-Z0-9\-\/]{3,}/i),
      invoiceDate:   fieldConfidence(invoiceDate, /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/),
      subtotal:      fieldConfidence(subtotal || null, null),
      taxAmount:     fieldConfidence(taxAmount || null, null),
      totalAmount:   fieldConfidence(totalAmount || null, null),
    }

    const avgConfidence =
      Object.values(fields).reduce((s, f) => s + f.confidence, 0) / Object.keys(fields).length

    const overallConfidence =
      avgConfidence >= 0.7 ? 'high' : avgConfidence >= 0.4 ? 'medium' : 'low'

    return {
      vendorName,
      gstin,
      invoiceNumber,
      invoiceDate,
      subtotal,
      taxAmount,
      totalAmount,
      lineItems,
      rawLineCount: lines.length,
      confidence: overallConfidence,
      fieldConfidence: fields,
    }
  },

  /**
   * Full pipeline: parse → validate → create invoice → inventory → ledger → blockchain.
   * @param {string} companyId
   * @param {object} opts - { rawText, parsedOverrides, customer, store, createdBy, idempotencyKey }
   */
  async processScannedInvoice(companyId, {
    rawText,
    parsedOverrides,
    customer,
    store,
    createdBy,
    idempotencyKey,
  }) {
    // ── Idempotency check ─────────────────────────────
    const idemKey = idempotencyKey || crypto.createHash('md5').update(rawText + companyId).digest('hex')
    const existing = await Invoice.findOne({ companyId, 'metadata.idempotencyKey': idemKey }).lean()
    if (existing) {
      logger.info('invoice_scanner.idempotent_hit', { invoiceId: existing._id })
      return {
        parsed: existing.metadata,
        invoice: existing,
        blockchainRecord: null,
        validation: { valid: true, errors: [], warnings: [{ field: 'idempotency', message: 'Duplicate submission — returning existing invoice' }] },
        inventoryUpdates: [],
        duplicate: true,
      }
    }

    // ── Parse ─────────────────────────────────────────
    let parsed = this.parseOCRText(rawText)

    // Apply user corrections from the review screen
    if (parsedOverrides && typeof parsedOverrides === 'object') {
      for (const key of ['vendorName', 'gstin', 'invoiceNumber', 'invoiceDate', 'subtotal', 'taxAmount', 'totalAmount']) {
        if (parsedOverrides[key] !== undefined && parsedOverrides[key] !== null && parsedOverrides[key] !== '') {
          parsed[key] = typeof parsed[key] === 'number' ? parseNum(parsedOverrides[key]) : parsedOverrides[key]
        }
      }
      if (Array.isArray(parsedOverrides.lineItems)) {
        parsed.lineItems = parsedOverrides.lineItems.map((it) => ({
          sno: it.sno || 0,
          description: it.description || it.name || '',
          quantity: parseNum(it.quantity),
          unitPrice: parseNum(it.unitPrice || it.unit_price),
          tax: parseNum(it.tax),
          amount: parseNum(it.amount || it.total),
        }))
      }
    }

    // ── Auto-fill missing fields before validation ───
    if (!parsed.invoiceNumber) {
      parsed.invoiceNumber = `SCN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    }

    // ── Validate ──────────────────────────────────────
    const validation = await invoiceValidationService.validate(parsed, companyId)
    // If hard errors, return early so user can correct
    if (!validation.valid) {
      return { parsed, invoice: null, blockchainRecord: null, validation, inventoryUpdates: [], duplicate: false }
    }

    // ── Create invoice ────────────────────────────────
    const invNumber = parsed.invoiceNumber
    const issueDate = normalizeDate(parsed.invoiceDate) || new Date()
    const dueDate = new Date(issueDate)
    dueDate.setDate(dueDate.getDate() + 30) // Net-30 default

    const invoice = await Invoice.create({
      companyId,
      invoiceNumber: invNumber,
      customer,
      store,
      subtotal: parsed.subtotal || parsed.totalAmount,
      taxAmount: parsed.taxAmount,
      totalAmount: parsed.totalAmount,
      balanceDue: parsed.totalAmount,
      status: 'issued',
      issueDate,
      dueDate,
      createdBy,
      source: 'scanner',
      vendorName: parsed.vendorName || null,
      gstin: parsed.gstin || null,
      lineItems: parsed.lineItems || [],
      metadata: {
        scanned: true,
        idempotencyKey: idemKey,
        vendorName: parsed.vendorName,
        gstin: parsed.gstin,
        rawText,
        lineItems: parsed.lineItems,
        ocrConfidence: parsed.confidence,
        fieldConfidence: parsed.fieldConfidence,
        validationWarnings: validation.warnings,
      },
    })

    // ── Audit log ─────────────────────────────────────
    try {
      await auditService.record({
        companyId,
        action: 'invoice.scanned',
        entityType: 'invoice',
        entityId: invoice._id,
        summary: `Scanned invoice ${invNumber} from ${parsed.vendorName || 'unknown vendor'} — ₹${parsed.totalAmount}`,
        actor: createdBy,
        metadata: { confidence: parsed.confidence, lineItemCount: parsed.lineItems.length },
      })
    } catch (e) {
      logger.warn('invoice_scanner.audit_failed', { error: e.message })
    }

    // ── Inventory matching & stock-in ─────────────────
    const inventoryUpdates = []
    if (parsed.lineItems.length > 0) {
      try {
        const products = await Product.find({ companyId, isActive: true }).lean()

        for (const item of parsed.lineItems) {
          // Try exact SKU match, then fuzzy name match
          let product = products.find(
            (p) => p.sku && item.description.toUpperCase().includes(p.sku.toUpperCase()),
          )
          if (!product) {
            let bestScore = 0, bestProduct = null
            for (const p of products) {
              const score = similarity(item.description, p.name)
              if (score > bestScore) { bestScore = score; bestProduct = p }
            }
            if (bestScore >= 0.4) product = bestProduct
          }

          if (product && item.quantity > 0) {
            await Product.findByIdAndUpdate(product._id, { $inc: { currentStock: item.quantity } })

            const tx = await InventoryTransaction.create({
              companyId,
              transactionType: 'stock_in',
              product: product._id,
              store,
              quantity: item.quantity,
              unitCost: item.unitPrice || 0,
              referenceType: 'invoice',
              referenceId: invoice._id,
              notes: `Auto stock-in from scanned invoice ${invNumber}`,
              createdBy,
            })

            inventoryUpdates.push({
              productId: product._id,
              productName: product.name,
              sku: product.sku,
              quantity: item.quantity,
              matchScore: similarity(item.description, product.name),
              transactionId: tx._id,
            })
          }
        }
      } catch (e) {
        logger.warn('invoice_scanner.inventory_update_failed', { invoiceId: invoice._id, error: e.message })
      }
    }

    // ── Vendor matching ───────────────────────────────
    let matchedSupplier = null
    if (parsed.gstin || parsed.vendorName) {
      try {
        if (parsed.gstin) {
          matchedSupplier = await Supplier.findOne({ companyId, taxId: parsed.gstin }).lean()
        }
        if (!matchedSupplier && parsed.vendorName) {
          const suppliers = await Supplier.find({ companyId, isActive: true }).lean()
          let bestScore = 0
          for (const s of suppliers) {
            const score = similarity(parsed.vendorName, s.name)
            if (score > bestScore) { bestScore = score; matchedSupplier = s }
          }
          if (bestScore < 0.4) matchedSupplier = null
        }
      } catch (e) {
        logger.warn('invoice_scanner.vendor_match_failed', { error: e.message })
      }
    }

    // ── Accounts Payable ledger entry ─────────────────
    let journalEntry = null
    try {
      const accounts = await accountingService.getAccounts(companyId)
      const apAccount = accounts.find((a) => a.code === '2000')   // Accounts Payable
      const invAccount = accounts.find((a) => a.code === '1200')  // Inventory asset
      const gstAccount = accounts.find((a) => a.code === '2100')  // GST Payable
      const cogsAccount = accounts.find((a) => a.code === '5000') // COGS (fallback)
      const debitAccount = invAccount || cogsAccount

      if (apAccount && debitAccount && parsed.totalAmount > 0) {
        const jLines = []
        const debitAmt = parsed.taxAmount && gstAccount
          ? parsed.totalAmount - parsed.taxAmount
          : parsed.totalAmount

        jLines.push({ account: debitAccount._id, debit: debitAmt, credit: 0 })

        if (parsed.taxAmount && gstAccount) {
          jLines.push({ account: gstAccount._id, debit: parsed.taxAmount, credit: 0 })
        }

        jLines.push({ account: apAccount._id, debit: 0, credit: parsed.totalAmount })

        journalEntry = await accountingService.createJournalEntry(companyId, {
          description: `Purchase invoice ${invNumber} — ${parsed.vendorName || 'vendor'}${matchedSupplier ? ` (${matchedSupplier.code})` : ''}`,
          reference: invNumber,
          lines: jLines,
        }, createdBy)
      }
    } catch (err) {
      logger.warn('invoice_scanner.ledger_push_failed', { invoiceId: invoice._id, error: err.message })
    }

    // ── Blockchain anchor ─────────────────────────────
    let blockchainRecord = null
    try {
      const canonical = canonicalizeRecord({
        invoiceId: invoice._id.toString(),
        invoiceNumber: invNumber,
        totalAmount: parsed.totalAmount,
        taxAmount: parsed.taxAmount,
        gstin: parsed.gstin,
        lineItemCount: parsed.lineItems.length,
      })
      const recordHash = hashRecord({
        invoiceId: invoice._id.toString(),
        invoiceNumber: invNumber,
        totalAmount: parsed.totalAmount,
        taxAmount: parsed.taxAmount,
        gstin: parsed.gstin,
        lineItemCount: parsed.lineItems.length,
      })

      blockchainRecord = await blockchainService.anchorRecord({
        companyId,
        entityType: 'invoice',
        entityId: invNumber,
        recordHash,
        ipfsCid: '',
        requestedBy: createdBy,
      })

      invoice.hash = recordHash
      invoice.verificationStatus = blockchainRecord.txHash ? 'verified' : 'pending'
      await invoice.save()
    } catch (err) {
      logger.error('invoice_scanner.blockchain_failed', { invoiceId: invoice._id, error: err.message })
    }

    logger.info('invoice_scanner.processed', {
      invoiceId: invoice._id,
      confidence: parsed.confidence,
      totalAmount: parsed.totalAmount,
      inventoryUpdates: inventoryUpdates.length,
      blockchainTx: blockchainRecord?.txHash,
    })

    return {
      parsed,
      invoice,
      blockchainRecord,
      validation,
      journalEntry,
      inventoryUpdates,
      matchedSupplier: matchedSupplier ? { id: matchedSupplier._id, name: matchedSupplier.name, code: matchedSupplier.code } : null,
      duplicate: false,
    }
  },

  /**
   * Recompute hash for a stored invoice and verify against blockchain.
   */
  async verifyInvoice(companyId, invoiceId) {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId }).lean()
    if (!invoice) {
      const err = new Error('Invoice not found')
      err.statusCode = 404
      throw err
    }

    if (!invoice.hash) {
      return { verified: false, reason: 'No blockchain hash stored for this invoice', invoice }
    }

    // Recompute hash from current DB fields
    const recomputedHash = hashRecord({
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      taxAmount: invoice.taxAmount,
      gstin: invoice.metadata?.gstin,
      lineItemCount: invoice.metadata?.lineItems?.length || 0,
    })

    const hashMatch = recomputedHash === invoice.hash

    // Verify against blockchain
    let blockchainVerified = false
    try {
      const result = await blockchainService.verifyRecord('invoice', invoice.invoiceNumber, invoice.hash)
      blockchainVerified = result.verified
    } catch (e) {
      logger.warn('invoice_scanner.verify_blockchain_failed', { invoiceId, error: e.message })
    }

    // Get the blockchain record from DB for tx details
    const bcRecord = await BlockchainRecord.findOne({
      companyId,
      entityType: 'invoice',
      entityId: invoice.invoiceNumber,
    }).lean()

    return {
      verified: hashMatch && blockchainVerified,
      hashMatch,
      blockchainVerified,
      storedHash: invoice.hash,
      recomputedHash,
      txHash: bcRecord?.txHash,
      blockNumber: bcRecord?.blockNumber,
      anchoredAt: bcRecord?.anchoredAt,
      invoice,
    }
  },

  /**
   * List scanned invoices for a company.
   */
  async listScanned(companyId, { page = 1, limit = 20 } = {}) {
    const filter = { companyId, 'metadata.scanned': true }
    const [docs, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Invoice.countDocuments(filter),
    ])
    return { invoices: docs, total, page, pages: Math.ceil(total / limit) }
  },
}
