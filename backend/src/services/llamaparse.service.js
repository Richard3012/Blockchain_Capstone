/**
 * LlamaParse Service — Cloud-based document parsing via LlamaCloud API.
 * ────────────────────────────────────────────────────────────────────
 * Replaces Tesseract / PaddleOCR as the PRIMARY OCR + parsing engine.
 * Handles PDFs (digital + scanned), images, DOCX, and more with superior
 * accuracy for Indian GST invoices (tables, HSN codes, tax breakdowns).
 *
 * API flow:
 *   1. Upload file  → POST /api/v1/beta/files
 *   2. Start parse  → POST /api/v2/parse
 *   3. Poll result  → GET  /api/v2/parse/{job_id}?expand=text,items,markdown
 */

import { logger } from '../utils/logger.js'

const BASE_URL = 'https://api.cloud.llamaindex.ai'
const POLL_INTERVAL_MS = 1500
const MAX_POLL_ATTEMPTS = 60 // 90 seconds max

function getApiKey() {
  return process.env.LLAMA_PARSE_API_KEY || process.env.LLAMA_CLOUD_API_KEY || ''
}

/**
 * Upload a file buffer to LlamaCloud.
 * @returns {{ id: string, name: string }} file metadata
 */
async function uploadFile(buffer, filename, mimetype) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('LLAMA_PARSE_API_KEY not configured')

  // Build multipart form data
  const { FormData, Blob } = await import('node-fetch').then(() => globalThis).catch(() => globalThis)
  const form = new FormData()
  const blob = new Blob([buffer], { type: mimetype || 'application/octet-stream' })
  form.append('file', blob, filename || 'document')
  form.append('purpose', 'parse')

  const res = await fetch(`${BASE_URL}/api/v1/beta/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`LlamaParse upload failed (${res.status}): ${errBody}`)
  }

  return res.json()
}

/**
 * Start a parse job for an uploaded file.
 * @returns {{ job: { id: string, status: string } }}
 */
async function startParseJob(fileId, options = {}) {
  const apiKey = getApiKey()

  const body = {
    file_id: fileId,
    tier: options.tier || 'agentic',
    version: 'latest',
    output_options: {
      markdown: { tables: { output_tables_as_markdown: true } },
    },
    processing_options: {
      ocr_parameters: { languages: ['en'] },
    },
  }

  const res = await fetch(`${BASE_URL}/api/v2/parse`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`LlamaParse parse start failed (${res.status}): ${errBody}`)
  }

  return res.json()
}

/**
 * Poll for parse job completion and retrieve results.
 * @returns {object} full parse result with text, markdown, items
 */
async function pollResult(jobId) {
  const apiKey = getApiKey()

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(
      `${BASE_URL}/api/v2/parse/${jobId}?expand=text,items,markdown`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`LlamaParse poll failed (${res.status}): ${errBody}`)
    }

    const data = await res.json()
    const status = data.job?.status || data.status

    if (status === 'COMPLETED') return data
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(`LlamaParse job ${status}: ${data.job?.error_message || 'unknown error'}`)
    }

    // Still PENDING or RUNNING — wait and retry
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  throw new Error('LlamaParse job timed out after polling')
}

/**
 * Extract structured text items from LlamaParse result into word-level
 * bounding box format compatible with the table reconstruction engine.
 */
function extractWordsFromItems(result) {
  const words = []
  const pages = result.text?.pages || result.items?.pages || []

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx]
    const pageText = page.text || page.markdown || ''
    const pageYOffset = pageIdx * 800 // virtual page separation

    // Split page text into lines, then words with estimated positions
    const lines = pageText.split('\n')
    let y = pageYOffset + 20

    for (const line of lines) {
      if (!line.trim()) { y += 15; continue }
      const lineWords = line.split(/\s+/).filter(Boolean)
      let x = 50
      for (const wt of lineWords) {
        const width = wt.length * 8 // approximate character width
        words.push({
          text: wt,
          confidence: 95,
          bbox: { x0: x, y0: y, x1: x + width, y1: y + 14 },
        })
        x += width + 8
      }
      y += 18
    }
  }

  return words
}

/**
 * Parse structured invoice fields from LlamaParse markdown output.
 * Markdown tables and bold labels are far more reliable than regex on raw text.
 */
function parseMarkdownInvoice(markdown) {
  if (!markdown) return null

  const result = {}

  // ── Vendor Name: first bold text on its own line (usually company name) ──
  const boldLines = markdown.match(/^\*\*([^*]+)\*\*\s*$/gm)
  if (boldLines && boldLines.length > 0) {
    const first = boldLines[0].replace(/\*\*/g, '').trim()
    // Skip headings that are just "INVOICE" or section labels
    if (!/^(invoice|tax\s*invoice|proforma|bill\s*to|ship\s*to|notes|terms)$/i.test(first)) {
      result.vendorName = first
    }
  }
  // Fallback: first line after # INVOICE heading
  if (!result.vendorName) {
    const afterHeading = markdown.match(/^#\s*(?:TAX\s*)?INVOICE\s*\n+\*\*([^*]+)\*\*/im)
    if (afterHeading) result.vendorName = afterHeading[1].trim()
  }

  // ── Labeled fields: **Label:** Value ──
  const labelPatterns = [
    { key: 'gstin', re: /\*\*GST\s*(?:IN|No?\.?)\s*[:\-]?\*\*\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z\d][A-Z\d])/i },
    { key: 'invoiceNumber', re: /\*\*Invoice\s*(?:#|No?\.?)\s*[:\-]?\*\*\s*([^\n*]+)/i },
    { key: 'invoiceDate', re: /\*\*Date\s*[:\-]?\*\*\s*([^\n*]+)/i },
    { key: 'subtotal', re: /\*\*Sub\s*-?\s*total\s*[:\-]?\*\*\s*[₹Rs.INR\s]*([\d,]+(?:\.\d+)?)/i },
    { key: 'sgst', re: /\*\*SGST\s*(?:\([^)]*\))?\s*[:\-]?\*\*\s*[₹Rs.INR\s]*([\d,]+(?:\.\d+)?)/i },
    { key: 'cgst', re: /\*\*CGST\s*(?:\([^)]*\))?\s*[:\-]?\*\*\s*[₹Rs.INR\s]*([\d,]+(?:\.\d+)?)/i },
    { key: 'igst', re: /\*\*IGST\s*(?:\([^)]*\))?\s*[:\-]?\*\*\s*[₹Rs.INR\s]*([\d,]+(?:\.\d+)?)/i },
  ]
  for (const { key, re } of labelPatterns) {
    const m = markdown.match(re)
    if (m) result[key] = m[1].trim()
  }

  // ── Total Amount: ## TOTAL or **Total** line ──
  const totalPatterns = [
    /#{1,3}\s*TOTAL\s*(?:AMOUNT\s*)?(?:DUE)?\s*[:\-]?\s*[₹Rs.INR\s]*([\d,]+(?:\.\d+)?)/i,
    /\*\*(?:Grand\s*)?Total\s*(?:Amount)?\s*(?:Due)?\s*[:\-]?\*\*\s*[₹Rs.INR\s]*([\d,]+(?:\.\d+)?)/i,
    /Total\s*(?:Amount\s*)?(?:Due)?\s*[:\-]\s*[₹Rs.INR\s]*([\d,]+(?:\.\d+)?)/i,
  ]
  for (const p of totalPatterns) {
    const m = markdown.match(p)
    if (m) {
      result.totalAmount = parseFloat(m[1].replace(/,/g, ''))
      break
    }
  }

  // ── Tax Amount: sum of SGST + CGST or IGST ──
  const parseAmt = (s) => s ? parseFloat(String(s).replace(/,/g, '')) || 0 : 0
  if (result.sgst || result.cgst) {
    result.taxAmount = parseAmt(result.sgst) + parseAmt(result.cgst)
  } else if (result.igst) {
    result.taxAmount = parseAmt(result.igst)
  }
  if (result.subtotal) result.subtotal = parseAmt(result.subtotal)

  // ── Line Items from markdown table ──
  const tableMatch = markdown.match(/\|[^\n]+\|\n\|[\s\-:|]+\|\n((?:\|[^\n]+\|\n?)+)/m)
  if (tableMatch) {
    // Parse header to identify columns
    const headerLine = markdown.substring(
      markdown.lastIndexOf('|', tableMatch.index) === tableMatch.index
        ? tableMatch.index
        : markdown.lastIndexOf('\n', tableMatch.index) + 1,
      markdown.indexOf('\n', tableMatch.index),
    )
    const headers = headerLine.split('|').map((h) => h.trim()).filter(Boolean)

    // Map column indices
    const colMap = {}
    headers.forEach((h, i) => {
      const hl = h.toLowerCase()
      if (/item|code|sku|hsn|sac/.test(hl) && !colMap.item) colMap.item = i
      if (/desc|particular|product|service/.test(hl)) colMap.description = i
      if (/qty|quantity|nos/.test(hl)) colMap.quantity = i
      if (/unit\s*price|rate|price/.test(hl)) colMap.unitPrice = i
      if (/^amount$|total|value/.test(hl) && !colMap.amount) colMap.amount = i
    })

    // Parse data rows
    const rowLines = tableMatch[1].trim().split('\n')
    result.lineItems = []
    for (const row of rowLines) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.length < 2) continue
      // Skip separator rows
      if (cells.every((c) => /^[-:\s]+$/.test(c))) continue

      const parseCurrency = (s) => parseFloat((s || '').replace(/[₹Rs.,INR\s]/g, '').replace(/,/g, '')) || 0

      const item = {
        description: cells[colMap.description] || cells[1] || '',
        quantity: parseFloat(cells[colMap.quantity] || cells[2]) || 1,
        unitPrice: parseCurrency(cells[colMap.unitPrice] || cells[3]),
        amount: parseCurrency(cells[colMap.amount] || cells[cells.length - 1]),
      }

      // Add item code if present
      if (colMap.item !== undefined && cells[colMap.item]) {
        item.itemCode = cells[colMap.item]
      }

      if (item.description && item.amount > 0) {
        result.lineItems.push(item)
      }
    }
  }

  // ── Date parsing ──
  if (result.invoiceDate) {
    result.invoiceDate = result.invoiceDate.replace(/\s+/g, '').trim()
  }

  // Clean GSTIN
  if (result.gstin) {
    result.gstin = result.gstin.replace(/\s/g, '').substring(0, 15)
  }

  // Clean invoice number
  if (result.invoiceNumber) {
    result.invoiceNumber = result.invoiceNumber.replace(/\s+/g, ' ').trim()
  }

  logger.info('llamaparse.markdown_parsed', {
    vendorName: result.vendorName || null,
    gstin: result.gstin || null,
    invoiceNumber: result.invoiceNumber || null,
    invoiceDate: result.invoiceDate || null,
    totalAmount: result.totalAmount || 0,
    subtotal: result.subtotal || 0,
    taxAmount: result.taxAmount || 0,
    lineItemCount: result.lineItems?.length || 0,
  })

  return result
}

/* ─── Exported Service ──────────────────────────────────────────── */

export const llamaParseService = {
  /**
   * Check if LlamaParse is configured.
   */
  isAvailable() {
    return !!getApiKey()
  },

  /**
   * Parse a document buffer end-to-end.
   * Returns { text, words, confidence, markdown, pages, durationMs }
   *
   * @param {Buffer} buffer - File content
   * @param {string} filename - Original file name
   * @param {string} mimetype - MIME type
   * @param {object} [options] - { emitProgress, tier }
   */
  async parse(buffer, filename, mimetype, options = {}) {
    const { emitProgress } = options
    const startTime = Date.now()

    // Step 1: Upload
    emitProgress?.('Uploading to LlamaParse...')
    logger.info('llamaparse.uploading', { filename, mimetype, size: buffer.length })
    const file = await uploadFile(buffer, filename, mimetype)
    logger.info('llamaparse.uploaded', { fileId: file.id, name: file.name })

    // Step 2: Start parse
    emitProgress?.('LlamaParse: starting agentic parse...')
    const parseRes = await startParseJob(file.id, { tier: options.tier || 'agentic' })
    const jobId = parseRes.job?.id || parseRes.id
    logger.info('llamaparse.job_started', { jobId })

    // Step 3: Poll for results
    emitProgress?.('LlamaParse: parsing document...')
    const result = await pollResult(jobId)
    const durationMs = Date.now() - startTime

    // Extract text from result
    let fullText = ''
    if (result.text_full) {
      fullText = result.text_full
    } else if (result.text?.pages) {
      fullText = result.text.pages.map((p) => p.text || '').join('\n\n')
    } else if (result.markdown_full) {
      fullText = result.markdown_full
    } else if (result.markdown?.pages) {
      fullText = result.markdown.pages.map((p) => p.markdown || '').join('\n\n')
    }

    // Extract markdown
    let markdown = ''
    if (result.markdown_full) {
      markdown = result.markdown_full
    } else if (result.markdown?.pages) {
      markdown = result.markdown.pages.map((p) => p.markdown || '').join('\n\n')
    }

    // Extract word positions for table reconstruction
    const words = extractWordsFromItems(result)

    const pageCount = result.text?.pages?.length || result.markdown?.pages?.length || 1

    // Parse structured fields from markdown (tables, labeled fields)
    const parsedFields = parseMarkdownInvoice(markdown)

    logger.info('llamaparse.done', {
      chars: fullText.length,
      wordCount: words.length,
      pages: pageCount,
      durationMs,
    })

    emitProgress?.(`LlamaParse: ${fullText.length} chars, ${pageCount} pages (${(durationMs / 1000).toFixed(1)}s)`)

    return {
      text: fullText,
      words,
      confidence: 95,
      markdown,
      parsedFields,
      pages: pageCount,
      variant: 'llamaparse_agentic',
      provider: 'llamaparse',
      durationMs,
    }
  },
}
