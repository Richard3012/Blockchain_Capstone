import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { env } from './env.js'
import { logger } from '../utils/logger.js'

let memoryServer = null

export const databaseState = {
  connected: false,
  mode: 'disconnected',
  uri: null,
  error: null,
}

async function connectWithUri(uri, mode) {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  databaseState.connected = true
  databaseState.mode = mode
  databaseState.uri = uri
  databaseState.error = null
  logger.info('database.connected', { mode, uri })
}

export const connectDatabase = async () => {
  try {
    await connectWithUri(env.mongoUri, 'primary')
    return databaseState
  } catch (error) {
    databaseState.connected = false
    databaseState.error = error.message
    logger.warn('database.primary_failed', { message: error.message })

    if (!env.mongoFallback) {
      databaseState.mode = 'degraded'
      logger.error('database.unavailable', { message: error.message, fallback: 'disabled' })
      return databaseState
    }

    try {
      memoryServer = await MongoMemoryServer.create()
      const uri = memoryServer.getUri('blockerp')
      await connectWithUri(uri, 'memory')
      return databaseState
    } catch (memoryError) {
      databaseState.connected = false
      databaseState.mode = 'degraded'
      databaseState.uri = null
      databaseState.error = memoryError.message
      logger.error('database.fallback_failed', { message: memoryError.message })
      return databaseState
    }
  }
}

export const stopDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  if (memoryServer) {
    await memoryServer.stop()
    memoryServer = null
  }
}
