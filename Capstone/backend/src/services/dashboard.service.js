import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { Customer } from '../models/customer.model.js'
import { Invoice } from '../models/invoice.model.js'
import { Product } from '../models/product.model.js'
import { PurchaseOrder } from '../models/purchase-order.model.js'
import { SalesOrder } from '../models/sales-order.model.js'

export const dashboardService = {
  async getSummary(companyId) {
    const [orders, invoices, products, customers, purchaseOrders, blockchainRecords] = await Promise.all([
      SalesOrder.find({ companyId }).lean(),
      Invoice.find({ companyId }).lean(),
      Product.find({ companyId }).lean(),
      Customer.find({ companyId }).lean(),
      PurchaseOrder.find({ companyId }).lean(),
      BlockchainRecord.find({ companyId }).lean(),
    ])

    const totalRevenue = invoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0)

    const pendingOrders = orders.filter((order) => order.status === 'pending' || order.status === 'processing').length
    const lowStockCount = products.filter((product) => product.currentStock <= product.reorderLevel).length
    const inventoryValue = products.reduce((sum, product) => sum + (product.currentStock * product.costPrice), 0)
    const pendingInvoices = invoices.filter((invoice) => invoice.status === 'issued' || invoice.status === 'overdue').length

    return {
      kpis: {
        totalRevenue,
        totalOrders: orders.length,
        activeCustomers: customers.filter((customer) => customer.isActive).length,
        pendingOrders,
        lowStockCount,
        inventoryValue,
        pendingInvoices,
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
