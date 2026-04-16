import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { useLiveData } from '../hooks/useLiveData'
import { apiClient } from '../services/api/client'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import Modal from '../components/UI/Modal'

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

  const stats = getBlockchainStats()

  const filteredTxs = useMemo(() => blockchainTxs.filter((tx) => {
    const query = (localSearch || searchQuery).toLowerCase()
    return !query
      || tx.hash.toLowerCase().includes(query)
      || tx.type.toLowerCase().includes(query)
      || tx.entityId.toLowerCase().includes(query)
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
      setVerifyResult({
        tx,
        result,
        title: result.verificationStatus === 'failed' ? 'Tampering Detected' : 'Integrity Verified',
      })
      addToast(
        result.verificationStatus === 'failed'
          ? `Tampering detected for ${display}`
          : `Integrity verified for ${display}`,
        result.verificationStatus === 'failed' ? 'error' : 'success',
      )
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const getStatusBadge = (status) => {
    const variants = { confirmed: 'success', pending: 'warning', failed: 'error' }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Verification Ledger</h1>
          <p className="text-text-secondary mt-1">Blockchain proof entries and integrity verification results</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Total Entries</p><p className="text-2xl font-bold text-text-primary mt-1"><AnimatedNumber value={stats.total} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Confirmed</p><p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={stats.confirmed} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Pending</p><p className="text-2xl font-bold text-orange mt-1"><AnimatedNumber value={stats.pending} /></p></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border"><p className="text-sm text-text-secondary">Last 24 Hours</p><p className="text-2xl font-bold text-blue mt-1"><AnimatedNumber value={stats.todayCount} /></p></div>
      </div>

      <div className="flex flex-wrap gap-4">
        <input type="text" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder="Search by hash, type, entity..." className="flex-1 max-w-xs px-4 py-2 bg-white border border-border rounded-lg text-sm" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
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
                    <td className="py-3 px-6"><button onClick={(event) => { event.stopPropagation(); copyHash(tx.hash) }} className="font-mono text-sm text-blue hover:underline">{tx.hash.slice(0, 16)}...{tx.hash.slice(-8)}</button></td>
                    <td className="py-3 px-6 text-sm text-text-secondary">{tx.type}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">
                      <div className="font-medium text-text-primary">{tx.entityLabel || tx.entityId}</div>
                      <div className="text-xs text-text-muted">{tx.entityId}</div>
                    </td>
                    <td className="py-3 px-6">{getStatusBadge(tx.status)}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary whitespace-nowrap">{new Date(tx.timestamp).toLocaleString()}</td>
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
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">Showing {Math.min(displayCount, filteredTxs.length)} of {filteredTxs.length} transactions</p>
          {displayCount < filteredTxs.length && <Button variant="secondary" size="sm" onClick={() => setDisplayCount((count) => count + 50)}>Load More</Button>}
        </div>
      </div>

      {verifyResult && (
        <Modal title={verifyResult.title} onClose={() => setVerifyResult(null)}>
          <div className="space-y-4">
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
                  : <Badge variant="success">Integrity Verified</Badge>}
              </div>
            </div>
            <div>
              <label className="text-sm text-text-muted">Trusted Hash</label>
              <p className="font-mono text-xs text-text-primary break-all mt-1">{verifyResult.result.expectedHash || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-text-muted">Current Hash</label>
              <p className="font-mono text-xs text-text-primary break-all mt-1">{verifyResult.result.currentHash || '-'}</p>
            </div>
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
              <p className="font-mono text-xs text-text-primary break-all mt-1">{selectedHash.hash}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => copyHash(selectedHash.hash)}>Copy Hash</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
