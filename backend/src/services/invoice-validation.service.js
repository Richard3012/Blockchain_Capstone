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

/* ─── Confidence thresholds ─────────────────────────────────────────── */
const CRITICAL_CONFIDENCE_THRESHOLD = 0.85 // Critical fields must exceed this to auto-accept
const WARNING_CONFIDENCE_THRESHOLD = 0.5   // Below this → hard block
const CRITICAL_FIELDS = ['vendorName', 'invoiceNumber', 'totalAmount', 'gstin']

/* ─── Main service ──────────────────────────────────────────────────── */

export const invoiceValidationService = {
  /**
   * Run all validations on a parsed invoice object.
   * Returns { valid, errors[], warnings[], canPost }.
   * canPost = false when critical fields fail or hard errors exist.
   */
  async validate(parsed, companyId, options = {}) {
    const errors = []
    const warnings = []
    const autoResolutions = options.autoResolutions || {}

    // 1. Required fields — critical fields are hard errors (BLOCKING)
    if (!parsed.vendorName) {
      errors.push({ field: 'vendorName', message: 'Vendor name is required — cannot post without vendor identification' })
    }
    if (!parsed.invoiceDate) {
      errors.push({ field: 'invoiceDate', message: 'Invoice date is required — cannot post undated invoices' })
    }
    if (!parsed.totalAmount || parsed.totalAmount <= 0) {
      errors.push({ field: 'totalAmount', message: 'Total amount is required and must be > 0' })
    }
    if (!parsed.invoiceNumber) {
      warnings.push({ field: 'invoiceNumber', message: 'Invoice number not detected — will be auto-generated' })
    }

    // 2. GSTIN — validate format + checksum if present; BLOCK if missing
    if (parsed.gstin) {
      const upper = parsed.gstin.toUpperCase()
      if (!GSTIN_RE.test(upper)) {
        errors.push({ field: 'gstin', message: `Invalid GSTIN format: ${parsed.gstin} — correct or remove` })
      } else if (!gstinChecksum(upper)) {
        warnings.push({ field: 'gstin', message: 'GSTIN checksum invalid — verify manually' })
      }
    } else {
      errors.push({ field: 'gstin', message: 'GSTIN not detected — required for GST compliance. Enter manually or verify vendor.' })
    }

    // 3. Line items structural validation (BLOCKING for invalid structures)
    if (!parsed.lineItems || parsed.lineItems.length === 0) {
      warnings.push({ field: 'lineItems', message: 'No line items detected — add manually or verify total' })
    } else {
      // Check for structurally invalid line items
      const invalidItems = parsed.lineItems.filter((it) => {
        const qty = typeof it.quantity === 'number' ? it.quantity : 0
        const price = typeof it.unitPrice === 'number' ? it.unitPrice : 0
        const amt = typeof it.amount === 'number' ? it.amount : 0
        // Invalid: qty=0 or unitPrice=0 with non-zero amount
        return (qty <= 0 || price <= 0) && amt > 0
      })
      if (invalidItems.length > 0) {
        errors.push({
          field: 'lineItems',
          message: `${invalidItems.length} line item(s) have qty=0 or unit price=0 with non-zero amount — correct before posting`,
        })
      }

      // Check for completely empty items
      const emptyItems = parsed.lineItems.filter((it) => !it.description && (!it.amount || it.amount <= 0))
      if (emptyItems.length > 0) {
        warnings.push({
          field: 'lineItems',
          message: `${emptyItems.length} line item(s) are empty — remove or fill in details`,
        })
      }
    }

    // 4. Arithmetic validation — structural + mathematical correctness
    if (parsed.lineItems?.length > 0 && parsed.totalAmount > 0) {
      const lineSum = parsed.lineItems.reduce((s, item) => s + (item.amount || 0), 0)

      // Check against subtotal (pre-tax) — warn on mismatches (intelligence layer handles correction)
      if (parsed.subtotal > 0 && Math.abs(lineSum - parsed.subtotal) > 1) {
        const diffPct = Math.abs(lineSum - parsed.subtotal) / Math.max(parsed.subtotal, 1) * 100
        warnings.push({
          field: 'subtotal',
          message: `Line items sum (₹${lineSum.toFixed(2)}) differs from subtotal (₹${parsed.subtotal.toFixed(2)}) by ${diffPct.toFixed(1)}%`,
        })
      }

      // Check against grand total (with tax) — warn on mismatches (intelligence layer recalculates)
      const expectedGrand = lineSum + (parsed.taxAmount || 0)
      if (Math.abs(expectedGrand - parsed.totalAmount) > 1) {
        const diffPct = Math.abs(expectedGrand - parsed.totalAmount) / Math.max(parsed.totalAmount, 1) * 100
        warnings.push({
          field: 'totalAmount',
          message: `Computed total (₹${expectedGrand.toFixed(2)}) differs from extracted total (₹${parsed.totalAmount.toFixed(2)}) by ${diffPct.toFixed(1)}%`,
        })
      }
    }

    // 5. Tax sanity check — block unusually high tax rates
    if (parsed.taxAmount && parsed.subtotal && parsed.subtotal > 0) {
      const taxPct = (parsed.taxAmount / parsed.subtotal) * 100
      if (taxPct > 30) {
        errors.push({ field: 'taxAmount', message: `Tax rate is ${taxPct.toFixed(1)}% — exceeds maximum standard GST rate of 28%. Verify and correct.` })
      } else if (taxPct > 0 && ![0, 5, 12, 18, 28].some((r) => Math.abs(taxPct - r) < 2)) {
        warnings.push({ field: 'taxAmount', message: `Tax rate ~${taxPct.toFixed(1)}% doesn't match standard GST rates (5/12/18/28%)` })
      }
    }

    // 6. Confidence-based enforcement — strict gating (skip auto-resolved fields)
    if (parsed.fieldConfidence) {
      const hardBlockFields = []
      const reviewFields = []
      for (const field of CRITICAL_FIELDS) {
        const fc = parsed.fieldConfidence[field]
        // Skip confidence blocking for auto-resolved fields
        if (fc?.autoResolved || autoResolutions[field]?.resolved) continue
        if (fc && fc.confidence < WARNING_CONFIDENCE_THRESHOLD) {
          hardBlockFields.push(`${field} (${Math.round(fc.confidence * 100)}%)`)
        } else if (fc && fc.confidence < CRITICAL_CONFIDENCE_THRESHOLD) {
          reviewFields.push(`${field} (${Math.round(fc.confidence * 100)}%)`)
        }
      }
      if (hardBlockFields.length > 0) {
        errors.push({
          field: 'confidence',
          message: `AI confidence critically low on: ${hardBlockFields.join(', ')}. Manual verification required before posting.`,
        })
      }
      if (reviewFields.length > 0) {
        warnings.push({
          field: 'confidence',
          message: `AI confidence below 85% on: ${reviewFields.join(', ')}. Review recommended.`,
        })
      }
    }

    // 7. Duplicate detection — same invoice_number + vendor
    if (parsed.invoiceNumber && companyId) {
      try {
        const dupFilter = { companyId, invoiceNumber: parsed.invoiceNumber }
        if (parsed.vendorName) {
          dupFilter['metadata.vendorName'] = parsed.vendorName
        }
        const dup = await Invoice.findOne(dupFilter).lean()

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

    // 8. Date sanity — don't allow future dates far out or very old
    if (parsed.invoiceDate) {
      const dateStr = parsed.invoiceDate
      const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
      if (dateMatch) {
        let [, d, mo, y] = dateMatch
        if (y.length === 2) y = '20' + y
        const invoiceDate = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
        const now = new Date()
        const daysDiff = (invoiceDate - now) / (1000 * 60 * 60 * 24)
        if (daysDiff > 30) {
          warnings.push({ field: 'invoiceDate', message: `Invoice date is ${Math.round(daysDiff)} days in the future` })
        }
        if (daysDiff < -365) {
          warnings.push({ field: 'invoiceDate', message: 'Invoice date is over 1 year old' })
        }
      }
    }

    const valid = errors.length === 0
    const canPost = valid

    return { valid, errors, warnings, canPost }
  },
}
