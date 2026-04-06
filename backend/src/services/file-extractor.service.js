import { createRequire } from 'module'
import mammoth from 'mammoth'
import Tesseract from 'tesseract.js'

import { logger } from '../utils/logger.js'

// pdf-parse v2 exports PDFParse class; v1 exports a plain function
const require = createRequire(import.meta.url)
const pdfParseModule = require('pdf-parse')
const PDFParse = pdfParseModule.PDFParse

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

    // ── Images (JPEG, PNG, WEBP, BMP, TIFF) ────────────
    if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)) {
      return this.extractFromImage(buffer)
    }

    // ── Plain text / fallback ───────────────────────────
    if (type.startsWith('text/') || ext === 'txt' || ext === 'csv') {
      return buffer.toString('utf-8')
    }

    throw Object.assign(
      new Error(`Unsupported file type: ${mimetype || ext}. Accepted: PDF, DOCX, JPG, PNG, WEBP, BMP, TIFF, TXT`),
      { statusCode: 400 },
    )
  },

  async extractFromPDF(buffer) {
    logger.info('file_extractor.pdf_start')
    const data = await parsePDF(buffer)
    const text = data.text || ''
    logger.info('file_extractor.pdf_done', { pages: data.numpages || data.pages || 0, chars: text.length })
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
    const { data } = await Tesseract.recognize(buffer, 'eng', {
      logger: (m) => {
        if (m.status) logger.debug('file_extractor.ocr_progress', { status: m.status, progress: m.progress })
      },
      tessedit_pageseg_mode: '6',           // Assume uniform block of text
      preserve_interword_spaces: '1',       // Keep spacing for table-like layouts
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:-/#@%₹ ()\n',
    })
    logger.info('file_extractor.ocr_done', { chars: data.text.length, confidence: data.confidence })
    if (data.confidence < 30) {
      logger.warn('file_extractor.ocr_low_confidence', { confidence: data.confidence })
    }
    return data.text
  },
}
