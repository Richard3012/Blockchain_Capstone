import crypto from 'crypto'

import { Account } from '../models/account.model.js'
import { JournalEntry } from '../models/journal-entry.model.js'
import { logger } from '../utils/logger.js'

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '1200', name: 'Inventory', type: 'asset' },
  { code: '1500', name: 'Fixed Assets', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '2100', name: 'GST Payable', type: 'liability' },
  { code: '2200', name: 'TDS Payable', type: 'liability' },
  { code: '3000', name: 'Owner Equity', type: 'equity' },
  { code: '3100', name: 'Retained Earnings', type: 'equity' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue' },
  { code: '4100', name: 'Service Revenue', type: 'revenue' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
  { code: '5100', name: 'Salaries Expense', type: 'expense' },
  { code: '5200', name: 'Rent Expense', type: 'expense' },
  { code: '5300', name: 'Utilities Expense', type: 'expense' },
]

export const accountingService = {
  async initializeAccounts(companyId) {
    const existing = await Account.countDocuments({ companyId })
    if (existing > 0) return { message: 'Accounts already initialized', count: existing }

    const accounts = await Account.insertMany(
      DEFAULT_ACCOUNTS.map((account) => ({ ...account, companyId })),
    )

    logger.info('accounting.accounts_initialized', { companyId: companyId.toString(), count: accounts.length })
    return { message: 'Chart of accounts initialized', count: accounts.length }
  },

  async getAccounts(companyId) {
    return Account.find({ companyId, isActive: true }).sort({ code: 1 })
  },

  async createAccount(companyId, payload) {
    return Account.create({ ...payload, companyId })
  },

  async createJournalEntry(companyId, payload, userId) {
    const entry = await JournalEntry.create({
      companyId,
      entryNumber: `JE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      date: payload.date || new Date(),
      description: payload.description,
      lines: payload.lines,
      reference: payload.reference,
      status: 'posted',
      createdBy: userId,
    })

    for (const line of entry.lines) {
      const delta = (line.debit || 0) - (line.credit || 0)
      await Account.findByIdAndUpdate(line.account, { $inc: { balance: delta } })
    }

    logger.info('accounting.journal_entry_created', { entryNumber: entry.entryNumber, companyId: companyId.toString() })
    return entry
  },

  async getJournalEntries(companyId) {
    return JournalEntry.find({ companyId }).populate('lines.account').sort({ date: -1 })
  },

  async getJournalEntry(companyId, entryId) {
    const entry = await JournalEntry.findOne({ _id: entryId, companyId }).populate('lines.account')
    if (!entry) {
      const error = new Error('Journal entry not found')
      error.statusCode = 404
      throw error
    }
    return entry
  },

  async getTrialBalance(companyId) {
    const accounts = await Account.find({ companyId, isActive: true }).sort({ code: 1 }).lean()

    let totalDebit = 0
    let totalCredit = 0

    const rows = accounts.map((account) => {
      const debit = account.balance > 0 ? account.balance : 0
      const credit = account.balance < 0 ? Math.abs(account.balance) : 0
      totalDebit += debit
      totalCredit += credit
      return { code: account.code, name: account.name, type: account.type, debit, credit }
    })

    return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 }
  },

  async getProfitAndLoss(companyId) {
    const accounts = await Account.find({ companyId, type: { $in: ['revenue', 'expense'] }, isActive: true }).lean()

    const revenue = accounts.filter((a) => a.type === 'revenue')
    const expenses = accounts.filter((a) => a.type === 'expense')
    const totalRevenue = revenue.reduce((sum, a) => sum + Math.abs(a.balance), 0)
    const totalExpenses = expenses.reduce((sum, a) => sum + Math.abs(a.balance), 0)

    return {
      revenue: revenue.map((a) => ({ code: a.code, name: a.name, amount: Math.abs(a.balance) })),
      expenses: expenses.map((a) => ({ code: a.code, name: a.name, amount: Math.abs(a.balance) })),
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    }
  },

  async getBalanceSheet(companyId) {
    const accounts = await Account.find({ companyId, type: { $in: ['asset', 'liability', 'equity'] }, isActive: true }).lean()

    const assets = accounts.filter((a) => a.type === 'asset')
    const liabilities = accounts.filter((a) => a.type === 'liability')
    const equity = accounts.filter((a) => a.type === 'equity')

    const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0)
    const totalLiabilities = liabilities.reduce((sum, a) => sum + Math.abs(a.balance), 0)
    const totalEquity = equity.reduce((sum, a) => sum + Math.abs(a.balance), 0)

    return {
      assets: assets.map((a) => ({ code: a.code, name: a.name, amount: a.balance })),
      liabilities: liabilities.map((a) => ({ code: a.code, name: a.name, amount: Math.abs(a.balance) })),
      equity: equity.map((a) => ({ code: a.code, name: a.name, amount: Math.abs(a.balance) })),
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    }
  },
}
