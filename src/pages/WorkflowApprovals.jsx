import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'

const STATUSES = ['All', 'Pending', 'Approved', 'Rejected', 'Escalated']
const WF_TYPES = ['All', 'Purchase Order', 'Invoice Approval', 'Leave Request', 'Expense Claim', 'Vendor Onboarding', 'Contract Renewal']

const sampleRequests = [
  { id: 'WF-3001', title: 'PO-8847 — Steel Plates (2 tons)', type: 'Purchase Order', requester: 'Suresh Gupta', amount: 240000, submitted: '2026-03-18', level: 2, maxLevel: 3, status: 'Pending', approvers: ['Rajesh Kumar', 'Deepa Joshi', 'CFO'] },
  { id: 'WF-3002', title: 'Invoice #INV-4421 — Transport Co.', type: 'Invoice Approval', requester: 'Priya Sharma', amount: 85000, submitted: '2026-03-17', level: 3, maxLevel: 3, status: 'Approved', approvers: ['Accounts', 'Manager', 'CFO'] },
  { id: 'WF-3003', title: 'Leave — Amit Patel (5 days)', type: 'Leave Request', requester: 'Amit Patel', amount: null, submitted: '2026-03-19', level: 1, maxLevel: 2, status: 'Pending', approvers: ['Supervisor', 'HR'] },
  { id: 'WF-3004', title: 'Expense — Client Visit to Mumbai', type: 'Expense Claim', requester: 'Sneha Reddy', amount: 32000, submitted: '2026-03-16', level: 2, maxLevel: 2, status: 'Approved', approvers: ['Manager', 'Finance'] },
  { id: 'WF-3005', title: 'Vendor Registration — LogiParts Ltd', type: 'Vendor Onboarding', requester: 'Suresh Gupta', amount: null, submitted: '2026-03-15', level: 1, maxLevel: 3, status: 'Escalated', approvers: ['Procurement', 'Compliance', 'Director'] },
  { id: 'WF-3006', title: 'PO-8850 — Packaging Material', type: 'Purchase Order', requester: 'Rajesh Kumar', amount: 75000, submitted: '2026-03-20', level: 1, maxLevel: 2, status: 'Pending', approvers: ['Manager', 'Finance'] },
  { id: 'WF-3007', title: 'Fleet Insurance Renewal — FY27', type: 'Contract Renewal', requester: 'Vikram Singh', amount: 450000, submitted: '2026-03-14', level: 2, maxLevel: 3, status: 'Rejected', approvers: ['Fleet Mgr', 'Finance', 'Director'] },
  { id: 'WF-3008', title: 'Invoice #INV-4430 — Fuel Depot', type: 'Invoice Approval', requester: 'Priya Sharma', amount: 120000, submitted: '2026-03-20', level: 1, maxLevel: 2, status: 'Pending', approvers: ['Accounts', 'Manager'] },
]

const fmt = (n) => n != null ? `₹${(n).toLocaleString('en-IN')}` : '—'

export default function WorkflowApprovals() {
  const searchQuery = useStore((s) => s.searchQuery)
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  const filtered = useMemo(() => {
    const q = (searchQuery || '').toLowerCase()
    return sampleRequests.filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (typeFilter !== 'All' && r.type !== typeFilter) return false
      return r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.requester.toLowerCase().includes(q)
    })
  }, [statusFilter, typeFilter, searchQuery])

  const pending = sampleRequests.filter((r) => r.status === 'Pending').length
  const approved = sampleRequests.filter((r) => r.status === 'Approved').length
  const totalValue = sampleRequests.reduce((s, r) => s + (r.amount || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Workflow & Approvals</h1>
        <p className="text-text-secondary mt-1">Multi-level approval chains, automated routing, and audit-ready approval histories for all business processes.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approvals', value: pending, sub: 'Require action' },
          { label: 'Approved (MTD)', value: approved, sub: 'This month' },
          { label: 'Total Value', value: fmt(totalValue), sub: 'In pipeline' },
          { label: 'Avg. Levels', value: (sampleRequests.reduce((s, r) => s + r.maxLevel, 0) / sampleRequests.length).toFixed(1), sub: 'Approval depth' },
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          {WF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Request Cards */}
      <div className="space-y-3">
        {filtered.map((r) => (
          <div key={r.id} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-blue-600">{r.id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === 'Approved' ? 'bg-green-100 text-green-700' :
                    r.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                    r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>{r.status}</span>
                </div>
                <p className="font-semibold text-text-primary mt-1 truncate">{r.title}</p>
                <p className="text-xs text-text-secondary mt-0.5">By {r.requester} &bull; {r.type} &bull; {r.submitted}</p>
                {r.amount && <p className="text-sm font-medium text-text-primary mt-1">{fmt(r.amount)}</p>}
              </div>
              {r.status === 'Pending' && (
                <div className="flex gap-2 shrink-0">
                  <button className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition">Approve</button>
                  <button className="px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition">Reject</button>
                </div>
              )}
            </div>
            {/* Approval Chain */}
            <div className="mt-3 flex items-center gap-1">
              {r.approvers.map((name, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                    i < r.level ? 'bg-green-50 text-green-700 border border-green-200' :
                    i === r.level && r.status === 'Rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
                    i === r.level && r.status === 'Pending' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                    'bg-gray-50 text-text-muted border border-gray-200'
                  }`}>
                    {i < r.level && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    {name}
                  </div>
                  {i < r.approvers.length - 1 && <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
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

      {/* Workflow Features */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Automation Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { title: 'Conditional Routing', desc: 'Auto-route approvals based on amount thresholds, department, or request category.' },
            { title: 'Escalation Rules', desc: 'Auto-escalate to next level if no action taken within configurable SLA windows.' },
            { title: 'Delegation & Proxy', desc: 'Designate backup approvers for leave periods with automatic re-routing.' },
            { title: 'Parallel Approvals', desc: 'Support concurrent sign-offs when multiple departments must approve independently.' },
            { title: 'Blockchain Anchoring', desc: 'Anchor approval decisions on-chain for tamper-proof, auditable compliance records.' },
            { title: 'Notification Engine', desc: 'Email, in-app, and WhatsApp alerts at each approval stage with reminders.' },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-background p-4">
              <p className="font-medium text-text-primary">{item.title}</p>
              <p className="text-xs text-text-secondary mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
