import { useMemo, useState } from 'react'
import { invalidateLiveData, useLiveData } from '../hooks/useLiveData'
import { useStore } from '../store/useStore'
import { apiClient } from '../services/api/client'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import AnimatedNumber from '../components/UI/AnimatedNumber'

const buildEmptyForm = (storeId = '') => ({
  customer: '',
  store: storeId || '',
  dueDate: '',
  taxAmount: 0,
  items: [{ product: '', quantity: 1, unitPrice: 0 }],
})

export default function Orders() {
  useLiveData('orders', 'customers', 'inventory')
  const orders = useStore((state) => state.orders)
  const customers = useStore((state) => state.customers)
  const inventory = useStore((state) => state.inventory)
  const setOrders = useStore((state) => state.setOrders)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getOrderStats = useStore((state) => state.getOrderStats)
  const user = useStore((state) => state.user)

  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState(buildEmptyForm(user.storeId))
  const [saving, setSaving] = useState(false)
  const pageSize = 20

  const stats = getOrderStats()

  const reloadOrders = async () => {
    invalidateLiveData('orders', 'audit', 'blockchain')
    const rows = await apiClient.get('/orders')
    setOrders(rows.map((o) => ({
      mongoId: o._id,
      id: o.orderNumber || o._id,
      customer: o.customer?.name || '-',
      amount: o.totalAmount || 0,
      total: o.totalAmount || 0,
      items: Array.isArray(o.items) ? o.items.length : 0,
      status: String(o.status || 'pending').toLowerCase(),
      date: o.createdAt,
      blockchainHash: o.blockchainHash || o.hash || '',
      verificationStatus: o.verificationStatus || 'not_requested',
    })))
  }

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const query = (localSearch || searchQuery).toLowerCase()
    const matchesSearch = !query || order.id.toLowerCase().includes(query) || order.customer.toLowerCase().includes(query)
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    return matchesSearch && matchesStatus
  }), [orders, localSearch, searchQuery, statusFilter])

  const paginatedOrders = useMemo(() => filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filteredOrders, currentPage])
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))

  const getStatusBadge = (status) => {
    const variants = { pending: 'warning', processing: 'info', shipped: 'purple', in_transit: 'info', delivered: 'success', cancelled: 'error' }
    return <Badge variant={variants[status] || 'default'}>{String(status).replace(/_/g, ' ')}</Badge>
  }

  const getIntegrityBadge = (status) => {
    const normalized = String(status || 'not_requested').toLowerCase()
    if (normalized === 'verified') return <Badge variant="success">Verified</Badge>
    if (normalized === 'failed') return <Badge variant="error">Flagged</Badge>
    if (normalized === 'pending') return <Badge variant="warning">Pending</Badge>
    return <Badge variant="default">Not Anchored</Badge>
  }

  const handleStatusUpdate = async (order, newStatus) => {
    try {
      await apiClient.put(`/orders/${order.mongoId}/status`, { status: newStatus })
      await reloadOrders()
      addToast(`Order ${order.id} updated to ${newStatus}`, 'success')
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const handleVerify = async (order) => {
    try {
      const verification = await apiClient.get(`/blockchain/verify/sales_order/${order.mongoId}`)
      await reloadOrders()
      if (verification.verificationStatus === 'failed') {
        addToast(`Tampering detected for ${order.id}`, 'error')
      } else {
        addToast(`Integrity verified for ${order.id}`, 'success')
      }
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const handleCreateOrder = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await apiClient.post('/orders', {
        customer: form.customer,
        store: form.store || user.storeId || undefined,
        dueDate: form.dueDate || undefined,
        taxAmount: Number(form.taxAmount || 0),
        items: form.items.map((item) => ({
          product: item.product,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      })
      await reloadOrders()
      setForm(buildEmptyForm(user.storeId))
      setShowCreateModal(false)
      addToast('Sales order created', 'success')
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
  }

  const formatDate = (value) => new Date(value).toLocaleDateString()
  const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Orders</h1>
          <p className="text-text-secondary mt-1">MongoDB-backed sales orders with blockchain integrity verification</p>
        </div>
        {user.role !== 'viewer' && <Button onClick={() => setShowCreateModal(true)}>New Order</Button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Total Orders</p><p className="text-2xl font-bold text-text-primary mt-1"><AnimatedNumber value={stats.total} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Pending</p><p className="text-2xl font-bold text-orange mt-1"><AnimatedNumber value={stats.pending} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Processing</p><p className="text-2xl font-bold text-blue mt-1"><AnimatedNumber value={stats.processing} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Delivered</p><p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={stats.delivered} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Total Value</p><p className="text-2xl font-bold text-purple mt-1">{formatCurrency(stats.totalValue)}</p></div>
      </div>

      <div className="flex flex-wrap gap-4">
        <input type="text" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder="Search orders..." className="flex-1 max-w-xs px-4 py-2 bg-white border border-border rounded-lg text-sm" />
        <div className="flex gap-2">
          {['all', 'pending', 'processing', 'shipped', 'in_transit', 'delivered'].map((status) => (
            <button key={status} onClick={() => { setStatusFilter(status); setCurrentPage(1) }} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${statusFilter === status ? 'bg-blue text-white' : 'bg-white border border-border'}`}>{status}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Order ID</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Customer</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Date</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Total</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Integrity</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr key={order.mongoId} className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors" onClick={() => setSelectedOrder(order)}>
                  <td className="py-3 px-6 text-sm font-medium text-blue">{order.id}</td>
                  <td className="py-3 px-6 text-sm text-text-primary">{order.customer}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{formatDate(order.date)}</td>
                  <td className="py-3 px-6 text-sm font-medium text-text-primary">{formatCurrency(order.total)}</td>
                  <td className="py-3 px-6">{getStatusBadge(order.status)}</td>
                  <td className="py-3 px-6">{getIntegrityBadge(order.verificationStatus)}</td>
                  <td className="py-3 px-6" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSelectedOrder(order)}>View Order</Button>
                      <Button variant="secondary" size="sm" onClick={() => handleVerify(order)}>Verify Integrity</Button>
                      <Button variant="secondary" size="sm" onClick={() => useStore.getState().setActivePage('blockchain')}>View Ledger</Button>
                      <Button variant="secondary" size="sm" onClick={() => useStore.getState().setActivePage('audit')}>View Audit Trail</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {selectedOrder && (
        <Modal title={`Order ${selectedOrder.id}`} onClose={() => setSelectedOrder(null)}>
          <div className="space-y-4">
            <div><label className="text-sm text-text-muted">Customer</label><p className="font-medium text-text-primary">{selectedOrder.customer}</p></div>
            <div><label className="text-sm text-text-muted">Date</label><p className="font-medium text-text-primary">{formatDate(selectedOrder.date)}</p></div>
            <div><label className="text-sm text-text-muted">Total</label><p className="font-medium text-text-primary">{formatCurrency(selectedOrder.total)}</p></div>
            <div><label className="text-sm text-text-muted">Integrity</label><div className="mt-1">{getIntegrityBadge(selectedOrder.verificationStatus)}</div></div>
            {selectedOrder.blockchainHash && <div><label className="text-sm text-text-muted">Ledger Hash</label><p className="font-mono text-xs text-green break-all mt-1">{selectedOrder.blockchainHash}</p></div>}
            <div className="flex gap-2 pt-4 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => handleVerify(selectedOrder)}>Verify Integrity</Button>
              {selectedOrder.status === 'processing' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusUpdate(selectedOrder, 'shipped')}>
                  Mark Shipped
                </Button>
              )}
              {selectedOrder.status === 'shipped' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusUpdate(selectedOrder, 'in_transit')}>
                  Mark In Transit
                </Button>
              )}
              {selectedOrder.status === 'in_transit' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusUpdate(selectedOrder, 'delivered')}>
                  Mark Delivered
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {showCreateModal && (
        <Modal title="Create Sales Order" onClose={() => setShowCreateModal(false)} size="xl">
          <form onSubmit={handleCreateOrder} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Customer</label>
                <select value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                  <option value="">Select customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Store</label>
                <input type="text" value={form.store || user.storeId || ''} onChange={(event) => setForm({ ...form, store: event.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Store ObjectId" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
            </div>

            {form.items.map((item, index) => (
              <div key={`${index}-${item.product}`} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-lg border border-border p-3">
                <div className="md:col-span-6">
                  <label className="block text-sm text-text-secondary mb-1">Product</label>
                  <select value={item.product} onChange={(event) => { const selected = inventory.find((product) => product.id === event.target.value); updateItem(index, 'product', event.target.value); updateItem(index, 'unitPrice', selected?.price || 0) }} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                    <option value="">Select product</option>
                    {inventory.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}
                  </select>
                </div>
                <div className="md:col-span-2"><label className="block text-sm text-text-secondary mb-1">Qty</label><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', Number(event.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" /></div>
                <div className="md:col-span-3"><label className="block text-sm text-text-secondary mb-1">Unit Price</label><input type="number" min="0" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', Number(event.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" /></div>
                <div className="md:col-span-1 flex items-end"><Button type="button" variant="secondary" size="sm" onClick={() => setForm((current) => {
                  const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index)
                  return { ...current, items: nextItems.length > 0 ? nextItems : [{ product: '', quantity: 1, unitPrice: 0 }] }
                })}>Remove</Button></div>
              </div>
            ))}

            <div className="flex justify-between">
              <Button type="button" variant="secondary" onClick={() => setForm((current) => ({ ...current, items: [...current.items, { product: '', quantity: 1, unitPrice: 0 }] }))}>Add Item</Button>
              <div className="w-48">
                <label className="block text-sm text-text-secondary mb-1">Tax Amount</label>
                <input type="number" min="0" value={form.taxAmount} onChange={(event) => setForm({ ...form, taxAmount: Number(event.target.value) })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Order'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
