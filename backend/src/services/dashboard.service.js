import { databaseState } from '../config/database.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { Customer } from '../models/customer.model.js'
import { Invoice } from '../models/invoice.model.js'
import { Product } from '../models/product.model.js'
import { PurchaseOrder } from '../models/purchase-order.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { getDevDashboardSummary } from './dev-fallback.service.js'
import { logger } from '../utils/logger.js'

const buildFinanceHistory = (invoices) => {
  const now = new Date()
  const revBuckets = []
  const expBuckets = []

  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    const month = monthDate.toLocaleString('en-IN', { month: 'short' })
    revBuckets.push({ key, month, revenue: 0 })
    expBuckets.push({ key, month, expenses: 0 })
  }

  const revMap = new Map(revBuckets.map((b) => [b.key, b]))
  const expMap = new Map(expBuckets.map((b) => [b.key, b]))

  const invoiceStatuses = new Set(['issued', 'paid', 'overdue'])
  invoices.forEach((invoice) => {
    const st = String(invoice.status || '').toLowerCase()
    if (!invoiceStatuses.has(st)) return

    const sourceDate = invoice.issueDate || invoice.createdAt
    if (!sourceDate) return

    const date = new Date(sourceDate)
    if (Number.isNaN(date.getTime())) return

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const isExpense = invoice.source === 'scanner'

    if (isExpense) {
      const bucket = expMap.get(key)
      if (bucket) bucket.expenses += invoice.totalAmount || 0
    } else {
      const bucket = revMap.get(key)
      if (bucket) bucket.revenue += invoice.totalAmount || 0
    }
  })

  return { revBuckets, expBuckets }
}

export const dashboardService = {
  async getSummary(companyId) {
    if (!databaseState.connected) {
      return getDevDashboardSummary()
    }

    const [orders, invoices, products, customers, purchaseOrders, blockchainRecords] = await Promise.all([
      SalesOrder.find({ companyId }).lean(),
      Invoice.find({ companyId }).lean(),
      Product.find({ companyId }).lean(),
      Customer.find({ companyId }).lean(),
      PurchaseOrder.find({ companyId }).lean(),
      BlockchainRecord.find({ companyId }).lean(),
    ])

    const salesInvoices = invoices.filter((inv) => inv.source !== 'scanner')
    const purchaseInvoices = invoices.filter((inv) => inv.source === 'scanner')

    const totalRevenue = salesInvoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0)

    const totalExpenses = purchaseInvoices
      .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0)

    const pendingOrders = orders.filter((order) => order.status === 'pending' || order.status === 'processing').length
    const lowStockCount = products.filter((product) => product.currentStock <= product.reorderLevel).length
    const inventoryValue = products.reduce((sum, product) => sum + (product.currentStock * product.costPrice), 0)
    const pendingInvoices = invoices.filter((invoice) => invoice.status === 'issued' || invoice.status === 'overdue').length
    const { revBuckets: revenueHistory, expBuckets: expenseHistory } = buildFinanceHistory(invoices)

    logger.info('dashboard.summary_fetched', {
      companyId: companyId.toString(),
      orders: orders.length,
      invoices: invoices.length,
      products: products.length,
      customers: customers.length,
      revenuePoints: revenueHistory.length,
    })

    return {
      kpis: {
        totalRevenue,
        totalExpenses,
        totalOrders: orders.length,
        activeCustomers: customers.filter((customer) => customer.isActive).length,
        pendingOrders,
        lowStockCount,
        inventoryValue,
        pendingInvoices,
        scannedInvoices: purchaseInvoices.length,
        verifiedRecords: blockchainRecords.filter((record) => record.status === 'anchored').length,
      },
      charts: {
        orderStatus: ['pending', 'processing', 'delivered', 'cancelled'].map((status) => ({
          label: status,
          value: orders.filter((order) => order.status === status).length,
        })),
        invoiceStatus: ['draft', 'issued', 'paid', 'overdue', 'cancelled'].map((status) => ({
          label: status,
          value: invoices.filter((invoice) => invoice.status === status).length,
        })),
        revenueHistory,
        expenseHistory,
      },
      panels: {
        recentOrders: orders.slice(0, 5),
        recentInvoices: invoices.slice(0, 5),
        lowStockItems: products.filter((product) => product.currentStock <= product.reorderLevel).slice(0, 5),
        procurementQueue: purchaseOrders
          .filter((purchaseOrder) => ['approved', 'ordered', 'partially_received'].includes(purchaseOrder.status))
          .slice(0, 5),
      },
    }
  },
}
