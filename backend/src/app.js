import compression from 'compression'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { databaseState } from './config/database.js'
import { env } from './config/env.js'
import { runtime } from './config/runtime.js'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js'
import { requestLogger } from './middlewares/request-logger.js'
import apiRouter from './routes/index.js'

const app = express()

// Security headers
app.use(helmet())

// Gzip compression
app.use(compression())

// Rate limiting — stricter on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // failed auth attempts (successful logins are not counted)
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts, please try again later.' },
})
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 600, // SPA boot + live data fetches; avoid blocking normal ERP usage
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many requests, please slow down.' },
})

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true)
      return
    }

    const isAllowed = env.clientOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)
    callback(isAllowed ? null : new Error(`CORS blocked for origin ${origin}`), isAllowed)
  },
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'blockerp-api',
    message: 'BlockERP backend is running. Use /health or /api/* endpoints.',
  })
})

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'blockerp-api',
    timestamp: new Date().toISOString(),
    uptime: runtime.uptime,
    database: { connected: databaseState.connected, mode: databaseState.mode },
  })
})

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'blockerp-api',
      timestamp: new Date().toISOString(),
      uptime: runtime.uptime,
      database: { connected: databaseState.connected, mode: databaseState.mode },
    },
  })
})

// Apply rate limiters (general API limiter only — no auth rate limiting)
app.use('/api', (req, res, next) => {
  const base = req.originalUrl.split('?')[0]
  if (base.startsWith('/api/auth')) {
    return next()
  }
  return apiLimiter(req, res, next)
})

app.use('/api', apiRouter)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
