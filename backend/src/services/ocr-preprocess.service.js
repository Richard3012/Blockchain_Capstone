/**
 * OCR Pre-Processing Enhancement Layer
 * ──────────────────────────────────────
 * PRIMARY:  Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *   - Superior accuracy, word-level bounding boxes, high confidence
 * FALLBACK: Tesseract.js multi-pass (when Vision API key not set)
 *
 * Image preprocessing via sharp:
 *   - Grayscale conversion + normalization
 *   - Deskew, denoise, sharpen
 */

import sharp from 'sharp'
import Tesseract from 'tesseract.js'
import { logger } from '../utils/logger.js'
import { googleVisionService } from './google-vision.service.js'

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

/* ─── Tesseract OCR with multiple page segmentation modes ─────── */

async function runTesseractOCR(buffer, variantName, pagesegMode = '6') {
  const { data } = await Tesseract.recognize(buffer, 'eng', {
    tessedit_pageseg_mode: pagesegMode,
    preserve_interword_spaces: '1',
  })
  return {
    text: data.text || '',
    confidence: data.confidence || 0,
    variant: variantName,
    words: (data.words || []).map((w) => ({
      text: w.text,
      bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
      confidence: w.confidence || 0,
      x: w.bbox?.x0 || 0,
      y: w.bbox?.y0 || 0,
      width: ((w.bbox?.x1 || 0) - (w.bbox?.x0 || 0)),
      height: ((w.bbox?.y1 || 0) - (w.bbox?.y0 || 0)),
    })),
  }
}

async function tesseractMultiPass(buffer, emitProgress) {
  // Prepare image variants
  const variants = [{ name: 'original', buffer }]
  try {
    variants.push({ name: 'enhanced', buffer: await enhanceForVision(buffer) })
  } catch { /* ignore */ }
  try {
    variants.push({
      name: 'threshold',
      buffer: await sharp(buffer).grayscale().normalize().threshold(140).toBuffer(),
    })
  } catch { /* ignore */ }
  try {
    // High-contrast variant for table detection
    variants.push({
      name: 'highcontrast',
      buffer: await sharp(buffer).grayscale().normalize().linear(1.5, -20).sharpen({ sigma: 1.5 }).toBuffer(),
    })
  } catch { /* ignore */ }

  emitProgress?.(`Running Tesseract multi-pass OCR (${variants.length} variants, 2 PSM modes)...`)

  // Run each variant with TWO page segmentation modes:
  // PSM 6 = single uniform block (good for structured text)
  // PSM 4 = single column of variable-size text (better for tables)
  const psmModes = ['6', '4']
  const allRuns = []
  for (const v of variants) {
    for (const psm of psmModes) {
      allRuns.push(
        runTesseractOCR(v.buffer, `${v.name}_psm${psm}`, psm)
          .catch(() => ({ text: '', confidence: 0, variant: `${v.name}_psm${psm}`, words: [] })),
      )
    }
  }

  const results = await Promise.all(allRuns)
  
  // Pick best by: most words with valid bounding boxes, then by confidence
  const scored = results
    .filter((r) => r.text.length > 10)
    .map((r) => {
      const validWords = r.words.filter((w) => w.bbox && (w.bbox.x1 - w.bbox.x0) > 0)
      return { ...r, validWordCount: validWords.length, score: validWords.length * 0.5 + r.confidence * 0.5 }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0] || results[0] || { text: '', confidence: 0, variant: 'none', words: [] }

  logger.info('ocr_preprocess.tesseract_multipass', {
    variantsRun: allRuns.length,
    bestVariant: best.variant,
    bestConfidence: best.confidence,
    bestWordCount: best.words?.length || 0,
    validWordCount: best.validWordCount || 0,
  })

  return best
}

/* ─── Exported Service ──────────────────────────────────────────── */

export const ocrPreprocessService = {
  isImage(mimetype) {
    return /^image\/(jpeg|png|webp|bmp|tiff|tif)$/i.test(mimetype || '')
  },

  /**
   * Main entry: run OCR on an image buffer.
   *   - If GOOGLE_VISION_API_KEY is set → Google Cloud Vision (primary)
   *   - Else → Tesseract.js multi-pass (fallback)
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
        emitProgress?.(`Vision API failed (${e.message}), falling back to Tesseract...`)
        // Fall through to Tesseract
      }
    }

    // ────── TESSERACT.JS FALLBACK ──────
    emitProgress?.('Running Tesseract.js OCR...')
    const best = await tesseractMultiPass(buffer, emitProgress)
    const durationMs = Date.now() - startTime

    logger.info('ocr_preprocess.tesseract_done', {
      variant: best.variant,
      confidence: best.confidence,
      durationMs,
    })

    emitProgress?.(`Tesseract: ${best.variant} (${best.confidence.toFixed(1)}% confidence)`)

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
    return runTesseractOCR(enhanced, 'enhanced')
  },

  async enhanceImage(buffer) {
    try {
      return sharp(buffer).grayscale().normalize().sharpen({ sigma: 1 }).toBuffer()
    } catch {
      return buffer
    }
  },
}
