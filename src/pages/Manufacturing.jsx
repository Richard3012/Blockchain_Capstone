import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/UI/Modal'

const STATUSES = ['All', 'In Progress', 'Planned', 'Completed', 'On Hold']

const initialOrders = [
  { id: 'WO-2401', product: 'Industrial Valve Assembly', bom: 'BOM-IV-12', qty: 500, completed: 480, status: 'In Progress', start: '2026-03-01', due: '2026-03-25', line: 'Line A' },
  { id: 'WO-2402', product: 'Hydraulic Pump Housing', bom: 'BOM-HP-08', qty: 200, completed: 200, status: 'Completed', start: '2026-02-15', due: '2026-03-10', line: 'Line B' },
  { id: 'WO-2403', product: 'Steel Flange (DN150)', bom: 'BOM-SF-22', qty: 1000, completed: 350, status: 'In Progress', start: '2026-03-10', due: '2026-04-05', line: 'Line A' },
  { id: 'WO-2404', product: 'Control Panel Unit', bom: 'BOM-CP-05', qty: 50, completed: 0, status: 'Planned', start: '2026-04-01', due: '2026-04-20', line: 'Line C' },
  { id: 'WO-2405', product: 'Bearing Cage Set', bom: 'BOM-BC-17', qty: 2000, completed: 2000, status: 'Completed', start: '2026-02-01', due: '2026-02-28', line: 'Line B' },
  { id: 'WO-2406', product: 'Coupling Adapter', bom: 'BOM-CA-09', qty: 800, completed: 0, status: 'On Hold', start: '2026-03-15', due: '2026-04-10', line: 'Line A' },
]

const materials = [
  { code: 'RM-STL-01', name: 'Carbon Steel Plate (10mm)', stock: 450, required: 600, unit: 'kg', status: 'low' },
  { code: 'RM-ALU-03', name: 'Aluminium Bar (25mm)', stock: 1200, required: 800, unit: 'kg', status: 'ok' },
  { code: 'RM-COP-02', name: 'Copper Wire (2.5mm)', stock: 80, required: 120, unit: 'kg', status: 'critical' },
  { code: 'RM-RUB-04', name: 'Industrial Rubber Seal', stock: 3500, required: 2000, unit: 'pcs', status: 'ok' },
  { code: 'RM-BRG-05', name: 'Ball Bearing 6205', stock: 200, required: 500, unit: 'pcs', status: 'low' },
]

