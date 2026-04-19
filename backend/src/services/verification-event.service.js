import { VerificationEvent } from '../models/verification-event.model.js'
import { logger } from '../utils/logger.js'

export const verificationEventService = {
  async append({
    companyId,
    entityType,
    entityId,
    recordLabel,
    status,
    storedHash,
    recomputedHash,
    message,
    fieldDiffs = [],
    tamperSource,
    triggeredBy = null,
  }) {
    const doc = await VerificationEvent.create({
      companyId,
      entityType,
      entityId: String(entityId),
      recordLabel,
      status,
      storedHash: storedHash || '',
      recomputedHash: recomputedHash || '',
      message: message || '',
      fieldDiffs,
      tamperSource: tamperSource || undefined,
      triggeredBy,
    })

    logger.info('verification.event_logged', {
      companyId: companyId?.toString?.() || companyId,
      entityType,
      entityId: String(entityId),
      status,
    })

    return doc
  },

  async list(companyId, { status, entityType, from, to, limit = 200 } = {}) {
    const query = { companyId }
    if (status) query.status = status
    if (entityType) query.entityType = entityType
    if (from || to) {
      query.createdAt = {}
      if (from) query.createdAt.$gte = new Date(from)
      if (to) query.createdAt.$lte = new Date(to)
    }

    return VerificationEvent.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 200, 500)).lean()
  },
}
