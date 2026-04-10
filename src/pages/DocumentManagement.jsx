import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/UI/Modal'

const CATEGORIES = ['All', 'Invoice', 'Contract', 'Policy', 'Compliance', 'Report', 'Other']

const initialDocs = [
  { id: 'DOC-0001', name: 'Vendor Agreement — Steel Corp', category: 'Contract', size: '2.4 MB', uploaded: '2026-03-10', uploadedBy: 'Deepa Joshi', version: 'v3', status: 'approved', tags: ['vendor', 'legal'] },
  { id: 'DOC-0002', name: 'Q4 2025 Financial Audit Report', category: 'Report', size: '5.1 MB', uploaded: '2026-02-28', uploadedBy: 'Priya Sharma', version: 'v1', status: 'approved', tags: ['audit', 'finance'] },
  { id: 'DOC-0003', name: 'Warehouse Safety Policy', category: 'Policy', size: '1.1 MB', uploaded: '2026-01-15', uploadedBy: 'Rajesh Kumar', version: 'v2', status: 'approved', tags: ['safety', 'warehouse'] },
  { id: 'DOC-0004', name: 'GST Return Filing — Mar 2026', category: 'Compliance', size: '890 KB', uploaded: '2026-03-18', uploadedBy: 'Priya Sharma', version: 'v1', status: 'pending', tags: ['gst', 'tax'] },
  { id: 'DOC-0005', name: 'Purchase Order PO-8832', category: 'Invoice', size: '340 KB', uploaded: '2026-03-20', uploadedBy: 'Suresh Gupta', version: 'v1', status: 'approved', tags: ['procurement'] },
  { id: 'DOC-0006', name: 'Fleet Insurance Renewal', category: 'Contract', size: '3.8 MB', uploaded: '2026-03-05', uploadedBy: 'Vikram Singh', version: 'v1', status: 'review', tags: ['fleet', 'insurance'] },
  { id: 'DOC-0007', name: 'FSSAI License Certificate', category: 'Compliance', size: '420 KB', uploaded: '2025-12-01', uploadedBy: 'Deepa Joshi', version: 'v1', status: 'approved', tags: ['compliance', 'fssai'] },
  { id: 'DOC-0008', name: 'IT Infrastructure Upgrade Plan', category: 'Report', size: '1.7 MB', uploaded: '2026-03-12', uploadedBy: 'Anjali Nair', version: 'v2', status: 'review', tags: ['it', 'infra'] },
]

