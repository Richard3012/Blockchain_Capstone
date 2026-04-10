import { useState, useEffect, useMemo, useCallback } from 'react'
import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const STATUS_OPTS = ['All', 'draft', 'approved', 'received', 'cancelled']
const emptyForm = () => ({ supplier: '', items: [{ description: '', quantity: 1, unitPrice: 0 }], notes: '' })

export default function Procurement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)

  const [pos, setPos] = useState([])
  const [receipts, setReceipts] = useState([])
  const [tab, setTab] = useState('pos')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [showReceipt, setShowReceipt] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [loadingData, setLoadingData] = useState(true)

  const loadData = useCallback(async () => {
    setLoadingData(true)
    try {
      const [poData, grData] = await Promise.all([
        apiClient.get('/procurement/purchase-orders').catch(() => []),
        apiClient.get('/procurement/goods-receipts').catch(() => []),
      ])
      setPos(Array.isArray(poData) ? poData : [])
      setReceipts(Array.isArray(grData) ? grData : [])
    } catch { /* ignore */ }
    setLoadingData(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = useMemo(() => {
    const q = (searchQuery || '').toLowerCase()
    const list = tab === 'pos' ? pos : receipts
    return list.filter((item) => {
      if (tab === 'pos' && statusFilter !== 'All' && item.status !== statusFilter) return false
      const text = JSON.stringify(item).toLowerCase()
      return text.includes(q)
    })
  }, [pos, receipts, tab, statusFilter, searchQuery])

  const handleCreatePO = async () => {
    if (!form.supplier.trim()) return addToast('Supplier name is required', 'error')
    if (form.items.some((i) => !i.description.trim() || i.quantity < 1)) return addToast('Fill all item rows', 'error')
    setSaving(true)
    try {
      await apiClient.post('/procurement/purchase-orders', {
        supplier: form.supplier,
        items: form.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
        notes: form.notes,
      })
      addToast('Purchase Order created', 'success')
      setShowCreate(false)
      setForm(emptyForm())
      loadData()
    } catch (err) { addToast(err.message, 'error') }
    setSaving(false)
  }

  const handleGoodsReceipt = async (po) => {
    setSaving(true)
    try {
      await apiClient.post('/procurement/goods-receipts', { purchaseOrderId: po._id })
      addToast('Goods Receipt recorded', 'success')
      setShowReceipt(null)
      loadData()
    } catch (err) { addToast(err.message, 'error') }
    setSaving(false)
  }

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { description: '', quantity: 1, unitPrice: 0 }] }))
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx, key, val) => setForm((f) => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it) }))

  const totalValue = pos.reduce((s, p) => s + (p.totalAmount || p.items?.reduce((a, i) => a + i.quantity * i.unitPrice, 0) || 0), 0)
  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Procurement</h1>
          <p className="text-text-secondary mt-1">Purchase orders, goods receipts, and supplier management.</p>
        </div>
        <button onClick={() => { setForm(emptyForm()); setShowCreate(true) }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + New Purchase Order
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total POs', value: pos.length, sub: 'All time' },
          { label: 'Open POs', value: pos.filter((p) => p.status === 'draft' || p.status === 'approved').length, sub: 'Awaiting receipt' },
          { label: 'Goods Receipts', value: receipts.length, sub: 'Completed' },
          { label: 'PO Value', value: fmt(totalValue), sub: 'Total' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-4 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {['pos', 'receipts'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === t ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
              {t === 'pos' ? 'Purchase Orders' : 'Goods Receipts'}
            </button>
          ))}
        </div>
        {tab === 'pos' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        {loadingData ? (
          <p className="text-center text-sm text-text-muted py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-12">
            {tab === 'pos' ? 'No purchase orders yet. Click "+ New Purchase Order" to create one.' : 'No goods receipts recorded yet.'}
          </p>
        ) : tab === 'pos' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  {['PO #', 'Supplier', 'Items', 'Total', 'Status', 'Date', 'Actions'].map((h) => (
                    <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => {
                  const total = po.totalAmount || po.items?.reduce((a, i) => a + i.quantity * i.unitPrice, 0) || 0
                  return (
                    <tr key={po._id} className="border-b border-border hover:bg-gray-50 transition">
                      <td className="p-3 font-mono text-xs text-blue-600">{po.poNumber || po._id?.slice(-6)}</td>
                      <td className="p-3 font-medium text-text-primary">{po.supplier}</td>
                      <td className="p-3 text-text-secondary">{po.items?.length || 0}</td>
                      <td className="p-3 font-semibold text-text-primary">{fmt(total)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          po.status === 'approved' ? 'bg-green-100 text-green-700' :
                          po.status === 'received' ? 'bg-blue-100 text-blue-700' :
                          po.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{po.status}</span>
                      </td>
                      <td className="p-3 text-text-secondary text-xs">{po.createdAt ? new Date(po.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="p-3">
                        {(po.status === 'approved' || po.status === 'draft') && (
                          <button onClick={() => setShowReceipt(po)}
                            className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition">
                            Record Receipt
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  {['GR #', 'PO Reference', 'Items', 'Date'].map((h) => (
                    <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((gr) => (
                  <tr key={gr._id} className="border-b border-border hover:bg-gray-50 transition">
                    <td className="p-3 font-mono text-xs text-blue-600">{gr.grNumber || gr._id?.slice(-6)}</td>
                    <td className="p-3 text-text-secondary">{gr.purchaseOrder?.poNumber || gr.purchaseOrderId?.slice(-6) || '—'}</td>
                    <td className="p-3 text-text-secondary">{gr.items?.length || '—'}</td>
                    <td className="p-3 text-text-secondary text-xs">{gr.createdAt ? new Date(gr.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create PO Modal */}
      {showCreate && (
        <Modal title="New Purchase Order" onClose={() => setShowCreate(false)} size="xl">
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Supplier Name</label>
              <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm" placeholder="Enter supplier name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Line Items</label>
              {form.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm" placeholder="Description" />
                  <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    className="w-20 border border-border rounded-lg px-3 py-2 text-sm" placeholder="Qty" />
                  <input type="number" min="0" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                    className="w-28 border border-border rounded-lg px-3 py-2 text-sm" placeholder="Unit Price" />
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="px-2 text-red-500 hover:text-red-700 text-lg">×</button>
                  )}
                </div>
              ))}
              <button onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-1">+ Add Item</button>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Optional notes" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
              <button onClick={handleCreatePO} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Goods Receipt Confirmation */}
      {showReceipt && (
        <Modal title="Record Goods Receipt" onClose={() => setShowReceipt(null)} size="md">
          <div className="p-6 space-y-4">
            <p className="text-sm text-text-secondary">
              Confirm receipt of goods for PO <span className="font-semibold text-text-primary">{showReceipt.poNumber || showReceipt._id?.slice(-6)}</span> from <span className="font-semibold text-text-primary">{showReceipt.supplier}</span>?
            </p>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs font-medium text-text-muted mb-2">Items:</p>
              {showReceipt.items?.map((item, i) => (
                <p key={i} className="text-sm text-text-primary">{item.description} — Qty: {item.quantity}</p>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowReceipt(null)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
              <button onClick={() => handleGoodsReceipt(showReceipt)} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Recording...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
