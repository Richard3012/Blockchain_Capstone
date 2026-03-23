import http from 'http'

import { Server } from 'socket.io'

import app from './app.js'
import { ensureBootstrapData } from './bootstrap/ensure-bootstrap-data.js'
import { connectDatabase } from './config/database.js'
import { env } from './config/env.js'
import { schedulerService } from './services/scheduler.service.js'
import { telegramService } from './services/telegram.service.js'
import { logger } from './utils/logger.js'

const bootstrap = async () => {
  const database = await connectDatabase()
  await ensureBootstrapData()

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
      databaseMode: database.mode,
    })
  })
}

bootstrap().catch((error) => {
  console.error('Failed to start BlockERP API', error)
  process.exit(1)
})
