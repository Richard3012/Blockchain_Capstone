import { useEffect, useMemo, useState } from 'react'

import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const STATUSES = ['All', 'In Progress', 'Planned', 'Completed', 'On Hold']

export default function Manufacturing() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [workOrders, setWorkOrders] = useState([])
  const [materials, setMaterials] = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [tab, setTab] = useState('orders')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ product: '', bom: '', qty: '', line: 'Line A', start: '', due: '', status: 'Planned' })

  const loadManufacturing = async () => {
    setLoading(true)
    try {
      const data = await apiClient.get('/manufacturing')
      setWorkOrders(data?.workOrders || [])
      setMaterials(data?.materials || [])
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadManufacturing()
  }, [])

  const filteredOrders = useMemo(() => {
    const query = (searchQuery || '').toLowerCase()
    return workOrders.filter((order) => {
      if (statusFilter !== 'All' && order.status !== statusFilter) return false
      return order.workOrderNumber?.toLowerCase().includes(query) || order.product?.toLowerCase().includes(query)
    })
  }, [workOrders, statusFilter, searchQuery])

  const totalQty = workOrders.reduce((sum, order) => sum + (order.qty || 0), 0)
  const totalDone = workOrders.reduce((sum, order) => sum + (order.completed || 0), 0)
  const inProgress = workOrders.filter((order) => order.status === 'In Progress').length
  const completedCount = workOrders.filter((order) => order.status === 'Completed').length

  const openAdd = () => {
    setEditing(null)
    setForm({ product: '', bom: '', qty: '', line: 'Line A', start: '', due: '', status: 'Planned' })
    setShowModal(true)
  }

  const openEdit = (order) => {
    setEditing(order)
    setForm({
      product: order.product,
      bom: order.bom || '',
      qty: String(order.qty || ''),
      line: order.line || 'Line A',
      start: order.start ? new Date(order.start).toISOString().slice(0, 10) : '',
      due: order.due ? new Date(order.due).toISOString().slice(0, 10) : '',
      status: order.status,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.product.trim() || !form.qty) {
      addToast('Fill required fields', 'error')
      return
    }
    setSaving(true)
    const payload = {
      product: form.product,
      bom: form.bom,
      qty: Number(form.qty),
      line: form.line,
      start: form.start || null,
      due: form.due || null,
      status: form.status,
    }
    try {
      if (editing) {
        await apiClient.patch(`/manufacturing/work-orders/${editing._id}`, payload)
        addToast('Work order updated', 'success')
      } else {
        await apiClient.post('/manufacturing/work-orders', payload)
        addToast('Work order created', 'success')
      }
      setShowModal(false)
      await loadManufacturing()
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this work order?')) return
    try {
      await apiClient.delete(`/manufacturing/work-orders/${id}`)
      addToast('Work order deleted', 'success')
      await loadManufacturing()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Manufacturing & Production</h1>
        <p className="text-text-secondary mt-1">Work orders and MRP data loaded from MongoDB-backed manufacturing records.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Active Work Orders', value: inProgress, sub: `${workOrders.length} total` },
          { label: 'Completed', value: completedCount, sub: 'This quarter' },
          { label: 'Production Yield', value: `${totalQty > 0 ? ((totalDone / totalQty) * 100).toFixed(1) : '0.0'}%`, sub: `${totalDone.toLocaleString()} / ${totalQty.toLocaleString()} units` },
          { label: 'Material Alerts', value: materials.filter((material) => material.status !== 'ok').length, sub: 'Require attention' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {['orders', 'materials', 'bom'].map((value) => (
          <button key={value} onClick={() => setTab(value)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === value ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
            {value === 'orders' ? 'Work Orders' : value === 'materials' ? 'Material Planning' : 'BOM Management'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading manufacturing data...</div>
      ) : tab === 'orders' ? (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button onClick={openAdd} className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
              + Create Work Order
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    {['Order ID', 'Product', 'BOM', 'Line', 'Qty', 'Progress', 'Due Date', 'Status', 'Actions'].map((heading) => (
                      <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order._id} className="border-b border-border hover:bg-gray-50 transition">
                      <td className="p-3 font-mono text-xs text-blue-600">{order.workOrderNumber}</td>
                      <td className="p-3 font-medium text-text-primary">{order.product}</td>
                      <td className="p-3 font-mono text-xs text-text-secondary">{order.bom}</td>
                      <td className="p-3 text-text-secondary">{order.line}</td>
                      <td className="p-3 text-text-primary">{(order.qty || 0).toLocaleString()}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden ring-1 ring-slate-300/70">
                            <div
                              className={`h-full rounded-full progress-bar ${(order.completed || 0) >= (order.qty || 0) ? 'bg-emerald-500' : 'bg-blue-600'}`}
                              style={{ width: `${Math.max(order.qty > 0 ? ((order.completed || 0) / order.qty) * 100 : 0, 4)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{order.qty > 0 ? (((order.completed || 0) / order.qty) * 100).toFixed(0) : 0}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-text-secondary">{order.due ? new Date(order.due).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          order.status === 'Completed' ? 'bg-green-100 text-green-700' : order.status === 'In Progress' ? 'bg-blue-100 text-blue-700' : order.status === 'On Hold' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                        }`}>{order.status}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(order)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                          <button onClick={() => handleDelete(order._id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && <p className="text-center text-sm text-text-muted py-8">No work orders match your filters.</p>}
          </div>
        </>
      ) : tab === 'materials' ? (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Material Requirements Planning (MRP)</h2>
            <p className="text-xs text-text-secondary mt-1">Real-time stock vs. demand for active work orders</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  {['Code', 'Material', 'In Stock', 'Required', 'Unit', 'Status'].map((heading) => (
                    <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materials.map((material) => (
                  <tr key={material._id} className="border-b border-border hover:bg-gray-50 transition">
                    <td className="p-3 font-mono text-xs text-blue-600">{material.code}</td>
                    <td className="p-3 font-medium text-text-primary">{material.name}</td>
                    <td className="p-3 text-text-primary">{material.stock.toLocaleString()}</td>
                    <td className="p-3 text-text-primary">{material.required.toLocaleString()}</td>
                    <td className="p-3 text-text-secondary">{material.unit}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        material.status === 'ok' ? 'bg-green-100 text-green-700' : material.status === 'low' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}>{material.status === 'ok' ? 'Sufficient' : material.status === 'low' ? 'Low Stock' : 'Critical'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Bill of Materials</h2>
          <p className="text-sm text-text-secondary">Manufacturing records are live. BOM authoring remains staged behind the work-order and MRP data already fetched from MongoDB.</p>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Work Order' : 'Create Work Order'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Product Name *</label>
            <input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Product to manufacture" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">BOM Reference</label>
              <input value={form.bom} onChange={(e) => setForm({ ...form, bom: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="BOM-XX-00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Quantity *</label>
              <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Units" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Production Line</label>
              <select value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {['Line A', 'Line B', 'Line C'].map((line) => <option key={line} value={line}>{line}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {STATUSES.filter((status) => status !== 'All').map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Start Date</label>
              <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Due Date</label>
              <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Work Order'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
