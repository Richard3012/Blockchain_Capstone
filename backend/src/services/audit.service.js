import { AuditLog } from '../models/audit-log.model.js'
import { hashRecord } from '../utils/hash-record.js'
import { logger } from '../utils/logger.js'

export const auditService = {
  async record({ companyId, action, entityType, entityId, summary, actor, metadata = {} }) {
    const hash = hashRecord({ action, entityType, entityId, metadata })

    const auditLog = await AuditLog.create({
      companyId,
      action,
      entityType,
      entityId: entityId.toString(),
      summary,
      metadata,
      hash,
      actor: actor ?? null,
    })

    logger.info('audit.recorded', { action, entityType, entityId: entityId.toString(), auditLogId: auditLog._id.toString() })
    return auditLog
  },
}
