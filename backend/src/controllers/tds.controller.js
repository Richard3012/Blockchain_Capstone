import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { tdsService } from '../services/tds.service.js'

const deductionSchema = z.object({
  section: z.string().min(2),
  deductee: z.string().min(2),
  deducteePAN: z.string().optional(),
  paymentAmount: z.number().positive(),
  tdsRate: z.number().nonnegative(),
  tdsAmount: z.number().nonnegative(),
  paymentDate: z.string(),
})

export const tdsController = {
  getSections: asyncHandler(async (_req, res) => {
    res.json({ success: true, data: tdsService.getSections() })
  }),

  calculate: asyncHandler(async (req, res) => {
    const schema = z.object({ section: z.string(), amount: z.number().positive() })
    const { section, amount } = schema.parse(req.body)
    const data = tdsService.calculateTDS(section, amount)
    res.json({ success: true, data })
  }),

  recordDeduction: asyncHandler(async (req, res) => {
    const payload = deductionSchema.parse(req.body)
    const data = await tdsService.recordDeduction(req.user.companyId, payload, req.user._id)
    res.status(201).json({ success: true, data })
  }),

  getEntries: asyncHandler(async (req, res) => {
    const data = await tdsService.getEntries(req.user.companyId, req.query)
    res.json({ success: true, data })
  }),

  getQuarterlySummary: asyncHandler(async (req, res) => {
    const { financialYear, quarter } = req.params
    if (!financialYear) {
      const error = new Error('financialYear is required')
      error.statusCode = 400
      throw error
    }
    const data = await tdsService.getQuarterlySummary(req.user.companyId, financialYear, quarter)
    res.json({ success: true, data })
  }),

  markDeposited: asyncHandler(async (req, res) => {
    const schema = z.object({ challanNumber: z.string().min(1) })
    const { challanNumber } = schema.parse(req.body)
    const data = await tdsService.markDeposited(req.user.companyId, req.params.id, challanNumber)
    res.json({ success: true, data })
  }),
}
