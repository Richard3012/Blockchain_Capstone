import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { useLiveData } from '../hooks/useLiveData'
import { apiClient } from '../services/api/client'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import Modal from '../components/UI/Modal'

const formatHashSnippet = (hash) => {
  const h = String(hash || '')
  if (h.length <= 20) return h || '—'
  return `${h.slice(0, 16)}…${h.slice(-8)}`
}

export default function Blockchain() {
  useLiveData('blockchain')
  const blockchainTxs = useStore((state) => state.blockchainTxs)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getBlockchainStats = useStore((state) => state.getBlockchainStats)
  const setActivePage = useStore((state) => state.setActivePage)

  const [localSearch, setLocalSearch] = useState('')
  const [hoveredId, setHoveredId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [displayCount, setDisplayCount] = useState(50)
  const [verifyResult, setVerifyResult] = useState(null)
  const [selectedHash, setSelectedHash] = useState(null)

  const [verificationLog, setVerificationLog] = useState([])
  const [logLoading, setLogLoading] = useState(true)
  const [logStatus, setLogStatus] = useState('all')
  const [logEntityType, setLogEntityType] = useState('all')
  const [logFrom, setLogFrom] = useState('')
  const [logTo, setLogTo] = useState('')

  const stats = getBlockchainStats()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLogLoading(true)
      try {
        const qs = new URLSearchParams()
        if (logStatus !== 'all') qs.set('status', logStatus)
        if (logEntityType !== 'all') qs.set('entityType', logEntityType)
        if (logFrom) qs.set('from', logFrom)
        if (logTo) qs.set('to', logTo)
        qs.set('limit', '300')
        const rows = await apiClient.get(`/blockchain/verification-log?${qs.toString()}`)
        if (!cancelled) setVerificationLog(Array.isArray(rows) ? rows : [])
      } catch {
        if (!cancelled) setVerificationLog([])
      } finally {
        if (!cancelled) setLogLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [logStatus, logEntityType, logFrom, logTo])

  const logStats = useMemo(() => {
    const verified = verificationLog.filter((e) => e.status === 'verified').length
    const tampered = verificationLog.filter((e) => e.status === 'tampered').length
    const pending = verificationLog.filter((e) => e.status === 'pending').length
    return { verified, tampered, pending, total: verificationLog.length }
  }, [verificationLog])

  const filteredTxs = useMemo(() => blockchainTxs.filter((tx) => {
    const query = (localSearch || searchQuery).toLowerCase()
    const h = String(tx.hash || '').toLowerCase()
    return !query
      || h.includes(query)
      || String(tx.type || '').toLowerCase().includes(query)
      || String(tx.entityId || '').toLowerCase().includes(query)
      || String(tx.entityLabel || '').toLowerCase().includes(query)
  }), [blockchainTxs, localSearch, searchQuery])

  const copyHash = (hash) => {
    navigator.clipboard.writeText(hash)
    addToast('Hash copied to clipboard', 'success')
  }

  const getEntityDisplay = (tx, verification = null) => verification?.recordLabel || tx.entityLabel || tx.entityId

  const handleVerify = async (tx) => {
    try {
      const result = await apiClient.get(`/blockchain/verify/${tx.type}/${tx.entityId}`)
      const display = getEntityDisplay(tx, result)
      const st = String(result.verificationStatus || '').toLowerCase()
      setVerifyResult({
        tx,
        result,
        title: st === 'failed' ? 'Tampering Detected' : st === 'verified' ? 'Integrity Verified' : 'Verification Result',
      })
      if (st === 'failed' || result.mismatchReasons?.length) {
        addToast(`Tampering detected for ${display}`, 'error')
      } else if (st === 'not_requested' || st === 'pending') {
        addToast(`Integrity check incomplete for ${display} (${st})`, 'warning')
      } else {
        addToast(`Integrity verified for ${display}`, 'success')
      }
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase()
    const variants = { confirmed: 'success', pending: 'warning', failed: 'error' }
    return <Badge variant={variants[s] || 'default'}>{s}</Badge>
  }

  const verificationOutcomeBadge = (status) => {
    const s = String(status || '').toLowerCase()
    if (s === 'verified') return <Badge variant="success">Verified</Badge>
    if (s === 'tampered') return <Badge variant="error">Tampered</Badge>
    if (s === 'pending') return <Badge variant="warning">Pending</Badge>
    return <Badge variant="default">Not requested</Badge>
  }

  const getSourceLabel = (source) => {
    if (source === 'external_or_untracked') return 'External / outside trusted app flow'
    if (source === 'application_user') return 'Application-tracked modification'
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Verification Ledger</h1>
          <p className="text-text-secondary mt-1">On-chain anchors, MongoDB integrity chain, and every explicit verification outcome.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Anchor rows</p><p className="text-2xl font-bold text-text-primary mt-1"><AnimatedNumber value={stats.total} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Anchored / confirmed</p><p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={stats.confirmed} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Chain pending</p><p className="text-2xl font-bold text-orange mt-1"><AnimatedNumber value={stats.pending} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Last 24 hours (anchors)</p><p className="text-2xl font-bold text-blue mt-1"><AnimatedNumber value={stats.todayCount} /></p></div>
      </div>

      <section className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-text-primary">Verification outcomes</h2>
            <p className="text-sm text-text-secondary mt-0.5">Each row is logged when you run Verify Integrity (or invoice verify). {logLoading ? 'Loading…' : `${logStats.total} events`}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-green/10 text-green font-medium">Verified {logStats.verified}</span>
            <span className="px-2 py-1 rounded-full bg-red/10 text-red font-medium">Tampered {logStats.tampered}</span>
            <span className="px-2 py-1 rounded-full bg-orange/10 text-orange font-medium">Pending {logStats.pending}</span>
          </div>
        </div>
        <div className="px-6 py-3 flex flex-wrap gap-3 border-b border-border bg-gray-50/80">
          <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)} className="px-3 py-2 border border-border rounded-lg text-sm bg-white">
            <option value="all">All statuses</option>
            <option value="verified">Verified</option>
            <option value="tampered">Tampered</option>
            <option value="pending">Pending</option>
            <option value="not_requested">Not requested</option>
          </select>
          <select value={logEntityType} onChange={(e) => setLogEntityType(e.target.value)} className="px-3 py-2 border border-border rounded-lg text-sm bg-white">
            <option value="all">All types</option>
            <option value="sales_order">Sales order</option>
            <option value="invoice">Invoice</option>
          </select>
          <input type="date" value={logFrom} onChange={(e) => setLogFrom(e.target.value)} className="px-3 py-2 border border-border rounded-lg text-sm bg-white" />
          <input type="date" value={logTo} onChange={(e) => setLogTo(e.target.value)} className="px-3 py-2 border border-border rounded-lg text-sm bg-white" />
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-border">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">When</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Record</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              {verificationLog.map((entry) => (
                <tr key={entry._id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-6 text-sm text-text-secondary whitespace-nowrap">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</td>
                  <td className="py-3 px-6 text-sm">
                    <div className="font-medium text-text-primary">{entry.recordLabel || entry.entityId}</div>
                    <div className="text-xs text-text-muted font-mono">{entry.entityId}</div>
                  </td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{entry.entityType}</td>
                  <td className="py-3 px-6">{verificationOutcomeBadge(entry.status)}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary max-w-md">
                    <p>{entry.message || '—'}</p>
                    {entry.tamperSource && <p className="text-xs text-red mt-1">{getSourceLabel(entry.tamperSource)}</p>}
                    {entry.fieldDiffs?.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs border border-border rounded-lg p-2 bg-gray-50 max-h-32 overflow-y-auto">
                        {entry.fieldDiffs.map((d, i) => (
                          <li key={`${entry._id}-d-${i}`}><span className="font-medium text-text-primary">{d.field}</span>: {JSON.stringify(d.before)} → {JSON.stringify(d.after)}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
              {!logLoading && verificationLog.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-secondary">
                    No verification events yet. Use Verify Integrity on an order or invoice to populate this ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-4">
        <input type="text" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder="Search anchors by hash, type, entity..." className="flex-1 max-w-xs px-4 py-2 bg-white border border-border rounded-lg text-sm" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-3 border-b border-border bg-gray-50">
          <h2 className="font-semibold text-text-primary">Blockchain anchor index</h2>
          <p className="text-sm text-text-secondary mt-0.5">Anchored hashes and sync state (may include virtual rows for orders without a chain tx yet).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Hash</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Type</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Entity</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Timestamp</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxs.slice(0, displayCount).map((tx) => {
                const isHovered = hoveredId === tx.id
                const isSelected = selectedId === tx.id
                return (
                  <tr
                    key={tx.id}
                    onMouseEnter={() => setHoveredId(tx.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedId(tx.id)}
                    className={`border-b border-border last:border-0 transition-colors ${
                      isSelected ? 'bg-blue/10' : isHovered ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <td className="py-3 px-6">
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); if (tx.hash) copyHash(tx.hash) }}
                        className="font-mono text-sm text-blue hover:underline"
                      >
                        {formatHashSnippet(tx.hash)}
                      </button>
                    </td>
                    <td className="py-3 px-6 text-sm text-text-secondary">{tx.type}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">
                      <div className="font-medium text-text-primary">{tx.entityLabel || tx.entityId}</div>
                      <div className="text-xs text-text-muted">{tx.entityId}</div>
                      {tx.tamperSource && (
                        <div className="mt-1 text-xs text-red">{getSourceLabel(tx.tamperSource)}</div>
                      )}
                    </td>
                    <td className="py-3 px-6">{getStatusBadge(tx.status)}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary whitespace-nowrap">{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}</td>
                    <td className="py-3 px-6" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => handleVerify(tx)}>Verify Integrity</Button>
                        <Button variant="secondary" size="sm" onClick={() => setSelectedHash(tx)}>View Hash</Button>
                        <Button variant="secondary" size="sm" onClick={() => setActivePage('audit')}>View Audit Trail</Button>
                      </div>
                      {tx.errorMessage && tx.status === 'failed' && <p className="mt-2 text-xs text-red">{tx.errorMessage}</p>}
                    </td>
                  </tr>
                )
              })}
              {filteredTxs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <p className="text-sm font-medium text-text-primary">No anchor rows match this search.</p>
                    <p className="mt-1 text-sm text-text-secondary">Create a sales order or invoice to generate anchored hashes.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">Showing {Math.min(displayCount, filteredTxs.length)} of {filteredTxs.length} anchor rows</p>
          {displayCount < filteredTxs.length && <Button variant="secondary" size="sm" onClick={() => setDisplayCount((count) => count + 50)}>Load More</Button>}
        </div>
      </div>

      {verifyResult && (
        <Modal title={verifyResult.title} onClose={() => setVerifyResult(null)}>
          <div className="space-y-4 max-h-[min(80vh,640px)] overflow-y-auto">
            <div>
              <label className="text-sm text-text-muted">Record</label>
              <p className="font-medium text-text-primary">{getEntityDisplay(verifyResult.tx, verifyResult.result)}</p>
              <p className="text-xs text-text-muted mt-1">ID: {verifyResult.tx.entityId}</p>
            </div>
            <div>
              <label className="text-sm text-text-muted">Verification Status</label>
              <div className="mt-2">
                {verifyResult.result.verificationStatus === 'failed'
                  ? <Badge variant="error">Tampering Detected</Badge>
                  : verifyResult.result.verificationStatus === 'verified'
                    ? <Badge variant="success">Integrity Verified</Badge>
                    : <Badge variant="warning">{String(verifyResult.result.verificationStatus || 'unknown')}</Badge>}
              </div>
            </div>
            {verifyResult.result.verificationStatus === 'failed' && (
              <div>
                <label className="text-sm text-text-muted">Detected Source</label>
                <p className="font-medium text-text-primary mt-1">{getSourceLabel(verifyResult.result.tamperSource) || 'Unclassified'}</p>
              </div>
            )}
            {(verifyResult.result.fieldDiffs?.length > 0) && (
              <div className="rounded-xl border border-red/20 bg-red/5 p-4">
                <p className="text-sm font-medium text-text-primary">Changed fields (snapshot vs current)</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {verifyResult.result.fieldDiffs.map((d, i) => (
                    <li key={`vd-${i}`} className="border border-border rounded-lg p-2 bg-white">
                      <span className="font-medium">{d.field}</span>
                      <div className="text-text-secondary mt-1">Before: {JSON.stringify(d.before)}</div>
                      <div className="text-text-secondary">After: {JSON.stringify(d.after)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <label className="text-sm text-text-muted">Stored chain head</label>
              <p className="font-mono text-xs text-text-primary break-all mt-1">{verifyResult.result.expectedHash || verifyResult.result.storedHash || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-text-muted">Recomputed hash</label>
              <p className="font-mono text-xs text-text-primary break-all mt-1">{verifyResult.result.recomputedHash || verifyResult.result.currentHash || '-'}</p>
            </div>
            {verifyResult.result.lastTrackedChange && (
              <div className="rounded-lg border border-border p-4 text-sm">
                <p className="font-medium text-text-primary">Last tracked app change</p>
                <p className="mt-1 text-text-secondary">{verifyResult.result.lastTrackedChange.summary}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {verifyResult.result.lastTrackedChange.actor?.name || 'Unknown'} · {new Date(verifyResult.result.lastTrackedChange.createdAt).toLocaleString()}
                </p>
              </div>
            )}
            {verifyResult.result.onChainVerification?.error && verifyResult.result.verificationStatus === 'failed' && (
              <div className="rounded-lg border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-text-secondary">
                {verifyResult.result.onChainVerification.error}
              </div>
            )}
          </div>
        </Modal>
      )}

      {selectedHash && (
        <Modal title={`Hash Details for ${selectedHash.entityLabel || selectedHash.entityId}`} onClose={() => setSelectedHash(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-text-muted">Record</label>
              <p className="font-medium text-text-primary">{selectedHash.entityLabel || selectedHash.entityId}</p>
            </div>
            <div>
              <label className="text-sm text-text-muted">Ledger Hash</label>
              <p className="font-mono text-xs text-text-primary break-all mt-1">{selectedHash.hash || '—'}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" disabled={!selectedHash.hash} onClick={() => copyHash(selectedHash.hash)}>Copy Hash</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
