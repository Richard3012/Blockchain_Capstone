/**
 * Table Reconstruction Engine v2
 * ──────────────────────────────
 * FORCE table reconstruction on every invoice.
 *
 * Pipeline (position-based, NOT text-order):
 *   1. X-Clustering: group all words by X position → columns
 *   2. Header Detection: match column clusters to known headers
 *   3. FORCED table if ≥ 2 vertical numeric alignments
 *   4. Y-Clustering: group words by Y proximity → rows
 *   5. Cell Assignment: STRICTLY by column X position
 *   6. Multi-line description merging
 *   7. HSN never mapped to quantity (hard rule)
 *   8. Self-healing: qty>1000, unitPrice=0, amount mismatch
 *   9. Financial override from doc totals
 *   10. Validation
 *
 * CRITICAL RULES:
 *   - Value assignment ONLY by column X position, NEVER text order
 *   - HSN (4-8 digits) is NEVER a quantity
 *   - Quantity must be < 1000 for realistic invoices
 *   - Every row: qty > 0, unitPrice > 0, amount = qty × unitPrice
 */

import { logger } from '../utils/logger.js'

const round2 = (n) => Math.round(n * 100) / 100

/* ═══════════════════════════════════════════════════════════════════
   Header Detection Patterns
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Known header aliases → canonical field name.
 * Order matters: first match wins.
 */
