// Single source of truth for Google Cloud authentication.
//
// Resolves a GoogleAuth client lazily so the rest of the codebase can call
// google-cloud SDKs (Document AI, Vision, Vertex AI) without repeating
// credential plumbing. Returns `null` when no credentials are configured —
// callers must treat that as "feature disabled" and fall back gracefully.

import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

let cachedAuth = null
let cachedClient = null
let warnedMissing = false

const tryLoadAuth = async () => {
  if (cachedAuth) return cachedAuth
  if (!env.googleApplicationCredentials && !env.gcpProjectId) {
    if (!warnedMissing) {
      logger.warn('google.auth.skipped', {
        reason: 'GOOGLE_APPLICATION_CREDENTIALS and GCP_PROJECT_ID both unset',
      })
      warnedMissing = true
    }
    return null
  }
  try {
    const { GoogleAuth } = await import('google-auth-library')
    cachedAuth = new GoogleAuth({
      keyFilename: env.googleApplicationCredentials || undefined,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      projectId: env.gcpProjectId || undefined,
    })
    return cachedAuth
  } catch (err) {
    logger.error('google.auth.init_failed', { message: err.message })
    return null
  }
}

export const googleAuthService = {
  async isConfigured() {
    return Boolean(await tryLoadAuth())
  },

  async getAuth() {
    return tryLoadAuth()
  },

  async client() {
    if (cachedClient) return cachedClient
    const auth = await tryLoadAuth()
    if (!auth) return null
    cachedClient = await auth.getClient()
    return cachedClient
  },

  async projectId() {
    if (env.gcpProjectId) return env.gcpProjectId
    const auth = await tryLoadAuth()
    if (!auth) return ''
    try {
      return await auth.getProjectId()
    } catch {
      return ''
    }
  },
}
