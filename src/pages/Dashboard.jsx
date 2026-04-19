import { useEffect, useState } from 'react'

import DonutChart from '../components/Charts/DonutChart'
import LineChart from '../components/Charts/LineChart'
import Badge from '../components/UI/Badge'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import { useDashboardSummary } from '../hooks/useDashboardSummary'
import { useLiveData } from '../hooks/useLiveData'
import { useStore } from '../store/useStore'

const kpiIcons = {
  revenue: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  orders: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  customers: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  pending: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  stock: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
}

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date())
  useLiveData('orders', 'invoices', 'customers', 'inventory', 'blockchain')
  const revenueHistory = useStore((state) => state.revenueHistory)
  const orders = useStore((state) => state.orders)
  const invoices = useStore((state) => state.invoices)
  const blockchainTxs = useStore((state) => state.blockchainTxs)
  const user = useStore((state) => state.user)
  const setActivePage = useStore((state) => state.setActivePage)
  const getOrderStats = useStore((state) => state.getOrderStats)
  const getInvoiceStats = useStore((state) => state.getInvoiceStats)
  const { data: dashboardSummary, loading, error } = useDashboardSummary()

  const orderStats = getOrderStats()
  const invoiceStats = getInvoiceStats()

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fallbackKpis = {
    totalRevenue: invoiceStats.paidValue,
    totalOrders: orderStats.total,
    activeCustomers: 0,
    pendingOrders: orderStats.pending + orderStats.processing,
    lowStockCount: 0,
    verifiedRecords: blockchainTxs.filter((tx) => String(tx.status).toLowerCase() === 'confirmed').length,
  }

  const kpis = dashboardSummary?.kpis || fallbackKpis
  const orderStatusData = dashboardSummary?.charts?.orderStatus || [
    { label: 'pending', value: orderStats.pending },
    { label: 'processing', value: orderStats.processing },
    { label: 'delivered', value: orderStats.delivered },
    { label: 'cancelled', value: orderStats.cancelled },
  ]
  const revenueChartData = dashboardSummary?.charts?.revenueHistory || revenueHistory
  const expenseChartData = dashboardSummary?.charts?.expenseHistory || []

  const donutSegments = [
    { label: 'Processing', value: orderStatusData.find((item) => item.label === 'processing')?.value || 0, color: '#f39c12' },
    { label: 'Pending', value: orderStatusData.find((item) => item.label === 'pending')?.value || 0, color: '#adb5bd' },
    { label: 'Delivered', value: orderStatusData.find((item) => item.label === 'delivered')?.value || 0, color: '#2ecc71' },
    { label: 'Cancelled', value: orderStatusData.find((item) => item.label === 'cancelled')?.value || 0, color: '#e74c3c' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Welcome back, {user.name.split(' ')[0]}!</h1>
        <p className="text-text-secondary mt-1">
          ERP operations overview · {currentTime.toLocaleTimeString()}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-text-secondary">
          Backend summary unavailable: {error}. Dashboard cards are temporarily using local placeholder values.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard label="Total Revenue" value={<AnimatedNumber value={kpis.totalRevenue} prefix="₹" />} icon={kpiIcons.revenue} iconBg="bg-green/10" iconColor="text-green" change={12.5} />
        <KPICard label="Total Expenses" value={<AnimatedNumber value={kpis.totalExpenses || 0} prefix="₹" />} icon={kpiIcons.orders} iconBg="bg-red/10" iconColor="text-red" />
        <KPICard label="Active Customers" value={<AnimatedNumber value={kpis.activeCustomers} />} icon={kpiIcons.customers} iconBg="bg-purple/10" iconColor="text-purple" change={2.4} />
        <KPICard label="Pending Orders" value={<AnimatedNumber value={kpis.pendingOrders} />} icon={kpiIcons.pending} iconBg="bg-orange/10" iconColor="text-orange" change={5.1} />
        <KPICard label="Low Stock Alerts" value={<AnimatedNumber value={kpis.lowStockCount} />} icon={kpiIcons.stock} iconBg="bg-red/10" iconColor="text-red" change={-1.6} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <div className="mb-4">
            <h3 className="font-semibold text-text-primary">Revenue Over Time</h3>
            <p className="text-sm text-text-secondary">Monthly totals from issued, paid, and overdue invoices (same month as issue date).</p>
          </div>
          <LineChart data={revenueChartData} width={500} height={250} />
          {expenseChartData.length > 0 && expenseChartData.some((d) => d.expenses > 0) && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-text-secondary mb-2">Expenses (Scanned Purchase Invoices)</h4>
              <LineChart data={expenseChartData.map((d) => ({ ...d, revenue: d.expenses }))} width={500} height={150} />
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <div className="mb-4">
            <h3 className="font-semibold text-text-primary">Order Status</h3>
            <p className="text-sm text-text-secondary">Derived from real order data when API is available</p>
          </div>
          <DonutChart segments={donutSegments} width={350} height={200} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl shadow-sm border border-border">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Recent Sales Orders</h3>
            <button onClick={() => setActivePage('orders')} className="text-sm text-blue hover:underline">
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Order ID</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Customer</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Amount</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-6 text-sm font-medium text-text-primary">{order.id}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">{order.customer}</td>
                    <td className="py-3 px-6 text-sm text-text-primary">₹{order.amount?.toLocaleString?.() || order.total?.toLocaleString?.()}</td>
                    <td className="py-3 px-6"><Badge>{order.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-border">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Recent Invoices</h3>
            <button onClick={() => setActivePage('invoices')} className="text-sm text-blue hover:underline">
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Invoice ID</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Customer</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Amount</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 5).map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-6 text-sm font-medium text-text-primary">{invoice.id}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">{invoice.customer}</td>
                    <td className="py-3 px-6 text-sm text-text-primary">₹{invoice.amount?.toLocaleString?.() || invoice.totalAmount?.toLocaleString?.()}</td>
                    <td className="py-3 px-6"><Badge>{invoice.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Pending Orders</p>
          <p className="text-2xl font-bold text-text-primary mt-1"><AnimatedNumber value={kpis.pendingOrders} /></p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Delivered Orders</p>
          <p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={orderStats.delivered} /></p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Paid Invoices</p>
          <p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={invoiceStats.paid} /></p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Verified Records</p>
          <p className="text-2xl font-bold text-blue mt-1"><AnimatedNumber value={kpis.verifiedRecords} /></p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary">Verification Activity</h3>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-green/10 text-green text-xs font-medium rounded-full">
              <span className="w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
              {loading ? 'Loading' : 'Ready'}
            </span>
          </div>
          <button onClick={() => setActivePage('blockchain')} className="text-sm text-blue hover:underline">
            View ledger
          </button>
        </div>
        <div className="divide-y divide-border">
          {blockchainTxs.slice(0, 8).map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 px-6 py-3">
              <span className="text-green">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <Badge variant={tx.type}>{tx.type}</Badge>
              <span className="text-sm text-text-secondary">{tx.entityId}</span>
              <span className="text-sm font-mono text-blue truncate max-w-[120px]">
                {tx.hash.slice(0, 12)}...
              </span>
              <Badge variant={tx.status}>{tx.status}</Badge>
              <span className="text-xs text-text-muted ml-auto">
                {new Date(tx.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, icon, iconBg, iconColor, change }) {
  const isPositive = change >= 0

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{label}</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
          <div className={`flex items-center gap-1 mt-2 text-sm ${isPositive ? 'text-green' : 'text-red'}`}>
            <svg className={`w-4 h-4 ${isPositive ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span>{Math.abs(change)}%</span>
          </div>
        </div>
        <div className={`p-3 rounded-xl ${iconBg} ${iconColor}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
