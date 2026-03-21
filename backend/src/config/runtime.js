import crypto from 'crypto'

export const runtime = {
  bootId: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
}