const HEADER_ALIASES = [
  // Serial number
  { canonical: 'sno', patterns: [/^s\.?\s*no\.?$/i, /^sr\.?\s*no\.?$/i, /^sl\.?\s*no\.?$/i, /^#$/i, /^no\.?$/i, /^item\s*#$/i] },
  // HSN / SAC code
  { canonical: 'hsn', patterns: [/^hsn/i, /^sac/i, /^hsn\s*[\/|]\s*sac/i, /^hsn\s*code/i] },
  // Description
  { canonical: 'description', patterns: [/^desc/i, /^particular/i, /^item\s*name/i, /^product/i, /^service/i, /^material/i, /^goods/i, /^name\s*of\s*product/i] },
  // Quantity
  { canonical: 'quantity', patterns: [/^qty\.?$/i, /^quantity$/i, /^qnty$/i, /^nos\.?$/i, /^units?$/i, /^pcs\.?$/i] },
  // UOM (Unit of Measure)
  { canonical: 'uom', patterns: [/^uom$/i, /^unit$/i, /^u\.o\.m/i] },
  // Rate / Unit Price
  { canonical: 'rate', patterns: [/^rate$/i, /^price$/i, /^unit\s*price$/i, /^mrp$/i, /^rate\s*per\s*unit$/i, /^unit\s*rate$/i] },
  // Discount
  { canonical: 'discount', patterns: [/^disc/i, /^discount/i, /^dis\.?%/i] },
  // Taxable Value / Amount before tax
  { canonical: 'taxableValue', patterns: [/^taxable/i, /^taxable\s*val/i, /^taxable\s*amount/i, /^base\s*amount/i, /^net\s*amount/i, /^value/i] },
  // CGST
  { canonical: 'cgst', patterns: [/^cgst/i, /^c\.g\.s\.t/i] },
  // SGST
  { canonical: 'sgst', patterns: [/^sgst/i, /^s\.g\.s\.t/i] },
  // IGST
  { canonical: 'igst', patterns: [/^igst/i, /^i\.g\.s\.t/i] },
  // GST Rate (%)
  { canonical: 'gstRate', patterns: [/^gst\s*%/i, /^gst\s*rate/i, /^tax\s*%/i, /^tax\s*rate/i, /^rate\s*%/i] },
  // Total / Amount
  { canonical: 'total', patterns: [/^total$/i, /^amount$/i, /^total\s*amount$/i, /^line\s*total$/i, /^gross\s*amount$/i, /^net\s*total$/i] },
]

/**
 * Classify a header cell text into a canonical field name.
 */
function classifyHeader(text) {
  const cleaned = text.replace(/[₹$]/g, '').trim()
  for (const alias of HEADER_ALIASES) {
    for (const pat of alias.patterns) {
      if (pat.test(cleaned)) return alias.canonical
    }
  }
  return null
}

/**
 * Detect if a text line is a table header row.
 * A header row must contain at least 3 recognized column names.
 */
function isHeaderLine(lineText) {
  // Strategy 1: Split on 2+ spaces or tab (traditional)
  const cells = lineText.split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean)
  let recognized = 0
  for (const cell of cells) {
    if (classifyHeader(cell)) recognized++
  }
  if (recognized >= 3) return true

  // Strategy 2: Keyword scan — count known header words anywhere in the line.
  // This catches Tesseract output where columns are separated by single spaces.
  const headerKeywords = /\b(sr\.?\s*no|s\.?\s*no|sl\.?\s*no|description|particulars|product|service|hsn|sac|qty|quantity|rate|price|amount|total|taxable|cgst|sgst|igst|gst\s*%|tax\s*%|value|unit|uom|discount)\b/gi
  const kwMatches = lineText.match(headerKeywords)
  if (kwMatches && new Set(kwMatches.map((m) => m.toLowerCase().replace(/\s+/g, ''))).size >= 3) return true

  return false
}

/**
 * Detect if a row of OCR words is a header row using bbox-based merging.
 * More reliable than isHeaderLine for bbox data since it doesn't depend
 * on whitespace-separated splitting.
 *
 * @param {Array} rowWords - words from a single row
 * @param {number} mergeGap - max pixel gap to merge adjacent words
 * @returns {number} count of recognized header columns
 */
function countBBoxHeaderMatches(rowWords, mergeGap = 50) {
  if (!rowWords?.length) return 0

  // Sort left to right
  const sorted = [...rowWords].sort((a, b) => {
    const ax = (a.bbox || a.bounding_box || {}).x0 || 0
    const bx = (b.bbox || b.bounding_box || {}).x0 || 0
    return ax - bx
  })

  // Merge adjacent words into header cell candidates
  const merged = []
  let current = null
  for (const w of sorted) {
    const bbox = w.bbox || w.bounding_box || {}
    if (!current) {
      current = { text: w.text, x0: bbox.x0 || 0, x1: bbox.x1 || 0 }
    } else {
      const gap = (bbox.x0 || 0) - current.x1
      if (gap < mergeGap) {
        current.text += ' ' + w.text
        current.x1 = Math.max(current.x1, bbox.x1 || 0)
      } else {
        merged.push(current)
        current = { text: w.text, x0: bbox.x0 || 0, x1: bbox.x1 || 0 }
      }
    }
  }
  if (current) merged.push(current)

  // Count recognized headers
  let recognized = 0
  for (const cell of merged) {
    if (classifyHeader(cell.text)) recognized++
  }
  return recognized
}

/* ═══════════════════════════════════════════════════════════════════
   X-Position Column Clustering (PHASE 3)
   Groups ALL words by X center into clusters → columns.
   Then maps each cluster to a header via the header row.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Cluster all word X-centers into column groups.
 * Uses a merge-threshold of `gap` pixels.
 *
 * @param {Array} words - Vision/Tesseract word objects with bbox
 * @param {number} [gap=30] - Maximum gap to merge into same cluster
 * @returns {Array<{ xMin, xMax, xCenter, wordCount }>}
 */
function clusterColumns(words, gap = null) {
  if (!words?.length) return []

  // Calculate adaptive gap from average word width if not specified
  if (gap === null) {
    const widths = words
      .map((w) => {
        const bbox = w.bbox || w.bounding_box || {}
        return (bbox.x1 || 0) - (bbox.x0 || 0)
      })
      .filter((w) => w > 0)
    const avgWidth = widths.length > 0 ? widths.reduce((a, b) => a + b, 0) / widths.length : 30
    gap = Math.max(avgWidth * 1.5, 30)
  }

  // Collect all X-centers
  const xCenters = words.map((w) => {
    const bbox = w.bbox || w.bounding_box || {}
    return ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2
  }).sort((a, b) => a - b)

  // Merge adjacent centers within gap
  const clusters = []
  let cStart = xCenters[0], cEnd = xCenters[0], cCount = 1

  for (let i = 1; i < xCenters.length; i++) {
    if (xCenters[i] - cEnd <= gap) {
      cEnd = xCenters[i]
      cCount++
    } else {
      clusters.push({ xMin: cStart, xMax: cEnd, xCenter: (cStart + cEnd) / 2, wordCount: cCount })
      cStart = xCenters[i]
      cEnd = xCenters[i]
      cCount = 1
    }
  }
  clusters.push({ xMin: cStart, xMax: cEnd, xCenter: (cStart + cEnd) / 2, wordCount: cCount })

  return clusters
}

/**
 * Detect if ≥ 2 column clusters contain mostly numeric values.
 * This is the trigger for FORCED table reconstruction.
 */
function hasVerticalNumericAlignments(words, clusters, minClusters = 2) {
  let numericClusters = 0
  for (const cluster of clusters) {
    const margin = (cluster.xMax - cluster.xMin) / 2 + 20
    const clusterWords = words.filter((w) => {
      const bbox = w.bbox || w.bounding_box || {}
      const cx = ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2
      return cx >= cluster.xMin - margin && cx <= cluster.xMax + margin
    })
    const numericCount = clusterWords.filter((w) => /^[\d,.\-₹$]+$/.test(w.text.trim())).length
    if (numericCount >= 2) numericClusters++
  }
  return numericClusters >= minClusters
}

/**
 * Build column map from OCR word-level bounding box data.
 * Groups words by their X-center position into columns,
 * then matches each column to a detected header.
 *
 * @param {Array} words - OCR word objects with bbox
 * @param {number} headerLineY - Y-coordinate of the header row
 * @returns {{ columns: Array<{ canonical, xMin, xMax, xCenter }>, headerWords: Array }}
 */
function buildColumnMap(words, headerLineY) {
  if (!words?.length || headerLineY == null) return { columns: [], headerWords: [] }

  // Find words on the header row (within ±15px of headerLineY)
  // Also check the NEXT row (within ±30px) for multi-row headers
  const tolerance = 15
  const extendedTolerance = 35 // catch sub-headers on next row
  const headerWords = words.filter((w) => {
    const bbox = w.bbox || w.bounding_box || {}
    const wordY = ((bbox.y0 || 0) + (bbox.y1 || 0)) / 2
    return Math.abs(wordY - headerLineY) <= tolerance
  })

  if (headerWords.length < 3) return { columns: [], headerWords: [] }

  // Calculate dynamic merge gap from average word height
  const wordHeights = headerWords.map((w) => {
    const bbox = w.bbox || w.bounding_box || {}
    return (bbox.y1 || 0) - (bbox.y0 || 0)
  }).filter((h) => h > 0)
  const avgHeight = wordHeights.length > 0 ? wordHeights.reduce((a, b) => a + b, 0) / wordHeights.length : 20
  const mergeGap = Math.max(avgHeight * 2.5, 50)

  // Sort header words left to right
  headerWords.sort((a, b) => {
    const aX = (a.bbox || a.bounding_box || {}).x0 || 0
    const bX = (b.bbox || b.bounding_box || {}).x0 || 0
    return aX - bX
  })

  // Merge adjacent header words that form multi-word headers (e.g. "Taxable Value")
  const mergedHeaders = []
  let current = null

  for (const w of headerWords) {
    const bbox = w.bbox || w.bounding_box || {}
    if (!current) {
      current = { text: w.text, x0: bbox.x0 || 0, x1: bbox.x1 || 0, y0: bbox.y0 || 0, y1: bbox.y1 || 0 }
    } else {
      const gap = (bbox.x0 || 0) - current.x1
      // Dynamic gap based on word height
      if (gap < mergeGap) {
        current.text += ' ' + w.text
        current.x1 = bbox.x1 || current.x1
      } else {
        mergedHeaders.push(current)
        current = { text: w.text, x0: bbox.x0 || 0, x1: bbox.x1 || 0, y0: bbox.y0 || 0, y1: bbox.y1 || 0 }
      }
    }
  }
  if (current) mergedHeaders.push(current)

  // Classify each merged header
  const columns = []
  for (const mh of mergedHeaders) {
    const canonical = classifyHeader(mh.text)
    if (canonical) {
      columns.push({
        canonical,
        headerText: mh.text,
        xMin: mh.x0,
        xMax: mh.x1,
        xCenter: (mh.x0 + mh.x1) / 2,
      })
    } else {
      // Unrecognized header — keep for reference but flag
      columns.push({
        canonical: null,
        headerText: mh.text,
        xMin: mh.x0,
        xMax: mh.x1,
        xCenter: (mh.x0 + mh.x1) / 2,
      })
    }
  }

  // ── Resolve duplicate canonicals ──────────────────────────────
  // If two columns both map to 'total' (e.g. "Amount" and "Total"),
  // keep rightmost as 'total'. If leftmost is near an igst/cgst/sgst
  // column, reclassify it as the corresponding tax amount.
  const totalCols = columns.filter((c) => c.canonical === 'total')
  if (totalCols.length > 1) {
    // Keep rightmost as total
    totalCols.sort((a, b) => a.xCenter - b.xCenter)
    for (let i = 0; i < totalCols.length - 1; i++) {
      const col = totalCols[i]
      // Check if this "Amount" is adjacent to a tax column
      const nearbyTax = columns.find((c) =>
        (c.canonical === 'igst' || c.canonical === 'cgst' || c.canonical === 'sgst' || c.canonical === 'gstRate') &&
        Math.abs(c.xCenter - col.xCenter) < 200,
      )
      if (nearbyTax) {
        // This is the tax amount column, not total
        col.canonical = nearbyTax.canonical === 'gstRate' ? 'igst' : nearbyTax.canonical
        col.headerText += ' (tax amount)'
      } else {
        // Reclassify as taxableValue
        col.canonical = 'taxableValue'
        col.headerText += ' (reclassified)'
      }
    }
  }

  // Check for sub-headers on the next row (e.g. "IGST" header with "%" and "Amount" sub-columns)
  const subHeaderWords = words.filter((w) => {
    const bbox = w.bbox || w.bounding_box || {}
    const wordY = ((bbox.y0 || 0) + (bbox.y1 || 0)) / 2
    return wordY > headerLineY + tolerance && wordY <= headerLineY + extendedTolerance
  })

  if (subHeaderWords.length > 0) {
    for (const sw of subHeaderWords) {
      const bbox = sw.bbox || sw.bounding_box || {}
      const swCenter = ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2
      const text = sw.text.trim()

      // Find which parent column this sub-header falls under
      const parentCol = columns.find((c) =>
        swCenter >= c.xMin - 30 && swCenter <= c.xMax + 30,
      )

      if (parentCol?.canonical === 'igst' || parentCol?.canonical === 'cgst' || parentCol?.canonical === 'sgst') {
        // Sub-header under a tax column: "%" → gstRate, "Amount" → keep as tax amount
        if (/^[%]$/.test(text) || /^rate/i.test(text)) {
          // Split: the "%" sub-column becomes gstRate, the parent becomes the tax amount
          // We need a new column for gstRate at this X position
          if (!columns.find((c) => c.canonical === 'gstRate')) {
            columns.push({
              canonical: 'gstRate',
              headerText: parentCol.headerText + ' %',
              xMin: bbox.x0 || parentCol.xMin,
              xMax: bbox.x1 || parentCol.xMin + 30,
              xCenter: swCenter,
            })
            // Shift parent column's xMin to the right of the % sub-column
            if (swCenter < parentCol.xCenter) {
              parentCol.xMin = (bbox.x1 || parentCol.xMin) + 5
              parentCol.xCenter = (parentCol.xMin + parentCol.xMax) / 2
            }
          }
        }
      }
    }
  }

  logger.info('table_reconstruction.column_map', {
    columns: columns.map((c) => ({ canonical: c.canonical, text: c.headerText, x: Math.round(c.xCenter) })),
    mergeGap: Math.round(mergeGap),
  })

  return { columns, headerWords: mergedHeaders }
}

/**
 * Assign a word to the nearest column based on X-coordinate overlap.
 * STRICTLY position-based — never text order.
 */
function assignWordToColumn(wordBbox, columns) {
  if (!columns.length) return null
  const wordCenter = ((wordBbox.x0 || 0) + (wordBbox.x1 || 0)) / 2

  // Calculate page width for proportional margins
  const pageWidth = Math.max(...columns.map((c) => c.xMax)) - Math.min(...columns.map((c) => c.xMin))
  const baseMargin = pageWidth > 0 ? pageWidth * 0.05 : 30

  let bestCol = null
  let bestDist = Infinity

  for (const col of columns) {
    // Check if word center falls within column bounds (with margin)
    const colWidth = col.xMax - col.xMin
    const margin = Math.max(colWidth * 0.6, baseMargin)
    if (wordCenter >= col.xMin - margin && wordCenter <= col.xMax + margin) {
      const dist = Math.abs(wordCenter - col.xCenter)
      if (dist < bestDist) {
        bestDist = dist
        bestCol = col
      }
    }
  }

  // Fallback: nearest column center
  if (!bestCol) {
    for (const col of columns) {
      const dist = Math.abs(wordCenter - col.xCenter)
      if (dist < bestDist) {
        bestDist = dist
        bestCol = col
      }
    }
  }

  return bestCol
}

/* ═══════════════════════════════════════════════════════════════════
   Row Grouping + Multi-Line Cell Merging
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Group words into rows by Y-coordinate proximity.
 * Dynamically computes tolerance from average word height.
 */
function groupWordsIntoRows(words, rowTolerance = null) {
  if (!words?.length) return []

  // Calculate average word height to use as adaptive tolerance
  const heights = words
    .map((w) => {
      const bbox = w.bbox || w.bounding_box || {}
      return (bbox.y1 || 0) - (bbox.y0 || 0)
    })
    .filter((h) => h > 0)
  const avgHeight = heights.length > 0
    ? heights.reduce((a, b) => a + b, 0) / heights.length
    : 20
  const tolerance = rowTolerance ?? Math.max(avgHeight * 0.6, 8)

  // Sort words by Y then X
  const sorted = [...words].sort((a, b) => {
    const ay = ((a.bbox || a.bounding_box || {}).y0 || 0)
    const by = ((b.bbox || b.bounding_box || {}).y0 || 0)
    if (Math.abs(ay - by) > tolerance) return ay - by
    return ((a.bbox || a.bounding_box || {}).x0 || 0) - ((b.bbox || b.bounding_box || {}).x0 || 0)
  })

  const rows = []
  let currentRow = []
  let currentY = null

  for (const word of sorted) {
    const bbox = word.bbox || word.bounding_box || {}
    const wordY = (bbox.y0 + bbox.y1) / 2

    if (currentY === null || Math.abs(wordY - currentY) <= tolerance) {
      currentRow.push(word)
      currentY = currentY === null ? wordY : (currentY + wordY) / 2
    } else {
      if (currentRow.length) rows.push({ words: currentRow, y: currentY })
      currentRow = [word]
      currentY = wordY
    }
  }
  if (currentRow.length) rows.push({ words: currentRow, y: currentY })

  logger.info('table_reconstruction.row_grouping', {
    wordCount: words.length,
    rowCount: rows.length,
    tolerance: Math.round(tolerance),
    avgWordHeight: Math.round(avgHeight),
  })

  return rows
}

/**
 * Detect if a row is a data row (not header, not totals, not separator).
 */
function isDataRow(rowText) {
  const lower = rowText.toLowerCase().trim()

  // Skip separator lines
  if (/^[\s\-=_*|+]+$/.test(lower)) return false

  // Skip empty or too short
  if (lower.length < 3) return false

  // Skip footer/totals lines
  if (/^(sub\s*total|total|grand\s*total|amount\s*in\s*words|e\.?\s*&?\s*o\.?\s*e|bank\s*details?|terms|notes?|declaration)/i.test(lower)) return false
  if (/^(taxable\s*value|tax\s*amount|round|balance|invoice\s*total|net\s*amount|freight|shipping|handling)/i.test(lower)) return false

  // Must have at least one number to be a data row (qty, rate, amount etc.)
  if (!/\d/.test(lower)) return false

  return true
}

/**
 * Check if a row starts a new line item (begins with serial number or has enough numeric columns).
 */
function startsNewItem(rowCells, columns) {
  // If there's a serial number column and this row has a value there → new item
  const snoCol = columns.find((c) => c.canonical === 'sno')
  if (snoCol) {
    const snoVal = rowCells[snoCol.canonical]
    if (snoVal && /^\d+$/.test(snoVal.trim())) return true
  }

  // If the row has values in qty AND (rate OR total) columns → new item
  const hasQty = rowCells.quantity && /\d/.test(rowCells.quantity)
  const hasRate = rowCells.rate && /\d/.test(rowCells.rate)
  const hasTotal = rowCells.total && /\d/.test(rowCells.total)
  const hasTaxable = rowCells.taxableValue && /\d/.test(rowCells.taxableValue)
  const hasHSN = rowCells.hsn && /\d/.test(rowCells.hsn)

  if (hasQty && (hasRate || hasTotal || hasTaxable)) return true

  // If row has description + HSN + (rate or taxable or total) → new item
  // (quantity might be on the same row but not detected yet, or is '1' implied)
  if (rowCells.description && hasHSN && (hasRate || hasTaxable || hasTotal)) return true

  // If row has rate AND total → new item (qty might be embedded in description)
  if (hasRate && (hasTotal || hasTaxable)) return true

  return false
}

/* ═══════════════════════════════════════════════════════════════════
   GST Invoice Content-Based Line Parser
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Parse line items from Indian GST invoice text using content analysis.
 * Handles the common format where Tesseract single-space-separates columns:
 *
 *   <sno> <description...> <HSN 4-8 digits> <qty> [UOM] <rate> <taxable> [gst%] [gst_amt] <total>
 *
 * Returns structured line items with all available fields.
 */
function parseGSTInvoiceLines(rawText, headerIdx = -1) {
  if (!rawText) return []

  const lines = rawText.split('\n')
  const items = []
  let currentItem = null
  let startParsing = headerIdx >= 0 ? headerIdx + 1 : 0

  // If no header index, try to find where data starts by looking for first line starting with "1"
  if (headerIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*1\s+[A-Za-z]/.test(lines[i])) {
        startParsing = i
        break
      }
    }
  }

  // Multi-column numeric line: extract all numbers and text segments
  for (let i = startParsing; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.length < 3) continue
    if (/^[\s\-=_*|+]+$/.test(line)) continue

    // Stop at totals/footer
    if (/^(?:sub\s*total|total\b|grand\s*total|amount\s*in\s*words|taxable\s*amount|net\s*payable|round\s*off|bank\s*details|terms|total\s+\d)/i.test(line)) break

    // Attempt to match a data row: starts with serial number followed by text
    const dataMatch = line.match(/^\s*(\d{1,3})\s+([A-Za-z].*)$/)
    if (dataMatch) {
      // Save previous item
      if (currentItem) {
        items.push(finalizeGSTItem(currentItem))
      }

      const sno = parseInt(dataMatch[1])
      const rest = dataMatch[2]

      // Parse the rest: extract all numeric tokens from right to left
      currentItem = parseGSTDataRow(sno, rest)
    } else if (currentItem) {
      // Continuation line: could be description continuation or more data

      // If line is purely text (no significant numbers), it's description continuation
      const numericTokens = line.match(/[\d,]+(?:\.\d+)?/g) || []
      const significantNums = numericTokens.filter((n) => parseFloat(n.replace(/,/g, '')) > 0)

      if (significantNums.length === 0 || (significantNums.length <= 1 && /^[A-Za-z\s()\/-]+$/.test(line.replace(/[\d.,]/g, '').trim()))) {
        // Description continuation
        const descPart = line.replace(/^\d+\s*/, '').trim()
        if (descPart && !/^(pcs|nos|units?|kgs?|ltrs?|mtrs?|sets?)$/i.test(descPart)) {
          currentItem.description += ' ' + descPart
        }
      }
    }
  }

  // Don't forget last item
  if (currentItem) {
    items.push(finalizeGSTItem(currentItem))
  }

  return items
}

