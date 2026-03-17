import http from 'http'

import { Server } from 'socket.io'

import app from './app.js'
import { connectDatabase } from './config/database.js'
import { env } from './config/env.js'

const bootstrap = async () => {
  await connectDatabase()

  const server = http.createServer(app)
  const io = new Server(server, {
    cors: {
      origin: env.clientOrigin,
      credentials: true,
    },
  })

  app.set('io', io)

  io.on('connection', (socket) => {
    socket.emit('erp:ready', {
      message: 'BlockERP realtime channel connected',
      timestamp: new Date().toISOString(),
    })
  })

  server.listen(env.port, () => {
    console.log(`BlockERP API listening on port ${env.port}`)
  })
}

bootstrap().catch((error) => {
  console.error('Failed to start BlockERP API', error)
  process.exit(1)
})
