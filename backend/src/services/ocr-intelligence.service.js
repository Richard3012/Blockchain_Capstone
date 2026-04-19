/**
 * OCR Intelligence Layer — Post-OCR Correction & Financial Consistency
 * ─────────────────────────────────────────────────────────────────────
 * Layers:
 *   3. Line Item Reconstruction Engine
 *   4. Financial Consistency Engine
 *   6. Self-Healing Correction Layer
 *   7. Duplicate & Context Awareness (enhanced)
 *
 * All corrections are recorded in an ocrCorrections[] array for full
 * auditability.
 */

import { Invoice } from '../models/invoice.model.js'
import { logger } from '../utils/logger.js'
import { tableReconstructionService } from './table-reconstruction.service.js'

/* ─── Helpers ───────────────────────────────────────────────────── */

function round2(n) { return Math.round(n * 100) / 100 }

function parseNum(s) {
  if (typeof s === 'number') return s
  if (!s) return 0
  return parseFloat(String(s).replace(/[₹,\s]/g, '')) || 0
}

/** Max realistic quantity for a single line item (beyond this = likely OCR misread) */
const MAX_REALISTIC_QTY = 10000
/** Max realistic unit price (beyond this = likely OCR-merged digits) */
const MAX_REALISTIC_UNIT_PRICE = 10000000

/* ─── GSTIN helpers ─────────────────────────────────────────────── */
const GSTIN_RE = /\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]/g
const GSTIN_STRICT_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/
const VALID_STATE_CODES = new Set([
  '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16',
  '17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32',
  '33','34','35','36','37','38','97',
])

/* ─── Vendor DB GSTIN Lookup ─────────────────────────────────────── */

/**
 * Search ERP database for a known GSTIN by vendor name.
 * Checks both past invoices and vendor templates.
 * Returns { gstin, source } or null.
 */
