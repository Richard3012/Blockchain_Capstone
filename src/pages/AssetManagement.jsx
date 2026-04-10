import { useEffect, useMemo, useState } from 'react'

import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const TYPES = ['All', 'Vehicle', 'Machinery', 'IT Equipment', 'Furniture', 'Infrastructure']
const CONDITIONS = ['All', 'Excellent', 'Good', 'Fair', 'Needs Repair']
const fmt = (n) => `₹${((n || 0) / 100000).toFixed(1)}L`

export default function AssetManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [assets, setAssets] = useState([])
  const [typeFilter, setTypeFilter] = useState('All')
  const [condFilter, setCondFilter] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'Vehicle', location: '', cost: '', condition: 'Good', purchaseDate: '', nextService: '' })

  const loadAssets = async () => {
    setLoading(true)
    try {
      const rows = await apiClient.get('/assets')
      setAssets(Array.isArray(rows) ? rows : [])
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [])

  const filtered = useMemo(() => {
    const query = (searchQuery || '').toLowerCase()
    return assets.filter((asset) => {
      if (typeFilter !== 'All' && asset.type !== typeFilter) return false
      if (condFilter !== 'All' && asset.condition !== condFilter) return false
      return asset.name?.toLowerCase().includes(query)
        || asset.assetNumber?.toLowerCase().includes(query)
        || asset.location?.toLowerCase().includes(query)
    })
  }, [assets, typeFilter, condFilter, searchQuery])

  const totalCost = assets.reduce((sum, asset) => sum + (asset.cost || 0), 0)
  const totalDep = assets.reduce((sum, asset) => sum + (asset.depValue || 0), 0)
  const needsRepair = assets.filter((asset) => asset.condition === 'Needs Repair').length
  const upcomingService = assets.filter((asset) => {
    if (!asset.nextService) return false
    const serviceDate = new Date(asset.nextService)
    const now = new Date()
    return serviceDate > now && (serviceDate - now) / 86400000 < 30
  }).length

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', type: 'Vehicle', location: '', cost: '', condition: 'Good', purchaseDate: '', nextService: '' })
    setShowModal(true)
  }

  const openEdit = (asset) => {
    setEditing(asset)
    setForm({
      name: asset.name,
      type: asset.type,
      location: asset.location || '',
      cost: String(asset.cost || ''),
      condition: asset.condition,
      purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate).toISOString().slice(0, 10) : '',
      nextService: asset.nextService ? new Date(asset.nextService).toISOString().slice(0, 10) : '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.cost) {
      addToast('Fill required fields', 'error')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name,
      type: form.type,
      location: form.location,
      cost: Number(form.cost),
      condition: form.condition,
      purchaseDate: form.purchaseDate || null,
      nextService: form.nextService || null,
    }
    try {
      if (editing) {
        await apiClient.patch(`/assets/${editing._id}`, payload)
        addToast('Asset updated', 'success')
      } else {
        await apiClient.post('/assets', payload)
        addToast('Asset added', 'success')
      }
      setShowModal(false)
      await loadAssets()
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this asset?')) return
    try {
      await apiClient.delete(`/assets/${id}`)
      addToast('Asset deleted', 'success')
      await loadAssets()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Asset Management</h1>
        <p className="text-text-secondary mt-1">Lifecycle tracking, depreciation, and maintenance scheduling backed by MongoDB.</p>
      </div>

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
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={condFilter} onChange={(e) => setCondFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
        </select>
        <button onClick={openAdd} className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          + Add Asset
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading assets...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  {['ID', 'Asset Name', 'Type', 'Location', 'Purchase Cost', 'Current Value', 'Condition', 'Next Service', 'Actions'].map((heading) => (
                    <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset) => (
                  <tr key={asset._id} className="border-b border-border hover:bg-gray-50 transition">
                    <td className="p-3 font-mono text-xs text-blue-600">{asset.assetNumber}</td>
                    <td className="p-3 font-medium text-text-primary">{asset.name}</td>
                    <td className="p-3 text-text-secondary">{asset.type}</td>
                    <td className="p-3 text-text-secondary">{asset.location}</td>
                    <td className="p-3 text-text-primary">{fmt(asset.cost)}</td>
                    <td className="p-3 text-text-primary">{fmt(asset.depValue)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        asset.condition === 'Excellent' ? 'bg-green-100 text-green-700'
                          : asset.condition === 'Good' ? 'bg-blue-100 text-blue-700'
                            : asset.condition === 'Fair' ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                      }`}>{asset.condition}</span>
                    </td>
                    <td className="p-3 text-text-secondary">{asset.nextService ? new Date(asset.nextService).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(asset)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                        <button onClick={() => handleDelete(asset._id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="text-center text-sm text-text-muted py-8">No assets match your filters.</p>}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Asset' : 'Add Asset'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Asset Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Asset name or description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {TYPES.filter((type) => type !== 'All').map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Location" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Purchase Cost (₹) *</label>
              <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Cost" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Condition</label>
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {CONDITIONS.filter((condition) => condition !== 'All').map((condition) => <option key={condition} value={condition}>{condition}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Purchase Date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Next Service Date</label>
              <input type="date" value={form.nextService} onChange={(e) => setForm({ ...form, nextService: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update Asset' : 'Add Asset'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
