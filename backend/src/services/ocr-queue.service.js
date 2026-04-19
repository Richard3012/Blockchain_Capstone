import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

/**
 * OCR Queue
 *
 * Wraps heavy OCR jobs (Document AI, Vision, Tesseract on large files)
 * in a `p-queue` so we don't fork-bomb the host when 50 users upload at
 * once. Concurrency is configurable via `OCR_QUEUE_CONCURRENCY` (default 2).
 *
 * Lazy-imports `p-queue` so the server still boots if the dep is missing.
 */

let queuePromise = null

async function getQueue() {
  if (!queuePromise) {
    queuePromise = (async () => {
      try {
        const { default: PQueue } = await import('p-queue')
        const concurrency = env.ocrQueueConcurrency || 2
        logger.info('ocr_queue.initialized', { concurrency })
        return new PQueue({ concurrency })
      } catch (err) {
        logger.warn('ocr_queue.fallback_no_queue', { error: err.message })
        return null
      }
    })()
  }
  return queuePromise
}

/**
 * Enqueue an OCR job. If p-queue is unavailable, runs immediately.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @param {{ priority?: number, label?: string }} [opts]
 * @returns {Promise<T>}
 */
export async function enqueueOcr(task, opts = {}) {
  const queue = await getQueue()
  if (!queue) return task()

  const startedAt = Date.now()
  const queuedSize = queue.size
  const queuedPending = queue.pending
  if (queuedSize > 0) {
    logger.info('ocr_queue.queued', {
      label: opts.label,
      ahead: queuedSize,
      running: queuedPending,
    })
  }

  return queue.add(
    async () => {
      const startRun = Date.now()
      const waitedMs = startRun - startedAt
      try {
        const result = await task()
        logger.info('ocr_queue.completed', {
          label: opts.label,
          waitedMs,
          ranMs: Date.now() - startRun,
        })
        return result
      } catch (err) {
        logger.warn('ocr_queue.task_failed', {
          label: opts.label,
          error: err.message,
        })
        throw err
      }
    },
    { priority: opts.priority || 0 },
  )
}

/** Snapshot of queue state — useful for /health and debugging. */
export async function ocrQueueStats() {
  const queue = await getQueue()
  if (!queue) return { available: false }
  return {
    available: true,
    size: queue.size,
    pending: queue.pending,
    concurrency: queue.concurrency,
    isPaused: queue.isPaused,
  }
}