export default function DocumentManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [documents, setDocuments] = useState(initialDocs)
  const [catFilter, setCatFilter] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', category: 'Invoice', tags: '', uploadedBy: '', status: 'pending' })

  const filtered = useMemo(() => {
    const q = (localSearch || searchQuery || '').toLowerCase()
    return documents.filter((d) => {
      if (catFilter !== 'All' && d.category !== catFilter) return false
      return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q))
    })
  }, [documents, catFilter, localSearch, searchQuery])

  const totalDocs = documents.length
  const approved = documents.filter((d) => d.status === 'approved').length
  const pending = documents.filter((d) => d.status === 'pending' || d.status === 'review').length

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', category: 'Invoice', tags: '', uploadedBy: '', status: 'pending' })
    setShowModal(true)
  }

  const openEdit = (doc) => {
    setEditing(doc)
    setForm({ name: doc.name, category: doc.category, tags: doc.tags.join(', '), uploadedBy: doc.uploadedBy, status: doc.status })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.name) { addToast('Document name is required', 'error'); return }
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    const today = new Date().toISOString().slice(0, 10)
    if (editing) {
      setDocuments(prev => prev.map(d => d.id === editing.id ? { ...d, name: form.name, category: form.category, tags, uploadedBy: form.uploadedBy, status: form.status } : d))
      addToast('Document updated', 'success')
    } else {
      const nextId = `DOC-${String(documents.length + 1).padStart(4, '0')}`
      setDocuments(prev => [...prev, { id: nextId, name: form.name, category: form.category, size: '—', uploaded: today, uploadedBy: form.uploadedBy || 'Current User', version: 'v1', status: form.status, tags }])
      addToast('Document added', 'success')
    }
    setShowModal(false)
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this document?')) return
    setDocuments(prev => prev.filter(d => d.id !== id))
    addToast('Document deleted', 'success')
  }

  const handleApprove = (id) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status: 'approved' } : d))
    addToast('Document approved', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Document Management</h1>
        <p className="text-text-secondary mt-1">Centralized document storage with version control, access management, and compliance audit trails.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Documents', value: totalDocs, sub: 'In repository' },
          { label: 'Approved', value: approved, sub: 'Fully signed off' },
          { label: 'Pending Review', value: pending, sub: 'Require action' },
          { label: 'Categories', value: CATEGORIES.length - 1, sub: 'Document types' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search documents..." className="w-64 px-4 py-2 bg-white border border-border rounded-lg text-sm" />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto flex gap-2 items-center">
          <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
            + Upload Document
          </button>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {['list', 'grid'].map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${viewMode === m ? 'bg-white shadow text-text-primary' : 'text-text-muted'}`}>
              {m === 'list' ? 'List' : 'Grid'}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Document List */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  {['ID', 'Document Name', 'Category', 'Version', 'Size', 'Uploaded By', 'Date', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-border hover:bg-gray-50 transition">
                    <td className="p-3 font-mono text-xs text-blue-600">{d.id}</td>
                    <td className="p-3">
                      <p className="font-medium text-text-primary">{d.name}</p>
                      <div className="flex gap-1 mt-1">{d.tags.map((t) =>
                        <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-text-muted rounded text-[10px]">{t}</span>
                      )}</div>
                    </td>
                    <td className="p-3 text-text-secondary">{d.category}</td>
                    <td className="p-3 font-mono text-xs">{d.version}</td>
                    <td className="p-3 text-text-secondary">{d.size}</td>
                    <td className="p-3 text-text-secondary">{d.uploadedBy}</td>
                    <td className="p-3 text-text-secondary">{d.uploaded}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.status === 'approved' ? 'bg-green-100 text-green-700' :
                        d.status === 'review' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>{d.status}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {d.status !== 'approved' && (
                          <button onClick={() => handleApprove(d.id)} className="text-green-600 hover:text-green-800 text-xs font-medium">Approve</button>
                        )}
                        <button onClick={() => openEdit(d)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                        <button onClick={() => handleDelete(d.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="text-center text-sm text-text-muted py-8">No documents match your search.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <div key={d.id} className="bg-white rounded-xl p-5 shadow-sm border border-border hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  d.status === 'approved' ? 'bg-green-100 text-green-700' :
                  d.status === 'review' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-orange-100 text-orange-700'
                }`}>{d.status}</span>
              </div>
              <p className="font-medium text-text-primary mt-3">{d.name}</p>
              <p className="text-xs text-text-muted mt-1">{d.category} &bull; {d.version} &bull; {d.size}</p>
              <p className="text-xs text-text-secondary mt-1">{d.uploadedBy} &bull; {d.uploaded}</p>
              <div className="flex gap-1 mt-2">{d.tags.map((t) =>
                <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-text-muted rounded text-[10px]">{t}</span>
              )}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full bg-white rounded-xl p-8 shadow-sm border border-border text-center">
              <p className="text-sm text-text-muted">No documents match your search.</p>
            </div>
          )}
        </div>
      )}

      {/* Features */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-semibold text-text-primary mb-4">DMS Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { title: 'Version History', desc: 'Track all document revisions with change logs, diff comparison, and rollback capability.' },
            { title: 'Access Control', desc: 'Role-based permissions — restrict view, edit, and download by department or user.' },
            { title: 'OCR Indexing', desc: 'Automatic text extraction from scanned PDFs and images for full-text search.' },
            { title: 'Compliance Vault', desc: 'Immutable storage for regulatory documents with blockchain-anchored timestamps.' },
            { title: 'Automated Workflows', desc: 'Route documents for review and approval with configurable multi-level chains.' },
            { title: 'Audit Trail', desc: 'Complete log of who accessed, modified, or shared each document and when.' },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-background p-4">
              <p className="font-medium text-text-primary">{item.title}</p>
              <p className="text-xs text-text-secondary mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Upload/Edit Document Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Document' : 'Upload Document'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Document Name *</label>
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Document title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                <option value="pending">Pending</option>
                <option value="review">In Review</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Tags (comma separated)</label>
            <input value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="vendor, legal, finance" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Uploaded By</label>
            <input value={form.uploadedBy} onChange={(e) => setForm({...form, uploadedBy: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Your name" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing ? 'Update' : 'Upload Document'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
