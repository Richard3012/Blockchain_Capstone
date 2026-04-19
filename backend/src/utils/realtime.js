import { logger } from './logger.js'

/**
 * Real-time analytics broadcast helper.
 *
 * Tenant-scoped, debounced Socket.IO emitter. Multiple write paths
 * (invoice create, payment record, order placed) call
 * `broadcastAnalyticsDelta(io, companyId, key)` and we coalesce bursts
 * into a single `analytics:invalidate` event per (companyId, key) within
 * a short window. Frontend hooks listen and refetch.
 *
 * Why debounce? A single invoice create can trigger multiple writes
 * (invoice + payment + journal entry). We want one UI refresh, not three.
 */

const DEBOUNCE_MS = 1000
const pending = new Map() // key = `${companyId}::${key}` → timeout

/**
 * Schedule (or coalesce) an analytics invalidation broadcast.
 * @param {import('socket.io').Server|null} io
 * @param {string} companyId
 * @param {string} key  e.g. 'revenue-trend', 'expense-breakdown', '*' for all
 */
export function broadcastAnalyticsDelta(io, companyId, key = '*') {
  if (!io || !companyId) return
  const room = `tenant:${String(companyId)}`
  const mapKey = `${room}::${key}`
  if (pending.has(mapKey)) {
    clearTimeout(pending.get(mapKey))
  }
  const t = setTimeout(() => {
    pending.delete(mapKey)
    try {
      io.to(room).emit('analytics:invalidate', {
        key,
        companyId: String(companyId),
        timestamp: new Date().toISOString(),
      })
      // Also broadcast unscoped for clients that haven't joined the room yet
      // (legacy frontends). Frontend filters by companyId.
      io.emit('analytics:invalidate', {
        key,
        companyId: String(companyId),
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      logger.warn('realtime.broadcast_failed', { error: err.message, key })
    }
  }, DEBOUNCE_MS)
  pending.set(mapKey, t)
}

/**
 * Pull the io instance off an Express app/req and broadcast.
 * Convenience wrapper for use in controllers/services that already have `req`.
 */
export function broadcastFromReq(req, key = '*') {
  const io = req?.app?.get?.('io')
  const companyId = req?.user?.companyId
  broadcastAnalyticsDelta(io, companyId, key)
}
