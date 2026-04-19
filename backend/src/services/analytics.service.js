import mongoose from 'mongoose'

import { Invoice } from '../models/invoice.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { Payment } from '../models/payment.model.js'
import { Product } from '../models/product.model.js'
import { logger } from '../utils/logger.js'

/**
 * Analytics Service
 *
 * Pure read aggregations over the tenant's data, returned in a
 * chart-ready shape:
 *   { chartType, title, labels, data, meta }
 *
 * Every method takes a `companyId` and a `period` ('week' | 'month' |
 * 'quarter' | 'year'). Results are memoizable on the client (Socket.IO
 * `analytics:invalidate` tells clients when to refetch).
 */

const oid = (id) => new mongoose.Types.ObjectId(id)

function rangeFor(period = 'month') {
  const now = new Date()
  const start = new Date(now)
  switch (period) {
    case 'week':
      start.setDate(now.getDate() - 7)
      break
    case 'quarter':
      start.setMonth(now.getMonth() - 3)
      break
    case 'year':
      start.setFullYear(now.getFullYear() - 1)
      break
    case 'month':
    default:
      start.setMonth(now.getMonth() - 1)
      break
  }
  start.setHours(0, 0, 0, 0)
  return { start, end: now }
}

function bucketFormat(period) {
  // MongoDB $dateToString format
  if (period === 'week') return '%Y-%m-%d'
  if (period === 'year') return '%Y-%m'
  return '%Y-%m-%d'
}

export const analyticsService = {
  /**
   * Daily/monthly revenue trend (paid + issued invoice totals).
   * Returns line-chart-ready buckets.
   */
  async revenueTrend(companyId, period = 'month') {
    const { start, end } = rangeFor(period)
    const fmt = bucketFormat(period)

    const rows = await Invoice.aggregate([
      {
        $match: {
          companyId: oid(companyId),
          issueDate: { $gte: start, $lte: end },
          status: { $in: ['issued', 'paid'] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: '$issueDate' } },
          revenue: { $sum: '$totalAmount' },
          paid: { $sum: '$amountPaid' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    return {
      chartType: 'line',
      title: `Revenue Trend (${period})`,
      labels: rows.map((r) => r._id),
      data: rows.map((r) => ({ label: r._id, value: r.revenue, paid: r.paid, count: r.count })),
      meta: { period, start, end, totalRevenue: rows.reduce((s, r) => s + r.revenue, 0) },
    }
  },

  /**
   * Expense breakdown by vendor (donut). Uses scanned/payable invoices —
   * we treat invoices with `vendorName` as expenses (purchase-side).
   */
  async expenseBreakdown(companyId, period = 'month') {
    const { start, end } = rangeFor(period)

    const rows = await Invoice.aggregate([
      {
        $match: {
          companyId: oid(companyId),
          issueDate: { $gte: start, $lte: end },
          vendorName: { $exists: true, $ne: '' },
        },
      },
      {
        $group: {
          _id: '$vendorName',
          amount: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 10 },
    ])

    return {
      chartType: 'donut',
      title: `Expense Breakdown by Vendor (${period})`,
      labels: rows.map((r) => r._id),
      data: rows.map((r) => ({ label: r._id, value: r.amount, count: r.count })),
      meta: {
        period,
        start,
        end,
        totalExpense: rows.reduce((s, r) => s + r.amount, 0),
        vendorCount: rows.length,
      },
    }
  },

  /**
   * GST summary — output (sales) vs input (purchase) tax for the period.
   */
  async gstSummary(companyId, period = 'month') {
    const { start, end } = rangeFor(period)

    const [output, input] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            companyId: oid(companyId),
            issueDate: { $gte: start, $lte: end },
            status: { $in: ['issued', 'paid'] },
            $or: [{ vendorName: { $exists: false } }, { vendorName: '' }],
          },
        },
        { $group: { _id: null, tax: { $sum: '$taxAmount' }, count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        {
          $match: {
            companyId: oid(companyId),
            issueDate: { $gte: start, $lte: end },
            vendorName: { $exists: true, $ne: '' },
          },
        },
        { $group: { _id: null, tax: { $sum: '$taxAmount' }, count: { $sum: 1 } } },
      ]),
    ])

    const outTax = output[0]?.tax || 0
    const inTax = input[0]?.tax || 0
    const netGst = outTax - inTax

    return {
      chartType: 'bar',
      title: `GST Summary (${period})`,
      labels: ['Output GST', 'Input GST', 'Net Payable'],
      data: [
        { label: 'Output GST', value: outTax },
        { label: 'Input GST', value: inTax },
        { label: 'Net Payable', value: Math.max(netGst, 0) },
      ],
      meta: {
        period,
        start,
        end,
        outputTax: outTax,
        inputTax: inTax,
        netPayable: netGst,
        outputCount: output[0]?.count || 0,
        inputCount: input[0]?.count || 0,
      },
    }
  },

  /**
   * Top vendors by spend (horizontal bar).
   */
  async vendorSpending(companyId, period = 'month', limit = 10) {
    const { start, end } = rangeFor(period)

    const rows = await Invoice.aggregate([
      {
        $match: {
          companyId: oid(companyId),
          issueDate: { $gte: start, $lte: end },
          vendorName: { $exists: true, $ne: '' },
        },
      },
      {
        $group: {
          _id: '$vendorName',
          totalSpend: { $sum: '$totalAmount' },
          invoiceCount: { $sum: 1 },
          avgInvoice: { $avg: '$totalAmount' },
          lastInvoice: { $max: '$issueDate' },
        },
      },
      { $sort: { totalSpend: -1 } },
      { $limit: Math.min(limit, 50) },
    ])

    return {
      chartType: 'bar',
      title: `Top Vendors by Spending (${period})`,
      labels: rows.map((r) => r._id),
      data: rows.map((r) => ({
        label: r._id,
        value: r.totalSpend,
        count: r.invoiceCount,
        avg: Math.round(r.avgInvoice || 0),
        lastInvoice: r.lastInvoice,
      })),
      meta: { period, start, end, vendorCount: rows.length },
    }
  },

  /**
   * Lightweight summary for dashboard tiles. Doesn't follow the chart
   * shape — it's just totals.
   */
  async summary(companyId) {
    try {
      const cId = oid(companyId)
      const [invAgg, ordAgg, payAgg, prodCount] = await Promise.all([
        Invoice.aggregate([
          { $match: { companyId: cId } },
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' },
              outstanding: { $sum: '$balanceDue' },
              count: { $sum: 1 },
              overdue: {
                $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] },
              },
            },
          },
        ]),
        SalesOrder.countDocuments({ companyId: cId }),
        Payment.aggregate([
          { $match: { companyId: cId } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        Product.countDocuments({ companyId: cId }),
      ])

      return {
        invoices: {
          total: invAgg[0]?.total || 0,
          outstanding: invAgg[0]?.outstanding || 0,
          count: invAgg[0]?.count || 0,
          overdue: invAgg[0]?.overdue || 0,
        },
        orders: { count: ordAgg },
        payments: { total: payAgg[0]?.total || 0, count: payAgg[0]?.count || 0 },
        products: { count: prodCount },
      }
    } catch (err) {
      logger.warn('analytics.summary_failed', { error: err.message })
      return { invoices: {}, orders: {}, payments: {}, products: {} }
    }
  },
}
