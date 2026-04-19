import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import mammoth from 'mammoth'

import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { paddleOcrService } from './paddle-ocr.service.js'

// pdf-parse v2 exports PDFParse class; v1 exports a plain function
const require = createRequire(import.meta.url)
const pdfParseModule = require('pdf-parse')
const PDFParse = pdfParseModule.PDFParse

let XLSX
try { XLSX = require('xlsx') } catch { XLSX = null }

async function parsePDF(buffer) {
  // v2 API: constructor takes { data }, then .getText() returns { text, total }
  if (PDFParse && typeof PDFParse === 'function') {
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const parser = new PDFParse({ data })
    try {
      const result = await parser.getText()
      return { text: result.text || '', numpages: result.total || 0 }
    } finally {
      await parser.destroy().catch(() => {})
    }
  }
  // v1 API: pdfParse(buffer) returns { text, numpages, ... }
  if (typeof pdfParseModule === 'function') {
    return pdfParseModule(buffer)
  }
  throw new Error('pdf-parse module has no usable parse method')
}

/**
 * Extracts plain text from uploaded files (PDF, DOCX, images).
 */
export const fileExtractorService = {
  /**
   * Extract text based on MIME type.
   * @param {Buffer} buffer   - File content
   * @param {string} mimetype - MIME type (e.g. application/pdf)
   * @param {string} originalname - Original file name (fallback for type detection)
   * @returns {Promise<string>} extracted text
   */
  async extractText(buffer, mimetype, originalname = '') {
    const type = mimetype?.toLowerCase() || ''
    const ext = originalname.split('.').pop()?.toLowerCase() || ''

    // Wrap heavy OCR (PDF / image) paths through the OCR queue when the
    // buffer is large (>2 MB). Other formats are cheap and run inline.
    const HEAVY_THRESHOLD = 2 * 1024 * 1024
    const isPdf = type === 'application/pdf' || ext === 'pdf'
    const isImage =
      type.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)
    if ((isPdf || isImage) && buffer?.length > HEAVY_THRESHOLD) {
      const { enqueueOcr } = await import('./ocr-queue.service.js')
      return enqueueOcr(
        () => (isPdf ? this.extractFromPDF(buffer) : this.extractFromImage(buffer)),
        { label: isPdf ? 'pdf' : 'image' },
      )
    }

    // ── PDF ─────────────────────────────────────────────
    if (isPdf) {
      return this.extractFromPDF(buffer)
    }

    // ── DOCX ────────────────────────────────────────────
    if (
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      type === 'application/msword' ||
      ext === 'docx' ||
      ext === 'doc'
    ) {
      return this.extractFromDOCX(buffer)
    }

    // ── Excel (XLS / XLSX) ──────────────────────────────
    if (
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      type === 'application/vnd.ms-excel' ||
      ext === 'xlsx' ||
      ext === 'xls'
    ) {
      return this.extractFromExcel(buffer)
    }

    // ── Images (JPEG, PNG, WEBP, BMP, TIFF) ────────────
    if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)) {
      return this.extractFromImage(buffer)
    }

    // ── Plain text / fallback ───────────────────────────
    if (type.startsWith('text/') || ext === 'txt' || ext === 'csv') {
      return buffer.toString('utf-8')
    }

    throw Object.assign(
      new Error(`Unsupported file type: ${mimetype || ext}. Accepted: PDF, DOCX, XLS, XLSX, JPG, PNG, WEBP, BMP, TIFF, TXT`),
      { statusCode: 400 },
    )
  },

  async extractFromPDF(buffer) {
    logger.info('file_extractor.pdf_start')
    // 1. Try Google Document AI first (richest structured output).
    try {
      const { documentAiService } = await import('./document-ai.service.js')
      if (await documentAiService.isAvailable()) {
        const docai = await documentAiService.parseInvoice(buffer, { mimeType: 'application/pdf' })
        if (docai && (docai.text?.length || Object.keys(docai.fields || {}).length)) {
          logger.info('file_extractor.pdf_documentai', { chars: docai.text.length, fields: Object.keys(docai.fields).length })
          return docai.text
        }
      }
    } catch (err) {
      logger.warn('file_extractor.pdf_documentai_failed', { error: err.message })
    }

    // 2. pdfjs-dist — text extraction WITH positional data (word bounding boxes).
    try {
      const result = await this.extractFromPDFWithPositions(buffer)
      if (result.text && result.text.replace(/\s/g, '').length >= 20) {
        logger.info('file_extractor.pdfjs_done', {
          chars: result.text.length,
          wordCount: result.words.length,
          pages: result.pages,
        })
        // Return enriched object: text + words with positions
        return result
      }
    } catch (err) {
      logger.warn('file_extractor.pdfjs_failed', { error: err.message })
    }

    // 3. pdf-parse fallback (text-layer extraction, no positions).
    let text = ''
    try {
      const data = await parsePDF(buffer)
      text = data.text || ''
      logger.info('file_extractor.pdf_done', { pages: data.numpages || data.pages || 0, chars: text.length })
    } catch (err) {
      logger.warn('file_extractor.pdf_parse_failed', { error: err.message })
    }

    // 4. If text extraction failed or returned very little text, render PDF to image and OCR.
    if (text.replace(/\s/g, '').length < 20) {
      logger.info('file_extractor.pdf_ocr_fallback', { extractedChars: text.length })
      try {
        const sharp = (await import('sharp')).default
        const imgBuffer = await sharp(buffer, { density: 300 })
          .png()
          .toBuffer()
        logger.info('file_extractor.pdf_rendered_to_image', { imgSize: imgBuffer.length })
        text = await this.extractFromImage(imgBuffer)
      } catch (renderErr) {
        logger.warn('file_extractor.pdf_render_fallback_failed', { error: renderErr.message })
        if (!text) throw renderErr
      }
    }
    return text
  },

  /**
   * Extract text from a PDF with word-level bounding box positions using pdfjs-dist.
   * Returns { text, words: [{ text, bbox: { x0, y0, x1, y1 }, confidence }], pages }
   */
  async extractFromPDFWithPositions(buffer) {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

    // pdfjs-dist v5 strictly requires Uint8Array, not Buffer (which is a subclass)
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise

    const allWords = []
    const textParts = []
    let globalYOffset = 0

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })
      const pageHeight = viewport.height
      const textContent = await page.getTextContent()

      const pageLines = []

      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue

        // PDF coordinate system: origin at bottom-left, Y increases upward.
        // Convert to top-left origin (like image OCR) for table reconstruction.
        const [, , , , tx, ty] = item.transform
        const x0 = Math.round(tx)
        const y0 = Math.round(pageHeight - ty) + globalYOffset
        const x1 = Math.round(tx + item.width)
        const y1 = Math.round(pageHeight - ty + item.height) + globalYOffset

        // Split multi-word items into individual words with estimated positions
        const fullText = item.str.trim()
        const wordTexts = fullText.split(/\s+/).filter(Boolean)

        if (wordTexts.length <= 1) {
          allWords.push({
            text: fullText,
            confidence: 95,
            bbox: { x0, y0, x1, y1 },
          })
        } else {
          // Distribute width proportionally across words
          const totalChars = wordTexts.reduce((s, w) => s + w.length, 0)
          let currentX = x0
          for (const wt of wordTexts) {
            const wWidth = Math.round((wt.length / totalChars) * (x1 - x0))
            allWords.push({
              text: wt,
              confidence: 95,
              bbox: { x0: currentX, y0, x1: currentX + wWidth, y1 },
            })
            currentX += wWidth + 3 // small gap between words
          }
        }

        pageLines.push({ text: fullText, y: y0, x: x0 })
      }

      // Sort page lines by Y position then X for natural reading order
      pageLines.sort((a, b) => a.y - b.y || a.x - b.x)

      // Group items on the same line (similar Y) and join with spaces
      const lineTexts = []
      let currentLineY = -1
      let currentLine = []
      const LINE_THRESHOLD = 5 // pixels

      for (const pl of pageLines) {
        if (currentLineY < 0 || Math.abs(pl.y - currentLineY) > LINE_THRESHOLD) {
          if (currentLine.length > 0) {
            lineTexts.push(currentLine.map((c) => c.text).join('  '))
          }
          currentLine = [pl]
          currentLineY = pl.y
        } else {
          currentLine.push(pl)
        }
      }
      if (currentLine.length > 0) {
        lineTexts.push(currentLine.map((c) => c.text).join('  '))
      }

      textParts.push(lineTexts.join('\n'))
      globalYOffset += pageHeight + 50 // gap between pages

      page.cleanup()
    }

    doc.cleanup()
    await doc.destroy()

    return {
      text: textParts.join('\n\n'),
      words: allWords,
      pages: doc.numPages,
    }
  },

  async extractFromDOCX(buffer) {
    logger.info('file_extractor.docx_start')
    const result = await mammoth.extractRawText({ buffer })
    logger.info('file_extractor.docx_done', { chars: result.value.length })
    return result.value
  },

  async extractFromImage(buffer) {
    logger.info('file_extractor.ocr_start')

    // 1. Try Google Vision SDK (service-account auth) — best accuracy.
    try {
      const { detectDocumentText } = await import('./google-vision.service.js')
      const visionResult = await detectDocumentText(buffer)
      if (visionResult && visionResult.text && visionResult.text.length > 10) {
        logger.info('file_extractor.ocr_vision_done', {
          chars: visionResult.text.length, confidence: visionResult.confidence,
        })
        return visionResult.text
      }
    } catch (err) {
      logger.warn('file_extractor.ocr_vision_failed', { error: err.message })
    }

    // 2. Try Google Vision via API key (REST). Cheap fallback when no
    //    service account is configured but GOOGLE_VISION_API_KEY is set.
    if (env.googleVisionApiKey) {
      try {
        const { detectDocument } = await import('./google-vision.service.js')
        const restResult = await detectDocument(buffer, env.googleVisionApiKey)
        if (restResult && restResult.text && restResult.text.length > 10) {
          logger.info('file_extractor.ocr_vision_apikey_done', {
            chars: restResult.text.length,
          })
          return restResult.text
        }
      } catch (err) {
        logger.warn('file_extractor.ocr_vision_apikey_failed', { error: err.message })
      }
    }

    // 3. Multi-pass Tesseract with preprocessing (existing path).
    try {
      const { ocrPreprocessService } = await import('./ocr-preprocess.service.js')
      if (ocrPreprocessService) {
        const result = await ocrPreprocessService.multiPassOCR(buffer)
        logger.info('file_extractor.ocr_multipass_done', {
          chars: result.text.length,
          confidence: result.confidence,
          variant: result.variant,
        })
        return result.text
      }
    } catch (err) {
      logger.warn('file_extractor.ocr_multipass_failed', { error: err.message })
    }

    // 4. Paddle (Python worker, optional).
    try {
      const result = await paddleOcrService.recognize(buffer)
      logger.info('file_extractor.ocr_done', { chars: result.text.length, confidence: result.confidence })
      if (result.confidence < 30) {
        logger.warn('file_extractor.ocr_low_confidence', { confidence: result.confidence })
      }
      return result.text
    } catch (err) {
      logger.warn('file_extractor.ocr_paddle_failed', { error: err.message })
    }

    // 5. Tesseract.js (Node WASM) — absolute last resort. Always works,
    //    no Python required, lower accuracy.
    const { tesseractFallbackService } = await import('./tesseract-fallback.service.js')
    const result = await tesseractFallbackService.recognize(buffer)
    logger.info('file_extractor.ocr_tesseract_fallback', {
      chars: result.text.length,
      confidence: result.confidence,
    })
    return result.text
  },

  async extractFromExcel(buffer) {
    if (!XLSX) {
      throw Object.assign(
        new Error('xlsx package is not installed — run: npm install xlsx'),
        { statusCode: 500 },
      )
    }
    logger.info('file_extractor.excel_start')
    // Try structured invoice parsing first — if it finds a header row,
    // serialize the structured payload into the text channel as a fenced
    // JSON block so downstream parsers can pick up the strong signal.
    try {
      const { excelInvoiceService } = await import('./excel-invoice.service.js')
      const structured = excelInvoiceService.parseInvoiceWorkbook(buffer)
      if (structured && structured.lineItems.length) {
        logger.info('file_extractor.excel_structured', { lineItems: structured.lineItems.length })
        const header = [
          structured.vendorName ? `Vendor: ${structured.vendorName}` : null,
          structured.gstin ? `GSTIN: ${structured.gstin}` : null,
          structured.invoiceNumber ? `Invoice: ${structured.invoiceNumber}` : null,
          structured.totalAmount ? `Total: ${structured.totalAmount}` : null,
        ].filter(Boolean).join('\n')
        const lines = structured.lineItems.map((it, i) =>
          `${i + 1}. ${it.description} | Qty: ${it.quantity || ''} | Rate: ${it.unitPrice || ''} | Amount: ${it.amount || ''}`).join('\n')
        return `${header}\n\n${lines}\n\n<!-- structured: ${JSON.stringify(structured)} -->`
      }
    } catch (err) {
      logger.warn('file_extractor.excel_structured_failed', { error: err.message })
    }
    // Fallback: raw text extraction (every sheet → CSV)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const lines = []
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name]
      const rows = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' })
      lines.push(rows)
    }
    const text = lines.join('\n')
    logger.info('file_extractor.excel_done', { sheets: workbook.SheetNames.length, chars: text.length })
    return text
  },
}