/**
 * Parse a GST invoice data row (text after serial number).
 * Strategy: split into text prefix (description) and numeric suffix (values).
 * Then assign numbers right-to-left: total, gstAmt, gst%, taxable, rate, qty, hsn
 */
function parseGSTDataRow(sno, text) {
  // Extract all tokens
  const tokens = text.split(/\s+/)

  // Separate into description (leading text) and numeric (trailing numbers)
  let descTokens = []
  let numericTokens = []
  let hsnToken = null
  let uomToken = null
  let foundFirstNum = false

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const cleaned = t.replace(/[,₹$]/g, '')

    // UOM tokens: PCS, NOS, KGS, etc.
    if (/^(pcs|nos|units?|kgs?|ltrs?|mtrs?|sets?|pairs?|boxes?|doz|dozen)\.?$/i.test(t)) {
      uomToken = t
      continue
    }

    // Check if this is a number (including decimals and commas)
    if (/^[\d,]+(?:\.\d+)?$/.test(cleaned) && cleaned.length > 0) {
      const numVal = parseFloat(cleaned)
      if (!foundFirstNum) {
        // First numeric: could be HSN (4-8 digits, no decimal) or start of numeric columns
        if (/^\d{4,8}$/.test(cleaned) && numVal >= 1000) {
          // Likely HSN code
          hsnToken = cleaned
          foundFirstNum = true
          continue
        }
        foundFirstNum = true
      }
      numericTokens.push({ raw: t, value: parseFloat(cleaned.replace(/,/g, '')) })
    } else if (!foundFirstNum) {
      descTokens.push(t)
    } else {
      // Text token after numbers started — could be UOM or description continuation
      if (/^[A-Za-z()\/-]+$/.test(t) && t.length <= 6) {
        uomToken = t
      }
    }
  }

  const description = descTokens.join(' ')

  // Assign numbers right-to-left based on count:
  // With ≥6 nums: qty, rate, taxable, gst%, gstAmt, total
  // With 5 nums: qty, rate, taxable, gstAmt, total
  // With 4 nums: qty, rate, taxable, total
  // With 3 nums: qty, rate, total (or qty, taxable, total)
  // With 2 nums: qty, total
  // With 1 num: total
  const nums = numericTokens
  let quantity = 0, unitPrice = 0, taxableValue = 0, gstRate = 0, gstAmount = 0, total = 0

  if (nums.length >= 6) {
    quantity = nums[0].value
    unitPrice = nums[1].value
    taxableValue = nums[2].value
    gstRate = nums[3].value
    gstAmount = nums[4].value
    total = nums[5].value
  } else if (nums.length === 5) {
    quantity = nums[0].value
    unitPrice = nums[1].value
    taxableValue = nums[2].value
    gstAmount = nums[3].value
    total = nums[4].value
  } else if (nums.length === 4) {
    quantity = nums[0].value
    unitPrice = nums[1].value
    taxableValue = nums[2].value
    total = nums[3].value
  } else if (nums.length === 3) {
    quantity = nums[0].value
    unitPrice = nums[1].value
    total = nums[2].value
  } else if (nums.length === 2) {
    quantity = nums[0].value
    total = nums[1].value
  } else if (nums.length === 1) {
    total = nums[0].value
  }

  // Detect if gstRate is actually a GST percentage (common values: 5, 12, 18, 28)
  if (gstRate > 0 && ![5, 12, 18, 28, 0.25, 1.5, 3].includes(gstRate)) {
    // Not a standard rate — might be swapped with gstAmount
    if ([5, 12, 18, 28].includes(Math.round(gstAmount))) {
      // Swap
      const tmp = gstRate
      gstRate = gstAmount
      gstAmount = tmp
    } else {
      // Neither is a standard rate — treat both as amounts
      gstAmount = gstRate + gstAmount
      gstRate = 0
    }
  }

  return {
    sno,
    description: description.trim(),
    hsn: hsnToken || '',
    quantity,
    uom: uomToken || '',
    unitPrice,
    taxableValue,
    gstRate,
    igst: gstAmount,
    total,
  }
}

