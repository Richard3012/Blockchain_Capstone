import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import AnimatedNumber from '../components/UI/AnimatedNumber'

export default function Blockchain() {
  const blockchainTxs = useStore((state) => state.blockchainTxs)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getBlockchainStats = useStore((state) => state.getBlockchainStats)

  const [localSearch, setLocalSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [displayCount, setDisplayCount] = useState(50)

  const stats = getBlockchainStats()

  const types = useMemo(() => [...new Set(blockchainTxs.map(tx => tx.type))], [blockchainTxs])
  const statuses = useMemo(() => [...new Set(blockchainTxs.map(tx => tx.status))], [blockchainTxs])

  const filteredTxs = useMemo(() => {
    return blockchainTxs.filter(tx => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query || 
        tx.hash.toLowerCase().includes(query) ||
        tx.type.toLowerCase().includes(query) ||
        tx.entityId.toLowerCase().includes(query)
      const matchesType = typeFilter === 'all' || tx.type === typeFilter
      const matchesStatus = statusFilter === 'all' || tx.status === statusFilter
      return matchesSearch && matchesType && matchesStatus
    })
  }, [blockchainTxs, localSearch, searchQuery, typeFilter, statusFilter])

  const copyHash = (hash) => {
    navigator.clipboard.writeText(hash)
    addToast('Hash copied to clipboard', 'success')
  }

  const formatTimestamp = (ts) => {
    const date = new Date(ts)
    return date.toLocaleString()
  }

  const getStatusBadge = (status) => {
    const variants = {
      confirmed: 'success',
      pending: 'warning',
      failed: 'error'
    }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Blockchain Ledger</h1>
          <p className="text-text-secondary mt-1">Immutable transaction records secured on chain</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-green">
            <span className="w-2 h-2 bg-green rounded-full animate-pulse" />
            Network Online
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Transactions</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={stats.total} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">Confirmed</p>
            <span className="w-2 h-2 bg-green rounded-full" />
          </div>
          <p className="text-2xl font-bold text-green mt-1">
            <AnimatedNumber value={stats.confirmed} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">Pending</p>
            <span className="w-2 h-2 bg-orange rounded-full animate-pulse" />
          </div>
          <p className="text-2xl font-bold text-orange mt-1">
            <AnimatedNumber value={stats.pending} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Last 24 Hours</p>
          <p className="text-2xl font-bold text-blue mt-1">
            <AnimatedNumber value={stats.todayCount} />
          </p>
        </div>
      </div>

      {/* Live Feed */}
      <div className="bg-gradient-to-r from-cyan/10 to-blue/10 rounded-xl p-4 border border-blue/20">
        <div className="flex items-center gap-3 mb-3">
          <span className="flex items-center gap-2 text-sm font-medium text-blue">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Live Feed
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {blockchainTxs.slice(0, 5).map((tx, i) => (
            <div 
              key={tx.id}
              className={`shrink-0 bg-white rounded-lg p-3 border border-border min-w-[200px] ${
                tx.isNew ? 'animate-slide-left' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-muted">{tx.type}</span>
                {getStatusBadge(tx.status)}
              </div>
              <p className="font-mono text-xs text-text-primary truncate">{tx.hash}</p>
              <p className="text-xs text-text-muted mt-1">
                {new Date(tx.timestamp).toLocaleTimeString()}
              </p>
            </div>
          ))}
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
            placeholder="Search by hash, type, entity..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Types</option>
          {types.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Statuses</option>
          {statuses.map(status => (
            <option key={status} value={status} className="capitalize">{status}</option>
          ))}
        </select>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Hash</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Type</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Entity</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Block</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Gas</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Timestamp</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxs.slice(0, displayCount).map((tx) => (
                <tr 
                  key={tx.id} 
                  className={`border-b border-border last:border-0 hover:bg-gray-50 transition-colors ${
                    tx.isNew ? 'animate-slide-down bg-green/5' : ''
                  }`}
                >
                  <td className="py-3 px-6">
                    <button 
                      onClick={() => copyHash(tx.hash)}
                      className="font-mono text-sm text-blue hover:underline"
                    >
                      {tx.hash.slice(0, 16)}...{tx.hash.slice(-8)}
                    </button>
                  </td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{tx.type}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{tx.entityId}</td>
                  <td className="py-3 px-6 text-sm font-mono text-text-muted">
                    {tx.blockNumber?.toLocaleString() || '-'}
                  </td>
                  <td className="py-3 px-6 text-sm text-text-muted">{tx.gasUsed?.toLocaleString() || '-'}</td>
                  <td className="py-3 px-6">{getStatusBadge(tx.status)}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary whitespace-nowrap">
                    {formatTimestamp(tx.timestamp)}
                  </td>
                  <td className="py-3 px-6">
                    <button 
                      onClick={() => copyHash(tx.hash)}
                      className="p-1 rounded hover:bg-gray-100 transition-colors"
                      title="Copy Hash"
                    >
                      <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
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
            Showing {Math.min(displayCount, filteredTxs.length)} of {filteredTxs.length} transactions
          </p>
          {displayCount < filteredTxs.length && (
            <Button variant="secondary" size="sm" onClick={() => setDisplayCount(d => d + 50)}>
              Load More
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
