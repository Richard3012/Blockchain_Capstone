import { createRequire } from 'module'
import mammoth from 'mammoth'

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

    // ── PDF ─────────────────────────────────────────────
    if (type === 'application/pdf' || ext === 'pdf') {
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
    let text = ''
    try {
      const data = await parsePDF(buffer)
      text = data.text || ''
      logger.info('file_extractor.pdf_done', { pages: data.numpages || data.pages || 0, chars: text.length })
    } catch (err) {
      logger.warn('file_extractor.pdf_parse_failed', { error: err.message })
    }

    // If text extraction failed or returned very little text, render PDF to image and OCR
    if (text.replace(/\s/g, '').length < 20) {
      logger.info('file_extractor.pdf_ocr_fallback', { extractedChars: text.length })
      try {
        const sharp = (await import('sharp')).default
        // sharp can render the first page of a PDF to a PNG image
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

  async extractFromDOCX(buffer) {
    logger.info('file_extractor.docx_start')
    const result = await mammoth.extractRawText({ buffer })
    logger.info('file_extractor.docx_done', { chars: result.value.length })
    return result.value
  },

  async extractFromImage(buffer) {
    logger.info('file_extractor.ocr_start')

    // Try multi-pass OCR with preprocessing (if sharp is available)
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
    } catch {
      // Fall through to standard single-pass OCR
    }

    const result = await paddleOcrService.recognize(buffer)
    logger.info('file_extractor.ocr_done', { chars: result.text.length, confidence: result.confidence })
    if (result.confidence < 30) {
      logger.warn('file_extractor.ocr_low_confidence', { confidence: result.confidence })
    }
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
