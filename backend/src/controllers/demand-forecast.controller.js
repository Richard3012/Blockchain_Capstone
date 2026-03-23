import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { demandForecastService } from '../services/demand-forecast.service.js'

export const demandForecastController = {
  forecast: asyncHandler(async (req, res) => {
    const schema = z.object({
      productId: z.string().optional(),
      months: z.coerce.number().int().min(1).max(12).optional(),
    })
    const { productId, months } = schema.parse(req.query)
    const data = await demandForecastService.forecast(req.user.companyId, productId, months)
    res.json({ success: true, data })
  }),

  history: asyncHandler(async (req, res) => {
    const schema = z.object({
      productId: z.string().optional(),
      months: z.coerce.number().int().min(1).max(24).optional(),
    })
    const { productId, months } = schema.parse(req.query)
    const data = await demandForecastService.getHistoricalDemand(req.user.companyId, productId, months)
    res.json({ success: true, data })
  }),

  topProducts: asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 10
    const data = await demandForecastService.getTopProducts(req.user.companyId, limit)
    res.json({ success: true, data })
  }),
}
