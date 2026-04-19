import { asyncHandler } from '../middlewares/async-handler.js'
import { verificationEventService } from '../services/verification-event.service.js'

export const verificationEventsController = {
  list: asyncHandler(async (req, res) => {
    const { status, entityType, from, to, limit } = req.query
    const rows = await verificationEventService.list(req.user.companyId, {
      status,
      entityType,
      from,
      to,
      limit,
    })
    res.json({ success: true, data: rows })
  }),
}
