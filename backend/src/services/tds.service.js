import { TDSEntry } from '../models/tds-entry.model.js'
import { logger } from '../utils/logger.js'

const TDS_SECTIONS = [
  { section: '194A', description: 'Interest other than interest on securities', rate: 10 },
  { section: '194C', description: 'Payment to contractor', rate: 2 },
  { section: '194H', description: 'Commission or brokerage', rate: 5 },
  { section: '194I', description: 'Rent', rate: 10 },
  { section: '194J', description: 'Professional or technical services', rate: 10 },
  { section: '194O', description: 'E-commerce participants', rate: 1 },
  { section: '194Q', description: 'Purchase of goods', rate: 0.1 },
]

// Indian TDS quarter (Form 26Q): Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
const getQuarter = (date) => {
  const m = date.getMonth() + 1
  if (m >= 4 && m <= 6) return 1
  if (m >= 7 && m <= 9) return 2
  if (m >= 10 && m <= 12) return 3
  return 4
}

const getFinancialYear = (date) => {
  const year = date.getFullYear()
  const month = date.getMonth()
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export const tdsService = {
  getSections() {
    return TDS_SECTIONS
  },

  calculateTDS(section, amount) {
    const sectionInfo = TDS_SECTIONS.find((s) => s.section === section)
    if (!sectionInfo) {
      const error = new Error(`Unknown TDS section: ${section}`)
      error.statusCode = 400
      throw error
    }
    return {
      section: sectionInfo.section,
      description: sectionInfo.description,
      rate: sectionInfo.rate,
      amount,
      tdsAmount: (amount * sectionInfo.rate) / 100,
    }
  },

  async recordDeduction(companyId, payload, userId) {
    const paymentDate = new Date(payload.paymentDate)
    const entry = await TDSEntry.create({
      companyId,
      section: payload.section,
      deductee: payload.deductee,
      deducteePAN: payload.deducteePAN,
      paymentAmount: payload.paymentAmount,
      tdsRate: payload.tdsRate,
      tdsAmount: payload.tdsAmount,
      paymentDate,
      financialYear: getFinancialYear(paymentDate),
      quarter: getQuarter(paymentDate),
      createdBy: userId,
    })

    logger.info('tds.deduction_recorded', { entryId: entry._id.toString(), section: payload.section })
    return entry
  },

  async getEntries(companyId, filters = {}) {
    const query = { companyId }
    if (filters.financialYear) query.financialYear = filters.financialYear
    if (filters.quarter) query.quarter = filters.quarter
    if (filters.section) query.section = filters.section
    return TDSEntry.find(query).sort({ paymentDate: -1 })
  },

  async getQuarterlySummary(companyId, financialYear, quarter) {
    const entries = await TDSEntry.find({
      companyId,
      financialYear,
      quarter: parseInt(quarter, 10),
    }).lean()

    const totalPayment = entries.reduce((sum, e) => sum + e.paymentAmount, 0)
    const totalTDS = entries.reduce((sum, e) => sum + e.tdsAmount, 0)
    const deposited = entries.filter((e) => e.status === 'deposited' || e.status === 'filed')
    const pending = entries.filter((e) => e.status === 'pending')

    return {
      financialYear,
      quarter: parseInt(quarter, 10),
      entryCount: entries.length,
      totalPayment,
      totalTDS,
      depositedAmount: deposited.reduce((sum, e) => sum + e.tdsAmount, 0),
      pendingAmount: pending.reduce((sum, e) => sum + e.tdsAmount, 0),
      entries,
    }
  },

  async markDeposited(companyId, entryId, challanNumber) {
    const entry = await TDSEntry.findOneAndUpdate(
      { _id: entryId, companyId, status: 'pending' },
      { status: 'deposited', depositDate: new Date(), challanNumber },
      { new: true },
    )
    if (!entry) {
      const error = new Error('TDS entry not found or already deposited')
      error.statusCode = 404
      throw error
    }
    logger.info('tds.marked_deposited', { entryId: entry._id.toString(), challanNumber })
    return entry
  },
}
