import { logger } from '../utils/logger.js'

let schedulerIntervals = []

export const schedulerService = {
  initialize() {
    logger.info('scheduler.initialized')
  },

  schedule(name, intervalMs, task) {
    const id = setInterval(async () => {
      try {
        await task()
        logger.info('scheduler.task_completed', { name })
      } catch (error) {
        logger.error('scheduler.task_failed', { name, message: error.message })
      }
    }, intervalMs)

    schedulerIntervals.push({ name, id })
    logger.info('scheduler.task_registered', { name, intervalMs })
  },

  shutdown() {
    for (const { name, id } of schedulerIntervals) {
      clearInterval(id)
      logger.info('scheduler.task_stopped', { name })
    }
    schedulerIntervals = []
    logger.info('scheduler.shutdown')
  },
}
