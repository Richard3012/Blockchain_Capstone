import cors from 'cors'
import express from 'express'

import { databaseState } from './config/database.js'
import { env } from './config/env.js'
import { runtime } from './config/runtime.js'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js'
import { requestLogger } from './middlewares/request-logger.js'
import apiRouter from './routes/index.js'

const app = express()

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
    frontend: env.clientOrigin,
  })
})

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'blockerp-api',
    timestamp: new Date().toISOString(),
    runtime,
    database: databaseState,
  })
})

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'blockerp-api',
      timestamp: new Date().toISOString(),
      runtime,
      database: databaseState,
    },
  })
})

app.use('/api', apiRouter)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
