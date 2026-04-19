/**
 * Confidence Scoring 2.0
 * ──────────────────────
 * Replaces naive confidence with a weighted composite score:
 *   - OCR confidence (from Tesseract word-level data)
 *   - Pattern match confidence (regex/format validation)
 *   - Cross-validation confidence (inter-field consistency)
 *   - Financial consistency confidence
 *
 * Each field gets a breakdown. Final composite drives behavior:
 *   - ≥ 0.8  → auto-accept
 *   - 0.4–0.8 → highlight for review
 *   - < 0.4  → force manual review, block posting
 */

import { logger } from '../utils/logger.js'

/* ─── Weights for composite score ──────────────────────────────── */

const WEIGHTS = {
  ocr: 0.30,           // raw OCR engine confidence
  pattern: 0.30,       // format/regex validation
  crossValidation: 0.25, // inter-field consistency
  financial: 0.15,     // financial rules pass
}

/* ─── Pattern validators ──────────────────────────────────────── */

const PATTERNS = {
  vendorName: {
    test: (v) => v && v.length >= 3 && /[A-Za-z]/.test(v),
    weight: 1.0,
  },
  gstin: {
    test: (v) => v && /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/.test(v.toUpperCase()),
    weight: 1.0,
  },
  invoiceNumber: {
    test: (v) => v && /[A-Z0-9\-\/]{3,}/i.test(v) && v.length >= 3,
    weight: 1.0,
  },
  invoiceDate: {
    test: (v) => {
      if (!v) return false
      // Accept DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, text dates
      return /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(v) ||
             /\d{4}-\d{1,2}-\d{1,2}/.test(v) ||
             /\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v)
    },
    weight: 0.8,
  },
  subtotal: {
    test: (v) => typeof v === 'number' && v > 0,
    weight: 0.7,
  },
  taxAmount: {
    test: (v) => typeof v === 'number' && v >= 0,
    weight: 0.6,
  },
  totalAmount: {
    test: (v) => typeof v === 'number' && v > 0,
    weight: 1.0,
  },
}

/* ─── Cross-validation checks ─────────────────────────────────── */

function crossValidationScore(parsed) {
  const scores = {}
  const { subtotal, taxAmount, totalAmount, lineItems = [], vendorName, gstin } = parsed

  // Vendor + GSTIN present together → higher confidence for both
  if (vendorName && gstin) {
    scores.vendorName = 1.0
    scores.gstin = 1.0
  } else if (vendorName || gstin) {
    scores.vendorName = vendorName ? 0.7 : 0.3
    scores.gstin = gstin ? 0.7 : 0.3
  } else {
    // Both missing — use a baseline so other fields aren't dragged to zero
    scores.vendorName = 0.2
    scores.gstin = 0.2
  }

  // Subtotal + Tax = Total check
  const computedTotal = (subtotal || 0) + (taxAmount || 0)
  if (totalAmount > 0 && computedTotal > 0) {
    const diff = Math.abs(computedTotal - totalAmount)
    const pct = diff / Math.max(totalAmount, 1)
    scores.totalAmount = Math.max(0, 1 - pct * 10) // drops fast for mismatches
    scores.subtotal = scores.totalAmount
    scores.taxAmount = scores.totalAmount
  } else {
    scores.totalAmount = totalAmount > 0 ? 0.5 : 0.2
    scores.subtotal = subtotal > 0 ? 0.5 : 0.2
    scores.taxAmount = taxAmount > 0 ? 0.5 : 0.2
  }

  // Line items sum ≈ subtotal
  if (lineItems.length > 0 && subtotal > 0) {
    const lineSum = lineItems.reduce((s, it) => s + (it.amount || 0), 0)
    const diff = Math.abs(lineSum - subtotal) / Math.max(subtotal, 1)
    const lineScore = Math.max(0, 1 - diff * 5)
    scores.subtotal = Math.min(scores.subtotal || 1, lineScore)
  }

  // Invoice number present → standard confidence
  scores.invoiceNumber = parsed.invoiceNumber ? 0.9 : 0.3
  scores.invoiceDate = parsed.invoiceDate ? 0.8 : 0.3

  return scores
}

/* ─── Main Service ─────────────────────────────────────────────── */

