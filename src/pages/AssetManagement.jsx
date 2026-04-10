import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/UI/Modal'

const TYPES = ['All', 'Vehicle', 'Machinery', 'IT Equipment', 'Furniture', 'Infrastructure']
const COND = ['All', 'Excellent', 'Good', 'Fair', 'Needs Repair']

const initialAssets = [
  { id: 'AST-001', name: 'Tata 407 Delivery Truck', type: 'Vehicle', location: 'Fleet Yard', purchaseDate: '2023-06-15', cost: 850000, depValue: 620000, condition: 'Good', nextService: '2026-04-10' },
  { id: 'AST-002', name: 'Crown Reach Forklift', type: 'Machinery', location: 'Warehouse A', purchaseDate: '2022-01-20', cost: 1200000, depValue: 780000, condition: 'Excellent', nextService: '2026-05-01' },
  { id: 'AST-003', name: 'Conveyor Belt System (50m)', type: 'Infrastructure', location: 'Warehouse B', purchaseDate: '2021-09-10', cost: 3500000, depValue: 2100000, condition: 'Good', nextService: '2026-06-15' },
  { id: 'AST-004', name: 'Dell PowerEdge R750 Server', type: 'IT Equipment', location: 'Server Room', purchaseDate: '2024-03-01', cost: 420000, depValue: 350000, condition: 'Excellent', nextService: '2026-09-01' },
  { id: 'AST-005', name: 'Ashok Leyland 16T Truck', type: 'Vehicle', location: 'Fleet Yard', purchaseDate: '2020-11-25', cost: 1800000, depValue: 900000, condition: 'Fair', nextService: '2026-03-28' },
  { id: 'AST-006', name: 'Automatic Packing Machine', type: 'Machinery', location: 'Packing Bay', purchaseDate: '2023-08-12', cost: 650000, depValue: 520000, condition: 'Good', nextService: '2026-04-20' },
  { id: 'AST-007', name: 'Office Workstation (Set of 10)', type: 'Furniture', location: 'Admin Block', purchaseDate: '2024-01-05', cost: 180000, depValue: 150000, condition: 'Excellent', nextService: null },
  { id: 'AST-008', name: 'Eicher Pro Reefer Van', type: 'Vehicle', location: 'Cold Storage', purchaseDate: '2024-07-18', cost: 2200000, depValue: 1950000, condition: 'Excellent', nextService: '2026-07-18' },
  { id: 'AST-009', name: 'Diesel Generator 125 kVA', type: 'Infrastructure', location: 'Power House', purchaseDate: '2019-04-10', cost: 900000, depValue: 360000, condition: 'Needs Repair', nextService: '2026-03-25' },
]

const fmt = (n) => `₹${(n / 100000).toFixed(1)}L`

