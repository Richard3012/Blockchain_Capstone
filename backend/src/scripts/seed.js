import 'dotenv/config'

import { ensureBootstrapData } from '../bootstrap/ensure-bootstrap-data.js'
import { connectDatabase, databaseState } from '../config/database.js'
import { logger } from '../utils/logger.js'

const run = async () => {
  await connectDatabase()
  await ensureBootstrapData()
  if (databaseState.connected) {
    logger.info('seed.completed', { adminEmail: 'admin@blockerp.local', mode: databaseState.mode })
  } else {
    logger.warn('seed.skipped', { reason: 'database unavailable', mode: databaseState.mode, error: databaseState.error })
  }
  process.exit(0)
}

run().catch((error) => {
  logger.error('seed.failed', { message: error.message, stack: error.stack })
  process.exit(1)
})
