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
    scores.vendorName = vendorName ? 0.7 : 0
    scores.gstin = gstin ? 0.7 : 0
  } else {
    scores.vendorName = 0
    scores.gstin = 0
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
    scores.totalAmount = totalAmount > 0 ? 0.5 : 0
    scores.subtotal = subtotal > 0 ? 0.5 : 0
    scores.taxAmount = taxAmount > 0 ? 0.5 : 0
  }

  // Line items sum ≈ subtotal
  if (lineItems.length > 0 && subtotal > 0) {
    const lineSum = lineItems.reduce((s, it) => s + (it.amount || 0), 0)
    const diff = Math.abs(lineSum - subtotal) / Math.max(subtotal, 1)
    const lineScore = Math.max(0, 1 - diff * 5)
    scores.subtotal = Math.min(scores.subtotal || 1, lineScore)
  }

  // Invoice number present → standard confidence
  scores.invoiceNumber = parsed.invoiceNumber ? 0.9 : 0.2
  scores.invoiceDate = parsed.invoiceDate ? 0.8 : 0.3

  return scores
}

/* ─── Main Service ─────────────────────────────────────────────── */

export const confidenceScoringService = {
  /**
   * Compute comprehensive field-level confidence scores.
   *
   * @param {object} parsed - Parsed invoice data
   * @param {object} [options] - { ocrWordConfidences, financialConsistent, autoResolutions }
   * @returns {{ fieldScores, compositeScore, overallLevel, breakdown }}
   */
  score(parsed, options = {}) {
    const { ocrWordConfidences = {}, financialConsistent = true, autoResolutions = {}, tableReconstructionMeta = null } = options

    const fieldScores = {}
    const breakdown = {}

    for (const [field, validator] of Object.entries(PATTERNS)) {
      const value = parsed[field]

      // 1. OCR confidence (from Tesseract word data or existing fieldConfidence)
      let ocrConf = 0.5 // default if no word data
      if (ocrWordConfidences[field] !== undefined) {
        ocrConf = Math.min(1, ocrWordConfidences[field] / 100)
      } else if (parsed.fieldConfidence?.[field]?.confidence !== undefined) {
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

      // Deterministic boost: if field was auto-resolved, elevate to 100%
      // Zero-tolerance: extracted, reconstructed, or derived = fully trusted
      const resolution = autoResolutions[field]
      let boostedScore = finalScore
      let boostSource = null

      if (resolution?.resolved) {
        // ALL resolved fields get 100% — deterministic, not probabilistic
        boostedScore = 1.0
        boostSource = resolution.source
      }

      // Financial fields: if financials are consistent, boost to 100%
      if (['subtotal', 'taxAmount', 'totalAmount'].includes(field)) {
        if (financialConsistent && autoResolutions.financials?.resolved) {
          boostedScore = 1.0
          boostSource = boostSource || 'financial_recomputation'
        } else if (financialConsistent && patternConf >= 1.0 && !boostSource) {
          boostedScore = Math.max(boostedScore, 0.90)
        }
      }

      // Table reconstruction boost for financial fields
      if (['subtotal', 'taxAmount', 'totalAmount'].includes(field) && tableReconstructionMeta?.used && tableReconstructionMeta?.tableConfidence >= 0.8) {
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
}

function round2(n) { return Math.round(n * 100) / 100 }
