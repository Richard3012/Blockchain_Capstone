import { useEffect, useMemo, useState, useCallback } from 'react'

import Badge from '../components/UI/Badge'
import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const TABS = ['products', 'suppliers', 'stores']
const emptyProduct = () => ({ name: '', sku: '', category: '', unitPrice: 0, reorderLevel: 10, currentStock: 0 })
const emptySupplier = () => ({ name: '', code: '', email: '', phone: '', paymentTermsDays: 30 })
const emptyStore = () => ({ name: '', code: '', address: '', type: 'store' })

export default function MasterData() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)

  const [tab, setTab] = useState('products')
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [stores, setStores] = useState([])
  const [showModal, setShowModal] = useState(null) // 'product' | 'supplier' | 'store'
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s, st] = await Promise.all([
        apiClient.get('/products').catch(() => []),
        apiClient.get('/suppliers').catch(() => []),
        apiClient.get('/stores').catch(() => []),
      ])
      setProducts(Array.isArray(p) ? p : [])
      setSuppliers(Array.isArray(s) ? s : [])
      setStores(Array.isArray(st) ? st : [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const q = (searchQuery || '').toLowerCase()
  const filteredProducts = products.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q))
  const filteredSuppliers = suppliers.filter((s) => `${s.name} ${s.code} ${s.email}`.toLowerCase().includes(q))
  const filteredStores = stores.filter((s) => `${s.name} ${s.code} ${s.address}`.toLowerCase().includes(q))

  const openCreate = (type) => {
    setEditId(null)
    setForm(type === 'product' ? emptyProduct() : type === 'supplier' ? emptySupplier() : emptyStore())
    setShowModal(type)
  }
  const openEdit = (type, item) => {
    setEditId(item._id)
    setForm({ ...item })
    setShowModal(type)
  }

  const handleSave = async () => {
    const endpoint = showModal === 'product' ? '/products' : showModal === 'supplier' ? '/suppliers' : '/stores'
    if (!form.name?.trim()) return addToast('Name is required', 'error')
    setSaving(true)
    try {
      if (editId) {
        await apiClient.patch(`${endpoint}/${editId}`, form)
        addToast(`${showModal} updated`, 'success')
      } else {
        await apiClient.post(endpoint, form)
        addToast(`${showModal} created`, 'success')
      }
      setShowModal(null)
      loadData()
    } catch (err) { addToast(err.message, 'error') }
    setSaving(false)
  }

  const handleDelete = async (type, id) => {
    setDeleting(id)
    const endpoint = type === 'products' ? '/products' : type === 'suppliers' ? '/suppliers' : '/stores'
    try {
      await apiClient.delete(`${endpoint}/${id}`)
      addToast('Record deleted', 'success')
      loadData()
    } catch (err) { addToast(err.message, 'error') }
    setDeleting(null)
  }

  const upd = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Master Data</h1>
          <p className="text-text-secondary mt-1">Products, suppliers, stores, and warehouses that drive ERP transactions.</p>
        </div>
        <button onClick={() => openCreate(tab === 'products' ? 'product' : tab === 'suppliers' ? 'supplier' : 'store')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + Add {tab === 'products' ? 'Product' : tab === 'suppliers' ? 'Supplier' : 'Store'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Products', value: products.length },
          { label: 'Suppliers', value: suppliers.length },
          { label: 'Stores', value: stores.filter((s) => s.type === 'store').length },
          { label: 'Warehouses', value: stores.filter((s) => s.type === 'warehouse').length },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-4 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition capitalize ${tab === t ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Products Table */}
      {tab === 'products' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          {loading ? <p className="text-center text-sm text-text-muted py-12">Loading...</p> : filteredProducts.length === 0 ? (
            <p className="text-center text-sm text-text-muted py-12">No products found. Add your first product.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    {['SKU', 'Product Name', 'Category', 'Price', 'Stock', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p._id} className="border-b border-border hover:bg-gray-50 transition">
                      <td className="p-3 font-mono text-xs text-blue-600">{p.sku}</td>
                      <td className="p-3 font-medium text-text-primary">{p.name}</td>
                      <td className="p-3 text-text-secondary">{p.category || '—'}</td>
                      <td className="p-3 text-text-primary">₹{(p.unitPrice || 0).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-text-primary">{p.currentStock ?? 0}</td>
                      <td className="p-3"><Badge>{(p.currentStock ?? 0) <= (p.reorderLevel ?? 0) ? 'Low Stock' : 'In Stock'}</Badge></td>
                      <td className="p-3 flex gap-2">
                        <button onClick={() => openEdit('product', p)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => handleDelete('products', p._id)} disabled={deleting === p._id} className="text-xs text-red-600 hover:underline">{deleting === p._id ? '...' : 'Delete'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Suppliers Table */}
      {tab === 'suppliers' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          {loading ? <p className="text-center text-sm text-text-muted py-12">Loading...</p> : filteredSuppliers.length === 0 ? (
            <p className="text-center text-sm text-text-muted py-12">No suppliers found. Add your first supplier.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    {['Code', 'Supplier Name', 'Email', 'Phone', 'Payment Terms', 'Actions'].map((h) => (
                      <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map((s) => (
                    <tr key={s._id} className="border-b border-border hover:bg-gray-50 transition">
                      <td className="p-3 font-mono text-xs text-blue-600">{s.code}</td>
                      <td className="p-3 font-medium text-text-primary">{s.name}</td>
                      <td className="p-3 text-text-secondary">{s.email || '—'}</td>
                      <td className="p-3 text-text-secondary">{s.phone || '—'}</td>
                      <td className="p-3 text-text-secondary">{s.paymentTermsDays || 0} days</td>
                      <td className="p-3 flex gap-2">
                        <button onClick={() => openEdit('supplier', s)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => handleDelete('suppliers', s._id)} disabled={deleting === s._id} className="text-xs text-red-600 hover:underline">{deleting === s._id ? '...' : 'Delete'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stores Table */}
      {tab === 'stores' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          {loading ? <p className="text-center text-sm text-text-muted py-12">Loading...</p> : filteredStores.length === 0 ? (
            <p className="text-center text-sm text-text-muted py-12">No stores found. Add your first store.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    {['Code', 'Store Name', 'Type', 'Address', 'Actions'].map((h) => (
                      <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map((s) => (
                    <tr key={s._id} className="border-b border-border hover:bg-gray-50 transition">
                      <td className="p-3 font-mono text-xs text-blue-600">{s.code}</td>
                      <td className="p-3 font-medium text-text-primary">{s.name}</td>
                      <td className="p-3"><Badge variant={s.type === 'warehouse' ? 'warning' : 'success'}>{s.type}</Badge></td>
                      <td className="p-3 text-text-secondary">{s.address || '—'}</td>
                      <td className="p-3 flex gap-2">
                        <button onClick={() => openEdit('store', s)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => handleDelete('stores', s._id)} disabled={deleting === s._id} className="text-xs text-red-600 hover:underline">{deleting === s._id ? '...' : 'Delete'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal title={`${editId ? 'Edit' : 'New'} ${showModal}`} onClose={() => setShowModal(null)} size="md">
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
              <input value={form.name || ''} onChange={(e) => upd('name', e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            {showModal === 'product' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">SKU</label>
                    <input value={form.sku || ''} onChange={(e) => upd('sku', e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Category</label>
                    <input value={form.category || ''} onChange={(e) => upd('category', e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Unit Price</label>
                    <input type="number" value={form.unitPrice || 0} onChange={(e) => upd('unitPrice', Number(e.target.value))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Current Stock</label>
                    <input type="number" value={form.currentStock || 0} onChange={(e) => upd('currentStock', Number(e.target.value))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Reorder Level</label>
                    <input type="number" value={form.reorderLevel || 0} onChange={(e) => upd('reorderLevel', Number(e.target.value))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </>
            )}
            {showModal === 'supplier' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Code</label>
                    <input value={form.code || ''} onChange={(e) => upd('code', e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Payment Terms (days)</label>
                    <input type="number" value={form.paymentTermsDays || 30} onChange={(e) => upd('paymentTermsDays', Number(e.target.value))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
                    <input type="email" value={form.email || ''} onChange={(e) => upd('email', e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Phone</label>
                    <input value={form.phone || ''} onChange={(e) => upd('phone', e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </>
            )}
            {showModal === 'store' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Code</label>
                    <input value={form.code || ''} onChange={(e) => upd('code', e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Type</label>
                    <select value={form.type || 'store'} onChange={(e) => upd('type', e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                      <option value="store">Store</option>
                      <option value="warehouse">Warehouse</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Address</label>
                  <input value={form.address || ''} onChange={(e) => upd('address', e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(null)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
