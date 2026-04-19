import { asyncHandler } from '../middlewares/async-handler.js'
import { analyticsService } from '../services/analytics.service.js'

const allowedPeriod = (p) => (['week', 'month', 'quarter', 'year'].includes(p) ? p : 'month')

export const analyticsController = {
  revenueTrend: asyncHandler(async (req, res) => {
    const data = await analyticsService.revenueTrend(req.user.companyId, allowedPeriod(req.query.period))
    res.json({ success: true, data })
  }),

  expenseBreakdown: asyncHandler(async (req, res) => {
    const data = await analyticsService.expenseBreakdown(req.user.companyId, allowedPeriod(req.query.period))
    res.json({ success: true, data })
  }),

  gstSummary: asyncHandler(async (req, res) => {
    const data = await analyticsService.gstSummary(req.user.companyId, allowedPeriod(req.query.period))
    res.json({ success: true, data })
  }),

  vendorSpending: asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50)
    const data = await analyticsService.vendorSpending(req.user.companyId, allowedPeriod(req.query.period), limit)
    res.json({ success: true, data })
  }),

  summary: asyncHandler(async (req, res) => {
    const data = await analyticsService.summary(req.user.companyId)
    res.json({ success: true, data })
  }),
}
