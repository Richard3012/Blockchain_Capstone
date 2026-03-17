import cors from 'cors'
import express from 'express'

import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js'
import apiRouter from './routes/index.js'

const app = express()

app.use(cors({ origin: env.clientOrigin, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'blockerp-api',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api', apiRouter)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
