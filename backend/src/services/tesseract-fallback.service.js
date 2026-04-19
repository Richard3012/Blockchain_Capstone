// Tesseract.js fallback OCR. Pure-Node WASM, no Python. Lower accuracy
// than Google Vision / PaddleOCR but works offline with zero infra.
//
// Multi-PSM strategy: if the default PSM returns very little text we
// automatically retry with alternative page-segmentation modes (PSM 4,
// 6, 11, 12) and pick the best result.  This dramatically improves
// extraction on real-world invoices.

import { logger } from '../utils/logger.js'

let workerPromise = null

async function getWorker() {
  if (workerPromise) return workerPromise
  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js')
    logger.info('tesseract_fallback.initializing')
    const worker = await createWorker('eng', 1, {
      logger: () => {},
      gzip: false,
    })
    // Use LSTM engine (OEM 1) for better accuracy on modern documents
    await worker.setParameters({
      tessedit_ocr_engine_mode: '1',
      preserve_interword_spaces: '1',
    })
    logger.info('tesseract_fallback.ready')
    return worker
  })()
  return workerPromise
}

/**
 * Run a single recognize pass with given PSM.
 * PSM modes useful for invoices:
 *   3  = Fully automatic (default)
 *   4  = Assume single column of varying-size text
 *   6  = Assume uniform block of text
 *   11 = Sparse text — find as much text as possible
 *   12 = Sparse text with OSD
 */
async function recognizeWithPSM(worker, buffer, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: String(psm) })
  const { data } = await worker.recognize(buffer)
  return data
}

/**
 * Extract word-level bounding box data from Tesseract.js recognition result.
 * Returns an array compatible with the table reconstruction engine.
 */
function extractWords(data) {
  if (!data || !data.words || !Array.isArray(data.words)) return []
  return data.words
    .filter((w) => w.text && w.text.trim())
    .map((w) => ({
      text: w.text.trim(),
      confidence: w.confidence || 0,
      bbox: w.bbox ? {
        x0: w.bbox.x0,
        y0: w.bbox.y0,
        x1: w.bbox.x1,
        y1: w.bbox.y1,
      } : null,
    }))
    .filter((w) => w.bbox)
}

export const tesseractFallbackService = {
  /**
   * Recognize text in an image buffer with multi-PSM retry.
   * If the primary PSM returns < MIN_CHARS, retries with alternatives
   * and picks the result with the most text + highest confidence.
   */
  async recognize(buffer) {
    const MIN_CHARS = 30
    const start = Date.now()
    const worker = await getWorker()

    // Primary: PSM 3 (fully automatic) — best for varied invoice layouts
    const primary = await recognizeWithPSM(worker, buffer, 3)

    if ((primary.text || '').trim().length >= MIN_CHARS) {
      const durationMs = Date.now() - start
      logger.info('tesseract_fallback.done', {
        chars: primary.text.length,
        confidence: Math.round(primary.confidence),
        psm: 3,
        durationMs,
      })
      return {
        text: primary.text || '',
        confidence: primary.confidence || 0,
        provider: 'tesseract',
        words: extractWords(primary),
      }
    }

    // Primary failed — retry with alternative PSMs
    logger.warn('tesseract_fallback.primary_insufficient', {
      chars: (primary.text || '').trim().length,
      confidence: Math.round(primary.confidence || 0),
    })

    const altPSMs = [6, 4, 11, 12]
    const candidates = [{ text: primary.text || '', confidence: primary.confidence || 0, psm: 3, words: extractWords(primary) }]

    for (const psm of altPSMs) {
      try {
        const result = await recognizeWithPSM(worker, buffer, psm)
        candidates.push({ text: result.text || '', confidence: result.confidence || 0, psm, words: extractWords(result) })
        if ((result.text || '').trim().length >= MIN_CHARS) break
      } catch (e) {
        logger.warn('tesseract_fallback.psm_failed', { psm, error: e.message })
      }
    }

    // Pick best: longest text wins, tiebreak by confidence
    candidates.sort((a, b) => {
      const lenDiff = (b.text || '').trim().length - (a.text || '').trim().length
      return lenDiff !== 0 ? lenDiff : (b.confidence - a.confidence)
    })

    const best = candidates[0]
    const durationMs = Date.now() - start
    logger.info('tesseract_fallback.multi_psm_done', {
      chars: best.text.length,
      confidence: Math.round(best.confidence),
      psmUsed: best.psm,
      candidateCount: candidates.length,
      durationMs,
    })

    await worker.setParameters({ tessedit_pageseg_mode: '3' }).catch(() => {})

    return { text: best.text || '', confidence: best.confidence || 0, provider: 'tesseract', words: best.words || [] }
  },
}
