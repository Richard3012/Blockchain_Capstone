import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { accountingService } from '../services/accounting.service.js'

const journalEntrySchema = z.object({
  date: z.string().optional(),
  description: z.string().min(2),
  reference: z.string().optional(),
  lines: z.array(z.object({
    account: z.string(),
    debit: z.number().nonnegative().optional(),
    credit: z.number().nonnegative().optional(),
    description: z.string().optional(),
  })).min(2),
})

const accountSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentAccount: z.string().optional(),
})

export const accountingController = {
  initializeAccounts: asyncHandler(async (req, res) => {
    const data = await accountingService.initializeAccounts(req.user.companyId)
    res.json({ success: true, data })
  }),

  getAccounts: asyncHandler(async (req, res) => {
    const data = await accountingService.getAccounts(req.user.companyId)
    res.json({ success: true, data })
  }),

  createAccount: asyncHandler(async (req, res) => {
    const payload = accountSchema.parse(req.body)
    const data = await accountingService.createAccount(req.user.companyId, payload)
    res.status(201).json({ success: true, data })
  }),

  createJournalEntry: asyncHandler(async (req, res) => {
    const payload = journalEntrySchema.parse(req.body)
    const data = await accountingService.createJournalEntry(req.user.companyId, payload, req.user._id)
    res.status(201).json({ success: true, data })
  }),

  getJournalEntries: asyncHandler(async (req, res) => {
    const data = await accountingService.getJournalEntries(req.user.companyId)
    res.json({ success: true, data })
  }),

  getJournalEntry: asyncHandler(async (req, res) => {
    const data = await accountingService.getJournalEntry(req.user.companyId, req.params.id)
    res.json({ success: true, data })
  }),

  getTrialBalance: asyncHandler(async (req, res) => {
    const data = await accountingService.getTrialBalance(req.user.companyId)
    res.json({ success: true, data })
  }),

  getProfitAndLoss: asyncHandler(async (req, res) => {
    const data = await accountingService.getProfitAndLoss(req.user.companyId)
    res.json({ success: true, data })
  }),

  getBalanceSheet: asyncHandler(async (req, res) => {
    const data = await accountingService.getBalanceSheet(req.user.companyId)
    res.json({ success: true, data })
  }),
}
