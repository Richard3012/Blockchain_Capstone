/**
 * OCR Pre-Processing Enhancement Layer
 * ──────────────────────────────────────
 * PRIMARY:  Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *   - Superior accuracy, word-level bounding boxes, high confidence
 * FALLBACK: PaddleOCR-VL (pipeline_version v1.5) via Python subprocess
 * LAST-RESORT: Tesseract.js (Node WASM, no Python required)
 *
 * Multi-pass OCR:   4 image preprocessing variants run in parallel,
 *                   scored by confidence + text length + regex hits.
 */

import sharp from 'sharp'
import { logger } from '../utils/logger.js'
import { googleVisionService } from './google-vision.service.js'
import { paddleOcrService } from './paddle-ocr.service.js'

/* ─── 4-Variant Image Preprocessing Pipelines ───────────────────── */

/**
 * Upscale small images so Tesseract can read them (needs ~300 DPI).
 * If width < 1500 px, scale up to 2400 px wide preserving aspect ratio.
 * Also converts non-PNG formats to PNG for consistent Tesseract input.
 */
async function ensureMinResolution(buf) {
  try {
    const meta = await sharp(buf).metadata()
    const w = meta.width || 0
    if (w < 1500 && w > 0) {
      return sharp(buf).resize({ width: 2400, withoutEnlargement: false }).png().toBuffer()
    }
    if (w > 4000) {
      // Very large images: downscale to avoid Tesseract memory issues
      return sharp(buf).resize({ width: 3000, withoutEnlargement: true }).png().toBuffer()
    }
    return sharp(buf).png().toBuffer()
  } catch {
    return buf
  }
}

const variants = {
  /** V0: Original — just upscale + PNG, no color manipulation */
  async original(buf) {
    try {
      return await ensureMinResolution(buf)
    } catch { return buf }
  },
  /** V1: Grayscale + normalize (adaptive contrast) + sharpen */
  async enhanced(buf) {
    try {
      const big = await ensureMinResolution(buf)
      return await sharp(big).grayscale().normalize().sharpen({ sigma: 1.2 }).toBuffer()
    } catch { return buf }
  },
  /** V2: High-contrast — aggressive gamma darkening + sharpen */
  async highContrast(buf) {
    try {
      const big = await ensureMinResolution(buf)
      return await sharp(big).grayscale().gamma(2.2).normalize().sharpen({ sigma: 1.5 }).toBuffer()
    } catch { return buf }
  },
  /** V3: Binarize — threshold to pure black/white for degraded docs */
  async binarize(buf) {
    try {
      const big = await ensureMinResolution(buf)
      return await sharp(big).grayscale().normalize().threshold(140).toBuffer()
    } catch { return buf }
  },
  /** V4: Light touch — preserve original colors, just sharpen + upscale */
  async lightSharpen(buf) {
    try {
      const big = await ensureMinResolution(buf)
      return await sharp(big).sharpen({ sigma: 0.8 }).toBuffer()
    } catch { return buf }
  },
  /** V5: Inverted — white text on dark backgrounds / dark scans */
  async inverted(buf) {
    try {
      const big = await ensureMinResolution(buf)
      return await sharp(big).grayscale().normalize().negate().sharpen({ sigma: 1.0 }).toBuffer()
    } catch { return buf }
  },
  /** V6: Aggressive — median denoise + high sharpen for noisy scans */
  async denoised(buf) {
    try {
      const big = await ensureMinResolution(buf)
      return await sharp(big).grayscale().median(3).normalize().sharpen({ sigma: 2.0 }).toBuffer()
    } catch { return buf }
  },
}

const VARIANT_NAMES = Object.keys(variants)

/**
 * Score an OCR result using content-quality heuristics.
 * Higher is better.  Range ≈ 0 – 100.
 */
function scoreResult(text, confidence) {
  const regexes = [
    /\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z]/,             // GSTIN
    /INV|INVOICE|BILL|PROFORMA|RECEIPT|VOUCHER|CHALLAN/i,   // invoice number
    /\d{2}[/\-]\d{2}[/\-]\d{2,4}/,                          // date
    /₹|\bRs\.?\b|\bINR\b|\bTotal\b|\bSubtotal\b/i,         // amounts
    /\bQty\b|\bRate\b|\bAmount\b|\bHSN\b|\bSAC\b/i,        // line-item headers
  ]
  const hits = regexes.reduce((n, rx) => n + (rx.test(text) ? 1 : 0), 0)

  // Weighted composite: confidence 50%, regex hits 30%, text length 20%
  const lenScore = Math.min(text.length / 200, 1) * 100   // cap at 200 chars
  return (confidence * 0.5) + (hits / regexes.length * 100 * 0.3) + (lenScore * 0.2)
}

/* ─── PaddleOCR-VL single-shot ──────────────────────────────────── */

