import crypto from 'crypto'

import { Account } from '../models/account.model.js'
import { JournalEntry } from '../models/journal-entry.model.js'
import { Dimension } from '../models/dimension.model.js'
import { FiscalPeriod } from '../models/fiscal-period.model.js'
import { COA_TEMPLATES, NORMAL_SIDE, DEFAULT_TEMPLATE } from '../constants/coaTemplates.js'
import { logger } from '../utils/logger.js'
import { blockchainService } from './blockchain.service.js'

const httpError = (status, message) => {
  const err = new Error(message)
  err.statusCode = status
  return err
}

export const accountingService = {
  listTemplates() {
    return Object.entries(COA_TEMPLATES).map(([code, t]) => ({
      code,
      name: t.name,
      currency: t.currency,
      fyStartMonth: t.fyStartMonth,
      accountCount: t.accounts.length,
    }))
  },

  async initializeFromTemplate(companyId, templateCode = DEFAULT_TEMPLATE) {
    const template = COA_TEMPLATES[templateCode]
    if (!template) throw httpError(400, `Unknown COA template: ${templateCode}`)

    const existing = await Account.countDocuments({ companyId })
    if (existing > 0) {
      return { message: 'Accounts already initialized', count: existing, templateCode }
    }

    const codeToDoc = {}
    for (const acc of template.accounts) {
      const parent = acc.parent ? codeToDoc[acc.parent] : null
      const doc = await Account.create({
        companyId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subType: acc.subType || 'other',
        normalSide: NORMAL_SIDE[acc.type],
        currency: template.currency,
        isReconciliation: !!acc.isReconciliation,
        lockedSystem: !!acc.lockedSystem,
        parentAccount: parent?._id || null,
        level: parent ? parent.level + 1 : 0,
        path: parent ? `${parent.path}/${acc.code}` : acc.code,
      })
      codeToDoc[acc.code] = doc
    }

    logger.info('accounting.template_initialized', {
      companyId: companyId.toString(),
      templateCode,
      count: Object.keys(codeToDoc).length,
    })
    return {
      message: `Chart of accounts initialized from ${template.name}`,
      count: Object.keys(codeToDoc).length,
      templateCode,
    }
  },

  async initializeAccounts(companyId, templateCode = DEFAULT_TEMPLATE) {
    return this.initializeFromTemplate(companyId, templateCode)
  },

  async getAccounts(companyId, { tree = false } = {}) {
    const flat = await Account.find({ companyId, isActive: true }).sort({ code: 1 }).lean()
    if (!tree) return flat

    const byId = Object.fromEntries(flat.map((a) => [a._id.toString(), { ...a, children: [] }]))
    const roots = []
    for (const a of Object.values(byId)) {
      const parentId = a.parentAccount?.toString()
      if (parentId && byId[parentId]) {
        byId[parentId].children.push(a)
      } else {
        roots.push(a)
      }
    }
    return roots
  },

  async createAccount(companyId, payload) {
    const parent = payload.parentAccount
      ? await Account.findOne({ _id: payload.parentAccount, companyId })
      : null
    return Account.create({
      ...payload,
      companyId,
      normalSide: NORMAL_SIDE[payload.type],
      parentAccount: parent?._id || null,
      level: parent ? parent.level + 1 : 0,
      path: parent ? `${parent.path}/${payload.code}` : payload.code,
    })
  },

  async findAccountByCode(companyId, code) {
    return Account.findOne({ companyId, code, isActive: true })
  },

  async findAccountBySubType(companyId, subType) {
    return Account.findOne({ companyId, subType, isActive: true }).sort({ code: 1 })
  },

  async ensurePeriod(companyId, date) {
    const d = new Date(date)
    const month = d.getMonth() + 1 // 1-12
    const calYear = d.getFullYear()
    // Indian fiscal year runs April → March. FY label uses the start year:
    //   Apr 2026 → Mar 2027  ⇒  fiscalYear = 2026 (FY 2026-27)
    //   Jan 2027 → Mar 2027  ⇒  fiscalYear = 2026 (still FY 2026-27)
    const fiscalYear = month >= 4 ? calYear : calYear - 1
    let period = await FiscalPeriod.findOne({ companyId, fiscalYear, month })
    if (!period) {
      period = await FiscalPeriod.create({
        companyId,
        fiscalYear,
        month,
        startDate: new Date(Date.UTC(calYear, month - 1, 1)),
        endDate: new Date(Date.UTC(calYear, month, 0, 23, 59, 59)),
      })
    }
    return period
  },

  async listPeriods(companyId) {
    return FiscalPeriod.find({ companyId }).sort({ fiscalYear: -1, month: -1 })
  },

  async closePeriod(companyId, periodId, userId) {
    const period = await FiscalPeriod.findOne({ _id: periodId, companyId })
    if (!period) throw httpError(404, 'Period not found')
    if (period.status !== 'open') throw httpError(400, `Period is already ${period.status}`)

    const incomeAccts = await Account.find({
      companyId,
      type: { $in: ['revenue', 'expense'] },
      isActive: true,
      subType: { $ne: 'group' },
    })
    const retained = await Account.findOne({
      companyId,
      subType: 'retained',
      lockedSystem: true,
      isActive: true,
    })
    if (!retained) throw httpError(400, 'Retained Earnings account is missing')

    const lines = []
    let net = 0
    for (const a of incomeAccts) {
      if (Math.abs(a.balance) < 0.01) continue
      if (a.type === 'revenue') {
        lines.push({ account: a._id, debit: Math.abs(a.balance), credit: 0, description: `Close ${a.name}` })
        net += a.balance
      } else {
        lines.push({ account: a._id, debit: 0, credit: Math.abs(a.balance), description: `Close ${a.name}` })
        net -= a.balance
      }
    }

    if (lines.length > 0) {
      lines.push(net >= 0
        ? { account: retained._id, debit: 0, credit: Math.abs(net), description: 'Net income to retained earnings' }
        : { account: retained._id, debit: Math.abs(net), credit: 0, description: 'Net loss to retained earnings' })

      const fyLabel = `FY${period.fiscalYear}-${String((period.fiscalYear + 1) % 100).padStart(2, '0')}`
      const closingEntry = await this.createJournalEntry(companyId, {
        date: period.endDate,
        description: `Closing entry for ${fyLabel} period ${String(period.month).padStart(2, '0')}`,
        reference: `CLOSE-${period.fiscalYear}-${period.month}`,
        source: 'closing',
        lines,
      }, userId, { allowClosedPeriod: true })

      period.closingEntry = closingEntry._id
      period.closingTxHash = closingEntry.blockchainTxHash
    }

    period.status = 'closed'
    period.closedAt = new Date()
    period.closedBy = userId
    await period.save()
    logger.info('accounting.period_closed', { companyId: companyId.toString(), periodId: period._id.toString() })
    return period
  },

  async createJournalEntry(companyId, payload, userId, { autopost = true, allowClosedPeriod = false } = {}) {
    const date = payload.date ? new Date(payload.date) : new Date()
    const period = await this.ensurePeriod(companyId, date)
    if (!allowClosedPeriod && period.status !== 'open') {
      throw httpError(400, `Cannot post to ${period.status} period ${period.fiscalYear}-${period.month}`)
    }

    const entry = await JournalEntry.create({
      companyId,
      entryNumber: `JE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      date,
      period: period._id,
      description: payload.description,
      reference: payload.reference,
      source: payload.source || 'manual',
      sourceId: payload.sourceId,
      lines: payload.lines,
      status: autopost ? 'posted' : 'draft',
      postedAt: autopost ? new Date() : undefined,
      createdBy: userId,
    })

    if (autopost) await this._applyPosting(entry, userId)

    logger.info('accounting.journal_entry_created', {
      entryNumber: entry.entryNumber,
      companyId: companyId.toString(),
      status: entry.status,
    })
    return entry
  },

  async postJournalEntry(companyId, entryId, userId) {
    const entry = await JournalEntry.findOne({ _id: entryId, companyId })
    if (!entry) throw httpError(404, 'Journal entry not found')
    if (entry.status !== 'draft') throw httpError(400, 'Only draft entries can be posted')

    if (entry.period) {
      const period = await FiscalPeriod.findById(entry.period)
      if (period && period.status !== 'open') {
        throw httpError(400, `Cannot post to ${period.status} period`)
      }
    }

    entry.status = 'posted'
    entry.postedAt = new Date()
    await entry.save()
    await this._applyPosting(entry, userId)
    return entry
  },

  async reverseJournalEntry(companyId, entryId, userId) {
    const original = await JournalEntry.findOne({ _id: entryId, companyId })
    if (!original) throw httpError(404, 'Journal entry not found')
    if (original.status !== 'posted') throw httpError(400, 'Only posted entries can be reversed')

    const reversal = await this.createJournalEntry(companyId, {
      description: `Reversal of ${original.entryNumber}`,
      reference: original.entryNumber,
      source: 'reversal',
      sourceId: original._id,
      lines: original.lines.map((l) => ({
        account: l.account,
        debit: l.credit || 0,
        credit: l.debit || 0,
        description: l.description,
        currency: l.currency,
        fxRate: l.fxRate,
        dimensions: l.dimensions,
      })),
    }, userId, { allowClosedPeriod: true })

    original.status = 'reversed'
    original.reversedBy = reversal._id
    await original.save()
    return reversal
  },

  async _applyPosting(entry, userId) {
    for (const line of entry.lines) {
      const delta = (line.debit || 0) - (line.credit || 0)
      await Account.findByIdAndUpdate(line.account, { $inc: { balance: delta } })
    }

    try {
      const hashHex = crypto.createHash('sha256')
        .update(JSON.stringify({
          n: entry.entryNumber,
          d: entry.date,
          c: entry.companyId.toString(),
          l: entry.lines.map((l) => ({
            a: l.account?.toString?.() || String(l.account),
            d: l.debit || 0,
            c: l.credit || 0,
          })),
        }))
        .digest('hex')
      const recordHash = '0x' + hashHex

      const record = await blockchainService.anchorRecord({
        companyId: entry.companyId,
        entityType: 'journal_entry',
        entityId: entry.entryNumber,
        recordHash,
        ipfsCid: '',
        requestedBy: userId || entry.createdBy,
      })

      if (record?.txHash) {
        entry.blockchainTxHash = record.txHash
        entry.blockchainBlockNumber = record.blockNumber
        await entry.save()
      }
    } catch (err) {
      logger.warn('accounting.anchor_failed', {
        entryNumber: entry.entryNumber,
        error: err.message,
      })
    }
  },

  async getJournalEntries(companyId) {
    return JournalEntry.find({ companyId }).populate('lines.account').sort({ date: -1 })
  },

  async getJournalEntry(companyId, entryId) {
    const entry = await JournalEntry.findOne({ _id: entryId, companyId }).populate('lines.account')
    if (!entry) throw httpError(404, 'Journal entry not found')
    return entry
  },

  async listDimensions(companyId, kind) {
    const filter = { companyId, isActive: true }
    if (kind) filter.kind = kind
    return Dimension.find(filter).sort({ kind: 1, code: 1 })
  },

  async createDimension(companyId, payload) {
    return Dimension.create({ ...payload, companyId })
  },

  async getTrialBalance(companyId) {
    const accounts = await Account.find({ companyId, isActive: true, subType: { $ne: 'group' } })
      .sort({ code: 1 }).lean()

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
    const accounts = await Account.find({
      companyId,
      type: { $in: ['revenue', 'expense'] },
      isActive: true,
      subType: { $ne: 'group' },
    }).lean()

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
    const accounts = await Account.find({
      companyId,
      type: { $in: ['asset', 'liability', 'equity'] },
      isActive: true,
      subType: { $ne: 'group' },
    }).lean()

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
