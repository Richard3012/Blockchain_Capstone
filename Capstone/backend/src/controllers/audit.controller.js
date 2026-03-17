import { asyncHandler } from '../middlewares/async-handler.js'
import { AuditLog } from '../models/audit-log.model.js'

export const auditController = {
  list: asyncHandler(async (req, res) => {
    const data = await AuditLog.find({ companyId: req.user.companyId }).populate('actor').sort({ createdAt: -1 })
    res.json({ success: true, data })
  }),
  byEntity: asyncHandler(async (req, res) => {
    const data = await AuditLog.find({
      companyId: req.user.companyId,
      entityType: req.params.entityType,
      entityId: req.params.entityId,
    }).populate('actor').sort({ createdAt: -1 })
    res.json({ success: true, data })
  }),
}
