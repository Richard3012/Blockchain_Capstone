import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import AnimatedNumber from '../components/UI/AnimatedNumber'

export default function AuditLog() {
  const auditLog = useStore((state) => state.auditLog)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getAuditStats = useStore((state) => state.getAuditStats)
  const user = useStore((state) => state.user)

  const [localSearch, setLocalSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [displayCount, setDisplayCount] = useState(50)

  if (user.role === 'viewer') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Access Restricted</h2>
          <p className="text-text-secondary mt-2">You need admin privileges to view Audit Log.</p>
        </div>
      </div>
    )
  }

  const stats = getAuditStats()

  const actions = useMemo(() => [...new Set(auditLog.map(l => l.action))], [auditLog])
  const entities = useMemo(() => [...new Set(auditLog.map(l => l.entity))], [auditLog])

  const filteredLog = useMemo(() => {
    return auditLog.filter(entry => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query || 
        entry.user.toLowerCase().includes(query) ||
        entry.action.toLowerCase().includes(query) ||
        entry.entity.toLowerCase().includes(query) ||
        entry.entityId.toLowerCase().includes(query)
      const matchesAction = actionFilter === 'all' || entry.action === actionFilter
      const matchesEntity = entityFilter === 'all' || entry.entity === entityFilter
      return matchesSearch && matchesAction && matchesEntity
    })
  }, [auditLog, localSearch, searchQuery, actionFilter, entityFilter])

  const handleExport = () => {
    addToast(`Preparing export of ${filteredLog.length} entries...`, 'info')
  }

  const copyHash = (hash) => {
    navigator.clipboard.writeText(hash)
    addToast('Hash copied to clipboard', 'success')
  }

  const formatTimestamp = (ts) => {
    const date = new Date(ts)
    return date.toLocaleString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
          <p className="text-text-secondary mt-1">Track all system activities and changes</p>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Export Logs
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Entries</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={stats.total} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Today</p>
          <p className="text-2xl font-bold text-blue mt-1">
            <AnimatedNumber value={stats.today} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Blockchain Verified</p>
          <p className="text-2xl font-bold text-green mt-1">
            <AnimatedNumber value={stats.withHash} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Active Users (24h)</p>
          <p className="text-2xl font-bold text-purple mt-1">
            <AnimatedNumber value={stats.activeUsers} />
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-xs">
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Actions</option>
          {actions.map(action => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Entities</option>
          {entities.map(entity => (
            <option key={entity} value={entity}>{entity}</option>
          ))}
        </select>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Timestamp</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">User</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Action</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Entity</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Blockchain</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLog.slice(0, displayCount).map((entry, index) => (
                <tr 
                  key={entry.id} 
                  className={`border-b border-border last:border-0 hover:bg-gray-50 transition-colors ${
                    entry.isNew ? 'animate-slide-down bg-cyan-50' : ''
                  }`}
                >
                  <td className="py-3 px-6 text-sm text-text-secondary whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="py-3 px-6 text-sm font-medium text-text-primary">{entry.user}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{entry.action}</td>
                  <td className="py-3 px-6">
                    <Badge variant={entry.entity}>{entry.entity}</Badge>
                    <span className="ml-2 text-sm text-text-muted">{entry.entityId}</span>
                  </td>
                  <td className="py-3 px-6">
                    {entry.hash ? (
                      <button 
                        onClick={() => copyHash(entry.hash)}
                        className="text-sm font-mono text-green hover:underline"
                      >
                        {entry.hash.slice(0, 12)}...
                      </button>
                    ) : (
                      <span className="text-sm text-text-muted">-</span>
                    )}
                  </td>
                  <td className="py-3 px-6">
                    <button 
                      onClick={() => setSelectedEntry(entry)}
                      className="text-sm text-blue hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {Math.min(displayCount, filteredLog.length)} of {filteredLog.length} entries
          </p>
          {displayCount < filteredLog.length && (
            <Button variant="secondary" size="sm" onClick={() => setDisplayCount(d => d + 50)}>
              Load More
            </Button>
          )}
        </div>
      </div>

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <Modal title="Audit Entry Details" onClose={() => setSelectedEntry(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-text-muted">Timestamp</label>
              <p className="font-medium text-text-primary">{formatTimestamp(selectedEntry.timestamp)}</p>
            </div>
            <div>
              <label className="text-sm text-text-muted">User</label>
              <p className="font-medium text-text-primary">{selectedEntry.user}</p>
            </div>
            <div>
              <label className="text-sm text-text-muted">Action</label>
              <p className="font-medium text-text-primary">{selectedEntry.action}</p>
            </div>
            <div>
              <label className="text-sm text-text-muted">Entity</label>
              <p className="font-medium text-text-primary">{selectedEntry.entity} - {selectedEntry.entityId}</p>
            </div>
            {selectedEntry.hash && (
              <div>
                <label className="text-sm text-text-muted">Blockchain Hash</label>
                <p className="font-mono text-sm text-green break-all">{selectedEntry.hash}</p>
              </div>
            )}
            <div>
              <label className="text-sm text-text-muted">Details</label>
              <p className="font-medium text-text-primary">{selectedEntry.details}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
