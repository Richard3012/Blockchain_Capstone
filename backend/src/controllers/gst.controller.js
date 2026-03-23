import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { gstService } from '../services/gst.service.js'

const periodSchema = z.string().regex(/^\d{6}$/, 'Period must be YYYYMM format')

export const gstController = {
  summary: asyncHandler(async (req, res) => {
    const period = periodSchema.parse(req.query.period)
    const data = await gstService.getSummary(req.user.companyId, period)
    res.json({ success: true, data })
  }),

  generateGSTR1: asyncHandler(async (req, res) => {
    const period = periodSchema.parse(req.query.period)
    const data = await gstService.generateGSTR1(req.user.companyId, period)
    res.json({ success: true, data })
  }),

  fileReturn: asyncHandler(async (req, res) => {
    const schema = z.object({
      returnType: z.enum(['GSTR1', 'GSTR3B', 'GSTR9']),
      period: periodSchema,
    })
    const payload = schema.parse(req.body)
    const data = await gstService.fileReturn(req.user.companyId, payload.returnType, payload.period, req.user._id)
    res.status(201).json({ success: true, data })
  }),

  getReturns: asyncHandler(async (req, res) => {
    const data = await gstService.getReturns(req.user.companyId, req.query.financialYear)
    res.json({ success: true, data })
  }),

  stateCodes: asyncHandler(async (_req, res) => {
    res.json({ success: true, data: gstService.getStateCodes() })
  }),

  hsnSearch: asyncHandler(async (req, res) => {
    const data = gstService.searchHSN(req.query.q)
    res.json({ success: true, data })
  }),
}
