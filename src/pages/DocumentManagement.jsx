import { useEffect, useMemo, useState } from 'react'

import Modal from '../components/UI/Modal'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const CATEGORIES = ['All', 'Invoice', 'Contract', 'Policy', 'Compliance', 'Report', 'Other']

export default function DocumentManagement() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const user = useStore((s) => s.user)
  const [documents, setDocuments] = useState([])
  const [catFilter, setCatFilter] = useState('All')
  const [localSearch, setLocalSearch] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'Invoice', tags: '', uploadedByName: '', status: 'pending' })

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const rows = await apiClient.get('/documents')
      setDocuments(Array.isArray(rows) ? rows : [])
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  const filtered = useMemo(() => {
    const q = (localSearch || searchQuery || '').toLowerCase()
    return documents.filter((doc) => {
      if (catFilter !== 'All' && doc.category !== catFilter) return false
      const tags = Array.isArray(doc.tags) ? doc.tags : []
      return doc.name?.toLowerCase().includes(q)
        || doc.documentNumber?.toLowerCase().includes(q)
        || tags.some((tag) => tag.toLowerCase().includes(q))
    })
  }, [documents, catFilter, localSearch, searchQuery])

  const totalDocs = documents.length
  const approved = documents.filter((doc) => doc.status === 'approved').length
  const pending = documents.filter((doc) => doc.status === 'pending' || doc.status === 'review').length

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', category: 'Invoice', tags: '', uploadedByName: user.name, status: 'pending' })
    setShowModal(true)
  }

  const openEdit = (doc) => {
    setEditing(doc)
    setForm({
      name: doc.name,
      category: doc.category,
      tags: Array.isArray(doc.tags) ? doc.tags.join(', ') : '',
      uploadedByName: doc.uploadedByName || '',
      status: doc.status,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast('Document name is required', 'error')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name,
      category: form.category,
      status: form.status,
      uploadedByName: form.uploadedByName || user.name,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    }
    try {
      if (editing) {
        await apiClient.patch(`/documents/${editing._id}`, payload)
        addToast('Document updated', 'success')
      } else {
        await apiClient.post('/documents', payload)
        addToast('Document added', 'success')
      }
      setShowModal(false)
      await loadDocuments()
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this document?')) return
    try {
      await apiClient.delete(`/documents/${id}`)
      addToast('Document deleted', 'success')
      await loadDocuments()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const handleApprove = async (id) => {
    try {
      await apiClient.patch(`/documents/${id}`, { status: 'approved' })
      addToast('Document approved', 'success')
      await loadDocuments()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Document Management</h1>
        <p className="text-text-secondary mt-1">Centralized document storage with version control, review status, and MongoDB-backed records.</p>
      </div>

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

      <div className="flex flex-wrap gap-3 items-center">
        <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} placeholder="Search documents..." className="w-64 px-4 py-2 bg-white border border-border rounded-lg text-sm" />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <div className="ml-auto flex gap-2 items-center">
          <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
            + Upload Document
          </button>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {['list', 'grid'].map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1 rounded-md text-sm font-medium transition ${viewMode === mode ? 'bg-white shadow text-text-primary' : 'text-text-muted'}`}>
                {mode === 'list' ? 'List' : 'Grid'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading documents...</div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  {['ID', 'Document Name', 'Category', 'Version', 'Size', 'Uploaded By', 'Date', 'Status', 'Actions'].map((heading) => (
                    <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc._id} className="border-b border-border hover:bg-gray-50 transition">
                    <td className="p-3 font-mono text-xs text-blue-600">{doc.documentNumber}</td>
                    <td className="p-3">
                      <p className="font-medium text-text-primary">{doc.name}</p>
                      <div className="flex gap-1 mt-1">{(doc.tags || []).map((tag) =>
                        <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-text-muted rounded text-[10px]">{tag}</span>
                      )}</div>
                    </td>
                    <td className="p-3 text-text-secondary">{doc.category}</td>
                    <td className="p-3 font-mono text-xs">{doc.version}</td>
                    <td className="p-3 text-text-secondary">{doc.sizeLabel || '—'}</td>
                    <td className="p-3 text-text-secondary">{doc.uploadedByName || '—'}</td>
                    <td className="p-3 text-text-secondary">{new Date(doc.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === 'approved' ? 'bg-green-100 text-green-700' : doc.status === 'review' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
                      }`}>{doc.status}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {doc.status !== 'approved' && (
                          <button onClick={() => handleApprove(doc._id)} className="text-green-600 hover:text-green-800 text-xs font-medium">Approve</button>
                        )}
                        <button onClick={() => openEdit(doc)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                        <button onClick={() => handleDelete(doc._id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
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
          {filtered.map((doc) => (
            <div key={doc._id} className="bg-white rounded-xl p-5 shadow-sm border border-border hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  doc.status === 'approved' ? 'bg-green-100 text-green-700' : doc.status === 'review' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
                }`}>{doc.status}</span>
              </div>
              <p className="font-medium text-text-primary mt-3">{doc.name}</p>
              <p className="text-xs text-text-muted mt-1">{doc.category} • {doc.version} • {doc.sizeLabel || '—'}</p>
              <p className="text-xs text-text-secondary mt-1">{doc.uploadedByName || '—'} • {new Date(doc.createdAt).toLocaleDateString('en-IN')}</p>
              <div className="flex gap-1 mt-2">{(doc.tags || []).map((tag) =>
                <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-text-muted rounded text-[10px]">{tag}</span>
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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Document' : 'Upload Document'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Document Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Document title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {CATEGORIES.filter((category) => category !== 'All').map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                <option value="pending">Pending</option>
                <option value="review">In Review</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Tags (comma separated)</label>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="vendor, legal, finance" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Uploaded By</label>
            <input value={form.uploadedByName} onChange={(e) => setForm({ ...form, uploadedByName: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Your name" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Upload Document'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