/**
 * Finalize a GST-parsed item: derive missing fields and validate.
 */
function finalizeGSTItem(item) {
  const result = {
    sno: item.sno,
    description: cleanDescription(item.description || ''),
    hsn: item.hsn || '',
    quantity: item.quantity || 0,
    uom: item.uom || '',
    unitPrice: item.unitPrice || 0,
    taxableValue: item.taxableValue || 0,
    cgst: 0,
    sgst: 0,
    igst: item.igst || 0,
    gstRate: item.gstRate || 0,
    discount: 0,
    amount: item.total || 0,
    tax: item.igst || 0,
  }

  // Derive missing: taxableValue from qty × unitPrice
  if (result.taxableValue <= 0 && result.quantity > 0 && result.unitPrice > 0) {
    result.taxableValue = round2(result.quantity * result.unitPrice)
  }

  // Derive missing: unitPrice from taxableValue / qty
  if (result.unitPrice <= 0 && result.quantity > 0 && result.taxableValue > 0) {
    result.unitPrice = round2(result.taxableValue / result.quantity)
  }

  // Derive missing: qty from taxableValue / unitPrice
  if (result.quantity <= 0 && result.unitPrice > 0 && result.taxableValue > 0) {
    result.quantity = Math.round(result.taxableValue / result.unitPrice)
  }

  // Derive missing: amount from taxableValue + tax
  if (result.amount <= 0 && result.taxableValue > 0) {
    result.amount = round2(result.taxableValue + result.tax)
  }

  // Derive gstRate from igst / taxableValue if not set
  if (result.gstRate <= 0 && result.igst > 0 && result.taxableValue > 0) {
    const rate = round2(result.igst / result.taxableValue * 100)
    // Snap to nearest standard rate
    const standardRates = [5, 12, 18, 28]
    const nearest = standardRates.reduce((prev, curr) =>
      Math.abs(curr - rate) < Math.abs(prev - rate) ? curr : prev,
    )
    if (Math.abs(nearest - rate) < 2) {
      result.gstRate = nearest
    } else {
      result.gstRate = rate
    }
  }

  // Verify: qty × unitPrice ≈ taxableValue
  if (result.quantity > 0 && result.unitPrice > 0 && result.taxableValue > 0) {
    const computed = round2(result.quantity * result.unitPrice)
    if (Math.abs(computed - result.taxableValue) > 1) {
      // Trust taxableValue, fix unitPrice
      result.unitPrice = round2(result.taxableValue / result.quantity)
    }
  }

  logger.info('table_reconstruction.gst_item', {
    desc: result.description.substring(0, 40),
    hsn: result.hsn,
    qty: result.quantity,
    rate: result.unitPrice,
    taxable: result.taxableValue,
    gstRate: result.gstRate,
    igst: result.igst,
    total: result.amount,
  })

  return result
}

/* ═══════════════════════════════════════════════════════════════════
   Text-Based Table Detection (Fallback when no bounding boxes)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Parse table from raw text using space-alignment heuristics.
 * This is the fallback when bounding box data is unavailable.
 */
