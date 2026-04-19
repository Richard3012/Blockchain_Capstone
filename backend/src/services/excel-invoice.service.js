// Structured Excel invoice parser. Reads a workbook, finds a header row by
// keyword matching (Description/Item/Qty/Price/Amount/HSN/GST), and maps the
// rows underneath into BlockERP's lineItems[] shape. Falls back to nothing —
// callers should send the raw text to the LLM if no header row is detected.
//
// Returns { lineItems, vendorName?, gstin?, invoiceNumber?, totalAmount?, headerRowIndex }
// or null when no usable header row is found.

import { createRequire } from 'node:module'

import { logger } from '../utils/logger.js'

const require = createRequire(import.meta.url)
let XLSX
try { XLSX = require('xlsx') } catch { XLSX = null }

const HEADER_PATTERNS = {
  description: /^(description|item|particular|product|name|details)$/i,
  hsn: /^(hsn|sac|hsn[\s/]?sac|hsn code)$/i,
  quantity: /^(qty|quantity|nos|count|units?)$/i,
  unitPrice: /^(rate|price|unit\s*price|mrp)$/i,
  amount: /^(amount|total|line\s*total|value)$/i,
  taxableValue: /^(taxable|taxable\s*value|net)$/i,
  gstRate: /^(gst|gst\s*%|tax\s*%|tax\s*rate)$/i,
  tax: /^(tax|gst\s*amount|igst|cgst|sgst)$/i,
}

const META_PATTERNS = {
  vendorName: /^(vendor|seller|supplier|from|billed?\s*by)/i,
  gstin: /^(gstin|gst\s*no|gst\s*number)/i,
  invoiceNumber: /^(invoice|inv|invoice\s*no|bill\s*no)/i,
  totalAmount: /^(grand\s*total|total\s*amount|invoice\s*total|net\s*payable)/i,
}

const matchColumn = (header) => {
  const norm = String(header || '').trim().replace(/[:\-_]/g, ' ').replace(/\s+/g, ' ')
  for (const [field, re] of Object.entries(HEADER_PATTERNS)) {
    if (re.test(norm)) return field
  }
  return null
}

const findHeaderRow = (rows) => {
  // Scan first 15 rows for a row containing ≥3 known column keywords.
  const limit = Math.min(rows.length, 15)
  for (let i = 0; i < limit; i++) {
    const row = rows[i] || []
    const matches = row.map(matchColumn).filter(Boolean)
    const unique = new Set(matches)
    if (unique.has('description') && unique.size >= 3) {
      return { index: i, columns: row.map(matchColumn) }
    }
  }
  return null
}

const extractMeta = (rows, headerIdx) => {
  const meta = {}
  const limit = Math.min(headerIdx, 30)
  for (let i = 0; i < limit; i++) {
    const row = rows[i] || []
    for (let c = 0; c < row.length - 1; c++) {
      const label = String(row[c] || '').trim()
      const value = String(row[c + 1] ?? '').trim()
      if (!label || !value) continue
      for (const [field, re] of Object.entries(META_PATTERNS)) {
        if (re.test(label) && !meta[field]) {
          meta[field] = field === 'totalAmount' ? Number(String(value).replace(/[^\d.-]/g, '')) || 0 : value
        }
      }
    }
  }
  return meta
}

const toNumber = (v) => {
  if (typeof v === 'number') return v
  if (!v) return 0
  const cleaned = String(v).replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export const excelInvoiceService = {
  isAvailable() { return Boolean(XLSX) },

  /**
   * Parse a workbook buffer into structured invoice data.
   * Returns null when no recognizable header row is present.
   */
  parseInvoiceWorkbook(buffer) {
    if (!XLSX) return null
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false })
      const header = findHeaderRow(rows)
      if (!header) continue
      const meta = extractMeta(rows, header.index)
      const lineItems = []
      for (let i = header.index + 1; i < rows.length; i++) {
        const row = rows[i] || []
        const item = {}
        let nonEmpty = 0
        header.columns.forEach((field, c) => {
          if (!field) return
          const raw = row[c]
          if (raw === null || raw === undefined || raw === '') return
          if (['quantity', 'unitPrice', 'amount', 'taxableValue', 'gstRate', 'tax'].includes(field)) {
            item[field] = toNumber(raw)
          } else {
            item[field] = String(raw).trim()
          }
          nonEmpty++
        })
        if (!nonEmpty || !item.description) continue
        if (!item.amount && item.quantity && item.unitPrice) {
          item.amount = Math.round(item.quantity * item.unitPrice * 100) / 100
        }
        item.sno = lineItems.length + 1
        lineItems.push(item)
      }
      logger.info('excel_invoice.parsed', {
        sheet: sheetName, headerRow: header.index, lineItems: lineItems.length, meta: Object.keys(meta).length,
      })
      if (!lineItems.length) continue
      const subtotal = lineItems.reduce((s, it) => s + (it.taxableValue || it.amount || 0), 0)
      const taxAmount = lineItems.reduce((s, it) => s + (it.tax || 0), 0)
      return {
        lineItems,
        vendorName: meta.vendorName || null,
        gstin: meta.gstin || null,
        invoiceNumber: meta.invoiceNumber || null,
        totalAmount: meta.totalAmount || Math.round((subtotal + taxAmount) * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        sourceSheet: sheetName,
        headerRowIndex: header.index,
        provider: 'excel_structured',
      }
    }
    return null
  },
}
