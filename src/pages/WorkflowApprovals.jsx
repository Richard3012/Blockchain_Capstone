import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const STATUSES = ['All', 'Pending', 'Approved', 'Rejected', 'Escalated']
const WF_TYPES = ['All', 'Purchase Order', 'Invoice Approval', 'Leave Request', 'Expense Claim', 'Vendor Onboarding', 'Contract Renewal']

const fmt = (n) => n != null ? `₹${n.toLocaleString('en-IN')}` : '—'

export default function WorkflowApprovals() {
  const searchQuery = useStore((s) => s.searchQuery)
  const addToast = useStore((s) => s.addToast)
  const [requests, setRequests] = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [loading, setLoading] = useState(false)

  const loadRequests = async () => {
    setLoading(true)
    try {
      const rows = await apiClient.get('/workflow-requests')
      setRequests(Array.isArray(rows) ? rows : [])
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const filtered = useMemo(() => {
    const query = (searchQuery || '').toLowerCase()
    return requests.filter((request) => {
      if (statusFilter !== 'All' && request.status !== statusFilter) return false
      if (typeFilter !== 'All' && request.type !== typeFilter) return false
      return request.title?.toLowerCase().includes(query)
        || request.requestNumber?.toLowerCase().includes(query)
        || request.requesterName?.toLowerCase().includes(query)
    })
  }, [requests, statusFilter, typeFilter, searchQuery])

  const pending = requests.filter((request) => request.status === 'Pending').length
  const approved = requests.filter((request) => request.status === 'Approved').length
  const totalValue = requests.reduce((sum, request) => sum + (request.amount || 0), 0)
  const avgLevels = requests.length > 0 ? (requests.reduce((sum, request) => sum + (request.maxLevel || 1), 0) / requests.length).toFixed(1) : '0.0'

  const handleAction = async (requestId, status) => {
    try {
      await apiClient.patch(`/workflow-requests/${requestId}/status`, { status })
      addToast(`Request ${status.toLowerCase()}`, 'success')
      await loadRequests()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Workflow & Approvals</h1>
        <p className="text-text-secondary mt-1">Multi-level approval chains and approval histories persisted in MongoDB.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approvals', value: pending, sub: 'Require action' },
          { label: 'Approved (MTD)', value: approved, sub: 'This month' },
          { label: 'Total Value', value: fmt(totalValue), sub: 'In pipeline' },
          { label: 'Avg. Levels', value: avgLevels, sub: 'Approval depth' },
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
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {WF_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">Loading workflow requests...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((request) => (
            <div key={request._id} className="bg-white rounded-xl p-5 shadow-sm border border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-600">{request.requestNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      request.status === 'Approved' ? 'bg-green-100 text-green-700'
                        : request.status === 'Pending' ? 'bg-yellow-100 text-yellow-700'
                          : request.status === 'Rejected' ? 'bg-red-100 text-red-700'
                            : 'bg-orange-100 text-orange-700'
                    }`}>{request.status}</span>
                  </div>
                  <p className="font-semibold text-text-primary mt-1 truncate">{request.title}</p>
                  <p className="text-xs text-text-secondary mt-0.5">By {request.requesterName} • {request.type} • {new Date(request.submittedDate || request.createdAt).toLocaleDateString('en-IN')}</p>
                  {request.amount != null && <p className="text-sm font-medium text-text-primary mt-1">{fmt(request.amount)}</p>}
                </div>
                {request.status === 'Pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleAction(request._id, 'Approved')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition">Approve</button>
                    <button onClick={() => handleAction(request._id, 'Rejected')} className="px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition">Reject</button>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center gap-1 flex-wrap">
                {(request.approvers || []).map((approver, index) => (
                  <div key={`${request._id}-${approver.name}-${index}`} className="flex items-center gap-1">
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                      approver.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200'
                        : approver.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200'
                          : approver.status === 'escalated' ? 'bg-orange-50 text-orange-700 border border-orange-200'
                            : 'bg-gray-50 text-text-muted border border-gray-200'
                    }`}>
                      {approver.status === 'approved' && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {approver.name}
                    </div>
                    {index < (request.approvers || []).length - 1 && (
                      <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center">
              <p className="text-sm text-text-muted">No workflow requests match your filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
