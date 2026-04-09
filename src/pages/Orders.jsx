import { useMemo, useState } from 'react'

import AnimatedNumber from '../components/UI/AnimatedNumber'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import { invalidateLiveData, useLiveData } from '../hooks/useLiveData'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

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
  const setActivePage = useStore((state) => state.setActivePage)
  const user = useStore((state) => state.user)

  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showModifyModal, setShowModifyModal] = useState(false)
  const [form, setForm] = useState(buildEmptyForm(user.storeId))
  const [modifyForm, setModifyForm] = useState({ dueDate: '', taxAmount: 0, items: [] })
  const [saving, setSaving] = useState(false)
  const pageSize = 20

  const stats = getOrderStats()
  const canCreateOrders = ['admin', 'store_manager', 'sales_staff', 'procurement_manager'].includes(user.role)
  const canProgressOrders = ['admin', 'inventory_manager'].includes(user.role)
  const canModifyOrders = ['admin', 'inventory_manager'].includes(user.role)
  const isInventoryManager = user.role === 'inventory_manager'

  const reloadOrders = async () => {
    invalidateLiveData('orders', 'audit', 'blockchain')
    const rows = await apiClient.get('/orders')
    setOrders(rows.map((order) => ({
      mongoId: order._id,
      id: order.orderNumber || order._id,
      customer: order.customer?.name || '-',
      amount: order.totalAmount || 0,
      total: order.totalAmount || 0,
      items: Array.isArray(order.items) ? order.items.length : 0,
      status: String(order.status || 'pending').toLowerCase(),
      date: order.createdAt,
      blockchainHash: order.blockchainHash || order.hash || '',
      verificationStatus: order.verificationStatus || 'not_requested',
    })))
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query
        || order.id.toLowerCase().includes(query)
        || order.customer.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [orders, localSearch, searchQuery, statusFilter])

  const paginatedOrders = useMemo(() => filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filteredOrders, currentPage])
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))

  const getStatusBadge = (status) => {
    const variants = {
      pending: 'warning',
      processing: 'info',
      shipped: 'purple',
      in_transit: 'info',
      delivered: 'success',
      cancelled: 'error',
    }
    return <Badge variant={variants[status] || 'default'}>{String(status).replace(/_/g, ' ')}</Badge>
  }

  const getIntegrityBadge = (status) => {
    const normalized = String(status || 'not_requested').toLowerCase()
    if (normalized === 'verified') return <Badge variant="success">Verified</Badge>
    if (normalized === 'failed') return <Badge variant="error">Tampered</Badge>
    if (normalized === 'pending') return <Badge variant="warning">Pending Verification</Badge>
    return <Badge variant="default">Not Anchored</Badge>
  }

  const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-')
  const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0)

  const loadOrderDetail = async (order) => {
    const detail = await apiClient.get(`/orders/${order.mongoId}`)
    setSelectedOrder(order)
    setSelectedOrderDetail(detail)
    return detail
  }

  const handleStatusUpdate = async (order, newStatus) => {
    try {
      await apiClient.put(`/orders/${order.mongoId}/status`, { status: newStatus })
      await reloadOrders()
      addToast(`Order ${order.id} updated to ${String(newStatus).replace(/_/g, ' ')}`, 'success')
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
      addToast(error.message || 'Unable to create order', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openModifyOrder = async (order) => {
    try {
      const detail = await loadOrderDetail(order)
      setModifyForm({
        dueDate: detail.dueDate ? new Date(detail.dueDate).toISOString().split('T')[0] : '',
        taxAmount: detail.taxAmount || 0,
        items: (detail.items || []).map((item) => ({
          product: item.product?._id || item.product,
          productName: item.product?.name || 'Product',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      })
      setShowModifyModal(true)
    } catch (error) {
      addToast(error.message || 'Unable to load order for modification', 'error')
    }
  }

  const handleModifyOrder = async (event) => {
    event.preventDefault()
    setSaving(true)

    try {
      await apiClient.patch(`/orders/${selectedOrder.mongoId}`, {
        dueDate: modifyForm.dueDate || null,
        taxAmount: Number(modifyForm.taxAmount || 0),
        items: modifyForm.items.map((item) => ({
          product: item.product,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      })

      await reloadOrders()
      setShowModifyModal(false)
      addToast(`Order ${selectedOrder.id} modified. Run Verify Integrity to demonstrate tampering detection.`, 'warning')
    } catch (error) {
      addToast(error.message || 'Unable to modify order', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateCreateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
  }

  const updateModifyItem = (index, key, value) => {
    setModifyForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Orders</h1>
          <p className="text-text-secondary mt-1">MongoDB-backed sales orders with blockchain integrity verification.</p>
        </div>
        {canCreateOrders && <Button onClick={() => setShowCreateModal(true)}>New Order</Button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Total Orders</p><p className="text-2xl font-bold text-text-primary mt-1"><AnimatedNumber value={stats.total} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Pending</p><p className="text-2xl font-bold text-orange mt-1"><AnimatedNumber value={stats.pending} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Processing</p><p className="text-2xl font-bold text-blue mt-1"><AnimatedNumber value={stats.processing} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">In Transit</p><p className="text-2xl font-bold text-cyan mt-1"><AnimatedNumber value={stats.inTransit || 0} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Delivered</p><p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={stats.delivered} /></p></div>
      </div>

      <div className="flex flex-wrap gap-4">
        <input type="text" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder="Search orders..." className="flex-1 max-w-xs px-4 py-2 bg-white border border-border rounded-lg text-sm" />
        <div className="flex gap-2">
          {['all', 'pending', 'processing', 'shipped', 'in_transit', 'delivered'].map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setCurrentPage(1) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${statusFilter === status ? 'bg-blue text-white' : 'bg-white border border-border'}`}
            >
              {status.replace(/_/g, ' ')}
            </button>
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
                <tr key={order.mongoId} className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors" onClick={() => loadOrderDetail(order)}>
                  <td className="py-3 px-6 text-sm font-medium text-blue">{order.id}</td>
                  <td className="py-3 px-6 text-sm text-text-primary">{order.customer}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{formatDate(order.date)}</td>
                  <td className="py-3 px-6 text-sm font-medium text-text-primary">{formatCurrency(order.total)}</td>
                  <td className="py-3 px-6">{getStatusBadge(order.status)}</td>
                  <td className="py-3 px-6">{getIntegrityBadge(order.verificationStatus)}</td>
                  <td className="py-3 px-6" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => loadOrderDetail(order)}>View Order</Button>
                      <Button variant="secondary" size="sm" onClick={() => handleVerify(order)}>Verify Integrity</Button>
                      {canModifyOrders && <Button variant="secondary" size="sm" onClick={() => openModifyOrder(order)}>Modify Order</Button>}
                      <Button variant="secondary" size="sm" onClick={() => setActivePage('blockchain')}>View Ledger</Button>
                      <Button variant="secondary" size="sm" onClick={() => setActivePage('audit')}>View Audit Trail</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {filteredOrders.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {selectedOrder && (
        <Modal title={`Order ${selectedOrder.id}`} onClose={() => { setSelectedOrder(null); setSelectedOrderDetail(null) }}>
          <div className="space-y-4">
            <div><label className="text-sm text-text-muted">Customer</label><p className="font-medium text-text-primary">{selectedOrder.customer}</p></div>
            <div><label className="text-sm text-text-muted">Date</label><p className="font-medium text-text-primary">{formatDate(selectedOrder.date)}</p></div>
            <div><label className="text-sm text-text-muted">Total</label><p className="font-medium text-text-primary">{formatCurrency(selectedOrder.total)}</p></div>
            <div><label className="text-sm text-text-muted">Integrity</label><div className="mt-1">{getIntegrityBadge(selectedOrder.verificationStatus)}</div></div>
            {selectedOrderDetail?.items?.length > 0 && (
              <div>
                <label className="text-sm text-text-muted">Items</label>
                <div className="mt-2 space-y-2">
                  {selectedOrderDetail.items.map((item, index) => (
                    <div key={`${selectedOrder.id}-item-${index}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="text-text-primary">{item.product?.name || item.product}</span>
                      <span className="text-text-secondary">{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedOrder.blockchainHash && (
              <div>
                <label className="text-sm text-text-muted">Ledger Hash</label>
                <p className="font-mono text-xs text-green break-all mt-1">{selectedOrder.blockchainHash}</p>
              </div>
            )}
            <div className="flex gap-2 pt-4 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => handleVerify(selectedOrder)}>Verify Integrity</Button>
              {canProgressOrders && selectedOrder.status === 'processing' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusUpdate(selectedOrder, 'shipped')}>
                  {isInventoryManager ? 'Release Order' : 'Mark Shipped'}
                </Button>
              )}
              {canProgressOrders && selectedOrder.status === 'shipped' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusUpdate(selectedOrder, 'in_transit')}>
                  Dispatch to Store
                </Button>
              )}
              {canProgressOrders && selectedOrder.status === 'in_transit' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusUpdate(selectedOrder, 'delivered')}>
                  Mark Fulfilled
                </Button>
              )}
              {canModifyOrders && <Button variant="secondary" size="sm" onClick={() => openModifyOrder(selectedOrder)}>Modify Order</Button>}
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
              <div key={`create-item-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-lg border border-border p-3">
                <div className="md:col-span-6">
                  <label className="block text-sm text-text-secondary mb-1">Product</label>
                  <select
                    value={item.product}
                    onChange={(event) => {
                      const selected = inventory.find((product) => product.id === event.target.value)
                      updateCreateItem(index, 'product', event.target.value)
                      updateCreateItem(index, 'unitPrice', selected?.price || 0)
                    }}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  >
                    <option value="">Select product</option>
                    {inventory.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-text-secondary mb-1">Qty</label>
                  <input type="number" min="1" value={item.quantity} onChange={(event) => updateCreateItem(index, 'quantity', Number(event.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm text-text-secondary mb-1">Unit Price</label>
                  <input type="number" min="0" value={item.unitPrice} onChange={(event) => updateCreateItem(index, 'unitPrice', Number(event.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div className="md:col-span-1 flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setForm((current) => {
                      const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index)
                      return { ...current, items: nextItems.length > 0 ? nextItems : [{ product: '', quantity: 1, unitPrice: 0 }] }
                    })}
                  >
                    Remove
                  </Button>
                </div>
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

      {showModifyModal && selectedOrder && (
        <Modal title={`Modify ${selectedOrder.id}`} onClose={() => setShowModifyModal(false)} size="xl">
          <form onSubmit={handleModifyOrder} className="space-y-5">
            <div className="rounded-lg border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-text-secondary">
              This controlled demo edit updates the MongoDB order without replacing the original anchored baseline. After saving, use Verify Integrity to demonstrate blockchain-backed tamper detection.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Due Date</label>
                <input type="date" value={modifyForm.dueDate} onChange={(event) => setModifyForm((current) => ({ ...current, dueDate: event.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Tax Amount</label>
                <input type="number" min="0" value={modifyForm.taxAmount} onChange={(event) => setModifyForm((current) => ({ ...current, taxAmount: Number(event.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
            </div>
            {modifyForm.items.map((item, index) => (
              <div key={`modify-item-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-lg border border-border p-3">
                <div className="md:col-span-6">
                  <label className="block text-sm text-text-secondary mb-1">Product</label>
                  <input value={item.productName} disabled className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-gray-50" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm text-text-secondary mb-1">Quantity</label>
                  <input type="number" min="1" value={item.quantity} onChange={(event) => updateModifyItem(index, 'quantity', Number(event.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm text-text-secondary mb-1">Unit Price</label>
                  <input type="number" min="0" value={item.unitPrice} onChange={(event) => updateModifyItem(index, 'unitPrice', Number(event.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="secondary" onClick={() => setShowModifyModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Demo Modification'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
