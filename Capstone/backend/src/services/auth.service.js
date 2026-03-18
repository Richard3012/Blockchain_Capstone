import crypto from 'crypto'

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { databaseState } from '../config/database.js'
import { env } from '../config/env.js'
import { runtime } from '../config/runtime.js'
import { ROLES } from '../constants/roles.js'
import Company from '../models/company.model.js'
import { Store } from '../models/store.model.js'
import { User } from '../models/user.model.js'
import { DEV_FALLBACK_USER, isDevFallbackLogin } from './dev-fallback.service.js'
import { logger } from '../utils/logger.js'

const signToken = (user) =>
  jwt.sign({ sub: (user._id || user.id).toString(), role: user.role, sid: runtime.bootId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  })

const sanitizeUser = (user) => ({
  id: user._id || user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  companyId: user.companyId,
  storeId: user.storeId,
  linkedWalletAddress: user.linkedWalletAddress || null,
  walletLinkedAt: user.walletLinkedAt || null,
  isActive: user.isActive,
})

export const authService = {
  async register(payload) {
    if (!databaseState.connected) {
      const error = new Error('Registration is unavailable while MongoDB is offline')
      error.statusCode = 503
      throw error
    }

    const existing = await User.findOne({ email: payload.email.toLowerCase() })
    if (existing) {
      const error = new Error('Email already in use')
      error.statusCode = 409
      throw error
    }

    let companyId = payload.companyId
    let storeId = payload.storeId || null

    if (!companyId) {
      const company = await Company.create({
        name: payload.companyName || 'BlockERP Company',
        code: `COMP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      })
      companyId = company._id

      const store = await Store.create({
        companyId,
        name: payload.storeName || 'Main Store',
        code: `STORE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        type: 'store',
      })
      storeId = store._id
    }

    const user = await User.create({
      name: payload.name,
      email: payload.email.toLowerCase(),
      passwordHash: await bcrypt.hash(payload.password, 10),
      role: payload.role || ROLES.ADMIN,
      companyId,
      storeId,
      isActive: true,
    })

    logger.info('auth.registered', { userId: user._id.toString(), email: user.email, role: user.role })

    return {
      token: signToken(user),
      user: sanitizeUser(user),
    }
  },

  async login(email, password) {
    if (!databaseState.connected) {
      if (!isDevFallbackLogin(email, password)) {
        const error = new Error('Invalid email or password')
        error.statusCode = 401
        throw error
      }

      logger.warn('auth.logged_in_fallback', {
        email: DEV_FALLBACK_USER.email,
        mode: databaseState.mode,
      })

      return {
        token: signToken(DEV_FALLBACK_USER),
        user: sanitizeUser(DEV_FALLBACK_USER),
      }
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      const error = new Error('Invalid email or password')
      error.statusCode = 401
      throw error
    }

    if (!user.isActive) {
      const error = new Error('User account is inactive')
      error.statusCode = 403
      throw error
    }

    user.lastLoginAt = new Date()
    await user.save()

    logger.info('auth.logged_in', { userId: user._id.toString(), email: user.email })

    return {
      token: signToken(user),
      user: sanitizeUser(user),
    }
  },

  sanitizeUser,
}