function parseTableFromText(rawText) {
  if (!rawText) return { items: [], headerMap: null, method: 'none' }

  const lines = rawText.split('\n')
  const corrections = []

  // Step 1: Find header row
  let headerIdx = -1
  let headerCells = []
  let headerMap = {} // canonical → column index

  for (let i = 0; i < lines.length; i++) {
    if (isHeaderLine(lines[i])) {
      headerIdx = i
      // Split on 2+ spaces or tab
      headerCells = lines[i].split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean)

      // Build column map
      for (let j = 0; j < headerCells.length; j++) {
        const canonical = classifyHeader(headerCells[j])
        if (canonical) {
          headerMap[canonical] = j
        }
      }
      break
    }
  }

  if (headerIdx < 0) {
    // Try GST content-based parsing as last resort
    const gstItems = parseGSTInvoiceLines(rawText)
    if (gstItems.length > 0) {
      return { items: gstItems, headerMap: null, method: 'gst_content_parse' }
    }
    return { items: [], headerMap: null, method: 'no_header' }
  }

  // Step 1b: Check if position-based extraction will work
  // (requires 2+ spaces between column headers)
  const multiSpaceHeaders = lines[headerIdx].split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean)
  const multiSpaceRecognized = multiSpaceHeaders.filter((h) => classifyHeader(h)).length

  // If position-based won't work (< 2 columns recognized via multi-space split),
  // fall back to content-based GST parsing
  if (multiSpaceRecognized < 2 || Object.keys(headerMap).length < 2) {
    const gstItems = parseGSTInvoiceLines(rawText, headerIdx)
    if (gstItems.length > 0) {
      return { items: gstItems, headerMap: null, method: 'gst_content_parse' }
    }
    return { items: [], headerMap: null, method: 'no_header' }
  }

  // Step 2: Build positional column map from header character positions
  const headerLine = lines[headerIdx]
  const columnPositions = []
  let inCell = false
  let cellStart = 0

  for (let i = 0; i <= headerLine.length; i++) {
    const ch = headerLine[i]
    if (ch && ch !== ' ' && ch !== '\t') {
      if (!inCell) {
        cellStart = i
        inCell = true
      }
    } else {
      if (inCell) {
        const text = headerLine.substring(cellStart, i).trim()
        columnPositions.push({ text, start: cellStart, end: i, canonical: classifyHeader(text) })
        inCell = false
      }
    }
  }

  // Step 3: Parse data rows using positional alignment
  const items = []
  let pendingDescription = null
  let currentItem = null

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]

    // Skip separators
    if (/^[\s\-=_*|+]+$/.test(line)) continue
    if (line.trim().length < 2) continue

    // Stop at totals/footer
    if (/^[\s|]*(?:sub\s*total|total|grand\s*total|amount\s*in\s*words|taxable\s*amount|net\s*payable|round\s*off)/i.test(line)) break

    const rowText = line.trim()
    if (!rowText) continue

    // Extract values by position
    const rowValues = extractByPosition(line, columnPositions)

    // Check if this line starts a new item
    const hasNumericContent = Object.entries(rowValues).some(([key, val]) =>
      ['quantity', 'rate', 'total', 'taxableValue'].includes(key) && val && /[\d]/.test(val),
    )

    if (hasNumericContent) {
      // Save previous item
      if (currentItem) {
        if (pendingDescription) {
          currentItem.description = (currentItem.description + ' ' + pendingDescription).trim()
          pendingDescription = null
        }
        items.push(finalizeItem(currentItem, columnPositions, headerMap))
      }

      currentItem = { ...rowValues }
      pendingDescription = null
    } else if (currentItem && rowValues.description) {
      // Multi-line description continuation
      pendingDescription = (pendingDescription ? pendingDescription + ' ' : '') + rowValues.description
    }
  }

  // Don't forget last item
  if (currentItem) {
    if (pendingDescription) {
      currentItem.description = (currentItem.description + ' ' + pendingDescription).trim()
    }
    items.push(finalizeItem(currentItem, columnPositions, headerMap))
  }

  return { items, headerMap, method: 'text_position', columnPositions }
}

/**
 * Extract cell values from a line using column character positions.
 */
function extractByPosition(line, columnPositions) {
  const values = {}
  for (let i = 0; i < columnPositions.length; i++) {
    const col = columnPositions[i]
    if (!col.canonical) continue

    const start = col.start
    // End is start of next column (or end of line)
    const end = i + 1 < columnPositions.length ? columnPositions[i + 1].start : line.length
    const cellText = line.substring(start, end).trim()
    values[col.canonical] = cellText
  }
  return values
}

/**
 * Convert raw cell values into a structured line item.
 */
function finalizeItem(rawItem, columnPositions, headerMap) {
  const item = {
    sno: parseItemInt(rawItem.sno),
    description: cleanDescription(rawItem.description || ''),
    hsn: (rawItem.hsn || '').trim(),
    quantity: parseItemFloat(rawItem.quantity),
    uom: (rawItem.uom || '').trim(),
    unitPrice: parseItemFloat(rawItem.rate),
    taxableValue: parseItemFloat(rawItem.taxableValue),
    cgst: parseItemFloat(rawItem.cgst),
    sgst: parseItemFloat(rawItem.sgst),
    igst: parseItemFloat(rawItem.igst),
    gstRate: parseItemFloat(rawItem.gstRate),
    discount: parseItemFloat(rawItem.discount),
    amount: parseItemFloat(rawItem.total),
    tax: 0,
  }

  // ── Derive missing fields ──────────────────────────

  // If taxableValue exists but amount doesn't → amount = taxableValue + taxes
  if (item.taxableValue > 0 && (!item.amount || item.amount <= 0)) {
    const totalTax = (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0)
    item.amount = round2(item.taxableValue + totalTax)
  }

  // If amount exists but taxableValue doesn't → taxableValue = amount - taxes
  if (item.amount > 0 && (!item.taxableValue || item.taxableValue <= 0)) {
    const totalTax = (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0)
    item.taxableValue = round2(item.amount - totalTax)
  }

  // If no unitPrice → derive from taxableValue / qty
  if ((!item.unitPrice || item.unitPrice <= 0) && item.quantity > 0 && item.taxableValue > 0) {
    item.unitPrice = round2(item.taxableValue / item.quantity)
  }

  // If no unitPrice → derive from amount / qty
  if ((!item.unitPrice || item.unitPrice <= 0) && item.quantity > 0 && item.amount > 0) {
    item.unitPrice = round2(item.amount / item.quantity)
  }

  // If no quantity → derive from taxableValue / unitPrice
  if ((!item.quantity || item.quantity <= 0) && item.unitPrice > 0 && item.taxableValue > 0) {
    item.quantity = Math.round(item.taxableValue / item.unitPrice)
  }

  // Verify: qty × unitPrice ≈ taxableValue (if both exist)
  if (item.quantity > 0 && item.unitPrice > 0) {
    const computed = round2(item.quantity * item.unitPrice)
    // If taxableValue exists and doesn't match → trust taxableValue, fix unitPrice
    if (item.taxableValue > 0 && Math.abs(computed - item.taxableValue) > 1) {
      item.unitPrice = round2(item.taxableValue / item.quantity)
    } else if (!item.taxableValue || item.taxableValue <= 0) {
      item.taxableValue = computed
    }
  }

  // If no amount, set from taxableValue
  if ((!item.amount || item.amount <= 0) && item.taxableValue > 0) {
    item.amount = item.taxableValue
  }

  // Compute total tax for the item
  item.tax = round2((item.cgst || 0) + (item.sgst || 0) + (item.igst || 0))

  // If GST rate present but no tax amounts → compute
  if (item.gstRate > 0 && item.tax === 0 && item.taxableValue > 0) {
    const taxAmt = round2(item.taxableValue * item.gstRate / 100)
    item.igst = taxAmt // default to IGST
    item.tax = taxAmt
    if (item.amount <= item.taxableValue) {
      item.amount = round2(item.taxableValue + taxAmt)
    }
  }

  return item
}

/* ═══════════════════════════════════════════════════════════════════
   Bounding-Box Based Table Reconstruction
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Reconstruct table using OCR word bounding boxes.
 * FORCED: Always attempts reconstruction if ≥ 2 vertical numeric alignments.
 * All cell assignment is STRICTLY by column X position.
 */