async function paddleSinglePass(buffer, emitProgress) {
  emitProgress?.('Running PaddleOCR-VL (pipeline_version=v1.5)...')
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

/* ─── Run recognizer against all 4 variants in parallel ─────────── */

async function runMultiVariant(buffer, recognizeFn, emitProgress) {
  emitProgress?.('Generating 4 image preprocessing variants...')
  const preprocessed = await Promise.all(
    VARIANT_NAMES.map(async (name) => ({ name, buf: await variants[name](buffer) })),
  )

  emitProgress?.('Running OCR on 4 variants in parallel...')
  const settled = await Promise.allSettled(
    preprocessed.map(({ name, buf }) =>
      recognizeFn(buf).then((r) => ({ ...r, variant: name })),
    ),
  )

  const results = settled
    .filter((s) => s.status === 'fulfilled')
    .map((s) => s.value)

  if (results.length === 0) throw new Error('All 4 OCR variants failed')

  const scored = results.map((r) => ({
    ...r,
    score: scoreResult(r.text, r.confidence),
  }))

  scored.sort((a, b) => b.score - a.score)

  logger.info('ocr_preprocess.multivariant_scored', {
    results: scored.map(({ variant, confidence, score, text }) => ({
      variant, confidence: Math.round(confidence), score: Math.round(score), chars: text.length,
    })),
    winner: scored[0].variant,
  })

  emitProgress?.(`Best variant: ${scored[0].variant} (score ${scored[0].score.toFixed(1)})`)

  return {
    best: scored[0],
    allResults: scored.map(({ variant, confidence, text }) => ({
      variant, confidence, textLength: text.length,
    })),
  }
}

/* ─── Exported Service ──────────────────────────────────────────── */

export const ocrPreprocessService = {
  isImage(mimetype) {
    return /^image\/(jpeg|png|webp|bmp|tiff|tif)$/i.test(mimetype || '')
  },

  /**
   * Main entry: run OCR on an image buffer.
   *
   * Engine cascade:
   *   1. Google Cloud Vision  (if GOOGLE_VISION_API_KEY set — single pass, API cost)
   *   2. PaddleOCR-VL         (4-variant multi-pass, local)
   *   3. Tesseract.js         (4-variant multi-pass, WASM, last resort)
   *
   * Multi-pass: 4 image preprocessing variants (enhanced, highContrast,
   *   binarize, lightSharpen) are run in parallel through the selected
   *   engine.  Each result is scored by confidence + regex hits + text
   *   length, and the best variant wins.
   *
   * @param {Buffer} buffer - Raw image file content
   * @param {object} [options] - { emitProgress }
   * @returns {{ text, confidence, variant, words, allResults, preprocessDurationMs, durationMs }}
   */
  async multiPassOCR(buffer, options = {}) {
    const { emitProgress } = options
    const startTime = Date.now()
    const visionKey = process.env.GOOGLE_VISION_API_KEY

    /* ─── 1. GOOGLE CLOUD VISION (single-pass — API costs per call) ─── */
    if (visionKey) {
      emitProgress?.('Running Google Cloud Vision DOCUMENT_TEXT_DETECTION...')
      try {
        const enhanced = await variants.enhanced(buffer)
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
          preprocessDurationMs: 0,
          durationMs,
        }
      } catch (e) {
        logger.error('ocr_preprocess.google_vision_failed', { error: e.message })
        emitProgress?.(`Vision API failed (${e.message}), falling back...`)
      }
    }

    /* ─── 2. PADDLEOCR-VL — 4-variant multi-pass ──────────────────── */
    try {
      const recognizeFn = (buf) => paddleOcrService.recognize(buf)
      const { best, allResults } = await runMultiVariant(buffer, recognizeFn, emitProgress)
      const durationMs = Date.now() - startTime

      logger.info('ocr_preprocess.paddle_multipass_done', {
        winner: best.variant,
        confidence: best.confidence,
        variantsTried: allResults.length,
        durationMs,
      })
      emitProgress?.(`PaddleOCR 4-pass: best=${best.variant} (${best.confidence.toFixed(1)}%)`)

      return {
        text: best.text,
        confidence: best.confidence,
        variant: `paddle_${best.variant}`,
        words: best.words || [],
        allResults: allResults.map((r) => ({ ...r, variant: `paddle_${r.variant}` })),
        preprocessDurationMs: durationMs,
        durationMs,
      }
    } catch (paddleErr) {
      logger.warn('ocr_preprocess.paddle_failed_using_tesseract', { error: paddleErr.message })
      emitProgress?.('PaddleOCR unavailable — falling back to Tesseract.js 4-pass...')
    }

    /* ─── 3. TESSERACT.JS — 4-variant multi-pass (last resort) ────── */
    const { tesseractFallbackService } = await import('./tesseract-fallback.service.js')
    const recognizeFn = (buf) => tesseractFallbackService.recognize(buf)
    const { best, allResults } = await runMultiVariant(buffer, recognizeFn, emitProgress)
    const durationMs = Date.now() - startTime

    logger.info('ocr_preprocess.tesseract_multipass_done', {
      winner: best.variant,
      confidence: best.confidence,
      variantsTried: allResults.length,
      durationMs,
    })
    emitProgress?.(`Tesseract 4-pass: best=${best.variant} (${best.confidence.toFixed(1)}%)`)

    return {
      text: best.text,
      confidence: best.confidence,
      variant: `tesseract_${best.variant}`,
      words: best.words || [],
      allResults: allResults.map((r) => ({ ...r, variant: `tesseract_${r.variant}` })),
      preprocessDurationMs: durationMs,
      durationMs,
    }
  },

  async enhancedOCR(buffer) {
    const enhanced = await variants.enhanced(buffer)
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
    return variants.enhanced(buffer)
  },
}
