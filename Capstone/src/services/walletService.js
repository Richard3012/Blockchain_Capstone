import { apiClient } from './api/client'

export const walletService = {
  requestLinkNonce() {
    return apiClient.post('/wallet/request-link-nonce', {})
  },
  verifyLink(signature) {
    return apiClient.post('/wallet/verify-link', { signature })
  },
  status() {
    return apiClient.get('/wallet/status')
  },
}
