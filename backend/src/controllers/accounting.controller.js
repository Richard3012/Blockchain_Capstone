import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { accountingService } from '../services/accounting.service.js'

const journalEntrySchema = z.object({
  date: z.string().optional(),
  description: z.string().min(2),
  reference: z.string().optional(),
  source: z.enum(['manual', 'invoice', 'payment', 'payroll', 'depreciation', 'closing', 'reversal']).optional(),
  lines: z.array(z.object({
    account: z.string(),
    debit: z.number().nonnegative().optional(),
    credit: z.number().nonnegative().optional(),
    description: z.string().optional(),
    currency: z.string().optional(),
    fxRate: z.number().positive().optional(),
    dimensions: z.object({
      costCenter: z.string().optional(),
      project: z.string().optional(),
      department: z.string().optional(),
    }).optional(),
  })).min(2),
})

const accountSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  subType: z.enum([
    'group', 'cash', 'bank', 'receivable', 'payable', 'inventory', 'tax',
    'fixed', 'capital', 'retained', 'operating', 'cogs', 'depreciation', 'other',
  ]).optional(),
  parentAccount: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  isReconciliation: z.boolean().optional(),
})

const dimensionSchema = z.object({
  kind: z.enum(['cost_center', 'project', 'department', 'location', 'class']),
  code: z.string().min(1),
  name: z.string().min(1),
  parent: z.string().optional(),
})

export const accountingController = {
  initializeAccounts: asyncHandler(async (req, res) => {
    const data = await accountingService.initializeAccounts(req.user.companyId)
    res.json({ success: true, data })
  }),

  listTemplates: asyncHandler(async (_req, res) => {
    res.json({ success: true, data: accountingService.listTemplates() })
  }),

  initializeFromTemplate: asyncHandler(async (req, res) => {
    const data = await accountingService.initializeFromTemplate(req.user.companyId, req.params.templateCode)
    res.json({ success: true, data })
  }),

  getAccounts: asyncHandler(async (req, res) => {
    const data = await accountingService.getAccounts(req.user.companyId)
    res.json({ success: true, data })
  }),

  getAccountsTree: asyncHandler(async (req, res) => {
    const data = await accountingService.getAccounts(req.user.companyId, { tree: true })
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

  postJournalEntry: asyncHandler(async (req, res) => {
    const data = await accountingService.postJournalEntry(req.user.companyId, req.params.id, req.user._id)
    res.json({ success: true, data })
  }),

  reverseJournalEntry: asyncHandler(async (req, res) => {
    const data = await accountingService.reverseJournalEntry(req.user.companyId, req.params.id, req.user._id)
    res.json({ success: true, data })
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

  listDimensions: asyncHandler(async (req, res) => {
    const data = await accountingService.listDimensions(req.user.companyId, req.query.kind)
    res.json({ success: true, data })
  }),

  createDimension: asyncHandler(async (req, res) => {
    const payload = dimensionSchema.parse(req.body)
    const data = await accountingService.createDimension(req.user.companyId, payload)
    res.status(201).json({ success: true, data })
  }),

  listPeriods: asyncHandler(async (req, res) => {
    const data = await accountingService.listPeriods(req.user.companyId)
    res.json({ success: true, data })
  }),

  closePeriod: asyncHandler(async (req, res) => {
    const data = await accountingService.closePeriod(req.user.companyId, req.params.id, req.user._id)
    res.json({ success: true, data })
  }),
}
