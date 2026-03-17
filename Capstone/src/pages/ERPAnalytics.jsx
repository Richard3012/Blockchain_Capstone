import { useStore } from '../store/useStore'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import Badge from '../components/UI/Badge'
import BarChart from '../components/Charts/BarChart'
import HorizontalBarChart from '../components/Charts/HorizontalBarChart'

export default function ERPAnalytics() {
  const orders = useStore((state) => state.orders)
  const invoices = useStore((state) => state.invoices)
  const inventory = useStore((state) => state.inventory)
  const getOrderStats = useStore((state) => state.getOrderStats)
  const getInvoiceStats = useStore((state) => state.getInvoiceStats)
  const getInventoryStats = useStore((state) => state.getInventoryStats)
  const user = useStore((state) => state.user)
  const hasPermission = useStore((state) => state.hasPermission)

  // RBAC check
  if (user.role === 'viewer' || !hasPermission('view_analytics')) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Access Restricted</h2>
          <p className="text-text-secondary mt-2">You need Manager or Admin privileges to view ERP Analytics.</p>
        </div>
      </div>
    )
  }

  const orderStats = getOrderStats()
  const invoiceStats = getInvoiceStats()
  const inventoryStats = getInventoryStats()

  // Orders per month (simulated)
  const ordersPerMonth = [
    { label: 'Sep', value: 52, color: '#4361ee' },
    { label: 'Oct', value: 78, color: '#4361ee' },
    { label: 'Nov', value: 65, color: '#4361ee' },
    { label: 'Dec', value: 91, color: '#4361ee' },
    { label: 'Jan', value: 84, color: '#4361ee' },
    { label: 'Feb', value: 100, color: '#4361ee' },
  ]

  // Invoice status breakdown
  const invoiceStatusData = [
    { label: 'Overdue', value: invoiceStats.overdue, color: '#e74c3c' },
    { label: 'Paid', value: invoiceStats.paid, color: '#2ecc71' },
    { label: 'Draft', value: invoices.filter(i => i.status === 'Draft').length, color: '#adb5bd' },
    { label: 'Sent', value: invoices.filter(i => i.status === 'Sent').length, color: '#4361ee' },
  ]

  // Inventory data for horizontal bar
  const inventoryData = inventory.slice(0, 6).map(p => ({
    name: p.name,
    stock: p.stock,
    reorder: p.reorderLevel
  }))

  // Low stock items
  const lowStockItems = inventory.filter(p => p.status !== 'In Stock')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">ERP Analytics</h1>
        <p className="text-text-secondary mt-1">Inventory, orders, and financial overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Orders</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={orderStats.total} />
          </p>
          <p className="text-xs text-green mt-2">+12% from last month</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Products</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={inventoryStats.total} />
          </p>
          <p className="text-xs text-text-muted mt-2">{inventoryStats.lowStock} low stock</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Invoice Value</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={invoiceStats.totalValue} prefix="₹" />
          </p>
          <p className="text-xs text-green mt-2">₹{invoiceStats.paidValue.toLocaleString()} collected</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Inventory Value</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={inventoryStats.totalValue} prefix="₹" />
          </p>
          <p className="text-xs text-text-muted mt-2">Across all products</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h3 className="font-semibold text-text-primary mb-4">Orders Per Month</h3>
          <BarChart data={ordersPerMonth} width={450} height={250} />
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h3 className="font-semibold text-text-primary mb-4">Invoice Status</h3>
          <BarChart data={invoiceStatusData} width={450} height={250} />
        </div>
      </div>

      {/* Inventory Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h3 className="font-semibold text-text-primary mb-4">Inventory Levels</h3>
          <HorizontalBarChart data={inventoryData} width={450} height={280} />
        </div>
        
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Low Stock Alerts</h3>
          </div>
          <div className="p-4 space-y-3">
            {lowStockItems.length > 0 ? lowStockItems.map((item) => (
              <div 
                key={item.id} 
                className={`flex items-center justify-between p-3 rounded-lg ${
                  item.status === 'Out of Stock' ? 'bg-red/5 border border-red/20' : 'bg-orange/5 border border-orange/20'
                }`}
              >
                <div>
                  <p className="font-medium text-text-primary">{item.name}</p>
                  <p className="text-sm text-text-secondary">{item.sku}</p>
                </div>
                <div className="text-right">
                  <Badge>{item.status}</Badge>
                  <p className="text-sm text-text-muted mt-1">{item.stock} units</p>
                </div>
              </div>
            )) : (
              <p className="text-center text-text-muted py-8">All products are in stock!</p>
            )}
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Recent Orders</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">ID</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Customer</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Amount</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-6 text-sm font-medium text-text-primary">{order.id}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">{order.customer}</td>
                    <td className="py-3 px-6 text-sm text-text-primary">${order.amount.toLocaleString()}</td>
                    <td className="py-3 px-6"><Badge>{order.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Recent Invoices</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">ID</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Customer</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Amount</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 8).map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-6 text-sm font-medium text-text-primary">{invoice.id}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">{invoice.customer}</td>
                    <td className="py-3 px-6 text-sm text-text-primary">${invoice.amount.toLocaleString()}</td>
                    <td className="py-3 px-6"><Badge>{invoice.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h3 className="font-semibold text-text-primary mb-4">Order Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-text-secondary">Processing</span>
              <span className="font-medium text-orange">{orderStats.processing}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Shipped</span>
              <span className="font-medium text-purple">{orderStats.shipped}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Delivered</span>
              <span className="font-medium text-green">{orderStats.delivered}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Cancelled</span>
              <span className="font-medium text-red">{orderStats.cancelled}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h3 className="font-semibold text-text-primary mb-4">Invoice Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-text-secondary">Total Value</span>
              <span className="font-medium">${invoiceStats.totalValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Paid</span>
              <span className="font-medium text-green">${invoiceStats.paidValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Overdue</span>
              <span className="font-medium text-red">${invoiceStats.overdueValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Pending</span>
              <span className="font-medium text-orange">${invoiceStats.pendingValue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h3 className="font-semibold text-text-primary mb-4">Inventory Health</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-text-secondary">In Stock</span>
              <span className="font-medium text-green">{inventoryStats.inStock}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Low Stock</span>
              <span className="font-medium text-orange">{inventoryStats.lowStock}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Out of Stock</span>
              <span className="font-medium text-red">{inventoryStats.outOfStock}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Total Value</span>
              <span className="font-medium">${inventoryStats.totalValue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
