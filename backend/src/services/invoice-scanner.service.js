import crypto from 'crypto'

import { Invoice } from '../models/invoice.model.js'
import { ScannedInvoice } from '../models/scanned-invoice.model.js'
import { Product } from '../models/product.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { Supplier } from '../models/supplier.model.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { blockchainService } from './blockchain.service.js'
import { accountingService } from './accounting.service.js'
import { invoiceValidationService } from './invoice-validation.service.js'
import { ocrIntelligenceService } from './ocr-intelligence.service.js'
import { confidenceScoringService } from './ocr-confidence.service.js'
import { vendorLearningService } from './ocr-vendor-learning.service.js'
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

  // Try YYYY-MM-DD (ISO)
  const m3 = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m3) {
    const date = new Date(`${m3[1]}-${m3[2].padStart(2, '0')}-${m3[3].padStart(2, '0')}`)
    if (!isNaN(date.getTime())) return date
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

/** Emit real-time stage update via Socket.IO */
function emitStage(io, companyId, scanId, stage, status, message) {
  if (!io) return
  io.emit(`scanner:stage`, { scanId, stage, status, message, timestamp: new Date() })
}

/* ─── Main Service ─────────────────────────────────────────────────── */

export const invoiceScannerService = {
  /**
   * Parse raw OCR text into structured fields with per-field confidence.
   * Enhanced with better post-processing and cross-field validation.
   */
  parseOCRText(rawText) {
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
    const text = rawText

    // GSTIN — match both strict and relaxed patterns
    // Standard: 2 digits + 5 alpha + 4 digits + 1 alpha + 1 alnum + Z + 1 alnum
    // Relaxed: 2 digits + 5 alphanumeric + 4 digits + 1 alpha + rest alphanumeric
    // Also match GSTINs with OCR degradation (mixed case, O/0 confusion)
    // GSTIN extraction: prefer the SELLER's GSTIN (usually the first one, often with ":")
    // Strategy: collect ALL candidate GSTINs, then pick the best one.
    const allGstinCandidates = []

    // Pass 1: labeled GSTINs with ":" separator ("GSTIN : 24HDE...") — seller style
    const labeledWithColon = /(?:gstin|gst\s*no|gst\s*in|gst\s*number)\s*:\s*([A-Z0-9]{15})/gi
    let lm
    while ((lm = labeledWithColon.exec(text)) !== null) {
      allGstinCandidates.push({ value: lm[1].toUpperCase(), priority: 1, index: lm.index })
    }

    // Pass 2: labeled GSTINs without ":" ("GSTIN 07A0L...") — could be buyer
    const labeledNoColon = /(?:gstin|gst\s*no|gst\s*in|gst\s*number)\s+([A-Z0-9]{15})/gi
    while ((lm = labeledNoColon.exec(text)) !== null) {
      const val = lm[1].toUpperCase()
      if (!allGstinCandidates.some((c) => c.value === val)) {
        allGstinCandidates.push({ value: val, priority: 2, index: lm.index })
      }
    }

    // Pass 3: strict standard format
    const strictRe = /\b(\d{2}[A-Za-z]{5}\d{4}[A-Za-z][\dA-Za-z][Zz][A-Za-z\d])\b/g
    while ((lm = strictRe.exec(text)) !== null) {
      const val = lm[1].toUpperCase()
      if (!allGstinCandidates.some((c) => c.value === val)) {
        allGstinCandidates.push({ value: val, priority: 3, index: lm.index })
      }
    }

    // Pass 4: any 15-char alphanumeric starting with valid state code
    const broadRe = /\b(\d{2}[A-Z0-9]{13})\b/g
    while ((lm = broadRe.exec(text)) !== null) {
      const val = lm[1].toUpperCase()
      if (!allGstinCandidates.some((c) => c.value === val)) {
        allGstinCandidates.push({ value: val, priority: 4, index: lm.index })
      }
    }

    // Filter: valid state code (01-37)
    const validCandidates = allGstinCandidates.filter((c) => {
      const sc = parseInt(c.value.substring(0, 2))
      return sc >= 1 && sc <= 37
    })

    // Pick best: highest priority (lowest number), then earliest in document
    validCandidates.sort((a, b) => a.priority - b.priority || a.index - b.index)
    let gstin = validCandidates.length > 0 ? validCandidates[0].value : null

    // Vendor name — smart extraction with multiple strategies
    // The SELLER name is usually the first prominent line in the document (letterhead),
    // NOT the buyer/customer info which appears later.
    let vendorName = null

    const skipPatterns = [
      /^\d{2}[\/-]/,                          // dates
      /gstin|invoice|tax\s*invoice|bill\s*of|proforma|purchase\s*order|delivery\s*note/i,
      /date|total|amount|qty|quantity|description|s\.?no|sr|sl|particulars/i,
      /^\d+\.?\s*$/,                          // just numbers
      /^[\d\s\-+().]+$/,                      // phone numbers
      /^\d{6}$/,                              // PIN codes
      /^(to|from|ship\s*to|bill\s*to|buyer|consignee|place\s*of)\s*[:\-]?$/i, // labels only
      /^(original|duplicate|triplicate)\s*(for|copy)?/i,
      /^page\s*\d/i,
      /^(e\.?\s*&?\s*o\.?\s*e|subject\s*to)/i,
      /^(m\/s|messrs?)\.?\s/i,               // M/S prefix = buyer reference
      /^customer\s*(detail|info)/i,           // buyer section header
      /^(address|phone|email|web|fax|tel)/i,  // contact info lines starting with these
      /\btel\s*[:\.]|\bphone\s*[:\.]|\bfax\s*[:\.]|\bemail\s*[:\.]|\bweb\s*[:\.]/i, // contact info ANYWHERE in line
      /manufacturing|supply|dealer|distributor|precision|component/i, // taglines
      /^\d+\s*[,.]\s*[A-Za-z]/,              // address: starts with number ("64, Akshay")
      /\b(estate|road|street|lane|market|nagar|colony|sector|block|floor|plot|near)\b/i, // address words
      /\b(ahmedabad|mumbai|delhi|chennai|kolkata|bangalore|hyderabad|pune)\b/i, // city names
      /\b\d{5,6}\b/,                          // PIN/ZIP codes embedded in text
    ]

    // Strategy 1: Look for explicit seller labels
    const sellerLabels = [
      /^(?:from|seller|vendor|supplier|sold\s*by|ship(?:ped)?\s*from|billed?\s*by)\s*[:\-]?\s*(.+)/i,
    ]
    for (const p of sellerLabels) {
      for (const l of lines) {
        const m = l.match(p)
        if (m && m[1].trim().length > 3) { vendorName = m[1].trim(); break }
      }
      if (vendorName) break
    }

    // Strategy 2: "For <CompanyName>" near the bottom (authorised signatory area)
    if (!vendorName) {
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
        const fm = lines[i].match(/^for\s+(.+?)\s*$/i)
        if (fm && fm[1].trim().length > 3 &&
            !/bank|account|branch|ifsc/i.test(fm[1])) {
          vendorName = fm[1].trim()
          break
        }
      }
    }

    // Strategy 3: First meaningful line — company letterhead
    if (!vendorName) {
      vendorName = lines.find((l) => {
        if (l.length <= 3) return false
        return !skipPatterns.some((p) => p.test(l))
      }) || null
    }

    // Strategy 4: Line immediately before the seller GSTIN
    if (!vendorName && gstin) {
      const gstinLineIdx = lines.findIndex((l) => l.includes(gstin))
      if (gstinLineIdx > 0) {
        for (let i = gstinLineIdx - 1; i >= Math.max(0, gstinLineIdx - 3); i--) {
          const candidate = lines[i]
          if (candidate.length > 3 &&
              !skipPatterns.some((p) => p.test(candidate)))
          {
            vendorName = candidate
            break
          }
        }
      }
    }

    // Clean vendor name: remove trailing GSTIN, phone numbers, etc.
    if (vendorName) {
      vendorName = vendorName
        .replace(/\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]/g, '')  // GSTIN
        .replace(/\b\d{10,}\b/g, '')                             // long numbers
        .replace(/[|]/g, '')                                     // OCR artifacts
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (vendorName.length <= 2) vendorName = null
    }

    // Invoice number — multiple patterns (expanded for OCR variations)
    const invPatterns = [
      /invoice\s*(?:no|number|#|num)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /inv[.\-]?\s*#?\s*:?\s*([A-Z0-9\-\/]+)/i,
      /proforma\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /bill\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /receipt\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /voucher\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
      /challan\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    ]
    let invoiceNumber = null
    for (const p of invPatterns) {
      const m = text.match(p)
      if (m) { invoiceNumber = m[1]; break }
    }

    // Date — multiple formats (expanded for OCR variations)
    const datePatterns = [
      /(?:date|dated|dt|invoice\s*date|proforma\s*date|bill\s*date|challan\s*date)\s*[:\-]?\s*(\d{1,2}[\/-]\w+[\/-]\d{2,4})/i,
      /(?:date|dated|dt|invoice\s*date|proforma\s*date)\s*[:\-]?\s*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[,.]?\s*\d{2,4})/i,
      /(?:date|dated|dt|invoice\s*date|proforma\s*date)\s*[:\-]?\s*(\d{4}-\d{1,2}-\d{1,2})/i,
      /(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4})/i,
      /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
    ]
    let invoiceDate = null
    for (const p of datePatterns) {
      const m = text.match(p)
      if (m) { invoiceDate = m[1]; break }
    }

    // Amounts
    const totalPatterns = [
      /(?:grand\s*total|total\s*amount\s*after\s*tax|total\s*amount|amount\s*due|net\s*payable|invoice\s*total|amount\s*payable)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:total\s*after\s*tax)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?<!sub)(?<!taxable\s)total\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
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

    // ── HSN Guard: detect when regex misidentified HSN codes as quantities ──
    // HSN codes are 4-8 digit integers (≥1000). If any "quantity" looks like
    // an HSN code, the regex produced garbage → clear items and let the
    // table reconstruction engine handle line items instead.
    const hasHSNasQty = lineItems.some((it) => {
      const qStr = String(it.quantity)
      return /^\d{4,8}$/.test(qStr) && it.quantity >= 1000
    })

    // ── Multi-column table guard: if the raw text has a header row with
    // HSN/SAC/Taxable/IGST columns, the simple 3-5 group regex cannot
    // correctly parse it. Clear items and let table reconstruction handle it.
    const hasTableHeader = /\b(hsn|sac)\b/i.test(text) &&
      /\b(taxable|igst|cgst|sgst|gst\s*%)\b/i.test(text) &&
      /\b(qty|quantity|rate|price|amount|total)\b/i.test(text)

    if (hasHSNasQty || hasTableHeader) {
      lineItems.length = 0 // clear — table reconstruction will rebuild
    }

    // ── Post-processing: cross-field inference ──────────
    // If subtotal is 0 but we have line items, compute from them
    if (!subtotal && lineItems.length > 0) {
      subtotal = Math.round(lineItems.reduce((s, it) => s + (it.amount || 0), 0) * 100) / 100
    }

    // If taxAmount is 0 but we have subtotal and total, derive it
    if (!taxAmount && subtotal > 0 && totalAmount > subtotal) {
      taxAmount = Math.round((totalAmount - subtotal) * 100) / 100
    }

    // If subtotal is 0 but we have total and tax, derive it
    if (!subtotal && totalAmount > 0 && taxAmount > 0) {
      subtotal = Math.round((totalAmount - taxAmount) * 100) / 100
    }

    // Auto-calculate line item tax if we know the overall tax rate
    if (lineItems.length > 0 && taxAmount > 0 && subtotal > 0) {
      const taxRate = taxAmount / subtotal
      for (const item of lineItems) {
        if (item.tax === 0 && item.amount > 0) {
          item.tax = Math.round(item.amount * taxRate * 100) / 100
        }
      }
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
      avgConfidence,
      fieldConfidence: fields,
    }
  },

  /**
   * Create a scan history record.
   */
  async createScanRecord(companyId, { fileName, fileType, fileSize, inputMode, rawText, createdBy }) {
    const stages = ['upload', 'preprocess', 'extract', 'correct', 'validate', 'map', 'post', 'blockchain'].map((s) => ({
      stage: s,
      status: 'pending',
    }))

    return ScannedInvoice.create({
      companyId,
      status: 'pending',
      fileName,
      fileType,
      fileSize,
      inputMode: inputMode || 'file',
      rawText,
      createdBy,
      pipelineStages: stages,
    })
  },

  /**
   * Update a pipeline stage on a scan record and emit via Socket.IO.
   */
  async updateScanStage(scan, stage, status, message, io) {
    const stageEntry = scan.pipelineStages.find((s) => s.stage === stage)
    if (stageEntry) {
      stageEntry.status = status
      stageEntry.message = message || ''
      if (status === 'active') stageEntry.startedAt = new Date()
      if (['success', 'error', 'warning'].includes(status)) stageEntry.completedAt = new Date()
    }
    await scan.save()
    emitStage(io, scan.companyId, scan._id, stage, status, message)
  },

  /**
   * Full pipeline: parse → validate → create invoice → inventory → ledger → blockchain.
   * Now with scan history tracking & Socket.IO real-time updates.
   */
  async processScannedInvoice(companyId, {
    rawText,
    parsedOverrides,
    customer,
    store,
    createdBy,
    idempotencyKey,
    scanId,
    io,
  }) {
    const startTime = Date.now()

    // Get or create scan record
    let scan = null
    if (scanId) {
      scan = await ScannedInvoice.findById(scanId)
    }
    if (!scan) {
      scan = await this.createScanRecord(companyId, { rawText, createdBy })
    }

    try {
      // ── Idempotency check ─────────────────────────────
      const idemKey = idempotencyKey || crypto.createHash('md5').update(rawText + companyId).digest('hex')
      const existing = await Invoice.findOne({ companyId, 'metadata.idempotencyKey': idemKey }).lean()
      if (existing) {
        logger.info('invoice_scanner.idempotent_hit', { invoiceId: existing._id })
        scan.status = 'processed'
        scan.invoiceId = existing._id
        scan.processedAt = new Date()
        scan.processingDurationMs = Date.now() - startTime
        await scan.save()
        return {
          parsed: existing.metadata,
          invoice: existing,
          blockchainRecord: null,
          validation: { valid: true, errors: [], warnings: [{ field: 'idempotency', message: 'Duplicate submission — returning existing invoice' }], canPost: true },
          inventoryUpdates: [],
          duplicate: true,
          scanId: scan._id,
        }
      }

      // ── Stage: Extract ──────────────────────────────────
      await this.updateScanStage(scan, 'upload', 'success', 'Document received', io)
      await this.updateScanStage(scan, 'preprocess', 'success', 'Pre-processing complete', io)
      await this.updateScanStage(scan, 'extract', 'active', 'Extracting data...', io)
      scan.status = 'extracting'
      await scan.save()

      let parsed = this.parseOCRText(rawText)

      // Save raw parsed data before corrections
      scan.ocrParsedData = {
        vendorName: parsed.vendorName,
        gstin: parsed.gstin,
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        subtotal: parsed.subtotal,
        taxAmount: parsed.taxAmount,
        totalAmount: parsed.totalAmount,
        lineItems: parsed.lineItems,
        rawLineCount: parsed.rawLineCount,
      }
      scan.ocrRawText = rawText

      // Apply user corrections from the review screen
      if (parsedOverrides && typeof parsedOverrides === 'object') {
        scan.correctedData = parsedOverrides
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
            hsn: it.hsn || '',
            gstRate: parseNum(it.gstRate),
            cgst: parseNum(it.cgst),
            sgst: parseNum(it.sgst),
            igst: parseNum(it.igst),
          }))
        }
      }

      // Auto-fill missing fields before validation
      if (!parsed.invoiceNumber) {
        parsed.invoiceNumber = `SCN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
      }

      await this.updateScanStage(scan, 'extract', 'success', `Extracted ${Object.keys(parsed.fieldConfidence || {}).length} fields`, io)

      // ── Stage: Correct (Intelligence Layer) ─────────────
      await this.updateScanStage(scan, 'correct', 'active', 'Running AI correction layers...', io)
      scan.status = 'correcting'
      await scan.save()

      try {
        // Apply vendor template hints
        const template = await vendorLearningService.findTemplate(companyId, {
          vendorName: parsed.vendorName,
          gstin: parsed.gstin,
        })
        if (template) {
          const { parsed: hinted, hints } = vendorLearningService.applyTemplate(parsed, template)
          parsed = hinted
          scan.vendorTemplateId = template._id
          scan.vendorHints = hints
        }

        // Run OCR intelligence: self-healing + line item reconstruction + financial consistency
        const intelligence = await ocrIntelligenceService.correctAndValidate(parsed, rawText, companyId, {
          ocrVariantResults: scan.ocrVariantResults || [],
        })
        parsed = intelligence.corrected
        scan.ocrCorrections = intelligence.corrections
        scan.financialFlags = intelligence.flags
        scan.financiallyConsistent = intelligence.consistent
        scan.duplicates = intelligence.duplicates

        // Confidence Scoring 2.0 — with auto-resolution boost + table reconstruction meta
        const autoResolutions = intelligence.autoResolutions || {}
        const scoring = confidenceScoringService.score(parsed, {
          financialConsistent: intelligence.consistent,
          autoResolutions,
          tableReconstructionMeta: intelligence.tableReconstructionMeta || null,
        })
        parsed.fieldConfidence = scoring.fieldScores
        parsed.avgConfidence = scoring.compositeScore
        parsed.confidence = scoring.overallLevel
        scan.confidenceBreakdown = scoring.breakdown

        const corrCount = intelligence.corrections.length
        const flagCount = intelligence.flags.length
        await this.updateScanStage(scan, 'correct',
          flagCount > 0 ? 'warning' : 'success',
          `${corrCount} correction(s) applied${flagCount > 0 ? `, ${flagCount} flag(s)` : ''}`, io)
      } catch (e) {
        logger.warn('invoice_scanner.intelligence_layer_failed', { error: e.message })
        await this.updateScanStage(scan, 'correct', 'warning', 'Intelligence layer partially failed', io)
      }

      // Save extracted data to scan record
      scan.extractedData = {
        vendorName: parsed.vendorName,
        gstin: parsed.gstin,
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        subtotal: parsed.subtotal,
        taxAmount: parsed.taxAmount,
        totalAmount: parsed.totalAmount,
        lineItems: parsed.lineItems,
        rawLineCount: parsed.rawLineCount,
      }
      scan.confidence = parsed.confidence
      scan.avgConfidence = parsed.avgConfidence || 0
      scan.fieldConfidence = parsed.fieldConfidence
      scan.status = 'extracted'
      await scan.save()
      await this.updateScanStage(scan, 'extract', 'success', `Extracted ${Object.keys(parsed.fieldConfidence || {}).length} fields`, io)
      await this.updateScanStage(scan, 'validate', 'active', 'Validating...', io)
      scan.status = 'validating'
      await scan.save()

      const validation = await invoiceValidationService.validate(parsed, companyId, { autoResolutions })

      scan.validationErrors = validation.errors
      scan.validationWarnings = validation.warnings

      if (!validation.valid) {
        await this.updateScanStage(scan, 'validate', 'error', `${validation.errors.length} validation error(s)`, io)
        scan.status = 'failed'
        scan.lastError = validation.errors.map((e) => e.message).join('; ')
        scan.processingDurationMs = Date.now() - startTime
        await scan.save()
        return { parsed, invoice: null, blockchainRecord: null, validation, inventoryUpdates: [], duplicate: false, scanId: scan._id }
      }

      await this.updateScanStage(scan, 'validate', validation.warnings.length > 0 ? 'warning' : 'success',
        validation.warnings.length > 0 ? `${validation.warnings.length} warning(s)` : 'All checks passed', io)

      // ── Stage: Map to ERP ───────────────────────────────
      await this.updateScanStage(scan, 'map', 'active', 'Creating ERP records...', io)
      scan.status = 'posting'
      await scan.save()

      const invNumber = parsed.invoiceNumber
      const issueDate = normalizeDate(parsed.invoiceDate) || new Date()
      const dueDate = new Date(issueDate)
      dueDate.setDate(dueDate.getDate() + 30)

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
          scanId: scan._id,
          // Blockchain hash reproducibility fields
          ocrRawTextHash: crypto.createHash('sha256').update(rawText || '').digest('hex').slice(0, 16),
          correctionCount: scan.ocrCorrections?.length || 0,
          financiallyConsistent: scan.financiallyConsistent ?? true,
          confidenceLevel: parsed.confidence,
          userOverridesApplied: !!parsedOverrides,
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
          metadata: { confidence: parsed.confidence, lineItemCount: parsed.lineItems.length, scanId: scan._id },
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

      // ── Vendor matching / auto-create ───────────────────
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
          // Auto-create vendor if not found and we have enough data
          if (!matchedSupplier && parsed.vendorName) {
            try {
              const newSupplier = await Supplier.create({
                companyId,
                name: parsed.vendorName,
                taxId: parsed.gstin || undefined,
                isActive: true,
                code: `SUP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
                notes: `Auto-created from scanned invoice ${invNumber}`,
              })
              matchedSupplier = newSupplier.toObject()
              logger.info('invoice_scanner.vendor_auto_created', { supplierId: newSupplier._id, name: parsed.vendorName })
            } catch (e) {
              logger.warn('invoice_scanner.vendor_auto_create_failed', { error: e.message })
            }
          }
        } catch (e) {
          logger.warn('invoice_scanner.vendor_match_failed', { error: e.message })
        }
      }

      await this.updateScanStage(scan, 'map', 'success', 'ERP records created', io)

      // ── Stage: Post (ledger entry) ─────────────────────
      await this.updateScanStage(scan, 'post', 'active', 'Creating ledger entry...', io)

      let journalEntry = null
      try {
        const accounts = await accountingService.getAccounts(companyId)
        const findBy = (subType, fallbackCode) =>
          accounts.find((a) => a.subType === subType) || accounts.find((a) => a.code === fallbackCode)
        const apAccount = findBy('payable', '2000')
        const invAccount = findBy('inventory', '1200')
        const gstAccount = findBy('tax', '2100')
        const cogsAccount = findBy('cogs', '5000')
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

      await this.updateScanStage(scan, 'post', 'success', 'Ledger entry created', io)

      // ── Stage: Blockchain anchor ────────────────────────
      await this.updateScanStage(scan, 'blockchain', 'active', 'Anchoring on blockchain...', io)

      let blockchainRecord = null
      try {
        const recordHash = hashRecord({
          invoiceId: invoice._id.toString(),
          invoiceNumber: invNumber,
          totalAmount: parsed.totalAmount,
          taxAmount: parsed.taxAmount,
          gstin: parsed.gstin,
          lineItemCount: parsed.lineItems.length,
          // Enhanced blockchain integrity: include OCR pipeline data
          ocrRawTextHash: crypto.createHash('sha256').update(rawText || '').digest('hex').slice(0, 16),
          correctionCount: scan.ocrCorrections?.length || 0,
          financiallyConsistent: scan.financiallyConsistent,
          confidenceLevel: parsed.confidence,
          userOverridesApplied: !!parsedOverrides,
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

        scan.blockchainTxHash = blockchainRecord.txHash
        scan.blockchainRecordId = blockchainRecord._id
        await this.updateScanStage(scan, 'blockchain', 'success', `TX: ${blockchainRecord.txHash?.slice(0, 12)}...`, io)
      } catch (err) {
        logger.error('invoice_scanner.blockchain_failed', { invoiceId: invoice._id, error: err.message })
        await this.updateScanStage(scan, 'blockchain', 'warning', 'Blockchain anchor failed — invoice still created', io)
      }

      // ── Finalize scan record ────────────────────────────
      scan.status = 'processed'
      scan.invoiceId = invoice._id
      scan.processedAt = new Date()
      scan.processingDurationMs = Date.now() - startTime
      await scan.save()

      // ── Vendor learning: record this scan for template improvement ──
      try {
        const taxRate = parsed.subtotal > 0 ? (parsed.taxAmount / parsed.subtotal) * 100 : 0
        const invPrefix = parsed.invoiceNumber?.match(/^([A-Z]{2,}-)/)?.[1] || ''
        await vendorLearningService.recordScan(companyId, {
          vendorName: parsed.vendorName,
          gstin: parsed.gstin,
          confidence: parsed.avgConfidence,
          success: true,
          taxRate,
          lineItemCount: parsed.lineItems?.length || 0,
          invoiceNumberPrefix: invPrefix,
        })
      } catch (e) {
        logger.warn('invoice_scanner.vendor_learning_failed', { error: e.message })
      }

      // Emit completion event
      if (io) {
        io.emit('scanner:complete', {
          scanId: scan._id,
          invoiceId: invoice._id,
          invoiceNumber: invNumber,
          totalAmount: parsed.totalAmount,
          confidence: parsed.confidence,
        })
      }

      logger.info('invoice_scanner.processed', {
        invoiceId: invoice._id,
        scanId: scan._id,
        confidence: parsed.confidence,
        totalAmount: parsed.totalAmount,
        inventoryUpdates: inventoryUpdates.length,
        blockchainTx: blockchainRecord?.txHash,
        durationMs: Date.now() - startTime,
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
        scanId: scan._id,
      }
    } catch (err) {
      // Record failure in scan history
      if (scan) {
        scan.status = 'failed'
        scan.lastError = err.message
        scan.processingDurationMs = Date.now() - startTime
        await scan.save().catch(() => {})
        if (io) emitStage(io, companyId, scan._id, 'error', 'error', err.message)
      }
      throw err
    }
  },

  /**
   * Retry a previously failed scan.
   */
  async retryScan(companyId, scanId, { parsedOverrides, customer, store, createdBy, io }) {
    const original = await ScannedInvoice.findOne({ _id: scanId, companyId })
    if (!original) {
      const err = new Error('Scan record not found')
      err.statusCode = 404
      throw err
    }
    if (!['failed', 'rejected'].includes(original.status)) {
      const err = new Error('Only failed or rejected scans can be retried')
      err.statusCode = 400
      throw err
    }

    // Create new scan linked to parent
    const newScan = await this.createScanRecord(companyId, {
      fileName: original.fileName,
      fileType: original.fileType,
      fileSize: original.fileSize,
      inputMode: original.inputMode,
      rawText: original.rawText,
      createdBy,
    })
    newScan.parentScanId = original._id
    newScan.retryCount = (original.retryCount || 0) + 1
    await newScan.save()

    return this.processScannedInvoice(companyId, {
      rawText: original.rawText,
      parsedOverrides: parsedOverrides || original.correctedData,
      customer: customer || '000000000000000000000000',
      store: store || '000000000000000000000000',
      createdBy,
      scanId: newScan._id,
      io,
    })
  },

  /**
   * Reject a scan — mark as rejected in history.
   */
  async rejectScan(companyId, scanId, { reason, rejectedBy }) {
    const scan = await ScannedInvoice.findOne({ _id: scanId, companyId })
    if (!scan) {
      const err = new Error('Scan record not found')
      err.statusCode = 404
      throw err
    }
    scan.status = 'rejected'
    scan.lastError = reason || 'Rejected by user'
    scan.processedAt = new Date()
    await scan.save()

    try {
      await auditService.record({
        companyId,
        action: 'scan.rejected',
        entityType: 'scanned_invoice',
        entityId: scan._id,
        summary: `Scan rejected: ${reason || 'No reason provided'}`,
        actor: rejectedBy,
      })
    } catch (e) {
      logger.warn('invoice_scanner.reject_audit_failed', { error: e.message })
    }

    return scan
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

    const recomputedHash = hashRecord({
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      taxAmount: invoice.taxAmount,
      gstin: invoice.metadata?.gstin || invoice.gstin || '',
      lineItemCount: invoice.metadata?.lineItems?.length || invoice.lineItems?.length || 0,
      ocrRawTextHash: invoice.metadata?.ocrRawTextHash || '',
      correctionCount: invoice.metadata?.correctionCount || 0,
      financiallyConsistent: invoice.metadata?.financiallyConsistent ?? true,
      confidenceLevel: invoice.metadata?.confidenceLevel || 'high',
      userOverridesApplied: invoice.metadata?.userOverridesApplied ?? false,
    })

    const hashMatch = recomputedHash === invoice.hash

    let blockchainVerified = false
    try {
      const result = await blockchainService.verifyRecord('invoice', invoice.invoiceNumber, invoice.hash)
      blockchainVerified = result.verified
    } catch (e) {
      logger.warn('invoice_scanner.verify_blockchain_failed', { invoiceId, error: e.message })
    }

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
   * List scanned invoices for a company (from scan history).
   */
  async listScanned(companyId, { page = 1, limit = 20, status } = {}) {
    const filter = { companyId }
    if (status) filter.status = status
    const [docs, total] = await Promise.all([
      ScannedInvoice.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ScannedInvoice.countDocuments(filter),
    ])

    // Stats
    const [processed, failed, pending] = await Promise.all([
      ScannedInvoice.countDocuments({ companyId, status: 'processed' }),
      ScannedInvoice.countDocuments({ companyId, status: { $in: ['failed', 'rejected'] } }),
      ScannedInvoice.countDocuments({ companyId, status: { $in: ['pending', 'extracting', 'validating', 'posting'] } }),
    ])

    return {
      scans: docs,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: { processed, failed, pending, total },
    }
  },

  /**
   * Get a single scan record by ID.
   */
  async getScan(companyId, scanId) {
    const scan = await ScannedInvoice.findOne({ _id: scanId, companyId }).lean()
    if (!scan) {
      const err = new Error('Scan record not found')
      err.statusCode = 404
      throw err
    }
    return scan
  },
}