export const confidenceScoringService = {
  /**
   * Compute comprehensive field-level confidence scores.
   *
   * @param {object} parsed - Parsed invoice data
   * @param {object} [options] - { ocrWordConfidences, ocrOverallConfidence, financialConsistent, autoResolutions }
   * @returns {{ fieldScores, compositeScore, overallLevel, breakdown }}
   */
  score(parsed, options = {}) {
    const { ocrWordConfidences = {}, ocrOverallConfidence, financialConsistent = true, autoResolutions = {}, tableReconstructionMeta = null } = options

    const fieldScores = {}
    const breakdown = {}

    for (const [field, validator] of Object.entries(PATTERNS)) {
      const value = parsed[field]

      // 1. OCR confidence (per-word → engine overall → field-level → 0.5)
      let ocrConf = 0.5 // last-resort default
      if (ocrWordConfidences[field] !== undefined) {
        ocrConf = Math.min(1, ocrWordConfidences[field] / 100)
      } else if (typeof ocrOverallConfidence === 'number' && ocrOverallConfidence > 0) {
        // Use engine-level confidence (e.g. Tesseract 93%) as field OCR factor
        ocrConf = Math.min(1, ocrOverallConfidence / 100)
      } else if (parsed.fieldConfidence?.[field]?.confidence > 0) {
        // Field-level fallback — only use if non-zero (zero means field was null)
        ocrConf = parsed.fieldConfidence[field].confidence
      }

      // 2. Pattern confidence
      const patternConf = validator.test(value) ? 1.0 : (value ? 0.3 : 0)

      // 3. Cross-validation confidence
      const crossScores = crossValidationScore(parsed)
      const crossConf = crossScores[field] || 0.5

      // 4. Financial consistency
      const finConf = financialConsistent ? 1.0 : 0.5

      // Weighted composite
      const composite =
        ocrConf * WEIGHTS.ocr +
        patternConf * WEIGHTS.pattern +
        crossConf * WEIGHTS.crossValidation +
        finConf * WEIGHTS.financial

      // Apply field importance weight
      const finalScore = Math.min(1, Math.max(0, composite * validator.weight + (1 - validator.weight) * composite))

      // Deterministic boost: if field was auto-resolved AND has a value, elevate to 100%
      // Zero-tolerance: extracted, reconstructed, or derived = fully trusted
      const resolution = autoResolutions[field]
      let boostedScore = finalScore
      let boostSource = null

      // Only boost if the value is actually present (not null/empty/0 for required fields)
      const hasValue = ['subtotal', 'taxAmount', 'totalAmount'].includes(field)
        ? (typeof value === 'number' && value > 0)
        : (value != null && value !== '')

      if (resolution?.resolved && hasValue) {
        // Resolved fields with actual values get 100%
        boostedScore = 1.0
        boostSource = resolution.source
      }

      // Financial fields: if financials are consistent, boost to 100% (only when value present)
      if (['subtotal', 'taxAmount', 'totalAmount'].includes(field) && hasValue) {
        if (financialConsistent && autoResolutions.financials?.resolved) {
          boostedScore = 1.0
          boostSource = boostSource || 'financial_recomputation'
        } else if (financialConsistent && patternConf >= 1.0 && !boostSource) {
          boostedScore = Math.max(boostedScore, 0.90)
        }
      }

      // Table reconstruction boost for financial fields (only when value present)
      if (['subtotal', 'taxAmount', 'totalAmount'].includes(field) && hasValue && tableReconstructionMeta?.used && tableReconstructionMeta?.tableConfidence >= 0.8) {
        boostedScore = 1.0
        boostSource = boostSource || 'table_reconstruction'
      }

      fieldScores[field] = {
        value,
        confidence: round2(boostedScore),
        level: boostedScore >= 0.8 ? 'high' : boostedScore >= 0.4 ? 'medium' : 'low',
        autoResolved: boostSource ? true : false,
        resolutionSource: boostSource || null,
      }

      breakdown[field] = {
        ocr: round2(ocrConf),
        pattern: round2(patternConf),
        crossValidation: round2(crossConf),
        financial: round2(finConf),
        composite: round2(finalScore),
        boosted: round2(boostedScore),
        boostSource,
      }
    }

    // Overall composite
    const allScores = Object.values(fieldScores).map((f) => f.confidence)
    const compositeScore = allScores.length > 0
      ? round2(allScores.reduce((s, v) => s + v, 0) / allScores.length)
      : 0

    const overallLevel = compositeScore >= 0.8 ? 'high' : compositeScore >= 0.4 ? 'medium' : 'low'

    return {
      fieldScores,
      compositeScore,
      overallLevel,
      breakdown,
    }
  },

  /**
   * Extract per-field OCR word confidences from Tesseract word data.
   * Maps words that appear near known field values to their confidence.
   */
  extractWordConfidences(words, parsed) {
    if (!words || words.length === 0) return {}

    const confidences = {}
    const fieldValues = {
      vendorName: parsed.vendorName,
      gstin: parsed.gstin,
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate,
      totalAmount: String(parsed.totalAmount),
      subtotal: String(parsed.subtotal),
      taxAmount: String(parsed.taxAmount),
    }

    for (const [field, value] of Object.entries(fieldValues)) {
      if (!value || value === '0') continue
      const valueLower = String(value).toLowerCase()
      const matchingWords = words.filter((w) =>
        w.text && valueLower.includes(w.text.toLowerCase().replace(/[₹,]/g, '')),
      )
      if (matchingWords.length > 0) {
        confidences[field] = matchingWords.reduce((s, w) => s + w.confidence, 0) / matchingWords.length
      }
    }

    return confidences
  },

  /**
   * Convert a score result + parsed invoice into a tier decision.
   *   high   → score ≥ 0.8 AND no critical validation failures
   *   review → score ≥ 0.4 OR recoverable issues
   *   reject → score < 0.4 OR multiple critical failures (e.g. invalid GSTIN
   *            and totals that don't reconcile) — caller should refuse to
   *            persist and return an actionable 422.
   *
   * Returns { score100, tier, reasons[], checks }.
   */
  tier(parsed, scoreResult) {
    const composite = scoreResult?.compositeScore ?? 0
    const score100 = Math.round(composite * 100)
    const reasons = []
    const checks = {
      gstinFormat: gstinIsValid(parsed.gstin),
      dateSane: dateWithinTolerance(parsed.invoiceDate),
      numericReconciliation: numericReconciles(parsed),
    }
    if (!checks.gstinFormat && parsed.gstin) reasons.push('GSTIN format invalid (failed checksum or pattern)')
    if (!checks.dateSane && parsed.invoiceDate) reasons.push('Invoice date is unreasonable (>1 year off)')
    if (!checks.numericReconciliation && (parsed.subtotal || parsed.taxAmount || parsed.totalAmount)) {
      reasons.push('Subtotal + tax does not reconcile to total (>₹1 deviation)')
    }
    const criticalFailures = reasons.length
    let tier
    if (composite >= 0.8 && criticalFailures === 0) tier = 'high'
    else if (composite < 0.4 && criticalFailures >= 2) tier = 'reject'
    else tier = 'review'
    return { score100, tier, reasons, checks }
  },
}

