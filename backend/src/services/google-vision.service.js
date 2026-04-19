/**
 * Google Cloud Vision API — OCR Service
 * ──────────────────────────────────────
 * Two code paths:
 *   1. `detectDocument(buffer, apiKey)` — API-key REST call (legacy, image-only).
 *   2. `detectDocumentText(buffer)` — service-account SDK call (preferred).
 *
 * Both return: { text, words[{text,bbox,confidence}], confidence }
 * The SDK path also returns `provider: 'google_vision'`.
 */

import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { googleAuthService } from './google-auth.service.js'

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'

let cachedSdkClient = null
const getSdkClient = async () => {
  if (cachedSdkClient !== null) return cachedSdkClient
  if (!(await googleAuthService.isConfigured())) { cachedSdkClient = false; return null }
  try {
    const { ImageAnnotatorClient } = await import('@google-cloud/vision')
    cachedSdkClient = new ImageAnnotatorClient({
      keyFilename: env.googleApplicationCredentials || undefined,
      projectId: env.gcpProjectId || undefined,
    })
    return cachedSdkClient
  } catch (err) {
    logger.error('vision.sdk_init_failed', { message: err.message })
    cachedSdkClient = false
    return null
  }
}

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

/**
 * Service-account-authenticated DOCUMENT_TEXT_DETECTION call. Returns the
 * same shape as detectDocument but with a `provider` field. Returns null
 * when no GCP credentials are configured (callers should fall back).
 */
export async function detectDocumentText(buffer) {
  const client = await getSdkClient()
  if (!client) return null
  const start = Date.now()
  try {
    const [result] = await client.documentTextDetection({ image: { content: buffer } })
    const annotation = result.fullTextAnnotation
    const text = annotation?.text || ''
    const words = []
    let totalConf = 0
    let wordCount = 0
    for (const page of annotation?.pages || []) {
      for (const block of page.blocks || []) {
        for (const para of block.paragraphs || []) {
          for (const word of para.words || []) {
            const wText = (word.symbols || []).map((s) => s.text).join('')
            const wConf = word.confidence || 0
            if (wConf) { totalConf += wConf; wordCount++ }
            const verts = word.boundingBox?.vertices || []
            const xs = verts.map((v) => v.x ?? 0)
            const ys = verts.map((v) => v.y ?? 0)
            const x0 = xs.length ? Math.min(...xs) : 0
            const y0 = ys.length ? Math.min(...ys) : 0
            const x1 = xs.length ? Math.max(...xs) : 0
            const y1 = ys.length ? Math.max(...ys) : 0
            words.push({
              text: wText,
              confidence: Math.round(wConf * 100),
              bbox: { x0, y0, x1, y1 },
              x: x0, y: y0, width: x1 - x0, height: y1 - y0,
            })
          }
        }
      }
    }
    const confidence = wordCount ? Math.round((totalConf / wordCount) * 10000) / 100 : 0
    logger.info('vision.document_text', {
      chars: text.length, words: words.length, confidence, durationMs: Date.now() - start,
    })
    return { text, words, confidence, provider: 'google_vision' }
  } catch (err) {
    logger.warn('vision.detect_failed', { message: err.message })
    return null
  }
}

export const googleVisionService = {
  detectDocument,
  detectDocumentText,
  async isAvailable() { return Boolean(await getSdkClient()) || Boolean(env.googleVisionApiKey) },
}
