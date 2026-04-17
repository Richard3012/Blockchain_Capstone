/**
 * Google Cloud Vision API — OCR Service
 * ──────────────────────────────────────
 * Uses DOCUMENT_TEXT_DETECTION to extract:
 *   - Full document text
 *   - Word-level bounding boxes (x, y, width, height)
 *   - Per-word confidence scores
 *
 * Returns data in the same shape the pipeline expects so it's a
 * drop-in replacement for Tesseract.js.
 */

import { logger } from '../utils/logger.js'

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'

/**
 * Call Google Cloud Vision DOCUMENT_TEXT_DETECTION.
 *
 * @param {Buffer} imageBuffer - Raw image bytes
 * @param {string} apiKey - Google Cloud API key
 * @returns {{ text: string, words: Array<{text,bbox:{x0,y0,x1,y1},confidence}>, confidence: number }}
 */
export async function detectDocument(imageBuffer, apiKey) {
  if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is not configured')

  const base64 = imageBuffer.toString('base64')

  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['en'] },
      },
    ],
  }

  const res = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    logger.error('google_vision.api_error', { status: res.status, body: errBody })
    throw new Error(`Google Vision API returned ${res.status}: ${errBody}`)
  }

  const data = await res.json()
  const annotation = data.responses?.[0]

  if (annotation?.error) {
    throw new Error(`Vision API error: ${annotation.error.message}`)
  }

  const fullAnnotation = annotation?.fullTextAnnotation
  const fullText = fullAnnotation?.text || ''

  // Extract word-level bounding boxes from pages → blocks → paragraphs → words
  const words = []
  let overallConfidence = 0
  let wordCount = 0

  if (fullAnnotation?.pages) {
    for (const page of fullAnnotation.pages) {
      for (const block of page.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          for (const word of paragraph.words || []) {
            const symbols = word.symbols || []
            const wordText = symbols.map((s) => s.text).join('')

            // Bounding box — use the word-level bounding poly
            const vertices = word.boundingBox?.vertices || []
            const xs = vertices.map((v) => v.x || 0)
            const ys = vertices.map((v) => v.y || 0)

            const x0 = Math.min(...xs)
            const y0 = Math.min(...ys)
            const x1 = Math.max(...xs)
            const y1 = Math.max(...ys)

            const wordConf = word.confidence ?? 1.0

            words.push({
              text: wordText,
              bbox: { x0, y0, x1, y1 },
              confidence: Math.round(wordConf * 100),
              // Convenience fields matching user spec
              x: x0,
              y: y0,
              width: x1 - x0,
              height: y1 - y0,
            })

            overallConfidence += wordConf
            wordCount++
          }
        }
      }
    }
  }

  const avgConfidence = wordCount > 0 ? (overallConfidence / wordCount) * 100 : 0

  logger.info('google_vision.document_detected', {
    textLength: fullText.length,
    wordCount,
    avgConfidence: avgConfidence.toFixed(1),
  })

  return {
    text: fullText,
    words,
    confidence: Math.round(avgConfidence * 100) / 100,
  }
}

export const googleVisionService = { detectDocument }
