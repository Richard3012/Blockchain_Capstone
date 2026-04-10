import { create } from 'zustand'

const getStoredTheme = () => {
  if (typeof window === 'undefined') return 'light'
  const storedTheme = window.localStorage.getItem('blockerp-theme')
  return storedTheme === 'dark' ? 'dark' : 'light'
}

const persistTheme = (theme) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('blockerp-theme', theme)
  document.documentElement.classList.toggle('theme-dark', theme === 'dark')
}

export const useStore = create((set, get) => ({
  // Navigation
  currentPage: 'dashboard',
  setCurrentPage: (page) => set({ currentPage: page }),
  activePage: 'dashboard', // Alias for backward compatibility
  setActivePage: (page) => set({ currentPage: page, activePage: page }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Auth / RBAC
  authToken: null,
  isAuthenticated: false,
  user: {
    name: 'Guest User',
    role: 'viewer',
    initials: 'GU',
    email: '',
    phone: '',
    department: ''
  },
  setSession: ({ token, user }) => set({
    authToken: token,
    isAuthenticated: true,
    user: {
      ...user,
      initials: user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    },
  }),
  clearSession: () => set({
    authToken: null,
    isAuthenticated: false,
    currentPage: 'dashboard',
    activePage: 'dashboard',
    user: {
      name: 'Guest User',
      role: 'viewer',
      initials: 'GU',
      email: '',
      phone: '',
      department: '',
    },
  }),
  setUser: (userData) => set((state) => ({ user: { ...state.user, ...userData } })),
  setUserRole: (role) => set((state) => ({ user: { ...state.user, role } })),
  
  // Role-based permissions
  roles: {
    admin: {
      label: 'Admin',
      permissions: ['view_all', 'edit_all', 'delete_all', 'manage_users', 'view_analytics', 'view_blockchain', 'view_audit', 'manage_settings', 'view_dashboard', 'view_orders', 'view_customers', 'view_inventory'],
      description: 'Full ERP access across master data, transactions, settings, and verification'
    },
    procurement_manager: {
      label: 'Procurement Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_inventory', 'view_blockchain', 'view_audit', 'view_procurement', 'create_orders', 'edit_orders'],
      description: 'Manage purchasing and review order integrity'
    },
    inventory_manager: {
      label: 'Inventory Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_inventory', 'view_blockchain', 'view_audit', 'edit_inventory', 'view_procurement'],
      description: 'Control inventory movements and stock visibility'
    },
    finance_manager: {
      label: 'Finance Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_blockchain', 'view_audit', 'view_analytics', 'view_finance'],
      description: 'Review invoices, payment impact, and finance summaries'
    },
    sales_staff: {
      label: 'Sales Staff',
      permissions: ['view_dashboard', 'view_orders', 'view_customers', 'create_orders'],
      description: 'Create and track sales orders'
    },
    store_manager: {
      label: 'Store Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_inventory', 'view_blockchain', 'view_audit', 'create_orders', 'edit_orders', 'edit_inventory'],
      description: 'Manage store-level transactions and order reviews'
    },
    support_staff: {
      label: 'Support Staff',
      permissions: ['view_dashboard', 'view_orders', 'view_customers', 'view_inventory'],
      description: 'Read operational ERP data for support tasks'
    },
    viewer: {
      label: 'Read Only',
      permissions: ['view_dashboard', 'view_orders', 'view_customers', 'view_inventory'],
      description: 'Read-only ERP access to core operational data'
    },
    manager: {
      label: 'Operations Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_customers', 'view_inventory', 'view_analytics', 'view_blockchain', 'view_audit', 'edit_orders', 'edit_inventory', 'edit_customers'],
      description: 'Legacy manager mapping retained for compatibility'
    },
    procurement: {
      label: 'Procurement Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_inventory', 'view_blockchain', 'view_audit', 'view_procurement', 'create_orders', 'edit_orders'],
      description: 'Legacy procurement mapping retained for compatibility'
    },
    inventory: {
      label: 'Inventory Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_inventory', 'view_blockchain', 'view_audit', 'edit_inventory', 'view_procurement'],
      description: 'Legacy inventory mapping retained for compatibility'
    },
    finance: {
      label: 'Finance Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_blockchain', 'view_audit', 'view_analytics', 'view_finance'],
      description: 'Legacy finance mapping retained for compatibility'
    },
    sales: {
      label: 'Sales Staff',
      permissions: ['view_dashboard', 'view_orders', 'view_customers', 'create_orders'],
      description: 'Legacy sales mapping retained for compatibility'
    },
    support: {
      label: 'Support Staff',
      permissions: ['view_dashboard', 'view_orders', 'view_customers', 'view_inventory'],
      description: 'Legacy support mapping retained for compatibility'
    },
    storemanager: {
      label: 'Store Manager',
      permissions: ['view_dashboard', 'view_orders', 'view_inventory', 'view_blockchain', 'view_audit', 'create_orders', 'edit_orders', 'edit_inventory'],
      description: 'Legacy store manager mapping retained for compatibility'
    }
  },
  hasPermission: (permission) => {
    const user = get().user
    const roles = get().roles
    const userRole = roles[user.role]
    if (!userRole) return false
    return userRole.permissions.includes(permission) || userRole.permissions.includes('view_all')
  },

  // Real-time metrics (Dashboard KPIs)
  metrics: {
    totalRevenue: 0,
    totalOrders: 0,
    activeCustomers: 0,
    pendingOrders: 0,
    lowStockCount: 0,
  },
  updateMetrics: (options = {}) => set((state) => {
    if (options.revenueOnly) {
      return {
        metrics: {
          ...state.metrics,
          totalRevenue: state.metrics.totalRevenue + (options.delta || 0)
        }
      }
    }
    return {
      metrics: state.metrics
    }
  }),

  // Revenue History for charts
  revenueHistory: [],
  
  // Bulk setters for live data loading
  setOrders: (data) => set({ orders: data }),
  setInvoices: (data) => set({ invoices: data }),
  setCustomers: (data) => set({ customers: data }),
  setInventory: (data) => set({ inventory: data }),
  setTickets: (data) => set({ tickets: data }),
  setAuditLog: (data) => set({ auditLog: data }),
  setBlockchainTxs: (data) => set({ blockchainTxs: data }),
  setRevenueHistory: (data) => set({ revenueHistory: data }),

  // Orders
  orders: [],
  addOrder: (order) => set((state) => ({ orders: [order, ...state.orders] })),
  updateOrderStatus: (id, status) => set((state) => ({
    orders: state.orders.map(o => o.id === id ? { ...o, status } : o)
  })),

  // Invoices
  invoices: [],
  addInvoice: (invoice) => set((state) => ({ invoices: [invoice, ...state.invoices] })),
  updateInvoiceStatus: (id, status) => set((state) => ({
    invoices: state.invoices.map(i => i.id === id ? { ...i, status } : i)
  })),

  // Customers
  customers: [],
  addCustomer: (customer) => set((state) => ({ 
    customers: [{ ...customer, id: state.customers.length + 1 }, ...state.customers] 
  })),
  updateCustomer: (id, data) => set((state) => ({
    customers: state.customers.map(c => c.id === id ? { ...c, ...data } : c)
  })),

  // Inventory
  inventory: [],
  restockProduct: (id, qty) => set((state) => ({
    inventory: state.inventory.map(p => {
      if (p.id === id) {
        const newStock = p.stock + qty
        return { 
          ...p, 
          stock: newStock, 
          status: newStock > p.reorderLevel ? 'In Stock' : newStock > 0 ? 'Low Stock' : 'Out of Stock',
          lastRestocked: new Date().toISOString().split('T')[0]
        }
      }
      return p
    })
  })),
  updateStockLevel: (id, delta) => set((state) => ({
    inventory: state.inventory.map(p => {
      if (p.id === id) {
        const newStock = Math.max(0, p.stock + delta)
        let status = p.status
        if (newStock <= 0) {
          status = 'Out of Stock'
        } else if (newStock <= p.reorderLevel) {
          status = 'Low Stock'
        } else {
          status = 'In Stock'
        }
        return { ...p, stock: newStock, status }
      }
      return p
    })
  })),

  // Support Tickets
  tickets: [],
  addTicket: (ticket) => set((state) => ({ 
    tickets: [{ 
      ...ticket, 
      id: `TKT-${String(state.tickets.length + 1).padStart(5, '0')}`,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    }, ...state.tickets] 
  })),
  updateTicketStatus: (id, status) => set((state) => ({
    tickets: state.tickets.map(t => t.id === id ? { ...t, status, updatedAt: new Date().toISOString().split('T')[0] } : t)
  })),

  // Audit Log
  auditLog: [],
  appendAuditEntry: (entry) => set((state) => ({
    auditLog: [entry, ...state.auditLog].slice(0, 500)
  })),

  // Blockchain Activity
  blockchainTxs: [],
  appendBlockchainTx: (tx) => set((state) => ({
    blockchainTxs: [tx, ...state.blockchainTxs].slice(0, 500)
  })),

  // Toast notifications
  toasts: [],
  addToast: (message, type = 'info') => set((state) => ({
    toasts: [...state.toasts, { id: Date.now(), message, type }]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  // Modal
  modal: null,
  openModal: (type, data = {}) => set({ modal: { type, data } }),
  closeModal: () => set({ modal: null }),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Notifications count
  notificationCount: 2,
  incrementNotifications: () => set((state) => ({ notificationCount: state.notificationCount + 1 })),
  clearNotifications: () => set({ notificationCount: 0 }),

  // Settings state
  settingsTab: 'profile',
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  
  // Notification settings
  notificationSettings: {
    email: true,
    sms: false,
    blockchain: true,
    lowStock: true,
    invoiceReminders: true,
    ticketUpdates: true,
  },
  toggleNotificationSetting: (key) => set((state) => ({
    notificationSettings: {
      ...state.notificationSettings,
      [key]: !state.notificationSettings[key]
    }
  })),

  // Appearance settings
  theme: getStoredTheme(),
  setTheme: (theme) => {
    persistTheme(theme)
    set({ theme })
  },
  accentColor: '#4361ee',
  setAccentColor: (color) => set({ accentColor: color }),
  density: 'normal',
  setDensity: (density) => set({ density }),

  // Computed selectors
  getOrderStats: () => {
    const orders = get().orders
    return {
      total: orders.length,
      processing: orders.filter(o => String(o.status).toLowerCase() === 'processing').length,
      shipped: orders.filter(o => String(o.status).toLowerCase() === 'shipped').length,
      inTransit: orders.filter(o => String(o.status).toLowerCase() === 'in_transit').length,
      delivered: orders.filter(o => String(o.status).toLowerCase() === 'delivered').length,
      cancelled: orders.filter(o => String(o.status).toLowerCase() === 'cancelled').length,
      pending: orders.filter(o => String(o.status).toLowerCase() === 'pending').length,
      totalValue: orders.reduce((sum, order) => sum + (order.total || order.amount || 0), 0),
    }
  },
  getInvoiceStats: () => {
    const invoices = get().invoices
    const paidInvoices = invoices.filter(i => String(i.status).toLowerCase() === 'paid')
    const overdueInvoices = invoices.filter(i => String(i.status).toLowerCase() === 'overdue')
    const pendingInvoices = invoices.filter(i => ['issued', 'sent', 'draft'].includes(String(i.status).toLowerCase()))
    return {
      total: invoices.length,
      paid: paidInvoices.length,
      paidValue: paidInvoices.reduce((sum, i) => sum + i.amount, 0),
      overdue: overdueInvoices.length,
      overdueValue: overdueInvoices.reduce((sum, i) => sum + i.amount, 0),
      pending: pendingInvoices.length,
      pendingValue: pendingInvoices.reduce((sum, i) => sum + i.amount, 0),
      totalValue: invoices.reduce((sum, i) => sum + i.amount, 0),
    }
  },
  getInventoryStats: () => {
    const inventory = get().inventory
    return {
      total: inventory.length,
      inStock: inventory.filter(p => p.status === 'In Stock').length,
      lowStock: inventory.filter(p => p.status === 'Low Stock').length,
      outOfStock: inventory.filter(p => p.status === 'Out of Stock').length,
      totalValue: inventory.reduce((sum, p) => sum + (p.price * p.stock), 0),
    }
  },
  getTicketStats: () => {
    const tickets = get().tickets
    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      inProgress: tickets.filter(t => t.status === 'in-progress').length,
      resolved: tickets.filter(t => t.status === 'resolved').length,
      closed: tickets.filter(t => t.status === 'closed').length,
      critical: tickets.filter(t => t.priority === 'CRITICAL').length,
    }
  },
  getCustomerStats: () => {
    const customers = get().customers
    const activeCustomers = customers.filter(c => c.status === 'active')
    const totalLifetimeValue = customers.reduce((sum, c) => sum + (c.lifetimeValue || c.totalSpent || 0), 0)
    return {
      total: customers.length,
      active: activeCustomers.length,
      withOrders: customers.filter(c => (c.orders || 0) > 0).length,
      inactive: customers.filter(c => c.status === 'inactive').length,
      totalLifetimeValue: totalLifetimeValue,
      avgLifetimeValue: customers.length > 0 ? totalLifetimeValue / customers.length : 0,
    }
  },
  getBlockchainStats: () => {
    const txs = get().blockchainTxs
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000)
    return {
      total: txs.length,
      confirmed: txs.filter(t => String(t.status).toLowerCase() === 'confirmed').length,
      pending: txs.filter(t => String(t.status).toLowerCase() === 'pending').length,
      failed: txs.filter(t => String(t.status).toLowerCase() === 'failed').length,
      todayCount: txs.filter((tx) => new Date(tx.timestamp).getTime() >= last24Hours).length,
    }
  },
  getAuditStats: () => {
    const logs = get().auditLog
    const today = new Date().toISOString().split('T')[0]
    const uniqueUsers = new Set(logs.filter(l => {
      const logDate = new Date(l.timestamp)
      const now = new Date()
      return (now - logDate) < 24 * 60 * 60 * 1000
    }).map(l => l.user))
    
    return {
      total: logs.length,
      today: logs.filter(l => l.timestamp.startsWith(today)).length,
      withHash: logs.filter(l => l.hash).length,
      activeUsers: uniqueUsers.size,
    }
  },
}))
