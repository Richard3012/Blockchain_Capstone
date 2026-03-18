import { apiClient } from './api/client'

const TOKEN_KEY = 'blockerp-token'
const AUTH_FLAG_KEY = 'blockerp-authenticated'

export const authService = {
  tokenKey: TOKEN_KEY,
  authFlagKey: AUTH_FLAG_KEY,
  getToken() {
    return localStorage.getItem(TOKEN_KEY)
  },
  hasAuthFlag() {
    return localStorage.getItem(AUTH_FLAG_KEY) === 'true'
  },
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(AUTH_FLAG_KEY, 'true')
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(AUTH_FLAG_KEY)
  },
  login(payload) {
    return apiClient.post('/auth/login', payload)
  },
  me() {
    return apiClient.get('/auth/me')
  },
}
