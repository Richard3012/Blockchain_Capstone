import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import AnimatedNumber from '../components/UI/AnimatedNumber'

export default function Orders() {
  const orders = useStore((state) => state.orders)
  const updateOrderStatus = useStore((state) => state.updateOrderStatus)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getOrderStats = useStore((state) => state.getOrderStats)
  const user = useStore((state) => state.user)

  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  const stats = getOrderStats()

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query || 
        order.id.toLowerCase().includes(query) ||
        order.customer.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [orders, localSearch, searchQuery, statusFilter])

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage])

  const totalPages = Math.ceil(filteredOrders.length / pageSize)

  const handleStatusUpdate = (orderId, newStatus) => {
    if (user.role === 'viewer') {
      addToast('Viewers cannot update order status', 'error')
      return
    }
    updateOrderStatus(orderId, newStatus)
    addToast(`Order ${orderId} updated to ${newStatus}`, 'success')
  }

  const getStatusBadge = (status) => {
    const variants = {
      pending: 'warning',
      processing: 'info',
      shipped: 'success',
      delivered: 'success',
      cancelled: 'error'
    }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString()
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Orders</h1>
          <p className="text-text-secondary mt-1">Manage and track customer orders</p>
        </div>
        {user.role !== 'viewer' && (
          <Button>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Order
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Orders</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={stats.total} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Pending</p>
          <p className="text-2xl font-bold text-orange mt-1">
            <AnimatedNumber value={stats.pending} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Processing</p>
          <p className="text-2xl font-bold text-blue mt-1">
            <AnimatedNumber value={stats.processing} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Delivered</p>
          <p className="text-2xl font-bold text-green mt-1">
            <AnimatedNumber value={stats.delivered} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Value</p>
          <p className="text-2xl font-bold text-purple mt-1">
            ${Math.round(stats.totalValue / 1000)}K
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-xs">
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search orders..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'processing', 'shipped', 'delivered'].map(status => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setCurrentPage(1) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === status 
                  ? 'bg-blue text-white' 
                  : 'bg-white border border-border hover:bg-gray-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Order ID</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Customer</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Date</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Items</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Total</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Blockchain</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr 
                  key={order.id} 
                  className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="py-3 px-6 text-sm font-medium text-blue">{order.id}</td>
                  <td className="py-3 px-6 text-sm text-text-primary">{order.customer}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{formatDate(order.date)}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{order.items}</td>
                  <td className="py-3 px-6 text-sm font-medium text-text-primary">
                    {formatCurrency(order.total)}
                  </td>
                  <td className="py-3 px-6">{getStatusBadge(order.status)}</td>
                  <td className="py-3 px-6">
                    {order.blockchainHash ? (
                      <span className="text-green text-sm">✓ Verified</span>
                    ) : (
                      <span className="text-text-muted text-sm">-</span>
                    )}
                  </td>
                  <td className="py-3 px-6" onClick={(e) => e.stopPropagation()}>
                    {user.role !== 'viewer' && order.status !== 'delivered' && order.status !== 'cancelled' && (
                      <select
                        value=""
                        onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                        className="text-sm border border-border rounded px-2 py-1"
                      >
                        <option value="">Update</option>
                        {order.status === 'pending' && <option value="processing">Processing</option>}
                        {order.status === 'processing' && <option value="shipped">Shipped</option>}
                        {order.status === 'shipped' && <option value="delivered">Delivered</option>}
                        <option value="cancelled">Cancel</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
          </p>
          <div className="flex gap-2">
            <Button 
              variant="secondary" 
              size="sm" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <Modal 
          title={`Order ${selectedOrder.id}`} 
          onClose={() => setSelectedOrder(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-text-muted">Customer</label>
                <p className="font-medium text-text-primary">{selectedOrder.customer}</p>
              </div>
              <div>
                <label className="text-sm text-text-muted">Order Date</label>
                <p className="font-medium text-text-primary">{formatDate(selectedOrder.date)}</p>
              </div>
              <div>
                <label className="text-sm text-text-muted">Items</label>
                <p className="font-medium text-text-primary">{selectedOrder.items} items</p>
              </div>
              <div>
                <label className="text-sm text-text-muted">Total</label>
                <p className="font-medium text-text-primary">{formatCurrency(selectedOrder.total)}</p>
              </div>
            </div>

            <div>
              <label className="text-sm text-text-muted">Status</label>
              <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
            </div>

            {selectedOrder.blockchainHash && (
              <div>
                <label className="text-sm text-text-muted">Blockchain Hash</label>
                <p className="font-mono text-xs text-green break-all mt-1">
                  {selectedOrder.blockchainHash}
                </p>
              </div>
            )}

            {user.role !== 'viewer' && selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
              <div className="pt-4 border-t border-border">
                <label className="text-sm text-text-muted mb-2 block">Update Status</label>
                <div className="flex gap-2">
                  {selectedOrder.status === 'pending' && (
                    <Button size="sm" onClick={() => handleStatusUpdate(selectedOrder.id, 'processing')}>
                      Mark Processing
                    </Button>
                  )}
                  {selectedOrder.status === 'processing' && (
                    <Button size="sm" onClick={() => handleStatusUpdate(selectedOrder.id, 'shipped')}>
                      Mark Shipped
                    </Button>
                  )}
                  {selectedOrder.status === 'shipped' && (
                    <Button size="sm" onClick={() => handleStatusUpdate(selectedOrder.id, 'delivered')}>
                      Mark Delivered
                    </Button>
                  )}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => handleStatusUpdate(selectedOrder.id, 'cancelled')}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
