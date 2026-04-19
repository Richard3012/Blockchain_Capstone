import { useStore } from '../../store/useStore.js'

function normalizeApiBaseUrl(raw) {
  const trimmed = (raw || '').trim() || 'http://localhost:4000'
  const noTrail = trimmed.replace(/\/+$/, '')
  if (/\/api$/i.test(noTrail)) return noTrail
  return `${noTrail}/api`
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)

function showErrorToast(message) {
  try {
    const { addToast } = useStore.getState()
    addToast(message, 'error')
  } catch (_) { /* store not ready */ }
}

function shouldSuppressErrorToast(status, message) {
  const msg = String(message || '')
  if (status === 400 && (/Invalid identifier|Invalid record identifier|Cast to ObjectId/i.test(msg))) return true
  if (status === 404 && /Route not found/i.test(msg)) return true
  return false
}

async function request(path, options = {}) {
  const { skipErrorToast, headers: headerOverrides, ...fetchOptions } = options
  const token = window.sessionStorage.getItem('blockerp-token')
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headerOverrides || {}),
      },
      ...fetchOptions,
    })
  } catch (error) {
    const msg = 'Cannot reach BlockERP API. Confirm the backend is running.'
    showErrorToast(msg)
    throw new Error(msg)
  }

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const msg = payload.message || `Request failed (${response.status})`
    if (response.status === 401) {
      window.sessionStorage.removeItem('blockerp-token')
    }
    const suppress = skipErrorToast || shouldSuppressErrorToast(response.status, msg)
    if (response.status !== 401 && !suppress) {
      showErrorToast(msg)
    }
    throw new Error(msg)
  }

  return payload.data
}

export const apiClient = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body: JSON.stringify(body), ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
}
