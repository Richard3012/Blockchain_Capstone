import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/UI/Modal'

const STATUSES = ['All', 'Active', 'Planning', 'Completed', 'On Hold']

const initialProjects = [
  { id: 'PRJ-001', name: 'Warehouse Expansion Phase II', client: 'Internal', manager: 'Deepa Joshi', status: 'Active', budget: 1500000, spent: 820000, start: '2026-01-15', end: '2026-06-30', progress: 55 },
  { id: 'PRJ-002', name: 'ERP System Migration', client: 'Internal', manager: 'Anjali Nair', status: 'Active', budget: 800000, spent: 450000, start: '2026-02-01', end: '2026-05-31', progress: 60 },
  { id: 'PRJ-003', name: 'Cold Chain Setup — North Region', client: 'FreshMart India', manager: 'Rajesh Kumar', status: 'Planning', budget: 3200000, spent: 0, start: '2026-04-01', end: '2026-10-15', progress: 5 },
  { id: 'PRJ-004', name: 'Automated Sorting Line Install', client: 'Internal', manager: 'Vikram Singh', status: 'Active', budget: 2100000, spent: 1900000, start: '2025-10-01', end: '2026-03-20', progress: 92 },
  { id: 'PRJ-005', name: 'Fleet Telematics Integration', client: 'Internal', manager: 'Suresh Gupta', status: 'Completed', budget: 600000, spent: 580000, start: '2025-08-01', end: '2026-01-31', progress: 100 },
  { id: 'PRJ-006', name: 'Vendor Portal Development', client: 'Multi-Vendor', manager: 'Anjali Nair', status: 'On Hold', budget: 450000, spent: 120000, start: '2026-01-10', end: '2026-07-30', progress: 25 },
]

const milestones = [
  { project: 'PRJ-001', name: 'Foundation Complete', due: '2026-02-28', done: true },
  { project: 'PRJ-001', name: 'Steel Structure Erected', due: '2026-04-15', done: false },
  { project: 'PRJ-002', name: 'Data Migration Dry Run', due: '2026-03-15', done: true },
  { project: 'PRJ-002', name: 'UAT Sign-off', due: '2026-04-30', done: false },
  { project: 'PRJ-004', name: 'Installation Complete', due: '2026-03-01', done: true },
  { project: 'PRJ-004', name: 'Production Go-Live', due: '2026-03-20', done: false },
]

const fmt = (n) => `₹${(n / 100000).toFixed(1)}L`

