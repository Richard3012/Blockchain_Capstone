import { Invoice } from '../models/invoice.model.js'
import { logger } from '../utils/logger.js'

/* ─── GSTIN Validation ──────────────────────────────────────────────── */

// GSTIN format: 2-digit state + 10-char PAN + 1 entity + Z + check digit
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/

// Weights for GSTIN checksum — ISO/IEC 7064 Mod 36,2
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function gstinChecksum(gstin) {
  if (!gstin || gstin.length !== 15) return false
  const upper = gstin.toUpperCase()
  if (!GSTIN_RE.test(upper)) return false

  // ISO/IEC 7064 Mod 36,2 check digit calculation
  let p = 36
  for (let i = 0; i < 14; i++) {
    const idx = GSTIN_CHARS.indexOf(upper[i])
    if (idx < 0) return false
    let a = (idx + p) % 36
    if (a === 0) a = 36
    p = (a * 2) % 37
  }
  const expected = GSTIN_CHARS[(36 + 1 - p) % 36]
  return upper[14] === expected
}

/* ─── Main service ──────────────────────────────────────────────────── */

export const invoiceValidationService = {
  /**
   * Run all validations on a parsed invoice object.
   * Returns { valid, errors[], warnings[] }.
   */
  async validate(parsed, companyId) {
    const errors = []
    const warnings = []

    // 1. GSTIN — just note if missing; skip checksum, extract only
    if (!parsed.gstin) {
      warnings.push({ field: 'gstin', message: 'GSTIN not detected' })
    }

    // 2. Required fields
    if (!parsed.vendorName) warnings.push({ field: 'vendorName', message: 'Vendor name not detected' })
    if (!parsed.invoiceNumber) warnings.push({ field: 'invoiceNumber', message: 'Invoice number not detected — will be auto-generated' })
    if (!parsed.invoiceDate) warnings.push({ field: 'invoiceDate', message: 'Invoice date not detected' })
    if (!parsed.totalAmount || parsed.totalAmount <= 0) {
      warnings.push({ field: 'totalAmount', message: 'Total amount missing or zero' })
    }

    // 3. Arithmetic validation — line items should sum to subtotal / grand total
    if (parsed.lineItems?.length > 0 && parsed.totalAmount > 0) {
      const lineSum = parsed.lineItems.reduce((s, item) => s + (item.amount || 0), 0)

      // Check against subtotal (pre-tax)
      if (parsed.subtotal > 0 && Math.abs(lineSum - parsed.subtotal) > 1) {
        warnings.push({
          field: 'subtotal',
          message: `Line items sum (₹${lineSum.toFixed(2)}) differs from subtotal (₹${parsed.subtotal.toFixed(2)})`,
        })
      }

      // Check against grand total (with tax)
      const expectedGrand = lineSum + (parsed.taxAmount || 0)
      if (Math.abs(expectedGrand - parsed.totalAmount) > 1) {
        warnings.push({
          field: 'totalAmount',
          message: `Computed total (₹${expectedGrand.toFixed(2)}) differs from extracted total (₹${parsed.totalAmount.toFixed(2)})`,
        })
      }
    }

    // 4. Tax sanity check
    if (parsed.taxAmount && parsed.subtotal && parsed.subtotal > 0) {
      const taxPct = (parsed.taxAmount / parsed.subtotal) * 100
      if (taxPct > 30) {
        warnings.push({ field: 'taxAmount', message: `Tax looks unusually high at ${taxPct.toFixed(1)}%` })
      }
    }

    // 5. Duplicate detection — same invoice_number + vendor
    if (parsed.invoiceNumber && companyId) {
      try {
        const dup = await Invoice.findOne({
          companyId,
          invoiceNumber: parsed.invoiceNumber,
          'metadata.vendorName': parsed.vendorName || undefined,
        }).lean()

        if (dup) {
          errors.push({
            field: 'invoiceNumber',
            message: `Duplicate invoice: ${parsed.invoiceNumber} already exists (ID: ${dup._id})`,
            existingId: dup._id.toString(),
          })
        }
      } catch (e) {
        logger.warn('invoice_validation.duplicate_check_failed', { error: e.message })
      }
    }

    const valid = errors.length === 0

    return { valid, errors, warnings }
  },
}
