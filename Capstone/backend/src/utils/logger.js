const format = (level, event, data = {}) =>
  JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  })

export const logger = {
  info(event, data) {
    console.log(format('info', event, data))
  },
  warn(event, data) {
    console.warn(format('warn', event, data))
  },
  error(event, data) {
    console.error(format('error', event, data))
  },
}