function parseTableFromBBox(words, rawText) {
  if (!words?.length) return { items: [], method: 'no_words' }

  // Step 1: Group words into rows by Y-coordinate
  const rows = groupWordsIntoRows(words)
  if (rows.length < 2) return { items: [], method: 'insufficient_rows' }

  // Step 1b: FORCE check — if ≥ 2 vertical numeric clusters exist, proceed
  const xClusters = clusterColumns(words)
  const forceTable = hasVerticalNumericAlignments(words, xClusters, 2)

  // Step 2: Find header row using bbox-based merging (NOT text splitting)
  let headerRow = null
  let headerRowIdx = -1

  // Calculate dynamic merge gap for header detection
  const allWordHeights = words.map((w) => {
    const bbox = w.bbox || w.bounding_box || {}
    return (bbox.y1 || 0) - (bbox.y0 || 0)
  }).filter((h) => h > 0)
  const globalAvgHeight = allWordHeights.length > 0
    ? allWordHeights.reduce((a, b) => a + b, 0) / allWordHeights.length : 20
  const headerMergeGap = Math.max(globalAvgHeight * 2.5, 50)

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    // Use bbox-aware header detection
    const bboxMatches = countBBoxHeaderMatches(rows[i].words, headerMergeGap)
    if (bboxMatches >= 3) {
      headerRow = rows[i]
      headerRowIdx = i
      break
    }
    // Also try traditional text-based detection as fallback
    const rowText = rows[i].words.map((w) => w.text).join('  ') // double space for isHeaderLine
    if (isHeaderLine(rowText)) {
      headerRow = rows[i]
      headerRowIdx = i
      break
    }
  }

  logger.info('table_reconstruction.header_detection', {
    headerFound: !!headerRow,
    headerRowIdx,
    forceTable,
    totalRows: rows.length,
    mergeGap: Math.round(headerMergeGap),
  })

  if (!headerRow && !forceTable) {
    // No header AND no vertical numeric alignment → fallback
    return parseTableFromText(rawText)
  }

  // Step 3: Build column map from header words (or from X-clusters)
  let columns = []
  if (headerRow) {
    const colResult = buildColumnMap(words, headerRow.y)
    columns = colResult.columns
  }

  // If header-based columns are < 3, fall back to X-cluster based columns
  // with heuristic: leftmost non-numeric = description, numerics = qty/rate/total
  if (columns.filter((c) => c.canonical).length < 3 && forceTable) {
    columns = inferColumnsFromClusters(words, xClusters, rows, headerRowIdx)
  }

  if (columns.filter((c) => c.canonical).length < 2) {
    return parseTableFromText(rawText)
  }

  // Step 4: Process data rows (everything after header, before totals)
  const items = []
  let currentItem = null
  let pendingDescParts = []

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const rowText = row.words.map((w) => w.text).join(' ')

    // Skip separators
    if (/^[\s\-=_*|+]+$/.test(rowText)) continue
    if (rowText.trim().length < 2) continue

    // Stop at totals/footer (require word boundary — don't match partial row content)
    if (/^(?:sub\s*total|total\s*(?:amount|value|payable|in\s*words|before|after)?|grand\s*total|amount\s*in\s*words|net\s*payable|round\s*off|bank\s*details|terms|notes)/i.test(rowText.trim())) break

    // Assign each word to a column
    const rowCells = {}
    for (const word of row.words) {
      const bbox = word.bbox || word.bounding_box || {}
      const col = assignWordToColumn(bbox, columns)
      if (col?.canonical) {
        rowCells[col.canonical] = (rowCells[col.canonical] || '') + (rowCells[col.canonical] ? ' ' : '') + word.text
      }
    }

    // ── Smart value reclassification ──────────────────────────────
    // HSN in quantity: 4-8 digit integer ≥ 1000 in 'quantity' → move to 'hsn'
    if (rowCells.quantity && !rowCells.hsn) {
      const qVal = rowCells.quantity.replace(/[,\s]/g, '')
      if (/^\d{4,8}$/.test(qVal) && parseInt(qVal) >= 1000) {
        rowCells.hsn = qVal
        delete rowCells.quantity
      }
    }

    // GST rate in igst: value ≤ 28 and common rate → move to gstRate
    if (rowCells.igst && !rowCells.gstRate) {
      const igstVal = parseFloat(rowCells.igst.replace(/[%,\s]/g, ''))
      if (igstVal > 0 && igstVal <= 28 && [5, 12, 18, 28].includes(Math.round(igstVal))) {
        rowCells.gstRate = rowCells.igst
        delete rowCells.igst
      }
    }
    // Same for cgst/sgst (half-rates)
    if (rowCells.cgst && !rowCells.gstRate) {
      const cVal = parseFloat(rowCells.cgst.replace(/[%,\s]/g, ''))
      if (cVal > 0 && cVal <= 14 && [2.5, 6, 9, 14].includes(cVal)) {
        rowCells.gstRate = String(cVal * 2) // full rate
        delete rowCells.cgst
      }
    }

    // Check if this row starts a new item
    if (startsNewItem(rowCells, columns)) {
      // Save previous item
      if (currentItem) {
        if (pendingDescParts.length) {
          currentItem.description = (currentItem.description + ' ' + pendingDescParts.join(' ')).trim()
          pendingDescParts = []
        }
        items.push(finalizeItem(currentItem, [], {}))
      }
      currentItem = { ...rowCells }
    } else if (currentItem) {
      // Multi-line continuation: merge description
      if (rowCells.description) {
        pendingDescParts.push(rowCells.description)
      }
      // Also merge any numeric values that might be on continuation lines
      for (const [key, val] of Object.entries(rowCells)) {
        if (key !== 'description' && val && /\d/.test(val) && !currentItem[key]) {
          currentItem[key] = val
        }
      }
    }
  }

  // Don't forget last item
  if (currentItem) {
    if (pendingDescParts.length) {
      currentItem.description = (currentItem.description + ' ' + pendingDescParts.join(' ')).trim()
    }
    items.push(finalizeItem(currentItem, [], {}))
  }

  logger.info('table_reconstruction.bbox_result', {
    itemCount: items.length,
    columnCount: columns.filter((c) => c.canonical).length,
    items: items.map((it) => ({
      desc: (it.description || '').substring(0, 40),
      hsn: it.hsn,
      qty: it.quantity,
      rate: it.unitPrice,
      taxable: it.taxableValue,
      gstRate: it.gstRate,
      igst: it.igst,
      total: it.amount,
    })),
  })

  return { items, columns, method: 'bbox', headerRowIdx }
}

/* ═══════════════════════════════════════════════════════════════════
   HSN Disambiguation
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Detect and fix HSN codes mistaken as quantities.
 * HSN codes are 4, 6, or 8 digit codes. If a quantity looks like an HSN:
 *   - 4+ digits, no decimal
 *   - And there's no separate HSN column value
 *   → Move it to HSN and derive qty from other fields
 */
function fixHSNMisidentification(items) {
  const corrections = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Check if quantity looks like an HSN code
    if (item.quantity > 0 && !item.hsn) {
      const qtyStr = String(item.quantity)
      // HSN codes: 4, 6, or 8 digits, typically > 1000
      if (/^\d{4,8}$/.test(qtyStr) && item.quantity >= 1000) {
        // This is likely an HSN code, not a quantity
        const likelyHSN = qtyStr

        // Try to derive real quantity from other fields
        let realQty = 0
        if (item.taxableValue > 0 && item.unitPrice > 0) {
          realQty = Math.round(item.taxableValue / item.unitPrice)
        } else if (item.amount > 0 && item.unitPrice > 0) {
          realQty = Math.round(item.amount / item.unitPrice)
        }

        if (realQty > 0 && realQty <= 10000) {
          corrections.push({
            field: `lineItems[${i}].quantity`,
            from: item.quantity,
            to: realQty,
            rule: `HSN ${likelyHSN} was misidentified as quantity. Real qty derived from amount/unitPrice`,
          })
          item.hsn = likelyHSN
          item.quantity = realQty
        }
      }
    }
  }

  return corrections
}

/* ═══════════════════════════════════════════════════════════════════
   IGST / Tax Extraction
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Extract and validate IGST data for each line item.
 * Ensures: igst_amount = taxable_value × rate%
 */
function validateItemTaxes(items) {
  const corrections = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item.taxableValue || item.taxableValue <= 0) continue

    const totalTax = (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0)

    // If GST rate is present, verify amounts
    if (item.gstRate > 0) {
      const expectedTax = round2(item.taxableValue * item.gstRate / 100)

      if (totalTax > 0 && Math.abs(totalTax - expectedTax) > 1) {
        // Tax rate doesn't match amounts — trust amounts, recalculate rate
        const actualRate = round2(totalTax / item.taxableValue * 100)
        corrections.push({
          field: `lineItems[${i}].gstRate`,
          from: item.gstRate,
          to: actualRate,
          rule: `GST rate adjusted from ${item.gstRate}% to ${actualRate}% to match tax amount`,
        })
        item.gstRate = actualRate
      } else if (totalTax === 0) {
        // Rate present but no tax amounts — compute
        if (item.igst > 0 || !item.cgst) {
          item.igst = expectedTax
        } else {
          item.cgst = round2(expectedTax / 2)
          item.sgst = round2(expectedTax / 2)
        }
        item.tax = expectedTax
        corrections.push({
          field: `lineItems[${i}].tax`,
          from: 0,
          to: expectedTax,
          rule: `Tax computed from rate ${item.gstRate}% × taxable value`,
        })
      }
    }

    // If CGST + SGST present → they should be equal
    if (item.cgst > 0 && item.sgst > 0 && Math.abs(item.cgst - item.sgst) > 0.5) {
      const avg = round2((item.cgst + item.sgst) / 2)
      corrections.push({
        field: `lineItems[${i}].cgst/sgst`,
        from: `${item.cgst}/${item.sgst}`,
        to: `${avg}/${avg}`,
        rule: 'CGST and SGST should be equal — averaged',
      })
      item.cgst = avg
      item.sgst = avg
    }

    // Recalculate total tax
    item.tax = round2((item.cgst || 0) + (item.sgst || 0) + (item.igst || 0))

    // Verify amount = taxableValue + tax (if amount column present)
    if (item.amount > 0 && item.taxableValue > 0 && item.tax > 0) {
      const expected = round2(item.taxableValue + item.tax)
      if (Math.abs(item.amount - expected) > 1) {
        // Trust taxableValue + tax
        corrections.push({
          field: `lineItems[${i}].amount`,
          from: item.amount,
          to: expected,
          rule: 'Amount = taxableValue + tax',
        })
        item.amount = expected
      }
    }
  }

  return corrections
}

