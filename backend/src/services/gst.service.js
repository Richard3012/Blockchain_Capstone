import { Invoice } from '../models/invoice.model.js'
import { GSTReturn } from '../models/gst-return.model.js'
import { logger } from '../utils/logger.js'

const GST_STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '27': 'Maharashtra', '29': 'Karnataka', '32': 'Kerala', '33': 'Tamil Nadu',
  '36': 'Telangana', '37': 'Andhra Pradesh',
}

const HSN_RATES = {
  '0401': 5, '1006': 5, '1905': 18, '2201': 18, '2202': 28,
  '3004': 12, '3926': 18, '4202': 18, '6109': 5, '6205': 12,
  '7113': 3, '8471': 18, '8517': 18, '8528': 28, '9403': 18,
}

export const gstService = {
  getStateCodes() {
    return GST_STATE_CODES
  },

  getHSNRate(hsnCode) {
    const prefix = hsnCode?.substring(0, 4)
    return HSN_RATES[prefix] || 18
  },

  searchHSN(query) {
    if (!query || query.length < 2) return []
    const lowerQuery = query.toLowerCase()
    return Object.entries(HSN_RATES)
      .filter(([code]) => code.includes(lowerQuery))
      .map(([code, rate]) => ({ code, rate }))
  },

  async generateGSTR1(companyId, period) {
    const year = parseInt(period.substring(0, 4), 10)
    const month = parseInt(period.substring(4, 6), 10)
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    const invoices = await Invoice.find({
      companyId,
      status: { $in: ['issued', 'paid'] },
      issueDate: { $gte: startDate, $lte: endDate },
    }).populate('customer').lean()

    const totalTaxableValue = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0)
    const totalTax = invoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0)

    return {
      period,
      invoiceCount: invoices.length,
      totalTaxableValue,
      totalCGST: totalTax / 2,
      totalSGST: totalTax / 2,
      totalIGST: 0,
      invoices: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer?.name || 'Unknown',
        taxableValue: inv.subtotal,
        taxAmount: inv.taxAmount,
        totalAmount: inv.totalAmount,
        date: inv.issueDate,
      })),
    }
  },

  async getSummary(companyId, period) {
    const year = parseInt(period.substring(0, 4), 10)
    const month = parseInt(period.substring(4, 6), 10)
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    const invoices = await Invoice.find({
      companyId,
      issueDate: { $gte: startDate, $lte: endDate },
    }).lean()

    const totalTaxableValue = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0)
    const totalTax = invoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0)

    return {
      period,
      invoiceCount: invoices.length,
      totalTaxableValue,
      totalCGST: totalTax / 2,
      totalSGST: totalTax / 2,
      totalIGST: 0,
      totalCess: 0,
      totalTax,
    }
  },

  async fileReturn(companyId, returnType, period, userId) {
    const summary = await this.getSummary(companyId, period)

    const gstReturn = await GSTReturn.findOneAndUpdate(
      { companyId, returnType, period },
      {
        companyId,
        returnType,
        period,
        filingDate: new Date(),
        status: 'filed',
        totalTaxableValue: summary.totalTaxableValue,
        totalCGST: summary.totalCGST,
        totalSGST: summary.totalSGST,
        totalIGST: summary.totalIGST,
        totalCess: summary.totalCess,
        invoiceCount: summary.invoiceCount,
        data: summary,
        createdBy: userId,
      },
      { new: true, upsert: true },
    )

    logger.info('gst.return_filed', { companyId: companyId.toString(), returnType, period })
    return gstReturn
  },

  async getReturns(companyId, financialYear) {
    const filter = { companyId }
    if (financialYear) {
      filter.period = { $regex: `^${financialYear}` }
    }
    return GSTReturn.find(filter).sort({ period: -1 })
  },
}
