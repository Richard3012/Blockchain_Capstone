import { apiClient } from './api/client'

const TOKEN_KEY = 'blockerp-token'
const AUTH_FLAG_KEY = 'blockerp-authenticated'
const LAST_EMAIL_KEY = 'blockerp-last-email'
const LAST_PASSWORD_KEY = 'blockerp-last-password'
const storage = () => window.sessionStorage

export const authService = {
  tokenKey: TOKEN_KEY,
  authFlagKey: AUTH_FLAG_KEY,
  getToken() {
    return storage().getItem(TOKEN_KEY)
  },
  hasAuthFlag() {
    return storage().getItem(AUTH_FLAG_KEY) === 'true'
  },
  setToken(token) {
    storage().setItem(TOKEN_KEY, token)
    storage().setItem(AUTH_FLAG_KEY, 'true')
  },
  clearToken() {
    storage().removeItem(TOKEN_KEY)
    storage().removeItem(AUTH_FLAG_KEY)
  },
  getLastEmail() {
    return storage().getItem(LAST_EMAIL_KEY) || ''
  },
  getLastPassword() {
    return storage().getItem(LAST_PASSWORD_KEY) || ''
  },
  setLastEmail(email) {
    if (!email) return
    storage().setItem(LAST_EMAIL_KEY, email)
  },
  setLastCredentials(email, password) {
    if (email) storage().setItem(LAST_EMAIL_KEY, email)
    if (password) storage().setItem(LAST_PASSWORD_KEY, password)
  },
  login(payload) {
    return apiClient.post('/auth/login', payload, { skipErrorToast: true })
  },
  me() {
    return apiClient.get('/auth/me', { skipErrorToast: true })
  },
}
