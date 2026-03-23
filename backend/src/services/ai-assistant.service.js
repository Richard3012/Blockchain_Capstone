import { Invoice } from '../models/invoice.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { Product } from '../models/product.model.js'
import { Customer } from '../models/customer.model.js'
import { Payment } from '../models/payment.model.js'
import { accountingService } from './accounting.service.js'
import { logger } from '../utils/logger.js'

/**
 * AI Business Assistant Service
 *
 * Natural-language query engine that reads live ERP data and returns
 * formatted responses. Runs server-side so it has direct DB access.
 * Also used by the WhatsApp chatbot (same intent engine).
 */

// ─── Intent detection ────────────────────────────────────────────────
const INTENTS = [
  { id: 'todays_sales', patterns: [/today.*(sale|revenue|order)/i, /sale.*today/i, /how much.*(sold|earned).*today/i] },
  { id: 'monthly_sales', patterns: [/this month.*(sale|revenue)/i, /(sale|revenue).*this month/i, /monthly.*(sale|revenue)/i] },
  { id: 'pnl', patterns: [/p\s*[&n]\s*l/i, /profit\s*(and|&)?\s*loss/i, /income statement/i] },
  { id: 'quarterly_pnl', patterns: [/(last|previous|this)\s*quarter.*p.*l/i, /quarter.*profit/i, /q[1-4]\s*(p.*l|profit|revenue)/i] },
  { id: 'overdue_invoices', patterns: [/overdue/i, /unpaid.*invoice/i, /outstanding.*payment/i, /pending.*payment/i] },
  { id: 'top_products', patterns: [/top.*(product|selling|seller)/i, /best.*(product|selling|seller)/i, /popular.*product/i] },
  { id: 'low_stock', patterns: [/low\s*stock/i, /reorder/i, /out\s*of\s*stock/i, /stock\s*alert/i] },
  { id: 'customer_count', patterns: [/how many.*(customer|client)/i, /total.*(customer|client)/i, /customer\s*count/i] },
  { id: 'revenue_total', patterns: [/total\s*revenue/i, /all.*(time|total).*revenue/i, /lifetime.*revenue/i] },
  { id: 'recent_orders', patterns: [/recent.*(order|sale)/i, /latest.*(order|sale)/i, /last\s*\d+\s*order/i] },
  { id: 'invoice_summary', patterns: [/invoice.*(summary|status|breakdown)/i, /how many.*invoice/i] },
  { id: 'trial_balance', patterns: [/trial\s*balance/i] },
  { id: 'balance_sheet', patterns: [/balance\s*sheet/i] },
  { id: 'help', patterns: [/help/i, /what can you/i, /capabilities/i] },
]

function detectIntent(query) {
  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(query)) return intent.id
    }
  }
  return 'general'
}

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

function startOfDay() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
function startOfMonth() { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d }
function startOfQuarter() {
  const d = new Date()
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q, 1)
}