export default function ProjectManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [projects, setProjects] = useState(initialProjects)
  const [statusFilter, setStatusFilter] = useState('All')
  const [selected, setSelected] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', client: '', manager: '', status: 'Planning', budget: '', start: '', end: '' })

  const filtered = useMemo(() => {
    const q = (searchQuery || '').toLowerCase()
    return projects.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false
      return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.manager.toLowerCase().includes(q)
    })
  }, [projects, statusFilter, searchQuery])

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0)
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0)
  const activeCount = projects.filter((p) => p.status === 'Active').length

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', client: '', manager: '', status: 'Planning', budget: '', start: '', end: '' })
    setShowModal(true)
  }

  const openEdit = (proj) => {
    setEditing(proj)
    setForm({ name: proj.name, client: proj.client, manager: proj.manager, status: proj.status, budget: proj.budget, start: proj.start, end: proj.end })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.name || !form.manager || !form.budget) { addToast('Fill required fields', 'error'); return }
    if (editing) {
      setProjects(prev => prev.map(p => p.id === editing.id ? { ...p, ...form, budget: Number(form.budget) } : p))
      addToast('Project updated', 'success')
    } else {
      const nextId = `PRJ-${String(projects.length + 1).padStart(3, '0')}`
      setProjects(prev => [...prev, { ...form, id: nextId, budget: Number(form.budget), spent: 0, progress: 0 }])
      addToast('Project created', 'success')
    }
    setShowModal(false)
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this project?')) return
    setProjects(prev => prev.filter(p => p.id !== id))
    addToast('Project deleted', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Project Management</h1>
        <p className="text-text-secondary mt-1">Planning, budgeting, resource allocation, and milestone tracking for logistics and infrastructure projects.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', value: activeCount, sub: `${projects.length} total` },
          { label: 'Total Budget', value: fmt(totalBudget), sub: 'All projects' },
          { label: 'Total Spent', value: fmt(totalSpent), sub: `${((totalSpent / totalBudget) * 100).toFixed(0)}% utilized` },
          { label: 'Upcoming Milestones', value: milestones.filter((m) => !m.done).length, sub: 'Pending' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={openAdd} className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          + Create Project
        </button>
      </div>

      {/* Project List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((p) => (
          <div key={p.id} onClick={() => setSelected(selected === p.id ? null : p.id)}
            className="bg-white rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-blue-600">{p.id}</p>
                <p className="font-semibold text-text-primary mt-0.5">{p.name}</p>
                <p className="text-xs text-text-secondary mt-1">Manager: {p.manager} &bull; Client: {p.client}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                p.status === 'Active' ? 'bg-blue-100 text-blue-700' :
                p.status === 'Completed' ? 'bg-green-100 text-green-700' :
                p.status === 'On Hold' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-700'
              }`}>{p.status}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${p.progress >= 90 ? 'bg-green-500' : p.progress >= 50 ? 'bg-blue-500' : 'bg-yellow-500'}`}
                  style={{ width: `${p.progress}%` }} />
              </div>
              <span className="text-xs font-medium text-text-primary w-10 text-right">{p.progress}%</span>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-text-muted">
              <span>Budget: {fmt(p.budget)}</span>
              <span>Spent: {fmt(p.spent)}</span>
              <span>{p.start} → {p.end}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); openEdit(p) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
            </div>

            {selected === p.id && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-sm font-medium text-text-primary mb-2">Milestones</p>
                {milestones.filter((m) => m.project === p.id).length === 0 && (
                  <p className="text-xs text-text-muted">No milestones defined yet.</p>
                )}
                {milestones.filter((m) => m.project === p.id).map((m, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${m.done ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                      {m.done && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <span className={`text-xs ${m.done ? 'text-text-muted line-through' : 'text-text-primary'}`}>{m.name}</span>
                    <span className="text-xs text-text-muted ml-auto">{m.due}</span>
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

      {/* Resource Planning */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Resource Planning</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { title: 'Gantt Scheduling', desc: 'Visual timeline view with task dependencies, critical path, and slack analysis.' },
            { title: 'Resource Allocation', desc: 'Assign staff, equipment, and vehicles across projects to prevent over-commitment.' },
            { title: 'Budget Tracking', desc: 'Track actual vs. planned costs with variance analysis and forecasting.' },
            { title: 'Risk Register', desc: 'Identify, assess, and mitigate project risks with probability-impact matrices.' },
            { title: 'Timesheet Integration', desc: 'Link employee hours to projects for accurate labour cost tracking.' },
            { title: 'Stakeholder Reports', desc: 'Auto-generate status reports with KPIs, milestones, and financial summaries.' },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-background p-4">
              <p className="font-medium text-text-primary">{item.title}</p>
              <p className="text-xs text-text-secondary mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Create/Edit Project Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Project' : 'Create Project'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Project Name *</label>
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Project name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Client</label>
              <input value={form.client} onChange={(e) => setForm({...form, client: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Client or Internal" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Project Manager *</label>
              <input value={form.manager} onChange={(e) => setForm({...form, manager: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Manager name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Budget (₹) *</label>
              <input type="number" value={form.budget} onChange={(e) => setForm({...form, budget: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Total budget" />
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
              <label className="block text-sm font-medium text-text-secondary mb-1">End Date</label>
              <input type="date" value={form.end} onChange={(e) => setForm({...form, end: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing ? 'Update' : 'Create Project'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