/* ═══════════════════════════════════════════════════════════════════
   Error Correction Layer
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Apply error correction rules to parsed items.
 */
function correctItems(items) {
  const corrections = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Rule: qty > 1000 → likely misread → re-evaluate
    if (item.quantity > 1000 && item.unitPrice > 0 && item.taxableValue > 0) {
      const derivedQty = Math.round(item.taxableValue / item.unitPrice)
      if (derivedQty > 0 && derivedQty <= 1000) {
        corrections.push({
          field: `lineItems[${i}].quantity`,
          from: item.quantity,
          to: derivedQty,
          rule: `Qty ${item.quantity} > 1000 → re-derived as ${derivedQty} from taxableValue/unitPrice`,
        })
        item.quantity = derivedQty
      }
    }

    // Rule: unit price = 0 → reconstruct from taxableValue / qty
    if ((!item.unitPrice || item.unitPrice <= 0) && item.quantity > 0) {
      if (item.taxableValue > 0) {
        item.unitPrice = round2(item.taxableValue / item.quantity)
        corrections.push({
          field: `lineItems[${i}].unitPrice`,
          from: 0,
          to: item.unitPrice,
          rule: 'unitPrice reconstructed from taxableValue / qty',
        })
      } else if (item.amount > 0) {
        item.unitPrice = round2(item.amount / item.quantity)
        corrections.push({
          field: `lineItems[${i}].unitPrice`,
          from: 0,
          to: item.unitPrice,
          rule: 'unitPrice reconstructed from amount / qty',
        })
      }
    }

    // Rule: no quantity but have unitPrice and amount → derive qty
    if ((!item.quantity || item.quantity <= 0) && item.unitPrice > 0 && item.amount > 0) {
      item.quantity = Math.round(item.amount / item.unitPrice) || 1
      corrections.push({
        field: `lineItems[${i}].quantity`,
        from: 0,
        to: item.quantity,
        rule: 'quantity derived from amount / unitPrice',
      })
    }

    // Ensure taxableValue = qty × unitPrice
    if (item.quantity > 0 && item.unitPrice > 0) {
      const expected = round2(item.quantity * item.unitPrice)
      if (!item.taxableValue || item.taxableValue <= 0) {
        item.taxableValue = expected
      }
    }

    // Ensure amount ≥ taxableValue (amount includes tax)
    if (item.taxableValue > 0 && (!item.amount || item.amount <= 0)) {
      item.amount = round2(item.taxableValue + item.tax)
    }
  }

  return corrections
}

/* ═══════════════════════════════════════════════════════════════════
   Financial Reconstruction Override
   ═══════════════════════════════════════════════════════════════════ */

/**
 * If table parsing fails or items are incomplete,
 * use document-level totals to back-calculate missing fields.
 */
function financialOverride(items, documentTotals) {
  if (!documentTotals) return []
  const { subtotal, taxAmount, totalAmount } = documentTotals
  const corrections = []

  if (!items.length && totalAmount > 0) {
    // No items but we have totals → create single line item
    items.push({
      sno: 1,
      description: 'Invoice total (table extraction failed)',
      quantity: 1,
      unitPrice: subtotal || (totalAmount - (taxAmount || 0)),
      taxableValue: subtotal || (totalAmount - (taxAmount || 0)),
      amount: totalAmount,
      tax: taxAmount || 0,
      igst: taxAmount || 0,
      cgst: 0,
      sgst: 0,
      hsn: '',
      gstRate: 0,
      uom: '',
      discount: 0,
    })
    corrections.push({
      field: 'lineItems',
      from: '(empty)',
      to: '1 item from document totals',
      rule: 'Table extraction failed — created single item from totals section',
    })
    return corrections
  }

  // If we have items, verify their sum matches document totals
  if (items.length > 0 && totalAmount > 0) {
    const itemsTotal = items.reduce((s, it) => s + (it.amount || 0), 0)
    const itemsSubtotal = items.reduce((s, it) => s + (it.taxableValue || 0), 0)

    // If items total is wildly off (> 10%), something went wrong
    if (itemsTotal > 0 && Math.abs(itemsTotal - totalAmount) / totalAmount > 0.10) {
      // Try to reconcile: if subtotals match but total doesn't, it's a tax issue
      if (itemsSubtotal > 0 && subtotal > 0 && Math.abs(itemsSubtotal - subtotal) / subtotal < 0.05) {
        // Subtotals match — distribute tax evenly
        if (taxAmount > 0) {
          for (const item of items) {
            if (item.taxableValue > 0) {
              const share = item.taxableValue / itemsSubtotal
              item.tax = round2(taxAmount * share)
              item.amount = round2(item.taxableValue + item.tax)
            }
          }
          corrections.push({
            field: 'lineItems.tax',
            from: 'incomplete',
            to: `distributed ₹${taxAmount} across ${items.length} items`,
            rule: 'Tax redistributed from document total to match',
          })
        }
      }
    }
  }

  return corrections
}

/* ═══════════════════════════════════════════════════════════════════
   Validation Layer
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Final validation — reject items that fail critical checks.
 */
function validateItems(items) {
  const valid = []
  const rejected = []

  for (const item of items) {
    const issues = []

    if (!item.unitPrice || item.unitPrice <= 0) issues.push('unitPrice=0')
    if (!item.quantity || item.quantity <= 0) issues.push('qty=0')
    if (item.tax === 0 && item.amount > item.taxableValue && item.taxableValue > 0) issues.push('tax=0 but total>subtotal')
    if (!item.description || item.description.trim().length < 2) issues.push('no description')

    if (issues.length > 0) {
      rejected.push({ item, issues })
    } else {
      valid.push(item)
    }
  }

  return { valid, rejected }
}

/* ═══════════════════════════════════════════════════════════════════
   Column Inference from X-Clusters (when no header detected)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * When header detection fails but we have vertical numeric alignments,
 * infer column roles from cluster position and content analysis.
 *
 * Heuristic:
 *   - Leftmost wide text cluster → description
 *   - Narrow numeric clusters (left→right) → qty, rate, taxableValue, igst, total
 *   - 4-8 digit clusters before qty → hsn
 */
