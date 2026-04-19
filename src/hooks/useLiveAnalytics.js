import { useEffect, useRef, useState, useCallback } from 'react'
import io from 'socket.io-client'

import { apiClient } from '../services/api/client'

/**
 * useLiveAnalytics(key, options)
 *
 * Fetches `/analytics/<key>` and re-fetches when the backend broadcasts
 * an `analytics:invalidate` event for that key (or '*'). Uses a single
 * shared Socket.IO connection per page mount.
 *
 * @param {string} key  one of: 'revenue-trend' | 'expense-breakdown' | 'gst-summary' | 'vendor-spending' | 'summary'
 * @param {{ period?: 'week'|'month'|'quarter'|'year', limit?: number, enabled?: boolean }} [opts]
 * @returns {{ data: any, loading: boolean, error: Error|null, refetch: () => void }}
 */
export function useLiveAnalytics(key, opts = {}) {
  const { period = 'month', limit, enabled = true } = opts
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const socketRef = useRef(null)

  const fetcher = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (period) params.set('period', period)
      if (limit) params.set('limit', String(limit))
      const qs = params.toString()
      const url = qs ? `/analytics/${key}?${qs}` : `/analytics/${key}`
      const result = await apiClient.get(url)
      setData(result)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [key, period, limit, enabled])

  useEffect(() => { fetcher() }, [fetcher])

  useEffect(() => {
    if (!enabled) return undefined
    const SOCKET_URL =
      (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') || '').trim() ||
      window.location.origin
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('analytics:invalidate', (payload) => {
      if (!payload?.key) return
      if (payload.key === key || payload.key === '*') {
        fetcher()
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [key, enabled, fetcher])

  return { data, loading, error, refetch: fetcher }
}
