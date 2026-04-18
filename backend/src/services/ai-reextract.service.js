/**
 * AI Re-Extraction Service
 * ─────────────────────────
 * Uses Claude (claude-opus-4-5 with extended thinking) to perform deep
 * re-extraction of line items from Indian GST invoices when the standard
 * OCR pipeline produces low-confidence or mathematically inconsistent results.
 *
 * Fixes addressed:
 *   1. Rate/Qty column swap (tight numeric columns → 1-col left-shift)
 *   2. HSN code merged into description or qty field
 *   3. Multi-line product descriptions consolidated
 *   4. Unit suffix stripping (3.00 PCS → qty=3, unit=PCS)
 *   5. Tax column splitting (IGST % vs IGST amount)
 *   6. Full financial recomputation with field-level confidence scoring
 */

import { logger } from '../utils/logger.js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

/**
 * System prompt for the deep re-extraction model.
 */
const SYSTEM_PROMPT = `You are an expert invoice OCR correction engine specializing in Indian GST-compliant invoices (Proforma, Tax Invoice, Challan formats). Your job is to extract structured line item data from raw OCR text with maximum accuracy.

Known failure modes you must correct:
1. Column misalignment: OCR scanners often conflate adjacent numeric columns. The most common error is reading the Rate/Unit Price value as Qty and vice versa. Always validate: Qty × Rate = Taxable Value. If this fails, attempt column reassignment.
2. Merged cell parsing: HSN/SAC codes (4–8 digit numerics like 82052000) are frequently absorbed into the Description or Qty field. Strip them out and place them in the correct HSN column. HSN codes are NEVER a quantity.
3. Multi-line product descriptions: Indian invoices often have product names spanning 2–3 lines. Consolidate these into a single Description string.
4. Unit suffix stripping: Qty fields may contain unit suffixes like "3.00 PCS", "1.00 NOS". Extract only the numeric value for Qty and store the unit separately.
5. Tax column splitting: IGST, CGST, SGST columns may be read as a single block. Separate % (rate) from Amount (computed value).
6. Total validation: After extracting all line items, recompute: Taxable Value = Qty × Rate, Tax Amount = Taxable Value × Tax%, Line Total = Taxable Value + Tax Amount. Flag any row where recomputed values deviate >1% from OCR-extracted values.

Rules:
- Qty should be a small integer (1–1000) for most industrial/commercial goods. Rate (unit price) is typically ≥ 100.
- If Qty > 1000 and Rate < Qty, they are likely swapped — correct them.
- HSN codes are always 4–8 standalone digits (e.g., 8205, 82052000). Pre-identify and remove them from description/qty parsing scope.
- Standard Indian GST rates: 0%, 5%, 12%, 18%, 28%.
- Return ONLY valid JSON. No markdown, no preamble, no explanation outside the JSON object.`

/**
 * Build the user prompt for a specific invoice extraction task.
 */
