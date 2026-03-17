import jwt from 'jsonwebtoken'

import { env } from '../config/env.js'
import { User } from '../models/user.model.js'

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
