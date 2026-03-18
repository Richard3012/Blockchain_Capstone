import 'dotenv/config'

import { ensureBootstrapData } from '../bootstrap/ensure-bootstrap-data.js'
import { connectDatabase } from '../config/database.js'
import { logger } from '../utils/logger.js'

const run = async () => {
  await connectDatabase()
  await ensureBootstrapData()
  logger.info('seed.completed', { adminEmail: 'admin@blockerp.local' })
  process.exit(0)
}

run().catch((error) => {
  logger.error('seed.failed', { message: error.message, stack: error.stack })
  process.exit(1)
})
