import jwt from 'jsonwebtoken'

import { databaseState } from '../config/database.js'
import { env } from '../config/env.js'
import { runtime } from '../config/runtime.js'
import { User } from '../models/user.model.js'
import { DEV_FALLBACK_USER } from '../services/dev-fallback.service.js'

export const requireAuth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) {
      const error = new Error('Authentication required')
      error.statusCode = 401
      throw error
    }

    const payload = jwt.verify(token, env.jwtSecret)
    if (payload.sid !== runtime.bootId) {
      const error = new Error('Session expired. Please log in again.')
      error.statusCode = 401
      throw error
    }

    // Dev fallback only allowed in non-production when DB is down
    if (!databaseState.connected) {
      if (env.isProduction) {
        const error = new Error('Service temporarily unavailable')
        error.statusCode = 503
        throw error
      }
      if (payload.sub !== DEV_FALLBACK_USER._id || !DEV_FALLBACK_USER.isActive) {
        const error = new Error('User is not authorized')
        error.statusCode = 401
        throw error
      }

      req.user = DEV_FALLBACK_USER
      next()
      return
    }

    const user = await User.findById(payload.sub).select('-passwordHash')

    if (!user || !user.isActive) {
      const error = new Error('User is not authorized')
      error.statusCode = 401
      throw error
    }

    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

export const requireRoles = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    const error = new Error('You do not have access to this resource')
    error.statusCode = 403
    next(error)
    return
  }

  next()
}