export default function AssetManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [assets, setAssets] = useState(initialAssets)
  const [typeFilter, setTypeFilter] = useState('All')
  const [condFilter, setCondFilter] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', type: 'Vehicle', location: '', cost: '', condition: 'Good', purchaseDate: '', nextService: '' })

  const filtered = useMemo(() => {
    const q = (searchQuery || '').toLowerCase()
    return assets.filter((a) => {
      if (typeFilter !== 'All' && a.type !== typeFilter) return false
      if (condFilter !== 'All' && a.condition !== condFilter) return false
      return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || a.location.toLowerCase().includes(q)
    })
  }, [assets, typeFilter, condFilter, searchQuery])

  const totalCost = assets.reduce((s, a) => s + a.cost, 0)
  const totalDep = assets.reduce((s, a) => s + a.depValue, 0)
  const needsRepair = assets.filter((a) => a.condition === 'Needs Repair').length
  const upcomingService = assets.filter((a) => {
    if (!a.nextService) return false
    const d = new Date(a.nextService)
    const now = new Date()
    return d > now && (d - now) / 86400000 < 30
  }).length

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', type: 'Vehicle', location: '', cost: '', condition: 'Good', purchaseDate: '', nextService: '' })
    setShowModal(true)
  }

  const openEdit = (asset) => {
    setEditing(asset)
    setForm({ name: asset.name, type: asset.type, location: asset.location, cost: asset.cost, condition: asset.condition, purchaseDate: asset.purchaseDate, nextService: asset.nextService || '' })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.name || !form.cost) { addToast('Fill required fields', 'error'); return }
    const cost = Number(form.cost)
    if (editing) {
      setAssets(prev => prev.map(a => a.id === editing.id ? { ...a, ...form, cost, depValue: Math.round(cost * 0.8) } : a))
      addToast('Asset updated', 'success')
    } else {
      const nextId = `AST-${String(assets.length + 1).padStart(3, '0')}`
      setAssets(prev => [...prev, { ...form, id: nextId, cost, depValue: cost, nextService: form.nextService || null }])
      addToast('Asset added', 'success')
    }
    setShowModal(false)
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this asset?')) return
    setAssets(prev => prev.filter(a => a.id !== id))
    addToast('Asset deleted', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Asset Management</h1>
        <p className="text-text-secondary mt-1">Lifecycle tracking, depreciation, maintenance scheduling, and utilization for fleet and fixed assets.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets', value: assets.length, sub: `Across ${TYPES.length - 1} categories` },
          { label: 'Total Value', value: fmt(totalCost), sub: `Current: ${fmt(totalDep)}` },
          { label: 'Needs Repair', value: needsRepair, sub: 'Require attention' },
          { label: 'Service Due (30d)', value: upcomingService, sub: 'Upcoming maintenance' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={condFilter} onChange={(e) => setCondFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {COND.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={openAdd} className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          + Add Asset
        </button>
      </div>

      {/* Asset Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                {['ID', 'Asset Name', 'Type', 'Location', 'Purchase Cost', 'Current Value', 'Condition', 'Next Service', 'Actions'].map((h) => (
                  <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border hover:bg-gray-50 transition">
                  <td className="p-3 font-mono text-xs text-blue-600">{a.id}</td>
                  <td className="p-3 font-medium text-text-primary">{a.name}</td>
                  <td className="p-3 text-text-secondary">{a.type}</td>
                  <td className="p-3 text-text-secondary">{a.location}</td>
                  <td className="p-3 text-text-primary">{fmt(a.cost)}</td>
                  <td className="p-3 text-text-primary">{fmt(a.depValue)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.condition === 'Excellent' ? 'bg-green-100 text-green-700' :
                      a.condition === 'Good' ? 'bg-blue-100 text-blue-700' :
                      a.condition === 'Fair' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{a.condition}</span>
                  </td>
                  <td className="p-3 text-text-secondary">{a.nextService || '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(a)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                      <button onClick={() => handleDelete(a.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-center text-sm text-text-muted py-8">No assets match your filters.</p>}
      </div>

      {/* Depreciation Summary */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Depreciation Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Original Cost', value: fmt(totalCost) },
            { label: 'Accumulated Depreciation', value: fmt(totalCost - totalDep) },
            { label: 'Net Book Value', value: fmt(totalDep) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">{item.label}</p>
              <p className="text-xl font-bold text-text-primary mt-1">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Asset Lifecycle */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Asset Lifecycle Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { title: 'Procurement & Tagging', desc: 'Capture purchase details, assign asset tags, QR codes, and register into the asset register.' },
            { title: 'Preventive Maintenance', desc: 'Schedule recurring service based on hours, mileage, or calendar intervals with auto-alerts.' },
            { title: 'Utilization Tracking', desc: 'Monitor usage rates for vehicles, equipment, and facilities to optimize fleet allocation.' },
            { title: 'Insurance & Warranty', desc: 'Track policy expiry, claim history, and extended warranty coverage per asset.' },
            { title: 'Disposal & Write-Off', desc: 'Manage end-of-life: scrap value, disposal compliance, and asset de-registration.' },
            { title: 'Audit & Verification', desc: 'Physical verification schedules, barcode scanning, and discrepancy resolution workflows.' },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-background p-4">
              <p className="font-medium text-text-primary">{item.title}</p>
              <p className="text-xs text-text-secondary mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Add/Edit Asset Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Asset' : 'Add Asset'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Asset Name *</label>
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Asset name or description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {TYPES.filter(t => t !== 'All').map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Location</label>
              <input value={form.location} onChange={(e) => setForm({...form, location: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Location" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Purchase Cost (₹) *</label>
              <input type="number" value={form.cost} onChange={(e) => setForm({...form, cost: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Cost" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Condition</label>
              <select value={form.condition} onChange={(e) => setForm({...form, condition: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {COND.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Purchase Date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({...form, purchaseDate: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Next Service Date</label>
              <input type="date" value={form.nextService} onChange={(e) => setForm({...form, nextService: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing ? 'Update Asset' : 'Add Asset'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
