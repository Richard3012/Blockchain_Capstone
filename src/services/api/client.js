import { useStore } from '../../store/useStore.js'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

function showErrorToast(message) {
  try {
    const { addToast } = useStore.getState()
    addToast(message, 'error')
  } catch (_) { /* store not ready */ }
}

async function request(path, options = {}) {
  const token = window.sessionStorage.getItem('blockerp-token')
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
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
    if (response.status !== 401) {
      showErrorToast(msg)
    }
    throw new Error(msg)
  }

  return payload.data
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