// ──────────────────────────────────────────────────────────────
// Validators used by tier()
// ──────────────────────────────────────────────────────────────
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/
function gstinIsValid(gstin) {
  if (!gstin) return true // tier() treats empty as not-applicable
  const v = String(gstin).toUpperCase().trim()
  if (!GSTIN_RE.test(v)) return false
  // Mod-36 checksum (per GSTN spec): chars 0..36 (0-9, A-Z) hashed with
  // alternating factor 1/2.
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const factor = (i % 2) + 1
    const digit = chars.indexOf(v[i])
    if (digit < 0) return false
    const product = digit * factor
    sum += Math.floor(product / 36) + (product % 36)
  }
  const checkDigit = chars[(36 - (sum % 36)) % 36]
  return checkDigit === v[14]
}

function dateWithinTolerance(invoiceDate) {
  if (!invoiceDate) return true
  const ts = Date.parse(invoiceDate)
  if (Number.isNaN(ts)) {
    // Accept locale-format dates (DD/MM/YYYY)
    const m = String(invoiceDate).match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/)
    if (!m) return false
    const [, dd, mm, yyyyRaw] = m
    const yyyy = yyyyRaw.length === 2 ? 2000 + Number(yyyyRaw) : Number(yyyyRaw)
    const parsed = Date.UTC(yyyy, Number(mm) - 1, Number(dd))
    return Math.abs(Date.now() - parsed) < 1000 * 60 * 60 * 24 * 365
  }
  return Math.abs(Date.now() - ts) < 1000 * 60 * 60 * 24 * 365
}

function numericReconciles(parsed) {
  const sub = Number(parsed.subtotal) || 0
  const tax = Number(parsed.taxAmount) || 0
  const total = Number(parsed.totalAmount) || 0
  if (!total) return true // can't reconcile what we don't have
  if (!sub && !tax) return true
  return Math.abs(sub + tax - total) <= 1
}

function round2(n) { return Math.round(n * 100) / 100 }
