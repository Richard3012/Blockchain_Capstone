import { ROLES } from '../constants/roles.js'

export const DEV_FALLBACK_USER = {
  _id: 'dev-admin',
  name: 'BlockERP Admin',
  email: 'admin@blockerp.local',
  role: ROLES.ADMIN,
  companyId: 'blockerp-dev-company',
  storeId: 'blockerp-dev-store',
  linkedWalletAddress: null,
  walletLinkedAt: null,
  isActive: true,
}

export const isDevFallbackLogin = (email, password) =>
  email.toLowerCase() === DEV_FALLBACK_USER.email && password === 'ChangeMe123!'

export const getDevDashboardSummary = () => ({
  kpis: {
    totalRevenue: 0,
    totalOrders: 0,
    activeCustomers: 0,
    pendingOrders: 0,
    lowStockCount: 0,
    inventoryValue: 0,
    pendingInvoices: 0,
    verifiedRecords: 0,
  },
  charts: {
    orderStatus: ['pending', 'processing', 'delivered', 'cancelled'].map((status) => ({
      label: status,
      value: 0,
    })),
    invoiceStatus: ['draft', 'issued', 'paid', 'overdue', 'cancelled'].map((status) => ({
      label: status,
      value: 0,
    })),
  },
  panels: {
    recentOrders: [],
    recentInvoices: [],
    lowStockItems: [],
    procurementQueue: [],
  },
  system: {
    mode: 'degraded',
    message: 'MongoDB is unavailable. BlockERP is running with a local fallback session only.',
  },
})