function buildUserPrompt(rawText, currentItems, knownMeta = {}) {
  const metaBlock = Object.keys(knownMeta).length > 0
    ? `\n## Known Document Context:\n${Object.entries(knownMeta).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`
    : ''

  const currentTable = currentItems.length > 0
    ? `\n## Current Faulty Extraction:\n| # | Description | Qty | Unit Price | Tax | Amount |\n|---|-------------|-----|------------|-----|--------|\n${currentItems.map((it, i) =>
        `| ${i + 1} | ${it.description || ''} | ${it.quantity || 0} | ${it.unitPrice || 0} | ${it.tax || 0} | ${it.amount || 0} |`
      ).join('\n')}\n`
    : ''

  return `You are correcting a line item extraction failure from an Indian GST invoice scan.

## Raw OCR Text (${rawText.length} characters):
${rawText}
${metaBlock}${currentTable}
## Task:
Perform a deep re-extraction of all line items. Apply ALL corrections:
1. Separate HSN/SAC codes from Description fields.
2. Fix any Qty/Rate column swap: validate Qty × Rate = Taxable Value.
3. Reconstruct full product descriptions from multi-line OCR output.
4. Strip unit suffixes from Qty fields (store unit separately).
5. Recompute all financial values: Taxable = Qty × Rate, Tax = Taxable × Tax%, Total = Taxable + Tax.
6. Validate invoice-level totals.
7. Assign field-level confidence (0–100). Flag fields below 85%.

## Output Format (strict JSON):
{
  "invoice_meta": {
    "vendor_name": "",
    "vendor_gstin": "",
    "customer_name": "",
    "customer_gstin": "",
    "invoice_number": "",
    "invoice_date": "",
    "proforma_no": "",
    "challan_no": ""
  },
  "line_items": [
    {
      "sr_no": 1,
      "description": "",
      "hsn_sac": "",
      "qty": 0,
      "unit": "",
      "rate": 0,
      "taxable_value": 0,
      "tax_type": "IGST",
      "tax_percent": 0,
      "tax_amount": 0,
      "line_total": 0,
      "confidence": {
        "description": 0,
        "qty": 0,
        "rate": 0,
        "tax": 0,
        "total": 0
      },
      "flags": []
    }
  ],
  "financials": {
    "subtotal_taxable": 0,
    "total_tax": 0,
    "grand_total": 0,
    "computation_validated": true
  },
  "correction_log": [
    {
      "field": "",
      "original_value": "",
      "corrected_value": "",
      "correction_type": "column_swap | hsn_extraction | description_merge | recomputation | unit_strip",
      "reason": ""
    }
  ]
}

Return ONLY valid JSON.`
}

/**
 * Convert Claude's AI re-extraction result to the standard BlockERP line item format.
 */
function normalizeAIResult(aiResult) {
  const round2 = (n) => Math.round(n * 100) / 100

  const lineItems = (aiResult.line_items || []).map((it, idx) => ({
    sno: it.sr_no || idx + 1,
    description: it.description || '',
    hsn: it.hsn_sac || '',
    quantity: parseFloat(it.qty) || 0,
    uom: it.unit || '',
    unitPrice: parseFloat(it.rate) || 0,
    taxableValue: parseFloat(it.taxable_value) || 0,
    taxType: it.tax_type || 'IGST',
    gstRate: parseFloat(it.tax_percent) || 0,
    igst: it.tax_type === 'IGST' ? parseFloat(it.tax_amount) || 0 : 0,
    cgst: it.tax_type === 'CGST' ? round2((parseFloat(it.tax_amount) || 0) / 2) : 0,
    sgst: it.tax_type === 'SGST' ? round2((parseFloat(it.tax_amount) || 0) / 2) : 0,
    tax: parseFloat(it.tax_amount) || 0,
    amount: parseFloat(it.line_total) || round2((parseFloat(it.taxable_value) || 0) + (parseFloat(it.tax_amount) || 0)),
    aiConfidence: it.confidence || {},
    aiFlags: it.flags || [],
  }))

  const meta = aiResult.invoice_meta || {}
  const financials = aiResult.financials || {}
  const corrections = (aiResult.correction_log || []).map((c) => ({
    field: c.field,
    from: c.original_value,
    to: c.corrected_value,
    rule: `[AI] ${c.correction_type}: ${c.reason}`,
  }))

  return {
    lineItems,
    invoiceMeta: {
      vendorName: meta.vendor_name || null,
      gstin: meta.vendor_gstin || null,
      customerName: meta.customer_name || null,
      customerGstin: meta.customer_gstin || null,
      invoiceNumber: meta.invoice_number || null,
      invoiceDate: meta.invoice_date || null,
    },
    financials: {
      subtotal: parseFloat(financials.subtotal_taxable) || 0,
      taxAmount: parseFloat(financials.total_tax) || 0,
      totalAmount: parseFloat(financials.grand_total) || 0,
      validated: financials.computation_validated !== false,
    },
    corrections,
  }
}

