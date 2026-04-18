/**
 * PaddleOCR-VL bridge service
 * ────────────────────────────────────────────────────────────────────
 * Replaces Tesseract.js as the OCR engine.
 *
 * Spawns a Python subprocess that runs the official PaddleOCR-VL pipeline
 * (`pipeline_version="v1.5"`) on a temp image file and returns the JSON
 * result on stdout.  Output shape matches the structure that the rest of
 * the BlockERP OCR pipeline (file-extractor, ocr-preprocess,
 * table-reconstruction) already understands:
 *
 *     {
 *       text:       "<plain text>",
 *       markdown:   "<markdown rendering>",
 *       confidence: 0..100,
 *       words: [{ text, bbox: { x0, y0, x1, y1 }, confidence,
 *                 x, y, width, height }],
 *       engine:    "paddleocr-vl",
 *       variant:   "paddleocr_vl_v1.5",
 *       version:   "v1.5",
 *       durationMs
 *     }
 *
 * Environment overrides:
 *   PADDLEOCR_PYTHON  – path to the python executable (default: 'python')
 *   PADDLEOCR_TIMEOUT – per-call timeout in ms (default: 180000)
 */

import { spawn } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = resolve(__dirname, 'python', 'paddle_ocr_worker.py')
const PYTHON_BIN = process.env.PADDLEOCR_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
const TIMEOUT_MS = Number(process.env.PADDLEOCR_TIMEOUT) || 180_000

function decorateWords(words = []) {
  return words.map((w) => {
    const bbox = w?.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 }
    return {
      text: w?.text ?? '',
      bbox,
      confidence: Number(w?.confidence ?? 0),
      x: bbox.x0,
      y: bbox.y0,
      width: Math.max(0, (bbox.x1 || 0) - (bbox.x0 || 0)),
      height: Math.max(0, (bbox.y1 || 0) - (bbox.y0 || 0)),
    }
  })
}

function runWorker(imagePath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(PYTHON_BIN, [WORKER_PATH, imagePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`PaddleOCR worker timed out after ${TIMEOUT_MS}ms`))
    }, TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8') })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to spawn '${PYTHON_BIN}': ${err.message}`))
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (stderr.trim()) logger.debug('paddle_ocr.worker_stderr', { stderr: stderr.trim().slice(-2000) })
      if (code !== 0) {
        return reject(new Error(`PaddleOCR worker exited with code ${code}: ${stderr.trim().slice(-500) || stdout.slice(-500)}`))
      }
      const lastBrace = stdout.lastIndexOf('{')
      const jsonText = lastBrace >= 0 ? stdout.slice(lastBrace) : stdout
      try {
        const parsed = JSON.parse(jsonText)
        if (parsed.error) return reject(new Error(parsed.error))
        resolvePromise(parsed)
      } catch (err) {
        reject(new Error(`PaddleOCR worker returned invalid JSON: ${err.message}`))
      }
    })
  })
}

export const paddleOcrService = {
  /**
   * Run PaddleOCR-VL on an image buffer.
   * @param {Buffer} buffer - Raw image bytes (PNG/JPEG/WEBP/BMP/TIFF).
   * @param {object} [options]
   * @param {string} [options.ext='png'] - Hint for the temp file extension.
   * @returns {Promise<{text:string, markdown:string, confidence:number, words:Array, variant:string, engine:string, version:string, durationMs:number}>}
   */
  async recognize(buffer, options = {}) {
    const ext = (options.ext || 'png').replace(/^\./, '')
    const startedAt = Date.now()
    const dir = await mkdtemp(join(tmpdir(), 'paddleocr-'))
    const filePath = join(dir, `input.${ext}`)
    try {
      await writeFile(filePath, buffer)
      logger.info('paddle_ocr.start', { bytes: buffer.length, ext })
      const result = await runWorker(filePath)
      const words = decorateWords(result.words || [])
      const text = result.text || words.map((w) => w.text).join(' ')
      const out = {
        text,
        markdown: result.markdown || '',
        confidence: Number(result.confidence) || 0,
        words,
        variant: 'paddleocr_vl_v1.5',
        engine: result.engine || 'paddleocr-vl',
        version: result.version || 'v1.5',
        durationMs: Date.now() - startedAt,
      }
      logger.info('paddle_ocr.done', {
        chars: text.length,
        words: words.length,
        confidence: out.confidence,
        durationMs: out.durationMs,
      })
      return out
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  },
}

export default paddleOcrService
