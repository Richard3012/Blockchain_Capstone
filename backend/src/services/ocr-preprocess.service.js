/**
 * OCR Pre-Processing Enhancement Layer
 * ──────────────────────────────────────
 * PRIMARY:  Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *   - Superior accuracy, word-level bounding boxes, high confidence
 * FALLBACK: PaddleOCR-VL (pipeline_version v1.5) via Python subprocess
 *
 * Image preprocessing via sharp:
 *   - Grayscale conversion + normalization
 *   - Deskew, denoise, sharpen
 */

import sharp from 'sharp'
import { logger } from '../utils/logger.js'
import { googleVisionService } from './google-vision.service.js'
import { paddleOcrService } from './paddle-ocr.service.js'

/* ─── Image Enhancement ─────────────────────────────────────────── */

async function enhanceForVision(buffer) {
  try {
    return sharp(buffer)
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.2 })
      .toBuffer()
  } catch {
    return buffer
  }
}

/* ─── PaddleOCR-VL single-shot (replaces Tesseract multi-pass) ─── */

async function paddleSinglePass(buffer, emitProgress) {
  emitProgress?.('Running PaddleOCR-VL (pipeline_version=v1.5)...')
  // PaddleOCR-VL does its own internal preprocessing/orientation, so we
  // hand it the original bytes rather than a thresholded variant.
  const result = await paddleOcrService.recognize(buffer)
  logger.info('ocr_preprocess.paddleocr_vl_done', {
    confidence: result.confidence,
    wordCount: result.words?.length || 0,
    chars: result.text.length,
    durationMs: result.durationMs,
  })
  return {
    text: result.text,
    confidence: result.confidence,
    variant: result.variant,
    words: result.words,
  }
}

/* ─── Exported Service ──────────────────────────────────────────── */

export const ocrPreprocessService = {
  isImage(mimetype) {
    return /^image\/(jpeg|png|webp|bmp|tiff|tif)$/i.test(mimetype || '')
  },

  /**
   * Main entry: run OCR on an image buffer.
   *   - If GOOGLE_VISION_API_KEY is set → Google Cloud Vision (primary)
   *   - Else → PaddleOCR-VL pipeline_version=v1.5 (fallback)
   *
   * @param {Buffer} buffer - Raw image file content
   * @param {object} [options] - { emitProgress }
   * @returns {{ text, confidence, variant, words, allResults, durationMs }}
   */
  async multiPassOCR(buffer, options = {}) {
    const { emitProgress } = options
    const startTime = Date.now()
    const visionKey = process.env.GOOGLE_VISION_API_KEY

    if (visionKey) {
      // ────── GOOGLE CLOUD VISION (primary) ──────
      emitProgress?.('Running Google Cloud Vision DOCUMENT_TEXT_DETECTION...')
      try {
        // Enhance image before sending to Vision API
        const enhanced = await enhanceForVision(buffer)
        const visionResult = await googleVisionService.detectDocument(enhanced, visionKey)

        const durationMs = Date.now() - startTime
        logger.info('ocr_preprocess.google_vision_done', {
          wordCount: visionResult.words.length,
          confidence: visionResult.confidence,
          durationMs,
        })

        emitProgress?.(`Google Vision: ${visionResult.words.length} words, ${visionResult.confidence.toFixed(1)}% confidence`)

        return {
          text: visionResult.text,
          confidence: visionResult.confidence,
          variant: 'google_vision',
          words: visionResult.words,
          allResults: [{ variant: 'google_vision', confidence: visionResult.confidence, textLength: visionResult.text.length }],
          durationMs,
        }
      } catch (e) {
        logger.error('ocr_preprocess.google_vision_failed', { error: e.message })
        emitProgress?.(`Vision API failed (${e.message}), falling back to PaddleOCR-VL...`)
        // Fall through to PaddleOCR-VL
      }
    }

    // ────── PADDLEOCR-VL FALLBACK ──────
    const best = await paddleSinglePass(buffer, emitProgress)
    const durationMs = Date.now() - startTime

    logger.info('ocr_preprocess.paddleocr_done', {
      variant: best.variant,
      confidence: best.confidence,
      durationMs,
    })

    emitProgress?.(`PaddleOCR-VL: ${best.variant} (${best.confidence.toFixed(1)}% confidence)`)

    return {
      text: best.text,
      confidence: best.confidence,
      variant: best.variant,
      words: best.words,
      allResults: [{ variant: best.variant, confidence: best.confidence, textLength: best.text.length }],
      durationMs,
    }
  },

  async enhancedOCR(buffer) {
    const enhanced = await enhanceForVision(buffer)
    const visionKey = process.env.GOOGLE_VISION_API_KEY
    if (visionKey) {
      try {
        const result = await googleVisionService.detectDocument(enhanced, visionKey)
        return { text: result.text, confidence: result.confidence, variant: 'google_vision', words: result.words }
      } catch { /* fallback */ }
    }
    const paddle = await paddleOcrService.recognize(enhanced)
    return { text: paddle.text, confidence: paddle.confidence, variant: paddle.variant, words: paddle.words }
  },

  async enhanceImage(buffer) {
    try {
      return sharp(buffer).grayscale().normalize().sharpen({ sigma: 1 }).toBuffer()
    } catch {
      return buffer
    }
  },
}