export default function Manufacturing() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [workOrders, setWorkOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState('All')
  const [tab, setTab] = useState('orders')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ product: '', bom: '', qty: '', line: 'Line A', start: '', due: '', status: 'Planned' })

  const filteredOrders = useMemo(() => {
    const q = (searchQuery || '').toLowerCase()
    return workOrders.filter((o) => {
      if (statusFilter !== 'All' && o.status !== statusFilter) return false
      return o.id.toLowerCase().includes(q) || o.product.toLowerCase().includes(q)
    })
  }, [workOrders, statusFilter, searchQuery])

  const totalQty = workOrders.reduce((s, o) => s + o.qty, 0)
  const totalDone = workOrders.reduce((s, o) => s + o.completed, 0)
  const inProgress = workOrders.filter((o) => o.status === 'In Progress').length
  const completedCount = workOrders.filter((o) => o.status === 'Completed').length

  const openAdd = () => {
    setEditing(null)
    setForm({ product: '', bom: '', qty: '', line: 'Line A', start: '', due: '', status: 'Planned' })
    setShowModal(true)
  }

  const openEdit = (wo) => {
    setEditing(wo)
    setForm({ product: wo.product, bom: wo.bom, qty: wo.qty, line: wo.line, start: wo.start, due: wo.due, status: wo.status })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.product || !form.qty) { addToast('Fill required fields', 'error'); return }
    if (editing) {
      setWorkOrders(prev => prev.map(o => o.id === editing.id ? { ...o, ...form, qty: Number(form.qty) } : o))
      addToast('Work order updated', 'success')
    } else {
      const nextId = `WO-${2400 + workOrders.length + 1}`
      setWorkOrders(prev => [...prev, { ...form, id: nextId, qty: Number(form.qty), completed: 0 }])
      addToast('Work order created', 'success')
    }
    setShowModal(false)
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this work order?')) return
    setWorkOrders(prev => prev.filter(o => o.id !== id))
    addToast('Work order deleted', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Manufacturing & Production</h1>
        <p className="text-text-secondary mt-1">Bill of Materials, work orders, MRP, and production line scheduling for supply chain manufacturing.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Active Work Orders', value: inProgress, sub: `${workOrders.length} total` },
          { label: 'Completed', value: completedCount, sub: 'This quarter' },
          { label: 'Production Yield', value: `${((totalDone / totalQty) * 100).toFixed(1)}%`, sub: `${totalDone.toLocaleString()} / ${totalQty.toLocaleString()} units` },
          { label: 'Material Alerts', value: materials.filter((m) => m.status !== 'ok').length, sub: 'Require attention' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {['orders', 'materials', 'bom'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === t ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
            {t === 'orders' ? 'Work Orders' : t === 'materials' ? 'Material Planning' : 'BOM Management'}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
                    {['Order ID', 'Product', 'BOM', 'Line', 'Qty', 'Progress', 'Due Date', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="border-b border-border hover:bg-gray-50 transition">
                      <td className="p-3 font-mono text-xs text-blue-600">{o.id}</td>
                      <td className="p-3 font-medium text-text-primary">{o.product}</td>
                      <td className="p-3 font-mono text-xs text-text-secondary">{o.bom}</td>
                      <td className="p-3 text-text-secondary">{o.line}</td>
                      <td className="p-3 text-text-primary">{o.qty.toLocaleString()}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${o.completed >= o.qty ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${(o.completed / o.qty) * 100}%` }} />
                          </div>
                          <span className="text-xs font-medium">{((o.completed / o.qty) * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-text-secondary">{o.due}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          o.status === 'Completed' ? 'bg-green-100 text-green-700' :
                          o.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                          o.status === 'On Hold' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{o.status}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(o)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                          <button onClick={() => handleDelete(o.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
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
      )}

      {tab === 'materials' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Material Requirements Planning (MRP)</h2>
            <p className="text-xs text-text-secondary mt-1">Real-time stock vs. demand for active work orders</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  {['Code', 'Material', 'In Stock', 'Required', 'Unit', 'Status'].map((h) => (
                    <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.code} className="border-b border-border hover:bg-gray-50 transition">
                    <td className="p-3 font-mono text-xs text-blue-600">{m.code}</td>
                    <td className="p-3 font-medium text-text-primary">{m.name}</td>
                    <td className="p-3 text-text-primary">{m.stock.toLocaleString()}</td>
                    <td className="p-3 text-text-primary">{m.required.toLocaleString()}</td>
                    <td className="p-3 text-text-secondary">{m.unit}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.status === 'ok' ? 'bg-green-100 text-green-700' :
                        m.status === 'low' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{m.status === 'ok' ? 'Sufficient' : m.status === 'low' ? 'Low Stock' : 'Critical'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'bom' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Bill of Materials</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[
              { title: 'BOM Creation', desc: 'Define multi-level BOMs with parent-child assemblies, quantities, and routing operations.' },
              { title: 'Version Control', desc: 'Track revisions with change history, approval workflows, and effective dates.' },
              { title: 'Cost Roll-Up', desc: 'Auto-calculate material, labour, and overhead costs from component-level pricing.' },
              { title: 'Where-Used Analysis', desc: 'Trace which finished goods use a specific raw material or sub-assembly.' },
              { title: 'Substitution Rules', desc: 'Define alternate materials with priority and conditions for automatic substitution.' },
              { title: 'Yield Management', desc: 'Configure scrap factors, by-products, and co-products in production recipes.' },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-background p-4">
                <p className="font-medium text-text-primary">{item.title}</p>
                <p className="text-xs text-text-secondary mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Create/Edit Work Order Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Work Order' : 'Create Work Order'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Product Name *</label>
            <input value={form.product} onChange={(e) => setForm({...form, product: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Product to manufacture" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">BOM Reference</label>
              <input value={form.bom} onChange={(e) => setForm({...form, bom: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="BOM-XX-00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Quantity *</label>
              <input type="number" value={form.qty} onChange={(e) => setForm({...form, qty: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Units" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Production Line</label>
              <select value={form.line} onChange={(e) => setForm({...form, line: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {['Line A', 'Line B', 'Line C'].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {STATUSES.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Start Date</label>
              <input type="date" value={form.start} onChange={(e) => setForm({...form, start: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Due Date</label>
              <input type="date" value={form.due} onChange={(e) => setForm({...form, due: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing ? 'Update' : 'Create Work Order'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
