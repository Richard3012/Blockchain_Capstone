import http from 'http'

import { Server } from 'socket.io'

import app from './app.js'
import { ensureBootstrapData } from './bootstrap/ensure-bootstrap-data.js'
import { connectDatabase, stopDatabase } from './config/database.js'
import { env } from './config/env.js'
import { schedulerService } from './services/scheduler.service.js'
import { telegramService } from './services/telegram.service.js'
import { logger } from './utils/logger.js'

const bootstrap = async () => {
  const server = http.createServer(app)
  const io = new Server(server, {
    cors: {
      origin: env.clientOrigins,
      credentials: true,
    },
  })

  app.set('io', io)

  telegramService.initialize(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID)
  schedulerService.initialize()

  io.on('connection', (socket) => {
    logger.info('socket.connected', { socketId: socket.id })
    socket.emit('erp:ready', {
      message: 'BlockERP realtime channel connected',
      timestamp: new Date().toISOString(),
    })
  })

  server.listen(env.port, () => {
    logger.info('server.started', {
      port: env.port,
      clientOrigin: env.clientOrigins.join(','),
      blockchainRpcUrl: env.blockchainRpcUrl,
      databaseMode: 'booting',
    })
  })

  ;(async () => {
    try {
      const database = await connectDatabase()
      await ensureBootstrapData()
      logger.info('server.bootstrap_ready', { databaseMode: database.mode })
    } catch (error) {
      logger.error('server.bootstrap_failed', { error: error.message, stack: error.stack })
    }
  })()

  const shutdown = async (signal) => {
    logger.info('server.shutdown', { signal })
    server.close(() => {
      logger.info('server.closed', { message: 'HTTP server closed' })
    })
    io.close()
    schedulerService.stop?.()
    try {
      await stopDatabase()
    } catch {
      // best effort
    }
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', { error: reason?.message || String(reason) })
  })
  process.on('uncaughtException', (error) => {
    logger.error('uncaughtException', { error: error.message, stack: error.stack })
    process.exit(1)
  })
}

bootstrap().catch((error) => {
  logger.error('bootstrap_failed', { error: error.message, stack: error.stack })
  process.exit(1)
})
