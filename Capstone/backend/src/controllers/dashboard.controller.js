import { asyncHandler } from '../middlewares/async-handler.js'
import { dashboardService } from '../services/dashboard.service.js'

export const dashboardController = {
  summary: asyncHandler(async (req, res) => {
    const summary = await dashboardService.getSummary(req.user.companyId)
    res.json({ success: true, data: summary })
  }),
}