function inferColumnsFromClusters(words, clusters, rows, headerRowIdx) {
  // Analyze each cluster's content
  const analyzed = clusters.map((cl) => {
    const margin = Math.max((cl.xMax - cl.xMin) / 2, 25)
    const clWords = words.filter((w) => {
      const bbox = w.bbox || w.bounding_box || {}
      const cx = ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2
      return cx >= cl.xMin - margin && cx <= cl.xMax + margin
    })
    // Skip header row words for content analysis
    const dataWords = headerRowIdx >= 0
      ? clWords.filter((w) => {
        const bbox = w.bbox || w.bounding_box || {}
        const wy = ((bbox.y0 || 0) + (bbox.y1 || 0)) / 2
        const headerY = rows[headerRowIdx]?.y || 0
        return Math.abs(wy - headerY) > 15
      })
      : clWords

    const numericCount = dataWords.filter((w) => /^[\d,.\-₹$%]+$/.test(w.text.trim())).length
    const textCount = dataWords.filter((w) => /[a-zA-Z]{2,}/.test(w.text.trim())).length
    const hsnLike = dataWords.filter((w) => /^\d{4,8}$/.test(w.text.trim())).length

    return {
      ...cl,
      numericCount,
      textCount,
      hsnLike,
      total: dataWords.length,
      isNumeric: numericCount > textCount && numericCount >= 2,
      isText: textCount > numericCount,
      isHSN: hsnLike >= 2 && hsnLike === numericCount,
    }
  })

  // Sort by X position (left to right)
  analyzed.sort((a, b) => a.xCenter - b.xCenter)

  // Assign roles
  const columns = []
  const numericClusters = analyzed.filter((a) => a.isNumeric && !a.isHSN)
  const textClusters = analyzed.filter((a) => a.isText)
  const hsnClusters = analyzed.filter((a) => a.isHSN)

  // Description: leftmost text cluster
  if (textClusters.length > 0) {
    columns.push({ canonical: 'description', xMin: textClusters[0].xMin, xMax: textClusters[0].xMax, xCenter: textClusters[0].xCenter, headerText: 'Description' })
  }

  // HSN: cluster with 4-8 digit values
  for (const hc of hsnClusters) {
    columns.push({ canonical: 'hsn', xMin: hc.xMin, xMax: hc.xMax, xCenter: hc.xCenter, headerText: 'HSN' })
  }

  // Numeric columns: assign by position (qty, rate, taxableValue, igst/cgst/sgst, total)
  const numericRoles = ['quantity', 'rate', 'taxableValue', 'igst', 'total']
  if (numericClusters.length >= 5) {
    // Full table with all columns
    for (let i = 0; i < Math.min(numericClusters.length, numericRoles.length); i++) {
      columns.push({ canonical: numericRoles[i], xMin: numericClusters[i].xMin, xMax: numericClusters[i].xMax, xCenter: numericClusters[i].xCenter, headerText: numericRoles[i] })
    }
  } else if (numericClusters.length >= 3) {
    // Minimal table: qty, rate, total
    columns.push({ canonical: 'quantity', xMin: numericClusters[0].xMin, xMax: numericClusters[0].xMax, xCenter: numericClusters[0].xCenter, headerText: 'Qty' })
    columns.push({ canonical: 'rate', xMin: numericClusters[1].xMin, xMax: numericClusters[1].xMax, xCenter: numericClusters[1].xCenter, headerText: 'Rate' })
    columns.push({ canonical: 'total', xMin: numericClusters[numericClusters.length - 1].xMin, xMax: numericClusters[numericClusters.length - 1].xMax, xCenter: numericClusters[numericClusters.length - 1].xCenter, headerText: 'Total' })
    // If 4 clusters: taxableValue in between
    if (numericClusters.length === 4) {
      columns.push({ canonical: 'taxableValue', xMin: numericClusters[2].xMin, xMax: numericClusters[2].xMax, xCenter: numericClusters[2].xCenter, headerText: 'Taxable Value' })
    }
  } else if (numericClusters.length === 2) {
    // Very minimal: qty, total
    columns.push({ canonical: 'quantity', xMin: numericClusters[0].xMin, xMax: numericClusters[0].xMax, xCenter: numericClusters[0].xCenter, headerText: 'Qty' })
    columns.push({ canonical: 'total', xMin: numericClusters[1].xMin, xMax: numericClusters[1].xMax, xCenter: numericClusters[1].xCenter, headerText: 'Total' })
  }

  return columns
}

/* ═══════════════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════════════ */

function parseNum(str) {
  if (!str) return 0
  return parseFloat(String(str).replace(/[₹,\s]/g, '')) || 0
}

function parseItemFloat(str) {
  if (str == null || str === '') return 0
  // Handle "18%" → 18
  const cleaned = String(str).replace(/[₹$,\s%]/g, '').replace(/[()]/g, '')
  return parseFloat(cleaned) || 0
}

function parseItemInt(str) {
  if (!str) return 0
  return parseInt(String(str).replace(/[^\d]/g, '')) || 0
}

function cleanDescription(desc) {
  if (!desc) return ''
  // Remove leading serial numbers
  let cleaned = desc.replace(/^\d+[.\s)]+/, '').trim()
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ')
  // Remove OCR artifacts
  cleaned = cleaned.replace(/[|{}[\]]/g, '')
  return cleaned.trim()
}

/* ═══════════════════════════════════════════════════════════════════
   Main Export
   ═══════════════════════════════════════════════════════════════════ */

export const tableReconstructionService = {
  /**
   * Main entry point: reconstruct line items from OCR data.
   *
   * @param {string} rawText - Full OCR text
   * @param {Array} [words] - Tesseract word-level data with bounding boxes
   * @param {object} [documentTotals] - { subtotal, taxAmount, totalAmount }
   * @returns {{
   *   items: Array,
   *   corrections: Array,
   *   method: string,
   *   headerMap: object|null,
   *   tableConfidence: number,
   *   meta: object
   * }}
   */
  reconstruct(rawText, words, documentTotals) {
    const allCorrections = []

    // Step 1: Parse table structure
    // FORCED: always use bbox if ANY words have bounding boxes
    let parseResult
    if (words?.length > 0 && words.some((w) => w.bbox && (w.bbox.x0 || w.bbox.x1 || w.bbox.y0 || w.bbox.y1))) {
      logger.info('table_reconstruction.using_bbox', { wordCount: words.length })
      parseResult = parseTableFromBBox(words, rawText)
    } else {
      logger.info('table_reconstruction.using_text', { textLength: rawText?.length || 0 })
      parseResult = parseTableFromText(rawText)
    }

    let { items, method } = parseResult

    if (!items.length) {
      // Try GST content-based parsing before financial override
      logger.info('table_reconstruction.trying_gst_parse', { textLength: rawText?.length || 0 })
      const gstItems = parseGSTInvoiceLines(rawText)
      if (gstItems.length > 0) {
        items = gstItems
        method = 'gst_content_parse'
        logger.info('table_reconstruction.gst_parse_success', { itemCount: gstItems.length })
      } else {
        // Complete fallback: financial override from totals
        const overrideCorr = financialOverride(items, documentTotals)
        allCorrections.push(...overrideCorr)

        return {
          items,
          corrections: allCorrections,
          method: 'financial_override',
          headerMap: null,
          tableConfidence: items.length > 0 ? 0.5 : 0,
          meta: { parseMethod: method, headerDetected: false, columnsDetected: 0 },
        }
      }
    }

    // Step 2: Fix HSN misidentification
    const hsnCorr = fixHSNMisidentification(items)
    allCorrections.push(...hsnCorr)

    // Step 3: Error correction (zero unitPrice, unrealistic qty, etc.)
    const errCorr = correctItems(items)
    allCorrections.push(...errCorr)

    // Step 4: Validate and extract IGST/tax data
    const taxCorr = validateItemTaxes(items)
    allCorrections.push(...taxCorr)

    // Step 5: Financial override (reconcile with document totals)
    const finCorr = financialOverride(items, documentTotals)
    allCorrections.push(...finCorr)

    // Step 6: Validate items
    const { valid, rejected } = validateItems(items)

    // Step 7: Compute table confidence
    let tableConfidence = 0
    if (valid.length > 0) {
      const allFieldsPresent = valid.every((it) =>
        it.quantity > 0 && it.unitPrice > 0 && it.amount > 0 && it.description,
      )
      const financialsMatch = documentTotals?.totalAmount > 0
        ? Math.abs(valid.reduce((s, it) => s + it.amount, 0) - documentTotals.totalAmount) / documentTotals.totalAmount < 0.05
        : true

      if (allFieldsPresent && financialsMatch) {
        tableConfidence = 1.0
      } else if (allFieldsPresent) {
        tableConfidence = 0.9
      } else {
        const completeness = valid.filter((it) => it.quantity > 0 && it.unitPrice > 0 && it.amount > 0).length / valid.length
        tableConfidence = round2(0.5 + completeness * 0.4)
      }
    }

    return {
      items: valid,
      corrections: allCorrections,
      method,
      headerMap: parseResult.headerMap || (parseResult.columns?.reduce((m, c) => { if (c.canonical) m[c.canonical] = c.headerText; return m }, {}) || null),
      tableConfidence,
      meta: {
        parseMethod: method,
        headerDetected: true,
        columnsDetected: parseResult.columns?.length || Object.keys(parseResult.headerMap || {}).length,
        totalItems: items.length,
        validItems: valid.length,
        rejectedItems: rejected.length,
        rejected: rejected.map((r) => ({ desc: r.item.description, issues: r.issues })),
        correctionsApplied: allCorrections.length,
      },
    }
  },

  // Expose internals for testing
  classifyHeader,
  isHeaderLine,
  countBBoxHeaderMatches,
  buildColumnMap,
  groupWordsIntoRows,
  parseTableFromText,
  parseTableFromBBox,
  parseGSTInvoiceLines,
  fixHSNMisidentification,
  validateItemTaxes,
  correctItems,
  financialOverride,
  validateItems,
  clusterColumns,
  hasVerticalNumericAlignments,
  inferColumnsFromClusters,
}