export const aiReExtractService = {
  /**
   * Check if AI re-extraction is available (API key configured).
   */
  isAvailable() {
    return !!ANTHROPIC_API_KEY
  },

  /**
   * Run deep re-extraction on raw OCR text using Claude with extended thinking.
   *
   * @param {string} rawText - Full raw OCR text from the document
   * @param {Array} currentItems - Current (potentially faulty) line items from OCR pipeline
   * @param {object} knownMeta - Any known document metadata (vendor, GSTIN, etc.)
   * @returns {{ lineItems, invoiceMeta, financials, corrections, model, thinkingTokens }}
   */
  async reExtract(rawText, currentItems = [], knownMeta = {}) {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured — AI re-extraction unavailable')
    }

    if (!rawText || rawText.trim().length < 20) {
      throw new Error('Insufficient OCR text for AI re-extraction (< 20 chars)')
    }

    const userPrompt = buildUserPrompt(rawText, currentItems, knownMeta)

    logger.info('ai_reextract.starting', {
      rawTextLen: rawText.length,
      currentItemCount: currentItems.length,
    })

    const startMs = Date.now()

    const body = {
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      thinking: {
        type: 'enabled',
        budget_tokens: 8000,
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }

    let response
    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'interleaved-thinking-2025-05-14',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Anthropic API error ${res.status}: ${errText.substring(0, 200)}`)
      }

      response = await res.json()
    } catch (fetchErr) {
      logger.error('ai_reextract.fetch_failed', { error: fetchErr.message })
      throw fetchErr
    }

    const durationMs = Date.now() - startMs

    // Extract text content from response (skip thinking blocks)
    const textContent = (response.content || []).find((b) => b.type === 'text')
    if (!textContent?.text) {
      throw new Error('AI re-extraction returned no text content')
    }

    // Count thinking tokens used
    const thinkingBlock = (response.content || []).find((b) => b.type === 'thinking')
    const thinkingTokens = thinkingBlock?.thinking?.length || 0

    // Parse JSON response
    let aiResult
    try {
      // Strip any accidental markdown fences if model output them
      const cleaned = textContent.text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      aiResult = JSON.parse(cleaned)
    } catch (parseErr) {
      logger.error('ai_reextract.json_parse_failed', {
        raw: textContent.text.substring(0, 500),
        error: parseErr.message,
      })
      throw new Error(`AI re-extraction returned invalid JSON: ${parseErr.message}`)
    }

    const normalized = normalizeAIResult(aiResult)

    logger.info('ai_reextract.complete', {
      itemCount: normalized.lineItems.length,
      correctionCount: normalized.corrections.length,
      durationMs,
      model: response.model,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    })

    return {
      ...normalized,
      model: response.model,
      durationMs,
      thinkingTokens,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    }
  },

  /**
   * Validate line items client-side: recompute Qty × Rate → Taxable → Tax → Total
   * and return deviation flags per row.
   *
   * @param {Array} items - Line items in BlockERP format
   * @returns {Array} items with added .validation field
   */
  validateLineItems(items) {
    const round2 = (n) => Math.round(n * 100) / 100
    return items.map((item) => {
      const qty = parseFloat(item.quantity) || 0
      const rate = parseFloat(item.unitPrice) || 0
      const taxPct = parseFloat(item.gstRate) || 0
      const recomputedTaxable = round2(qty * rate)
      const recomputedTax = round2(recomputedTaxable * taxPct / 100)
      const recomputedTotal = round2(recomputedTaxable + recomputedTax)
      const lineTotal = parseFloat(item.amount) || 0
      const deviation = lineTotal > 0
        ? Math.abs(recomputedTotal - lineTotal) / lineTotal
        : 0
      return {
        ...item,
        validation: {
          taxable_match: recomputedTaxable > 0
            ? Math.abs(recomputedTaxable - (parseFloat(item.taxableValue) || recomputedTaxable)) < 0.02
            : true,
          total_match: deviation < 0.01,
          needs_review: deviation >= 0.01,
          recomputed_taxable: recomputedTaxable,
          recomputed_tax: recomputedTax,
          recomputed_total: recomputedTotal,
          deviation_pct: round2(deviation * 100),
        },
      }
    })
  },
}