async function lookupVendorGSTIN(vendorName, companyId) {
  if (!vendorName || !companyId) return null
  try {
    // Search past invoices for this vendor
    const pastInvoice = await Invoice.findOne({
      companyId,
      vendorName: { $regex: new RegExp(`^${vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      gstin: { $exists: true, $ne: null, $ne: '' },
      source: 'scanner',
    }).sort({ createdAt: -1 }).lean()

    if (pastInvoice?.gstin) {
      return { gstin: pastInvoice.gstin, source: 'vendor_history' }
    }

    // Fuzzy match: partial vendor name
    if (vendorName.length >= 5) {
      const partial = await Invoice.findOne({
        companyId,
        vendorName: { $regex: new RegExp(vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').substring(0, 10), 'i') },
        gstin: { $exists: true, $ne: null, $ne: '' },
      }).sort({ createdAt: -1 }).lean()

      if (partial?.gstin) {
        return { gstin: partial.gstin, source: 'vendor_fuzzy_match' }
      }
    }
  } catch (e) {
    logger.warn('gstin_vendor_lookup_failed', { error: e.message })
  }
  return null
}

/* ─── GSTIN Recovery Engine ──────────────────────────────────────── */

/**
 * When GSTIN is missing or invalid, try multiple recovery strategies:
 *   1. Deep regex scan across full OCR text (all 15-char patterns)
 *   2. OCR misread repair (0↔O, 1↔I, 5↔S, 2↔Z)
 *   3. Vendor template lookup (handled in applyTemplate, but flagged here)
 * Returns { gstin, source, corrections }
 */
function recoverGSTIN(parsed, rawText) {
  const corrections = []

  // If GSTIN already present and valid, nothing to do
  if (parsed.gstin && GSTIN_STRICT_RE.test(parsed.gstin.toUpperCase())) {
    const stateCode = parsed.gstin.substring(0, 2)
    if (VALID_STATE_CODES.has(stateCode)) return { gstin: parsed.gstin, source: 'extracted', corrections }
  }

  // ── OCR misread repair utility ──────────────────────────
  // Common Tesseract misreads: O↔0, I↔1, S↔5, B↔8, G↔6, Z↔2, l↔1
  function repairGSTIN(raw) {
    if (!raw || raw.length !== 15) return null
    let f = raw.toUpperCase()

    // Positions 0-1: must be digits (state code)
    f = f[0].replace(/[OoQD]/g, '0').replace(/[IilL]/g, '1').replace(/[S]/g, '5').replace(/[B]/g, '8') +
        f[1].replace(/[OoQD]/g, '0').replace(/[IilL]/g, '1').replace(/[S]/g, '5').replace(/[B]/g, '8') +
        f.substring(2)

    // Positions 2-6: must be alpha (PAN first 5 chars)
    for (let i = 2; i <= 6; i++) {
      if (/\d/.test(f[i])) {
        const map = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '6': 'G' }
        if (map[f[i]]) f = f.slice(0, i) + map[f[i]] + f.slice(i + 1)
      }
    }

    // Positions 7-10: must be digits (PAN numeric part)
    for (let i = 7; i <= 10; i++) {
      if (/[A-Z]/.test(f[i])) {
        const map = { 'O': '0', 'I': '1', 'S': '5', 'B': '8', 'G': '6', 'L': '1', 'Z': '2' }
        if (map[f[i]]) f = f.slice(0, i) + map[f[i]] + f.slice(i + 1)
      }
    }

    // Position 11: must be alpha (PAN type)
    if (/\d/.test(f[11])) {
      const map = { '0': 'O', '1': 'I', '5': 'S', '8': 'B' }
      if (map[f[11]]) f = f.slice(0, 11) + map[f[11]] + f.slice(12)
    }

    // Position 12: alphanumeric (entity number) — leave as is

    // Position 13: must be 'Z'
    if (f[13] !== 'Z') {
      if (f[13] === '2' || f[13] === 'z') f = f.slice(0, 13) + 'Z' + f.slice(14)
    }

    // Position 14: alphanumeric (check digit) — leave as is

    if (GSTIN_STRICT_RE.test(f) && VALID_STATE_CODES.has(f.substring(0, 2))) return f
    return null
  }

  // Strategy 1: Deep regex scan across full text for any GSTIN-like pattern
  if (rawText) {
    const upper = rawText.toUpperCase()
    const candidates = []
    let m
    // Reset regex lastIndex
    GSTIN_RE.lastIndex = 0
    while ((m = GSTIN_RE.exec(upper)) !== null) {
      const candidate = m[0]
      const stateCode = candidate.substring(0, 2)
      if (VALID_STATE_CODES.has(stateCode)) {
        candidates.push(candidate)
      }
    }

    // Pick first valid candidate that differs from current
    for (const candidate of candidates) {
      if (candidate !== parsed.gstin) {
        corrections.push({
          field: 'gstin',
          from: parsed.gstin || '(missing)',
          to: candidate,
          rule: 'GSTIN recovered from deep text scan',
        })
        return { gstin: candidate, source: 'deep_scan', corrections }
      }
    }

    // Strategy 2: Try OCR misread repair on any 15-char alphanumeric sequences
    const potentialGstins = upper.match(/[A-Z0-9]{15}/g) || []
    for (const raw of potentialGstins) {
      const fixed = repairGSTIN(raw)
      if (fixed) {
        corrections.push({
          field: 'gstin',
          from: parsed.gstin || '(missing)',
          to: fixed,
          rule: 'GSTIN recovered via OCR misread repair (position-aware)',
        })
        return { gstin: fixed, source: 'ocr_repair', corrections }
      }
    }

    // Strategy 3: Context scan — look near GSTIN/GST labels for partial matches
    const contextPatterns = [
      /(?:gstin|gst\s*no|gst\s*number|gst\s*in|gst\s*i\.?d|gst\s*reg)[.\s:;\-]*([A-Z0-9 ]{15,20})/gi,
    ]
    for (const pattern of contextPatterns) {
      let cm
      while ((cm = pattern.exec(rawText)) !== null) {
        let raw = cm[1].toUpperCase().replace(/\s/g, '')
        if (raw.length < 15) continue
        raw = raw.substring(0, 15)
        const fixed = repairGSTIN(raw)
        if (fixed) {
          corrections.push({
            field: 'gstin',
            from: parsed.gstin || '(missing)',
            to: fixed,
            rule: 'GSTIN recovered from context near GST label (position-aware repair)',
          })
          return { gstin: fixed, source: 'labeled_pattern', corrections }
        }
      }
    }

    // Strategy 4: Scan ALL 15-char sequences with 1-2 char tolerance
    // Find sequences that are close to GSTIN pattern even with OCR noise
    const allSeqs = []
    for (let i = 0; i <= upper.length - 15; i++) {
      const seq = upper.substring(i, i + 15)
      if (/^[A-Z0-9]{15}$/.test(seq)) {
        const fixed = repairGSTIN(seq)
        if (fixed && !allSeqs.includes(fixed)) allSeqs.push(fixed)
      }
    }
    for (const fixed of allSeqs) {
      corrections.push({
        field: 'gstin',
        from: parsed.gstin || '(missing)',
        to: fixed,
        rule: 'GSTIN recovered via sliding window + position-aware repair',
      })
      return { gstin: fixed, source: 'sliding_window', corrections }
    }
  }

  return { gstin: parsed.gstin || null, source: parsed.gstin ? 'original' : 'missing', corrections }
}

/* ─── Invoice Date Intelligence ─────────────────────────────────── */

/**
 * When invoice date is missing, scan full text with multiple patterns:
 *   1. Labeled dates: "Invoice Date:", "Date:", "Dated:", "Bill Date:"
 *   2. Contextual date extraction (proximity to date keywords)
 *   3. Any valid date in text (as last resort)
 * Returns { invoiceDate, source, systemInferred, corrections }
 */
function recoverInvoiceDate(parsed, rawText) {
  const corrections = []

  if (parsed.invoiceDate) {
    return { invoiceDate: parsed.invoiceDate, source: 'extracted', systemInferred: false, corrections }
  }

  if (!rawText) {
    return { invoiceDate: null, source: 'missing', systemInferred: false, corrections }
  }

  // Labeled date patterns (highest priority)
  const labeledPatterns = [
    /(?:invoice\s*date|inv\.?\s*date|bill\s*date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /(?:invoice\s*date|inv\.?\s*date|bill\s*date)\s*[:\-]?\s*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s*\d{2,4})/i,
    /(?:invoice\s*date|inv\.?\s*date|bill\s*date)\s*[:\-]?\s*(\d{4}-\d{1,2}-\d{1,2})/i,
    /(?:^|\n)\s*(?:date|dated|dt)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/im,
    /(?:^|\n)\s*(?:date|dated|dt)\s*[:\-]?\s*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s*\d{2,4})/im,
    /(?:^|\n)\s*(?:date|dated|dt)\s*[:\-]?\s*(\d{4}-\d{1,2}-\d{1,2})/im,
  ]

  for (const pattern of labeledPatterns) {
    const m = rawText.match(pattern)
    if (m) {
      corrections.push({
        field: 'invoiceDate',
        from: '(missing)',
        to: m[1],
        rule: 'Date recovered from labeled pattern in text',
      })
      return { invoiceDate: m[1], source: 'labeled_pattern', systemInferred: false, corrections }
    }
  }

  // Unlabeled date patterns (lower priority, system-inferred)
  const datePattern = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/g
  const matches = []
  let dm
  while ((dm = datePattern.exec(rawText)) !== null) {
    matches.push(dm[1])
  }

  // Month-name dates
  const monthPattern = /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s*\d{2,4})/gi
  while ((dm = monthPattern.exec(rawText)) !== null) {
    matches.push(dm[1])
  }

  if (matches.length > 0) {
    // Pick the first date found (most likely the invoice date)
    corrections.push({
      field: 'invoiceDate',
      from: '(missing)',
      to: matches[0],
      rule: 'Date inferred from document text (system-inferred)',
    })
    return { invoiceDate: matches[0], source: 'text_scan', systemInferred: true, corrections }
  }

  // Fallback: use today's date as upload timestamp
  const today = new Date()
  const fallbackDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  corrections.push({
    field: 'invoiceDate',
    from: '(missing)',
    to: fallbackDate,
    rule: 'Date set to upload timestamp (no date found in document)',
  })
  return { invoiceDate: fallbackDate, source: 'upload_timestamp', systemInferred: true, corrections }
}

/* ─── Line Item Reconstruction Engine ───────────────────────────── */

/**
 * Extract embedded table column data from a Tesseract-merged description string.
 * Tesseract often concatenates all table columns into one line:
 *   "|Stanley Hammer 82052000 3.00 PCS"         → desc, HSN, qty, UOM
 *   "|Automatic Saw 8202 1.00 PCS 1,883.00 ..." → desc, HSN, qty, UOM, rate, taxable...
 *
 * Returns null if the description doesn't contain embedded table data.
 */
function extractEmbeddedTableData(description) {
  if (!description) return null

  // Clean leading pipe/bar characters (OCR artifact from table borders)
  let text = description.replace(/^[|¦]+\s*/, '').trim()

  // Split into tokens
  const tokens = text.split(/\s+/)
  if (tokens.length < 3) return null // need at least desc + HSN + qty

  // Find the boundary between text (description) and numeric (table columns)
  let descTokens = []
  let hsnToken = null
  let numericTokens = []
  let uomToken = null
  let foundHSN = false

  const uomRe = /^(PCS|NOS|UNITS?|KGS?|LTRS?|MTRS?|SETS?|PAIRS?|BOXES?|DOZ|DOZEN|EA|PC|NO)\.?$/i

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const cleaned = t.replace(/[,₹$]/g, '')

    // ── Unit suffix stripping: "3.00 PCS" → qty value only, store unit ──
    if (uomRe.test(t)) {
      uomToken = t
      continue
    }

    // "3.00PCS" combined token — split numeric from UOM suffix
    const combMatch = t.match(/^([\d,]+(?:\.\d+)?)(PCS|NOS|UNITS?|KGS?|LTRS?|MTRS?|SETS?|EA|PC|NO)\.?$/i)
    if (combMatch) {
      numericTokens.push(parseFloat(combMatch[1].replace(/,/g, '')))
      uomToken = combMatch[2]
      continue
    }

    // Check if this is a number
    if (/^[\d,]+(?:\.\d+)?$/.test(cleaned) && cleaned.length > 0) {
      const numVal = parseFloat(cleaned.replace(/,/g, ''))
      if (!foundHSN && /^\d{4,8}$/.test(cleaned) && numVal >= 1000) {
        // First big integer = HSN code (anchor: never treat as qty/rate)
        hsnToken = cleaned
        foundHSN = true
        continue
      }
      numericTokens.push(numVal)
    } else if (numericTokens.length === 0 && !foundHSN) {
      descTokens.push(t)
    } else if (numericTokens.length === 0 && foundHSN) {
      // Text after HSN but before numbers — part of description
      descTokens.push(t)
    }
  }

  // Need at least an HSN or 2+ numbers to consider this embedded table data
  if (!hsnToken && numericTokens.length < 2) return null
  if (descTokens.length === 0) return null

  const desc = descTokens.join(' ')

  // Assign numbers left-to-right (standard GST table column order):
  // qty, rate, taxable, gst%, gstAmt, total
  let quantity = 0, unitPrice = 0, taxableValue = 0, gstRate = 0, igst = 0, total = 0
  const nums = numericTokens

  if (nums.length >= 6) {
    quantity = nums[0]; unitPrice = nums[1]; taxableValue = nums[2]
    gstRate = nums[3]; igst = nums[4]; total = nums[5]
  } else if (nums.length === 5) {
    quantity = nums[0]; unitPrice = nums[1]; taxableValue = nums[2]
    igst = nums[3]; total = nums[4]
  } else if (nums.length === 4) {
    quantity = nums[0]; unitPrice = nums[1]; taxableValue = nums[2]; total = nums[3]
  } else if (nums.length === 3) {
    quantity = nums[0]; unitPrice = nums[1]; total = nums[2]
    taxableValue = round2(quantity * unitPrice)
  } else if (nums.length === 2) {
    quantity = nums[0]; unitPrice = nums[1]
    taxableValue = round2(quantity * unitPrice)
  } else if (nums.length === 1) {
    quantity = nums[0]
  }

  // ── Column-swap detection: qty × rate must ≈ taxableValue ──────────────
  // OCR scanners misread Rate (499) as Qty and Qty (3) as Rate decimal when
  // numeric columns are tightly spaced (1-column left-shift failure mode).
  // Rule: Qty should be a small integer (1–100) and Rate should be ≥ 100
  // for most industrial/commercial goods.
  if (quantity > 0 && unitPrice > 0) {
    if (taxableValue > 0) {
      const expectedTaxable = round2(quantity * unitPrice)
      const deviationPct = Math.abs(expectedTaxable - taxableValue) / Math.max(taxableValue, 1)
      if (deviationPct > 0.05) {
        // Try column swap: rate ↔ qty
        const swappedExpected = round2(unitPrice * quantity) // same math, but swap assignment
        const swappedQty = unitPrice
        const swappedRate = quantity
        const swappedTaxable = round2(swappedQty * swappedRate)
        const swappedDeviation = Math.abs(swappedTaxable - taxableValue) / Math.max(taxableValue, 1)
        if (swappedDeviation <= 0.05) {
          quantity = swappedQty
          unitPrice = swappedRate
        } else {
          // Heuristic: if qty > 100 and unitPrice < 100, swap (qty is likely rate)
          if (quantity > 100 && unitPrice < 100 && unitPrice > 0) {
            const tmpQ = quantity; quantity = unitPrice; unitPrice = tmpQ
          }
        }
      }
    } else {
      // No taxableValue to validate against — use heuristic:
      // Qty should be small integer (1–1000), Rate should be larger
      if (quantity > 1000 && unitPrice < 100) {
        const tmpQ = quantity; quantity = unitPrice; unitPrice = tmpQ
      }
    }
  }

  // Recompute taxableValue after any swap
  if (quantity > 0 && unitPrice > 0 && taxableValue <= 0) {
    taxableValue = round2(quantity * unitPrice)
  }

  // Snap gstRate to standard values
  if (gstRate > 0 && ![5, 12, 18, 28, 0.25, 1.5, 3].includes(gstRate)) {
    // Check if it's close to a standard rate
    for (const std of [5, 12, 18, 28]) {
      if (Math.abs(gstRate - std) <= 1) { gstRate = std; break }
    }
  }

  // Final validation: after swap attempt, if still doesn't reconcile → bail
  if (quantity > 0 && unitPrice > 0 && taxableValue > 0) {
    const expected = round2(quantity * unitPrice)
    if (Math.abs(expected - taxableValue) > taxableValue * 0.1) {
      return null
    }
  }

  return {
    description: desc,
    hsn: hsnToken || '',
    quantity,
    unitPrice,
    uom: uomToken || '',
    taxableValue,
    gstRate,
    igst,
    total,
  }
}

function normalizeDescriptionKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractRowCandidatesFromRawText(rawText) {
  if (!rawText) return []

  const candidates = []
  const lines = rawText.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^(?:sub\s*total|total\b|grand\s*total|amount\s*in\s*words|net\s*payable|round\s*off|bank\s*details|terms)/i.test(trimmed)) continue

    const rowMatch = trimmed.match(/^\s*(\d{1,3})[.)]?\s+([A-Za-z].+)$/)
    if (!rowMatch) continue

    const sno = parseInt(rowMatch[1], 10)
    const rest = rowMatch[2]

    // Strip unit suffix tokens (PCS, NOS, KGS, etc.) before parsing numbers
    const restClean = rest.replace(/\b(PCS|NOS|UNITS?|KGS?|LTRS?|MTRS?|SETS?|PAIRS?|BOXES?|DOZ|DOZEN|EA|PC|NO)\b\.?/gi, ' ')
    const rawNums = restClean.match(/[\d,]+(?:\.\d+)?/g) || []
    const nums = rawNums
      .map((n) => parseNum(n))
      .filter((n) => Number.isFinite(n) && n > 0)

    // Separate HSN codes (4–8 digit integers ≥ 1000) from quantity/price columns
    const hsnCandidates = nums.filter((n) => Number.isInteger(n) && n >= 1000 && n <= 99999999)
    const nonHsnNums = nums.filter((n) => !hsnCandidates.includes(n) || n < 1000)

    // Remove trailing numeric columns from the text to isolate description.
    const desc = rest
      .replace(/\s+[\d,]+(?:\.\d+)?(?:\s+[A-Za-z]{2,6})?(?:\s+[\d,]+(?:\.\d+)?){1,8}\s*$/, '')
      .replace(/^\|+\s*/, '')
      .trim()

    if (!/[A-Za-z]/.test(desc)) continue

    let quantity = 0
    let unitPrice = 0
    let amount = 0

    // Heuristic mapping for common invoice rows using nonHsnNums (HSN stripped)
    // Apply column-swap validation: qty × rate must ≈ amount (last numeric column)
    if (nonHsnNums.length >= 3) {
      quantity = Math.round(nonHsnNums[0])
      unitPrice = nonHsnNums[1] || 0
      amount = nonHsnNums[nonHsnNums.length - 1] || 0
      // Column-swap check: Qty should be small (1–1000), Rate should be larger
      if (quantity > 1000 && unitPrice < quantity && unitPrice > 0) {
        const tmp = quantity; quantity = unitPrice; unitPrice = tmp
      }
      // Mathematical validation: qty × rate ≈ amount
      if (quantity > 0 && unitPrice > 0 && amount > 0) {
        const computed = round2(quantity * unitPrice)
        const deviation = Math.abs(computed - amount) / Math.max(amount, 1)
        if (deviation > 0.1) {
          // Try swap
          const swapQ = nonHsnNums[1], swapR = nonHsnNums[0]
          const swapComputed = round2(swapQ * swapR)
          if (Math.abs(swapComputed - amount) / Math.max(amount, 1) <= 0.1) {
            quantity = Math.round(swapQ)
            unitPrice = swapR
          }
        }
      }
    } else if (nonHsnNums.length === 2) {
      quantity = Math.round(nonHsnNums[0])
      amount = nonHsnNums[1]
      unitPrice = quantity > 0 ? round2(amount / quantity) : 0
    } else if (nonHsnNums.length === 1) {
      quantity = 1
      amount = nonHsnNums[0]
      unitPrice = amount
    }

    candidates.push({
      sno: Number.isFinite(sno) ? sno : candidates.length + 1,
      description: desc,
      quantity: quantity > 0 ? quantity : 1,
      unitPrice: unitPrice > 0 ? unitPrice : (amount > 0 ? amount : 0),
      tax: 0,
      amount: amount > 0 ? amount : (unitPrice > 0 ? unitPrice : 0),
    })
  }

  return candidates
}

/**
 * Detect and reconstruct line items from raw OCR text.
 * Uses alignment-based detection (spacing patterns) and multiple regex passes.
 */
function reconstructLineItems(rawText, existingItems) {
  const corrections = []

  // If we already have good items, validate them
  if (existingItems && existingItems.length > 0) {
    const repaired = existingItems.map((item, idx) => {
      const fixed = { ...item }

      // ── CRITICAL: Detect embedded table columns in description ──
      // Tesseract often merges multi-column table data into description:
      //   "|Stanley Hammer 82052000 3.00 PCS"
      //   "|Automatic Saw 8202 1.00 PCS 1,883.00 1,883.00"
      // When this happens, qty/price/amount fields are garbage from wrong columns.
      // Extract the real values from the description itself.
      if (fixed.description) {
        const embeddedResult = extractEmbeddedTableData(fixed.description)
        if (embeddedResult) {
          const old = { desc: fixed.description, qty: fixed.quantity, price: fixed.unitPrice, amount: fixed.amount }

          fixed.description = embeddedResult.description
          if (embeddedResult.hsn) fixed.hsn = embeddedResult.hsn
          if (embeddedResult.quantity > 0) fixed.quantity = embeddedResult.quantity
          if (embeddedResult.unitPrice > 0) fixed.unitPrice = embeddedResult.unitPrice
          if (embeddedResult.taxableValue > 0) fixed.taxableValue = embeddedResult.taxableValue
          if (embeddedResult.igst > 0) fixed.igst = embeddedResult.igst
          if (embeddedResult.gstRate > 0) fixed.gstRate = embeddedResult.gstRate
          if (embeddedResult.total > 0) fixed.amount = embeddedResult.total
          if (embeddedResult.total <= 0 && embeddedResult.taxableValue > 0) {
            fixed.amount = embeddedResult.taxableValue
          }

          // Recompute amount if we have qty + unitPrice but no total
          if (fixed.quantity > 0 && fixed.unitPrice > 0 && fixed.amount <= 0) {
            fixed.amount = round2(fixed.quantity * fixed.unitPrice)
          }

          corrections.push({
            field: `lineItems[${idx}]`,
            from: `desc="${old.desc}" qty=${old.qty} price=${old.price} amount=${old.amount}`,
            to: `desc="${fixed.description}" qty=${fixed.quantity} price=${fixed.unitPrice} amount=${fixed.amount}`,
            rule: 'Extracted embedded table data (HSN/qty/UOM/rate) from merged description',
          })
        }
      }

      // ── Detect unrealistic quantities (OCR digit merge) ───
      if (fixed.quantity > MAX_REALISTIC_QTY && fixed.amount > 0) {
        // Likely OCR merged digits — try to derive from amount/unitPrice
        if (fixed.unitPrice > 0) {
          const derivedQty = Math.round(fixed.amount / fixed.unitPrice)
          if (derivedQty > 0 && derivedQty <= MAX_REALISTIC_QTY) {
            corrections.push({
              field: `lineItems[${idx}].quantity`,
              from: fixed.quantity,
              to: derivedQty,
              rule: `Unrealistic qty ${fixed.quantity} → derived ${derivedQty} from amount/unitPrice`,
            })
            fixed.quantity = derivedQty
          } else {
            // Can't derive — flag qty as 1 and recalculate
            corrections.push({
              field: `lineItems[${idx}].quantity`,
              from: fixed.quantity,
              to: 1,
              rule: `Unrealistic qty ${fixed.quantity} → reset to 1 (OCR misread likely)`,
            })
            fixed.quantity = 1
            fixed.unitPrice = fixed.amount
          }
        } else if (fixed.amount > 0) {
          // No unit price either — set qty=1, unitPrice=amount
          corrections.push({
            field: `lineItems[${idx}].quantity`,
            from: fixed.quantity,
            to: 1,
            rule: `Unrealistic qty ${fixed.quantity} → reset to 1, unitPrice set to amount`,
          })
          fixed.quantity = 1
          fixed.unitPrice = fixed.amount
        }
      }

      // ── Detect unrealistic unit prices ────────────────────
      if (fixed.unitPrice > MAX_REALISTIC_UNIT_PRICE && fixed.quantity > 0 && fixed.amount > 0) {
        const derivedPrice = round2(fixed.amount / fixed.quantity)
        corrections.push({
          field: `lineItems[${idx}].unitPrice`,
          from: fixed.unitPrice,
          to: derivedPrice,
          rule: `Unrealistic unit price ₹${fixed.unitPrice} → derived ₹${derivedPrice}`,
        })
        fixed.unitPrice = derivedPrice
      }

      // Fix missing amount: qty × unitPrice
      if ((!fixed.amount || fixed.amount <= 0) && fixed.quantity > 0 && fixed.unitPrice > 0) {
        fixed.amount = round2(fixed.quantity * fixed.unitPrice)
        corrections.push({
          field: `lineItems[${idx}].amount`,
          from: item.amount,
          to: fixed.amount,
          rule: 'amount = qty × unitPrice',
        })
      }

      // Fix missing unitPrice: amount / qty
      if ((!fixed.unitPrice || fixed.unitPrice <= 0) && fixed.quantity > 0 && fixed.amount > 0) {
        fixed.unitPrice = round2(fixed.amount / fixed.quantity)
        corrections.push({
          field: `lineItems[${idx}].unitPrice`,
          from: item.unitPrice,
          to: fixed.unitPrice,
          rule: 'unitPrice = amount / qty',
        })
      }

      // Fix missing quantity: amount / unitPrice
      if ((!fixed.quantity || fixed.quantity <= 0) && fixed.unitPrice > 0 && fixed.amount > 0) {
        fixed.quantity = Math.round(fixed.amount / fixed.unitPrice)
        corrections.push({
          field: `lineItems[${idx}].quantity`,
          from: item.quantity,
          to: fixed.quantity,
          rule: 'quantity = amount / unitPrice',
        })
      }

      // Verify: qty × unitPrice ≈ amount (allow ₹1 rounding)
      if (fixed.quantity > 0 && fixed.unitPrice > 0 && fixed.amount > 0) {
        const expected = round2(fixed.quantity * fixed.unitPrice)
        if (Math.abs(expected - fixed.amount) > 1) {
          // Trust amount, recalculate unitPrice
          fixed.unitPrice = round2(fixed.amount / fixed.quantity)
          corrections.push({
            field: `lineItems[${idx}].unitPrice`,
            from: item.unitPrice,
            to: fixed.unitPrice,
            rule: 'unitPrice recalculated: amount / qty (arithmetic mismatch)',
          })
        }
      }

      // Clean description — remove leading sno-like prefixes (e.g. "1  Widget")
      if (fixed.description && /^\d+\s{2,}/.test(fixed.description)) {
        const cleaned = fixed.description.replace(/^\d+\s+/, '').trim()
        if (cleaned.length > 1) {
          corrections.push({
            field: `lineItems[${idx}].description`,
            from: fixed.description,
            to: cleaned,
            rule: 'Removed leading serial number from description',
          })
          fixed.description = cleaned
        }
      }

      return fixed
    })

    // If OCR merged/under-counted rows, add missing rows based on raw text item lines.
    const rowCandidates = extractRowCandidatesFromRawText(rawText)
    if (rowCandidates.length > repaired.length) {
      const seen = new Set(repaired.map((it) => normalizeDescriptionKey(it.description)))
      const missingRows = rowCandidates.filter((it) => !seen.has(normalizeDescriptionKey(it.description)))

      if (missingRows.length > 0) {
        repaired.push(...missingRows)
        corrections.push({
          field: 'lineItems',
          from: `${existingItems.length} rows`,
          to: `${repaired.length} rows`,
          rule: `Added ${missingRows.length} missing rows to match item count inferred from description lines`,
        })
      }
    }

    return { lineItems: repaired, corrections }
  }

  // If no items found, attempt reconstruction from raw text
  if (!rawText) return { lineItems: [], corrections }

  // ── Multi-column table guard: if the text has GST table headers, don't try
  // simple regex reconstruction — the table reconstruction engine handles it.
  const hasGSTHeaders = /\b(hsn|sac)\b/i.test(rawText) &&
    /\b(taxable|igst|cgst|sgst)\b/i.test(rawText) &&
    /\b(qty|quantity|rate|price)\b/i.test(rawText)
  if (hasGSTHeaders) {
    return { lineItems: [], corrections }
  }

  const lines = rawText.split('\n')
  const reconstructed = []

  // Pattern: lines with multiple numeric columns (table rows)
  // Look for rows with at least 2 numbers that could be qty, price, amount
  const tableRowPattern = /^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)/
  const simpleRowPattern = /^(\d+)[.\)]\s*(.+?)\s+(\d+)\s+(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)/

  for (const line of lines) {
    // Skip header/footer lines
    if (/subtotal|total|tax|cgst|sgst|igst|amount|grand|discount|balance|due|paid/i.test(line)) continue
    if (/^[\s-=_*]+$/.test(line)) continue
    if (line.trim().length < 5) continue

    let match = line.match(tableRowPattern)
    if (match) {
      const desc = match[1].trim().replace(/^\d+[.\s)]+/, '').trim()
      if (desc.length < 2) continue
      reconstructed.push({
        sno: reconstructed.length + 1,
        description: desc,
        quantity: parseInt(match[2]) || 1,
        unitPrice: parseNum(match[3]),
        tax: 0,
        amount: parseNum(match[4]),
      })
      continue
    }

    match = line.match(simpleRowPattern)
    if (match) {
      const desc = match[2].trim()
      if (desc.length < 2) continue
      reconstructed.push({
        sno: parseInt(match[1]) || reconstructed.length + 1,
        description: desc,
        quantity: parseInt(match[3]) || 1,
        unitPrice: 0,
        tax: 0,
        amount: parseNum(match[4]),
      })
    }
  }

  if (reconstructed.length > 0) {
    // Compute missing unitPrice for reconstructed items
    for (const item of reconstructed) {
      if (!item.unitPrice && item.quantity > 0 && item.amount > 0) {
        item.unitPrice = round2(item.amount / item.quantity)
      }
    }
    corrections.push({
      field: 'lineItems',
      from: '(none)',
      to: `${reconstructed.length} items reconstructed from raw text`,
      rule: 'Line item reconstruction from table patterns',
    })
  }

  return { lineItems: reconstructed, corrections }
}

/* ─── Financial Consistency Engine ──────────────────────────────── */

/**
 * Enforce mathematical correctness on invoice amounts.
 * Rules:
 *   - Subtotal + Tax = Total
 *   - CGST + SGST = Tax (or IGST = Tax)
 *   - Line items sum ≈ Subtotal
 *   - Auto-correct minor discrepancies (< ₹5 rounding)
 *   - Block processing if major mismatch (> 5% or > ₹100)
 */
function enforceFinancialConsistency(parsed) {
  const corrections = []
  const flags = [] // issues that can't be auto-corrected

  let { subtotal, taxAmount, totalAmount, lineItems = [] } = parsed

  subtotal = parseNum(subtotal)
  taxAmount = parseNum(taxAmount)
  totalAmount = parseNum(totalAmount)

  // 0. Detect fake consistency — all zeros except total, or trivially small amounts
  const allZerosExceptTotal = subtotal <= 0 && taxAmount <= 0 && totalAmount > 0
  const trivialTotal = totalAmount > 0 && totalAmount <= 10 && lineItems.length === 0

  if (allZerosExceptTotal && lineItems.length > 0) {
    // Have line items but no subtotal/tax — derive them
    const lineSum = round2(lineItems.reduce((s, it) => s + (parseNum(it.amount) || 0), 0))
    if (lineSum > 0) {
      subtotal = lineSum
      corrections.push({ field: 'subtotal', from: 0, to: subtotal, rule: 'Derived from line items (was zero)' })
    }
  }

  if (trivialTotal && subtotal <= 0) {
    flags.push({
      field: 'totalAmount',
      severity: 'error',
      message: `Total amount ₹${totalAmount.toFixed(2)} is trivially small with no line items — likely OCR extraction failure`,
    })
  }

  // 0b. Structural validation: if items exist, line sum must be reasonable vs total
  if (lineItems.length > 0 && totalAmount > 0) {
    const lineSum = round2(lineItems.reduce((s, it) => s + (parseNum(it.amount) || 0), 0))
    const hasInvalidItems = lineItems.some((it) => {
      const qty = parseNum(it.quantity)
      const price = parseNum(it.unitPrice)
      const amt = parseNum(it.amount)
      return (qty <= 0 && price <= 0 && amt <= 0) // completely empty
    })
    if (hasInvalidItems) {
      flags.push({
        field: 'lineItems',
        severity: 'warning',
        message: 'One or more line items have all-zero values — verify extraction',
      })
    }

    // If ALL line items have qty=0 or unitPrice=0 but amounts exist → structural failure
    const allBroken = lineItems.every((it) =>
      (parseNum(it.quantity) <= 0 || parseNum(it.unitPrice) <= 0) && parseNum(it.amount) > 0,
    )
    if (allBroken && lineItems.length > 0) {
      flags.push({
        field: 'lineItems',
        severity: 'warning',
        message: 'All line items have missing quantity or unit price — OCR structural extraction likely failed',
      })
    }
  }

  // 1. Line items → subtotal
  const lineSum = round2(lineItems.reduce((s, it) => s + (parseNum(it.amount) || 0), 0))

  if (lineItems.length > 0 && lineSum > 0) {
    if (subtotal <= 0) {
      // Derive subtotal from line items
      subtotal = lineSum
      corrections.push({ field: 'subtotal', from: parsed.subtotal, to: subtotal, rule: 'Derived from line items sum' })
    } else if (Math.abs(lineSum - subtotal) <= 5) {
      // Minor rounding: trust line items
      corrections.push({ field: 'subtotal', from: subtotal, to: lineSum, rule: `Auto-corrected rounding (₹${Math.abs(lineSum - subtotal).toFixed(2)} diff)` })
      subtotal = lineSum
    } else if (Math.abs(lineSum - subtotal) > 5) {
      const diffPct = Math.abs(lineSum - subtotal) / Math.max(subtotal, 1) * 100
      if (diffPct > 5 || Math.abs(lineSum - subtotal) > 100) {
        // Major mismatch: trust the extracted subtotal from document over computed sum
        // Line items may have OCR errors in qty/price, but subtotal is printed directly
        corrections.push({ field: 'subtotal', from: lineSum, to: subtotal, rule: `Trusting extracted subtotal over line items sum (₹${Math.abs(lineSum - subtotal).toFixed(2)} diff)` })
        flags.push({
          field: 'subtotal',
          severity: 'warning',
          message: `Line items sum (₹${lineSum.toFixed(2)}) differs from subtotal (₹${subtotal.toFixed(2)}) by ₹${Math.abs(lineSum - subtotal).toFixed(2)} (${diffPct.toFixed(1)}%) — using extracted subtotal`,
        })
      } else {
        // Moderate difference: correct to line items
        corrections.push({ field: 'subtotal', from: subtotal, to: lineSum, rule: `Corrected to line items sum (₹${Math.abs(lineSum - subtotal).toFixed(2)} diff)` })
        subtotal = lineSum
      }
    }
  }

  // 2. Subtotal + Tax = Total
  if (subtotal > 0 && taxAmount > 0 && totalAmount > 0) {
    const computedTotal = round2(subtotal + taxAmount)
    const diff = Math.abs(computedTotal - totalAmount)

    if (diff > 0 && diff <= 5) {
      // Minor rounding: adjust total
      corrections.push({ field: 'totalAmount', from: totalAmount, to: computedTotal, rule: `Auto-corrected rounding: subtotal + tax (₹${diff.toFixed(2)} diff)` })
      totalAmount = computedTotal
    } else if (diff > 5) {
      const diffPct = diff / Math.max(totalAmount, 1) * 100
      if (diffPct > 5 || diff > 100) {
        // Major inconsistency: trust the extracted total (most reliably printed on invoices)
        // and recalculate tax as total - subtotal
        const derivedTax = round2(totalAmount - subtotal)
        if (derivedTax >= 0 && totalAmount > subtotal) {
          corrections.push({ field: 'taxAmount', from: taxAmount, to: derivedTax, rule: `Recalculated tax from total - subtotal (₹${diff.toFixed(2)} mismatch resolved)` })
          taxAmount = derivedTax
          flags.push({
            field: 'totalAmount',
            severity: 'warning',
            message: `Subtotal + original Tax = ₹${computedTotal.toFixed(2)}, but Total is ₹${totalAmount.toFixed(2)} — tax recalculated as ₹${derivedTax.toFixed(2)}`,
          })
        } else {
          flags.push({
            field: 'totalAmount',
            severity: 'warning',
            message: `Subtotal (₹${subtotal.toFixed(2)}) + Tax (₹${taxAmount.toFixed(2)}) = ₹${computedTotal.toFixed(2)}, but Total is ₹${totalAmount.toFixed(2)} — difference ₹${diff.toFixed(2)}`,
          })
        }
      } else {
        corrections.push({ field: 'totalAmount', from: totalAmount, to: computedTotal, rule: `Corrected to subtotal + tax (₹${diff.toFixed(2)} diff)` })
        totalAmount = computedTotal
      }
    }
  }

  // 3. Derive missing fields
  if (!taxAmount && subtotal > 0 && totalAmount > subtotal) {
    taxAmount = round2(totalAmount - subtotal)
    corrections.push({ field: 'taxAmount', from: parsed.taxAmount, to: taxAmount, rule: 'Derived: total - subtotal' })
  }
  if (!subtotal && totalAmount > 0 && taxAmount > 0 && totalAmount > taxAmount) {
    subtotal = round2(totalAmount - taxAmount)
    corrections.push({ field: 'subtotal', from: parsed.subtotal, to: subtotal, rule: 'Derived: total - tax' })
  }
  if (!totalAmount && subtotal > 0) {
    totalAmount = round2(subtotal + (taxAmount || 0))
    corrections.push({ field: 'totalAmount', from: parsed.totalAmount, to: totalAmount, rule: 'Derived: subtotal + tax' })
  }

  // 4. Tax sanity — standard Indian GST rates: 0%, 5%, 12%, 18%, 28%
  if (taxAmount > 0 && subtotal > 0) {
    const taxPct = (taxAmount / subtotal) * 100
    const standardRates = [0, 5, 12, 18, 28]
    const nearest = standardRates.reduce((best, r) => Math.abs(taxPct - r) < Math.abs(taxPct - best) ? r : best)
    if (Math.abs(taxPct - nearest) > 2 && taxPct > 30) {
      flags.push({
        field: 'taxAmount',
        severity: 'warning',
        message: `Tax rate ~${taxPct.toFixed(1)}% is unusual (nearest standard: ${nearest}%)`,
      })
    }
  }

  // 5. CGST/SGST consistency
  const cgst = parseNum(parsed.cgst)
  const sgst = parseNum(parsed.sgst)
  const igst = parseNum(parsed.igst)
  if (cgst > 0 && sgst > 0) {
    if (Math.abs(cgst - sgst) > 1) {
      flags.push({
        field: 'taxBreakdown',
        severity: 'warning',
        message: `CGST (₹${cgst.toFixed(2)}) ≠ SGST (₹${sgst.toFixed(2)}) — they should be equal for intra-state`,
      })
    }
    const taxSum = round2(cgst + sgst)
    if (taxAmount > 0 && Math.abs(taxSum - taxAmount) > 1) {
      if (Math.abs(taxSum - taxAmount) <= 5) {
        corrections.push({ field: 'taxAmount', from: taxAmount, to: taxSum, rule: 'Corrected to CGST + SGST sum' })
        taxAmount = taxSum
      }
    }
  }
  if (igst > 0 && taxAmount > 0 && Math.abs(igst - taxAmount) > 1) {
    if (Math.abs(igst - taxAmount) <= 5) {
      corrections.push({ field: 'taxAmount', from: taxAmount, to: igst, rule: 'Corrected to IGST amount' })
      taxAmount = igst
    }
  }

  // 6. Distribute tax to line items if missing
  if (lineItems.length > 0 && taxAmount > 0 && subtotal > 0) {
    const taxRate = taxAmount / subtotal
    let anyFixed = false
    for (const item of lineItems) {
      if ((!item.tax || item.tax <= 0) && item.amount > 0) {
        item.tax = round2(item.amount * taxRate)
        anyFixed = true
      }
    }
    if (anyFixed) {
      corrections.push({ field: 'lineItems.tax', from: 0, to: `${(taxRate * 100).toFixed(1)}% distributed`, rule: 'Tax distributed to line items proportionally' })
    }
  }

  return {
    corrected: { ...parsed, subtotal, taxAmount, totalAmount, lineItems },
    corrections,
    flags,
    consistent: flags.filter((f) => f.severity === 'error').length === 0,
  }
}

/* ─── Self-Healing Correction Layer ─────────────────────────────── */

/**
 * When inconsistencies are detected, attempt auto-fix by:
 *   1. Re-evaluating alternate parsing patterns
 *   2. Using financial rules to derive missing values
 *   3. Cleaning OCR artifacts from field values
 */
function selfHeal(parsed, rawText) {
  const corrections = []
  const resolutions = {} // Track auto-resolution sources

  // ── GSTIN Recovery Engine ─────────────────────────────
  const gstinResult = recoverGSTIN(parsed, rawText)
  if (gstinResult.gstin && gstinResult.gstin !== parsed.gstin) {
    parsed.gstin = gstinResult.gstin
    corrections.push(...gstinResult.corrections)
    resolutions.gstin = { resolved: true, source: gstinResult.source, original: '', final: gstinResult.gstin }
  } else if (gstinResult.gstin) {
    resolutions.gstin = { resolved: true, source: 'extracted', original: gstinResult.gstin, final: gstinResult.gstin }
  }

  // ── Invoice Date Intelligence ─────────────────────────
  const dateResult = recoverInvoiceDate(parsed, rawText)
  if (dateResult.invoiceDate && !parsed.invoiceDate) {
    parsed.invoiceDate = dateResult.invoiceDate
    parsed._dateSystemInferred = dateResult.systemInferred
    parsed._dateSource = dateResult.source
    corrections.push(...dateResult.corrections)
    resolutions.invoiceDate = { resolved: true, source: dateResult.source, original: '', final: dateResult.invoiceDate, systemInferred: dateResult.systemInferred }
  } else if (parsed.invoiceDate) {
    resolutions.invoiceDate = { resolved: true, source: 'extracted', original: parsed.invoiceDate, final: parsed.invoiceDate, systemInferred: false }
  }

  // ── Invoice Number Recovery ───────────────────────────
  if (!parsed.invoiceNumber && rawText) {
    // Try additional patterns that parseOCRText may have missed
    const recoveryPatterns = [
      // "No." on its own line followed by value
      /(?:^|\n)\s*no\.?\s*[:\-]\s*([A-Z0-9\-\/\._]{2,})/im,
      // OCR may insert spaces in the number
      /invoice\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9][\sA-Z0-9\-\/]{2,})/i,
      // Standalone alphanumeric near top (likely invoice number)
      /(?:^|\n)\s*#\s*([A-Z0-9\-\/]{3,})/m,
    ]
    for (const p of recoveryPatterns) {
      const m = rawText.match(p)
      if (m) {
        const cleaned = m[1].replace(/\s+/g, '').trim()
        if (cleaned.length >= 3) {
          corrections.push({ field: 'invoiceNumber', from: '(missing)', to: cleaned, rule: 'Invoice number recovered from text scan' })
          parsed.invoiceNumber = cleaned
          resolutions.invoiceNumber = { resolved: true, source: 'text_recovery', original: '', final: cleaned }
          break
        }
      }
    }
  }

  // Clean vendor name — remove stray characters, excess whitespace
  if (parsed.vendorName) {
    const cleaned = parsed.vendorName
      .replace(/[|\\{}[\]<>]/g, '')  // Remove OCR artifact characters
      .replace(/\s{2,}/g, ' ')       // Collapse multiple spaces
      .trim()
    if (cleaned !== parsed.vendorName) {
      corrections.push({ field: 'vendorName', from: parsed.vendorName, to: cleaned, rule: 'OCR artifact cleanup' })
      parsed.vendorName = cleaned
    }
  }

  // Clean GSTIN — common OCR misreads: 0↔O, 1↔I, 5↔S
  if (parsed.gstin) {
    let fixed = parsed.gstin.toUpperCase()
    // GSTIN is 2 digits + 10 PAN chars + 1 entity + Z + check digit
    // First 2 must be digits
    fixed = fixed.replace(/^([OoIi])/, (_, c) => c === 'O' || c === 'o' ? '0' : '1')
    // Position 14 is always Z
    if (fixed.length === 15 && fixed[13] !== 'Z') {
      if (fixed[13] === '2') {
        fixed = fixed.slice(0, 13) + 'Z' + fixed.slice(14)
        corrections.push({ field: 'gstin', from: parsed.gstin, to: fixed, rule: 'Fixed Z position in GSTIN (OCR misread)' })
      }
    }
    if (fixed !== parsed.gstin) {
      parsed.gstin = fixed
    }
  }

  // Clean invoice number — remove stray spaces
  if (parsed.invoiceNumber) {
    const cleaned = parsed.invoiceNumber.replace(/\s+/g, '').trim()
    if (cleaned !== parsed.invoiceNumber) {
      corrections.push({ field: 'invoiceNumber', from: parsed.invoiceNumber, to: cleaned, rule: 'Removed stray spaces from invoice number' })
      parsed.invoiceNumber = cleaned
    }
  }

  // Try alternate total extraction if total is 0 but text has amounts
  if ((!parsed.totalAmount || parsed.totalAmount <= 0) && rawText) {
    const amountMatches = []
    const re = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi
    let m
    while ((m = re.exec(rawText)) !== null) {
      amountMatches.push(parseNum(m[1]))
    }
    if (amountMatches.length > 0) {
      const maxAmount = Math.max(...amountMatches)
      if (maxAmount > 0) {
        corrections.push({ field: 'totalAmount', from: parsed.totalAmount, to: maxAmount, rule: 'Self-heal: picked largest currency amount from text' })
        parsed.totalAmount = maxAmount
      }
    }
  }

  // Detect handwritten elements — flag lines with very low word confidence
  // (This is handled in confidence scoring, but we add a flag here)
  if (rawText) {
    const hasUnusualChars = /[§†‡¶©®™]/.test(rawText)
    if (hasUnusualChars) {
      corrections.push({ field: '_handwriting', from: null, to: 'possible', rule: 'Unusual characters detected — possible handwritten elements' })
    }
  }

  // Track vendorName and invoiceNumber as resolved if present
  if (parsed.vendorName && !resolutions.vendorName) {
    resolutions.vendorName = { resolved: true, source: 'extracted', original: parsed.vendorName, final: parsed.vendorName }
  }
  if (parsed.invoiceNumber && !resolutions.invoiceNumber) {
    resolutions.invoiceNumber = { resolved: true, source: 'extracted', original: parsed.invoiceNumber, final: parsed.invoiceNumber }
  }
  // Track totalAmount as resolved if present
  if (parsed.totalAmount > 0 && !resolutions.totalAmount) {
    resolutions.totalAmount = { resolved: true, source: 'extracted', original: parsed.totalAmount, final: parsed.totalAmount }
  }

  return { corrected: parsed, corrections, resolutions }
}

/* ─── Enhanced Duplicate Detection ──────────────────────────────── */

/**
 * Check for duplicate invoices using multiple signals:
 *   - Invoice number + GSTIN + amount
 *   - Fuzzy vendor name matching
 *   - Date proximity
 */
async function checkDuplicates(parsed, companyId) {
  const duplicates = []

  if (!parsed.invoiceNumber || !companyId) return duplicates

  try {
    // Exact match: invoice number
    const exactMatch = await Invoice.findOne({
      companyId,
      invoiceNumber: parsed.invoiceNumber,
    }).lean()

    if (exactMatch) {
      duplicates.push({
        type: 'exact',
        field: 'invoiceNumber',
        message: `Invoice ${parsed.invoiceNumber} already exists`,
        existingId: exactMatch._id.toString(),
        existingTotal: exactMatch.totalAmount,
      })
    }

    // Fuzzy match: same vendor + similar amount + same date
    if (parsed.vendorName && parsed.totalAmount > 0) {
      const candidates = await Invoice.find({
        companyId,
        totalAmount: { $gte: parsed.totalAmount * 0.95, $lte: parsed.totalAmount * 1.05 },
        'metadata.vendorName': { $exists: true },
      }).lean().limit(10)

      for (const c of candidates) {
        if (c._id.toString() === exactMatch?._id?.toString()) continue
        const vendorMatch = c.metadata?.vendorName?.toLowerCase() === parsed.vendorName?.toLowerCase()
        if (vendorMatch) {
          duplicates.push({
            type: 'fuzzy',
            field: 'vendor+amount',
            message: `Possible duplicate: ${c.invoiceNumber} from same vendor with similar amount (₹${c.totalAmount})`,
            existingId: c._id.toString(),
            existingTotal: c.totalAmount,
          })
        }
      }
    }
  } catch (e) {
    logger.warn('ocr_intelligence.duplicate_check_failed', { error: e.message })
  }

  return duplicates
}

/* ─── Main Export ────────────────────────────────────────────────── */

export const ocrIntelligenceService = {
  /**
   * Run all correction layers on parsed OCR data.
   * Returns corrected data + all corrections applied + consistency flags.
   *
   * @param {object} parsed - Output from parseOCRText
   * @param {string} rawText - Original OCR text
   * @param {string} companyId - For duplicate detection
   * @param {object} [options] - { ocrVariantResults: [] } for multi-pass reconciliation
   * @returns {{ corrected, corrections[], flags[], duplicates[], consistent, correctionCount, dateSystemInferred }}
   */
  async correctAndValidate(parsed, rawText, companyId, options = {}) {
    const allCorrections = []
    const allFlags = []
    const autoResolutions = {}

    // Layer 0: Multi-pass reconciliation (if we have results from multiple OCR variants)
    if (options.ocrVariantResults?.length > 1) {
      const reconciled = this.reconcileMultiPass(parsed, options.ocrVariantResults)
      if (reconciled.corrections.length > 0) {
        Object.assign(parsed, reconciled.merged)
        allCorrections.push(...reconciled.corrections)
      }
    }

    // Layer 1: Self-healing (OCR artifact cleanup, GSTIN recovery, date intelligence)
    const healed = selfHeal({ ...parsed }, rawText)
    allCorrections.push(...healed.corrections)
    Object.assign(autoResolutions, healed.resolutions || {})

    // Layer 1b: Vendor DB GSTIN lookup (if GSTIN still missing after OCR recovery)
    if (!healed.corrected.gstin && healed.corrected.vendorName && companyId) {
      const vendorLookup = await lookupVendorGSTIN(healed.corrected.vendorName, companyId)
      if (vendorLookup?.gstin) {
        allCorrections.push({
          field: 'gstin',
          from: '(missing)',
          to: vendorLookup.gstin,
          rule: `GSTIN recovered from vendor ${vendorLookup.source === 'vendor_history' ? 'invoice history' : 'fuzzy match'}`,
        })
        healed.corrected.gstin = vendorLookup.gstin
        autoResolutions.gstin = { resolved: true, source: vendorLookup.source, original: '', final: vendorLookup.gstin }
      }
    }

    // Layer 1c: Vendor template GSTIN (if still missing — template was applied before this call)
    // This is handled in the controller via vendorLearningService.applyTemplate()

    // Layer 1.5: Table Reconstruction Engine (structured tabular invoices)
    // Attempts header-based column mapping with bounding boxes or text positions
    let tableReconstructionMeta = null
    const ocrWords = options.ocrWords || []
    const documentTotals = {
      subtotal: healed.corrected.subtotal || 0,
      taxAmount: healed.corrected.taxAmount || 0,
      totalAmount: healed.corrected.totalAmount || 0,
    }

    try {
      const tableResult = tableReconstructionService.reconstruct(rawText, ocrWords, documentTotals)

      if (tableResult.items.length > 0 && tableResult.tableConfidence >= 0.5) {
        // Table engine produced better results — convert items to standard format
        const tableItems = tableResult.items.map((ti, idx) => ({
          sno: ti.sno || idx + 1,
          description: ti.description || '',
          quantity: ti.quantity || 0,
          unitPrice: ti.unitPrice || 0,
          tax: ti.tax || 0,
          amount: ti.amount || ti.taxableValue || 0,
          hsn: ti.hsn || '',
          cgst: ti.cgst || 0,
          sgst: ti.sgst || 0,
          igst: ti.igst || 0,
          gstRate: ti.gstRate || 0,
        }))

        // Compare with existing items: use table engine if it has more complete items
        const existingItems = healed.corrected.lineItems || []
        const existingValid = existingItems.filter((it) => it.quantity > 0 && it.unitPrice > 0 && it.amount > 0)
        const tableValid = tableItems.filter((it) => it.quantity > 0 && it.unitPrice > 0 && it.amount > 0)

        if ((tableValid.length >= existingValid.length || tableResult.tableConfidence > 0.8) && tableResult.method !== 'financial_override') {
          healed.corrected.lineItems = tableItems
          allCorrections.push({
            field: 'lineItems',
            from: `${existingItems.length} items (basic parsing)`,
            to: `${tableItems.length} items (table reconstruction: ${tableResult.method})`,
            rule: `Table Reconstruction Engine: ${tableResult.method} — ${tableResult.meta?.columnsDetected || 0} columns detected`,
          })

          // If table engine found tax details, update document-level tax
          const tableTotalTax = tableItems.reduce((s, it) => s + (it.tax || 0), 0)
          if (tableTotalTax > 0 && (!healed.corrected.taxAmount || healed.corrected.taxAmount <= 0)) {
            healed.corrected.taxAmount = round2(tableTotalTax)
            allCorrections.push({
              field: 'taxAmount',
              from: 0,
              to: healed.corrected.taxAmount,
              rule: 'Tax amount derived from table reconstruction line item taxes',
            })
          }
        }

        tableReconstructionMeta = {
          used: true,
          method: tableResult.method,
          tableConfidence: tableResult.tableConfidence,
          columnsDetected: tableResult.meta?.columnsDetected || 0,
          headerDetected: tableResult.meta?.headerDetected || false,
          itemsExtracted: tableResult.items.length,
          validItems: tableValid.length,
          rejectedItems: tableResult.meta?.rejectedItems || 0,
          headerMap: tableResult.headerMap,
          corrections: tableResult.corrections.length,
        }

        // Add table-specific corrections to audit trail
        allCorrections.push(...tableResult.corrections)
      } else {
        tableReconstructionMeta = {
          used: false,
          method: tableResult.method,
          reason: tableResult.items.length === 0 ? 'no_items_extracted' : 'low_confidence',
          tableConfidence: tableResult.tableConfidence,
        }
      }
    } catch (tableErr) {
      logger.warn('table_reconstruction_failed', { error: tableErr.message })
      tableReconstructionMeta = { used: false, method: 'error', reason: tableErr.message }
    }

    // Layer 2: Line item reconstruction (fallback / enhancement on top of table engine)
    const reconstructed = reconstructLineItems(rawText, healed.corrected.lineItems)
    healed.corrected.lineItems = reconstructed.lineItems
    allCorrections.push(...reconstructed.corrections)

    // Layer 2b: Final line item guarantee — ensure all items are mathematically valid
    const finalItems = (healed.corrected.lineItems || []).map((item, idx) => {
      const fixed = { ...item }
      let wasFixed = false

      // Guarantee: qty > 0
      if (!fixed.quantity || fixed.quantity <= 0) {
        if (fixed.amount > 0 && fixed.unitPrice > 0) {
          fixed.quantity = Math.round(fixed.amount / fixed.unitPrice) || 1
        } else {
          fixed.quantity = 1
        }
        allCorrections.push({ field: `lineItems[${idx}].quantity`, from: item.quantity, to: fixed.quantity, rule: 'Auto-resolved: qty set to ensure validity' })
        wasFixed = true
      }

      // Guarantee: unitPrice > 0
      if (!fixed.unitPrice || fixed.unitPrice <= 0) {
        if (fixed.amount > 0 && fixed.quantity > 0) {
          fixed.unitPrice = round2(fixed.amount / fixed.quantity)
        } else if (fixed.amount > 0) {
          fixed.unitPrice = fixed.amount
        } else {
          fixed.unitPrice = 0 // truly empty item, will be filtered
        }
        if (fixed.unitPrice > 0) {
          allCorrections.push({ field: `lineItems[${idx}].unitPrice`, from: item.unitPrice, to: fixed.unitPrice, rule: 'Auto-resolved: unitPrice derived' })
          wasFixed = true
        }
      }

      // Guarantee: amount = qty × unitPrice
      if (fixed.quantity > 0 && fixed.unitPrice > 0) {
        const computed = round2(fixed.quantity * fixed.unitPrice)
        if (!fixed.amount || fixed.amount <= 0 || Math.abs(computed - fixed.amount) > 1) {
          if (fixed.amount > 0 && Math.abs(computed - fixed.amount) > 1) {
            // Trust amount, recompute unitPrice
            fixed.unitPrice = round2(fixed.amount / fixed.quantity)
          } else {
            fixed.amount = computed
          }
          if (!wasFixed) {
            allCorrections.push({ field: `lineItems[${idx}].amount`, from: item.amount, to: fixed.amount, rule: 'Auto-resolved: amount = qty × unitPrice' })
          }
        }
      }

      return fixed
    }).filter((it) => it.unitPrice > 0 || it.amount > 0 || it.description) // Remove truly empty items

    healed.corrected.lineItems = finalItems

    // Track line item resolution
    const allItemsValid = finalItems.every((it) => it.quantity > 0 && it.unitPrice > 0 && it.amount > 0)
    if (reconstructed.corrections.length > 0 || allItemsValid) {
      autoResolutions.lineItems = {
        resolved: allItemsValid,
        source: reconstructed.corrections.length > 0 ? 'reconstruction' : 'validated',
        itemsFixed: reconstructed.corrections.length,
      }
    }

    // Layer 3: Financial consistency engine — recompute everything from line items
    const financial = enforceFinancialConsistency(healed.corrected)
    allCorrections.push(...financial.corrections)
    allFlags.push(...financial.flags)

    if (financial.corrections.length > 0 || financial.consistent) {
      autoResolutions.financials = { resolved: financial.consistent, source: financial.corrections.length > 0 ? 'recomputed' : 'validated', correctionsApplied: financial.corrections.length }
    }

    // Layer 4: Duplicate detection
    const duplicates = await checkDuplicates(financial.corrected, companyId)

    // Layer 5: Build line item reconstruction metadata
    const lineItemMeta = {
      originalCount: parsed.lineItems?.length || 0,
      finalCount: financial.corrected.lineItems?.length || 0,
      unrealisticValuesFixed: allCorrections.filter((c) =>
        c.field.includes('lineItems') && (c.rule.includes('nrealistic') || c.rule.includes('Auto-resolved')),
      ).length,
      reconstructedFromText: allCorrections.some((c) => c.rule.includes('reconstruction')),
      allItemsValid: (financial.corrected.lineItems || []).every(
        (it) => it.quantity > 0 && it.unitPrice > 0 && it.amount > 0,
      ),
    }

    return {
      corrected: financial.corrected,
      corrections: allCorrections,
      flags: allFlags,
      duplicates,
      consistent: financial.consistent,
      correctionCount: allCorrections.length,
      dateSystemInferred: healed.corrected._dateSystemInferred || false,
      dateSource: healed.corrected._dateSource || 'extracted',
      lineItemReconstructionMeta: lineItemMeta,
      tableReconstructionMeta,
      autoResolutions,
    }
  },

  /**
   * Multi-pass reconciliation: merge best fields from multiple OCR variant results.
   * For each field, pick the value from the variant with the highest confidence.
   */
  reconcileMultiPass(parsed, variantResults) {
    const corrections = []
    const merged = {}

    if (!variantResults || variantResults.length < 2) return { merged, corrections }

    // Fields to reconcile
    const textFields = ['vendorName', 'gstin', 'invoiceNumber', 'invoiceDate']

    for (const field of textFields) {
      // Collect all non-empty values across variants
      const candidates = []
      for (const vr of variantResults) {
        if (vr.text) {
          // Re-parse each variant's text to extract this field
          // (we use simple pattern matching here to avoid circular deps)
          const val = extractFieldFromText(field, vr.text)
          if (val) {
            candidates.push({ value: val, confidence: vr.confidence || 0, variant: vr.variant || 'unknown' })
          }
        }
      }

      if (candidates.length > 0) {
        // Pick highest confidence value
        candidates.sort((a, b) => b.confidence - a.confidence)
        const best = candidates[0]
        if (best.value && best.value !== parsed[field]) {
          merged[field] = best.value
          corrections.push({
            field,
            from: parsed[field] || '(empty)',
            to: best.value,
            rule: `Multi-pass reconciliation: picked from ${best.variant} variant (${best.confidence.toFixed(1)}% conf)`,
          })
        }
      }
    }

    return { merged, corrections }
  },

  /**
   * Standalone line item reconstruction.
   */
  reconstructLineItems,

  /**
   * Standalone financial consistency check.
   */
  enforceFinancialConsistency,

  /**
   * Standalone GSTIN recovery.
   */
  recoverGSTIN,

  /**
   * Standalone date recovery.
   */
  recoverInvoiceDate,
}

/* ─── Utility: extract a single field from raw text ─────────────── */
function extractFieldFromText(field, text) {
  switch (field) {
    case 'gstin': {
      GSTIN_RE.lastIndex = 0
      const m = text.toUpperCase().match(GSTIN_RE)
      return m?.[0] || null
    }
    case 'invoiceNumber': {
      const patterns = [
        /invoice\s*(?:no|number|#|num)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
        /inv[.\-]?\s*#?\s*:?\s*([A-Z0-9\-\/]+)/i,
      ]
      for (const p of patterns) {
        const m = text.match(p)
        if (m) return m[1]
      }
      return null
    }
    case 'invoiceDate': {
      const m = text.match(/(?:date|dated|dt)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i)
      return m?.[1] || null
    }
    case 'vendorName': {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      return lines.find(
        (l) => l.length > 3 && !/^\d{2}[\/-]/.test(l) &&
          !/gstin|invoice|tax|bill|date|total|amount/i.test(l) && !/^\d+\.?\s*$/.test(l),
      ) || null
    }
    default:
      return null
  }
}
