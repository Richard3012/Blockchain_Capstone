import { apiClient } from './api/client'

const TOKEN_KEY = 'blockerp-token'
const AUTH_FLAG_KEY = 'blockerp-authenticated'
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
  login(payload) {
    return apiClient.post('/auth/login', payload)
  },
  me() {
    return apiClient.get('/auth/me')
  },
}
