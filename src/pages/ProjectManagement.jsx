import { useEffect, useMemo, useState } from 'react'

import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const STATUSES = ['All', 'Active', 'Planning', 'Completed', 'On Hold']
const fmt = (n) => `₹${((n || 0) / 100000).toFixed(1)}L`

export default function ProjectManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [projects, setProjects] = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [selected, setSelected] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', client: '', manager: '', status: 'Planning', budget: '', start: '', end: '' })

  const loadProjects = async () => {
    setLoading(true)
    try {
      const rows = await apiClient.get('/projects')
      setProjects(Array.isArray(rows) ? rows : [])
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const filtered = useMemo(() => {
    const query = (searchQuery || '').toLowerCase()
    return projects.filter((project) => {
      if (statusFilter !== 'All' && project.status !== statusFilter) return false
      return project.name?.toLowerCase().includes(query)
        || project.projectNumber?.toLowerCase().includes(query)
        || project.manager?.toLowerCase().includes(query)
    })
  }, [projects, statusFilter, searchQuery])

  const totalBudget = projects.reduce((sum, project) => sum + (project.budget || 0), 0)
  const totalSpent = projects.reduce((sum, project) => sum + (project.spent || 0), 0)
  const activeCount = projects.filter((project) => project.status === 'Active').length
  const pendingMilestones = projects.reduce((sum, project) => sum + (project.milestones || []).filter((milestone) => !milestone.done).length, 0)

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', client: '', manager: '', status: 'Planning', budget: '', start: '', end: '' })
    setShowModal(true)
  }

  const openEdit = (project) => {
    setEditing(project)
    setForm({
      name: project.name,
      client: project.client || '',
      manager: project.manager,
      status: project.status,
      budget: String(project.budget || ''),
      start: project.start ? new Date(project.start).toISOString().slice(0, 10) : '',
      end: project.end ? new Date(project.end).toISOString().slice(0, 10) : '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.manager.trim() || !form.budget) {
      addToast('Fill required fields', 'error')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name,
      client: form.client,
      manager: form.manager,
      status: form.status,
      budget: Number(form.budget),
      start: form.start || null,
      end: form.end || null,
    }
    try {
      if (editing) {
        await apiClient.patch(`/projects/${editing._id}`, payload)
        addToast('Project updated', 'success')
      } else {
        await apiClient.post('/projects', payload)
        addToast('Project created', 'success')
      }
      setShowModal(false)
      await loadProjects()
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project?')) return
    try {
      await apiClient.delete(`/projects/${id}`)
      addToast('Project deleted', 'success')
      await loadProjects()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Project Management</h1>
        <p className="text-text-secondary mt-1">Planning, budgeting, and milestone tracking with MongoDB-backed project records.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', value: activeCount, sub: `${projects.length} total` },
          { label: 'Total Budget', value: fmt(totalBudget), sub: 'All projects' },
          { label: 'Total Spent', value: fmt(totalSpent), sub: `${totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(0) : 0}% utilized` },
          { label: 'Upcoming Milestones', value: pendingMilestones, sub: 'Pending' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <button onClick={openAdd} className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          + Create Project
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading projects...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((project) => (
              <div key={project._id} onClick={() => setSelected(selected === project._id ? null : project._id)} className="bg-white rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-blue-600">{project.projectNumber}</p>
                    <p className="font-semibold text-text-primary mt-0.5">{project.name}</p>
                    <p className="text-xs text-text-secondary mt-1">Manager: {project.manager} • Client: {project.client}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                    project.status === 'Active' ? 'bg-blue-100 text-blue-700' : project.status === 'Completed' ? 'bg-green-100 text-green-700' : project.status === 'On Hold' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                  }`}>{project.status}</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${project.progress >= 90 ? 'bg-green-500' : project.progress >= 50 ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: `${project.progress || 0}%` }} />
                  </div>
                  <span className="text-xs font-medium text-text-primary w-10 text-right">{project.progress || 0}%</span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-text-muted">
                  <span>Budget: {fmt(project.budget)}</span>
                  <span>Spent: {fmt(project.spent)}</span>
                  <span>{project.start ? new Date(project.start).toLocaleDateString('en-IN') : '—'} → {project.end ? new Date(project.end).toLocaleDateString('en-IN') : '—'}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={(event) => { event.stopPropagation(); openEdit(project) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                  <button onClick={(event) => { event.stopPropagation(); handleDelete(project._id) }} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                </div>

                {selected === project._id && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <p className="text-sm font-medium text-text-primary mb-2">Milestones</p>
                    {(project.milestones || []).length === 0 && (
                      <p className="text-xs text-text-muted">No milestones defined yet.</p>
                    )}
                    {(project.milestones || []).map((milestone, index) => (
                      <div key={`${project._id}-milestone-${index}`} className="flex items-center gap-2 py-1">
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${milestone.done ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                          {milestone.done && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        <span className={`text-xs ${milestone.done ? 'text-text-muted line-through' : 'text-text-primary'}`}>{milestone.name}</span>
                        <span className="text-xs text-text-muted ml-auto">{milestone.due ? new Date(milestone.due).toLocaleDateString('en-IN') : '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center">
              <p className="text-sm text-text-muted">No projects match your filters.</p>
            </div>
          )}
        </>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Project' : 'Create Project'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Project Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Project name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Client</label>
              <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Client or Internal" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Project Manager *</label>
              <input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Manager name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Budget (₹) *</label>
              <input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Total budget" />
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
              <label className="block text-sm font-medium text-text-secondary mb-1">End Date</label>
              <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Project'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