// ─── Intent handlers ──────────────────────────────────────────────────
const handlers = {
  async todays_sales(companyId) {
    const since = startOfDay()
    const orders = await SalesOrder.find({ companyId, createdAt: { $gte: since } })
    const total = orders.reduce((s, o) => s + (o.totalAmount || 0), 0)
    return {
      text: `📊 *Today's Sales*\n\nOrders: *${orders.length}*\nRevenue: *${fmt(total)}*`,
      data: { orderCount: orders.length, total },
    }
  },

  async monthly_sales(companyId) {
    const since = startOfMonth()
    const orders = await SalesOrder.find({ companyId, createdAt: { $gte: since } })
    const total = orders.reduce((s, o) => s + (o.totalAmount || 0), 0)
    const monthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    return {
      text: `📈 *${monthName} Sales*\n\nOrders: *${orders.length}*\nRevenue: *${fmt(total)}*`,
      data: { orderCount: orders.length, total },
    }
  },

  async pnl(companyId) {
    try {
      const pnl = await accountingService.getProfitAndLoss(companyId)
      return {
        text: [
          `📊 *Profit & Loss Statement*`,
          ``,
          `Revenue: *${fmt(pnl.totalRevenue)}*`,
          `Expenses: *${fmt(pnl.totalExpenses)}*`,
          `Net Income: *${fmt(pnl.netIncome)}*`,
          ...(pnl.revenue || []).map((r) => `  • ${r.name}: ${fmt(r.amount)}`),
        ].join('\n'),
        data: pnl,
      }
    } catch {
      return { text: '📊 *P&L*: No accounting data yet. Initialize accounts first.', data: null }
    }
  },

  async quarterly_pnl(companyId) {
    const since = startOfQuarter()
    const orders = await SalesOrder.find({ companyId, createdAt: { $gte: since } })
    const invoices = await Invoice.find({ companyId, createdAt: { $gte: since } })
    const revenue = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0)
    const paid = invoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
    const qLabel = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`
    return {
      text: [
        `📈 *${qLabel} Summary*`,
        ``,
        `Orders placed: *${orders.length}*`,
        `Invoices: *${invoices.length}*`,
        `Total invoiced: *${fmt(revenue)}*`,
        `Collected: *${fmt(paid)}*`,
        `Outstanding: *${fmt(revenue - paid)}*`,
      ].join('\n'),
      data: { quarter: qLabel, orders: orders.length, invoices: invoices.length, revenue, paid },
    }
  },

  async overdue_invoices(companyId) {
    const invoices = await Invoice.find({
      companyId,
      status: { $in: ['issued', 'overdue'] },
      balanceDue: { $gt: 0 },
      dueDate: { $lt: new Date() },
    }).populate('customer').sort({ dueDate: 1 }).limit(10)

    if (!invoices.length) return { text: '✅ No overdue invoices!', data: [] }

    const total = invoices.reduce((s, i) => s + i.balanceDue, 0)
    const lines = invoices.map((i) =>
      `• ${i.invoiceNumber} — ${i.customer?.name || 'N/A'} — *${fmt(i.balanceDue)}* (due ${new Date(i.dueDate).toLocaleDateString('en-IN')})`,
    )
    return {
      text: [`⚠️ *Overdue Invoices (${invoices.length})*`, `Total outstanding: *${fmt(total)}*`, '', ...lines].join('\n'),
      data: invoices,
    }
  },

  async top_products(companyId) {
    const products = await Product.find({ companyId, isActive: true })
      .sort({ currentStock: -1 })
      .limit(10)
    const lines = products.map((p, i) =>
      `${i + 1}. *${p.name}* (${p.sku}) — Stock: ${p.currentStock}  Sale: ${fmt(p.salePrice)}`,
    )
    return {
      text: [`📦 *Top Products*`, '', ...lines].join('\n'),
      data: products,
    }
  },

  async low_stock(companyId) {
    const products = await Product.find({
      companyId,
      isActive: true,
      $expr: { $lte: ['$currentStock', '$reorderLevel'] },
    }).sort({ currentStock: 1 }).limit(15)

    if (!products.length) return { text: '✅ All products above reorder level.', data: [] }

    const lines = products.map((p) =>
      `• *${p.name}* (${p.sku}) — Stock: ${p.currentStock} / Reorder: ${p.reorderLevel}`,
    )
    return {
      text: [`🚨 *Low Stock Alert (${products.length})*`, '', ...lines].join('\n'),
      data: products,
    }
  },

  async customer_count(companyId) {
    const count = await Customer.countDocuments({ companyId })
    return {
      text: `👥 Total customers: *${count}*`,
      data: { count },
    }
  },

  async revenue_total(companyId) {
    const agg = await Invoice.aggregate([
      { $match: { companyId, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ])
    const row = agg[0] || { total: 0, count: 0 }
    return {
      text: `💰 *Lifetime Revenue*\n\nPaid invoices: *${row.count}*\nTotal collected: *${fmt(row.total)}*`,
      data: row,
    }
  },

  async recent_orders(companyId) {
    const orders = await SalesOrder.find({ companyId }).sort({ createdAt: -1 }).limit(5)
    if (!orders.length) return { text: 'No orders yet.', data: [] }
    const lines = orders.map((o) =>
      `• *${o.orderNumber}* — ${fmt(o.totalAmount)} — ${o.status} — ${new Date(o.createdAt).toLocaleDateString('en-IN')}`,
    )
    return {
      text: [`📋 *Recent Orders*`, '', ...lines].join('\n'),
      data: orders,
    }
  },

  async invoice_summary(companyId) {
    const all = await Invoice.find({ companyId })
    const byStatus = {}
    let totalAmount = 0
    for (const inv of all) {
      byStatus[inv.status] = (byStatus[inv.status] || 0) + 1
      totalAmount += inv.totalAmount || 0
    }
    const lines = Object.entries(byStatus).map(([s, c]) => `• ${s}: *${c}*`)
    return {
      text: [`🧾 *Invoice Summary*`, `Total: *${all.length}* invoices — ${fmt(totalAmount)}`, '', ...lines].join('\n'),
      data: { total: all.length, totalAmount, byStatus },
    }
  },

  async trial_balance(companyId) {
    try {
      const tb = await accountingService.getTrialBalance(companyId)
      const lines = (tb.rows || []).map((r) =>
        `${r.code} ${r.name} — Dr: ${fmt(r.debit)} Cr: ${fmt(r.credit)}`,
      )
      return {
        text: [`📊 *Trial Balance*`, `${tb.balanced ? '✅ Balanced' : '❌ Not balanced'}`, '', ...lines].join('\n'),
        data: tb,
      }
    } catch {
      return { text: 'No trial balance data. Initialize accounts first.', data: null }
    }
  },

  async balance_sheet(companyId) {
    try {
      const bs = await accountingService.getBalanceSheet(companyId)
      return {
        text: [
          `📄 *Balance Sheet*`,
          `${bs.balanced ? '✅ Balanced' : '❌ Not balanced'}`,
          '',
          `Assets: ${fmt(bs.totalAssets)}`,
          `Liabilities: ${fmt(bs.totalLiabilities)}`,
          `Equity: ${fmt(bs.totalEquity)}`,
        ].join('\n'),
        data: bs,
      }
    } catch {
      return { text: 'No balance sheet data.', data: null }
    }
  },

  async help() {
    return {
      text: [
        `🤖 *BlockERP AI Assistant*`,
        ``,
        `Ask me anything about your business:`,
        ``,
        `📊 "Today's sales"`,
        `📈 "This month's revenue"`,
        `💰 "P&L statement"`,
        `📋 "Last quarter's P&L"`,
        `⚠️ "Overdue invoices"`,
        `📦 "Top products"`,
        `🚨 "Low stock alerts"`,
        `👥 "How many customers?"`,
        `🧾 "Invoice summary"`,
        `📋 "Recent orders"`,
        `📊 "Trial balance"`,
        `📄 "Balance sheet"`,
      ].join('\n'),
      data: null,
    }
  },

  async general() {
    return {
      text: `I didn't quite understand that. Type *help* to see what I can answer, or try asking about sales, invoices, products, or financial reports.`,
      data: null,
    }
  },
}

// ─── Public API ──────────────────────────────────────────────────────
export const aiAssistantService = {
  async processQuery(companyId, query) {
    const intent = detectIntent(query)
    logger.info('ai_assistant.query', { intent, query: query.slice(0, 100) })

    const handler = handlers[intent] || handlers.general
    const result = await handler(companyId)
    return { intent, ...result }
  },
}
