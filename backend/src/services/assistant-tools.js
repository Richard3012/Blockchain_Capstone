// LLM tool registry for the AI assistant. Each tool is:
//  { name, description, parameters (JSON schema), handler(args, ctx) }
// Handlers run scoped to ctx.companyId — they MUST NOT accept a companyId
// from the LLM. This is a security boundary: the LLM may not specify which
// tenant's data it queries.

import { Invoice } from '../models/invoice.model.js'
import { Product } from '../models/product.model.js'
import { logger } from '../utils/logger.js'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

const periodToRange = (period) => {
  const now = new Date()
  const start = new Date(now)
  switch (String(period || 'month').toLowerCase()) {
    case 'today': start.setHours(0, 0, 0, 0); break
    case 'week': start.setDate(now.getDate() - 7); break
    case 'month': start.setDate(1); start.setHours(0, 0, 0, 0); break
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3
      start.setMonth(q, 1); start.setHours(0, 0, 0, 0); break
    }
    case 'year':
    case 'fy': start.setMonth(0, 1); start.setHours(0, 0, 0, 0); break
    default: start.setDate(1); start.setHours(0, 0, 0, 0)
  }
  return { from: start, to: now }
}

export const ASSISTANT_TOOLS = [
  {
    name: 'getInvoices',
    description: 'List invoices, optionally filtered by status, date range, vendor or customer.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'issued', 'paid', 'overdue', 'cancelled'] },
        fromDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        toDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        vendor: { type: 'string', description: 'Substring of vendor name' },
        limit: { type: 'number', description: 'Max rows (default 20)' },
      },
    },
    async handler(args, ctx) {
      const q = { companyId: ctx.companyId }
      if (args.status) q.status = args.status
      if (args.fromDate || args.toDate) {
        q.issueDate = {}
        if (args.fromDate) q.issueDate.$gte = new Date(args.fromDate)
        if (args.toDate) q.issueDate.$lte = new Date(args.toDate)
      }
      if (args.vendor) q.vendorName = new RegExp(escapeRegex(args.vendor), 'i')
      const limit = Math.min(Number(args.limit) || 20, 100)
      const rows = await Invoice.find(q).sort({ issueDate: -1 }).limit(limit).lean()
      return {
        count: rows.length,
        invoices: rows.map((r) => ({
          number: r.invoiceNumber,
          vendor: r.vendorName,
          status: r.status,
          total: r.totalAmount,
          balanceDue: r.balanceDue,
          issueDate: r.issueDate,
          dueDate: r.dueDate,
        })),
      }
    },
  },

  {
    name: 'getTotalExpenses',
    description: 'Sum of issued/paid invoices in a period, optionally grouped.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month', 'quarter', 'year', 'fy'] },
        groupBy: { type: 'string', enum: ['vendor', 'status'], description: 'Optional grouping' },
      },
    },
    async handler(args, ctx) {
      const { from, to } = periodToRange(args.period)
      const match = { companyId: ctx.companyId, issueDate: { $gte: from, $lte: to } }
      if (!args.groupBy) {
        const [agg] = await Invoice.aggregate([
          { $match: match },
          { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        ])
        return { period: args.period || 'month', total: agg?.total || 0, count: agg?.count || 0 }
      }
      const key = args.groupBy === 'status' ? '$status' : '$vendorName'
      const rows = await Invoice.aggregate([
        { $match: match },
        { $group: { _id: key, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 20 },
      ])
      return { period: args.period || 'month', groupBy: args.groupBy, breakdown: rows.map((r) => ({ key: r._id || '(unknown)', total: r.total, count: r.count })) }
    },
  },

  {
    name: 'getVendorStats',
    description: 'Top vendors by total spend in a period.',
    parameters: {
      type: 'object',
      properties: {
        topN: { type: 'number', description: 'How many vendors (default 10)' },
        period: { type: 'string', enum: ['week', 'month', 'quarter', 'year', 'fy'] },
      },
    },
    async handler(args, ctx) {
      const { from, to } = periodToRange(args.period || 'quarter')
      const limit = Math.min(Number(args.topN) || 10, 50)
      const rows = await Invoice.aggregate([
        { $match: { companyId: ctx.companyId, issueDate: { $gte: from, $lte: to }, vendorName: { $exists: true, $ne: '' } } },
        { $group: { _id: '$vendorName', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: limit },
      ])
      return {
        period: args.period || 'quarter',
        chartType: 'bar',
        data: rows.map((r) => ({ label: r._id, value: Math.round(r.total), count: r.count })),
      }
    },
  },

  {
    name: 'getRevenueTrend',
    description: 'Monthly revenue (sum of paid + issued invoices) for the last N months.',
    parameters: {
      type: 'object',
      properties: { months: { type: 'number', description: 'How many months (default 6, max 24)' } },
    },
    async handler(args, ctx) {
      const months = Math.min(Number(args.months) || 6, 24)
      const since = new Date()
      since.setMonth(since.getMonth() - months + 1)
      since.setDate(1); since.setHours(0, 0, 0, 0)
      const rows = await Invoice.aggregate([
        { $match: { companyId: ctx.companyId, issueDate: { $gte: since } } },
        { $group: {
          _id: { y: { $year: '$issueDate' }, m: { $month: '$issueDate' } },
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ])
      return {
        chartType: 'line',
        data: rows.map((r) => ({
          label: `${r._id.y}-${String(r._id.m).padStart(2, '0')}`,
          value: Math.round(r.total),
          count: r.count,
        })),
      }
    },
  },

  {
    name: 'getInventoryStatus',
    description: 'Current inventory: total SKUs, low-stock count, optional list of low-stock items.',
    parameters: {
      type: 'object',
      properties: { lowStockOnly: { type: 'boolean' }, limit: { type: 'number' } },
    },
    async handler(args, ctx) {
      const limit = Math.min(Number(args.limit) || 25, 100)
      const products = await Product.find({ companyId: ctx.companyId }).lean()
      const lowStock = products.filter((p) => Number(p.currentStock || 0) <= Number(p.reorderLevel || 0))
      const totalValue = products.reduce((s, p) => s + (Number(p.currentStock) || 0) * (Number(p.costPrice) || 0), 0)
      return {
        skus: products.length,
        lowStockCount: lowStock.length,
        inventoryValue: Math.round(totalValue),
        items: (args.lowStockOnly ? lowStock : products).slice(0, limit).map((p) => ({
          sku: p.sku, name: p.name, stock: p.currentStock, reorderLevel: p.reorderLevel, unit: p.unit,
        })),
      }
    },
  },

  {
    name: 'getOverdueInvoices',
    description: 'Invoices past due date that are not yet paid.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    async handler(args, ctx) {
      const limit = Math.min(Number(args.limit) || 20, 100)
      const rows = await Invoice.find({
        companyId: ctx.companyId,
        status: { $nin: ['paid', 'cancelled'] },
        dueDate: { $lt: new Date() },
      }).sort({ dueDate: 1 }).limit(limit).lean()
      const totalOverdue = rows.reduce((s, r) => s + (r.balanceDue || r.totalAmount || 0), 0)
      return {
        count: rows.length,
        totalOverdue: Math.round(totalOverdue),
        invoices: rows.map((r) => ({
          number: r.invoiceNumber, vendor: r.vendorName, balanceDue: r.balanceDue || r.totalAmount,
          dueDate: r.dueDate, daysOverdue: Math.floor((Date.now() - new Date(r.dueDate).getTime()) / 86400000),
        })),
      }
    },
  },

  {
    name: 'getGstSummary',
    description: 'GST collected vs paid for a given period (YYYYMM).',
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', description: 'YYYYMM e.g. 202604' } },
    },
    async handler(args, ctx) {
      const period = args.period || `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
      const year = Number(period.slice(0, 4))
      const month = Number(period.slice(4, 6))
      const from = new Date(Date.UTC(year, month - 1, 1))
      const to = new Date(Date.UTC(year, month, 1))
      const [agg] = await Invoice.aggregate([
        { $match: { companyId: ctx.companyId, issueDate: { $gte: from, $lt: to } } },
        { $group: { _id: null, taxable: { $sum: '$subtotal' }, tax: { $sum: '$taxAmount' }, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ])
      return {
        period,
        invoices: agg?.count || 0,
        taxable: agg?.taxable || 0,
        gstCollected: agg?.tax || 0,
        total: agg?.total || 0,
      }
    },
  },
]

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const dispatchTool = async (name, args, ctx) => {
  const tool = ASSISTANT_TOOLS.find((t) => t.name === name)
  if (!tool) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: 'UNKNOWN_TOOL' })
  const start = Date.now()
  try {
    const result = await tool.handler(args || {}, ctx)
    logger.info('assistant.tool_invoked', {
      tool: name, args, durationMs: Date.now() - start, companyId: String(ctx.companyId), userId: ctx.userId ? String(ctx.userId) : null,
    })
    return result
  } catch (err) {
    logger.warn('assistant.tool_failed', { tool: name, message: err.message })
    throw err
  }
}

export const TOOL_DECLARATIONS = ASSISTANT_TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }))
