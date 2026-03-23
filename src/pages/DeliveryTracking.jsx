import { useEffect, useState } from 'react'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

export default function DeliveryTracking() {
  const addToast = useStore((s) => s.addToast)
  const [tab, setTab] = useState('deliveries')
  const [deliveries, setDeliveries] = useState([])
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [trackingLookup, setTrackingLookup] = useState('')
  const [trackedDelivery, setTrackedDelivery] = useState(null)
  const [loading, setLoading] = useState(false)
  const [createForm, setCreateForm] = useState({ orderId: '' })

  useEffect(() => { if (tab === 'deliveries') loadDeliveries() }, [tab])

  const loadDeliveries = async () => {
    setLoading(true)
    try { setDeliveries(await apiClient.get('/delivery')) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!createForm.orderId) return addToast('Enter an order ID', 'error')
    setLoading(true)
    try {
      const d = await apiClient.post('/delivery', { orderId: createForm.orderId, customer: {} })
      addToast(`Delivery ${d.trackingNumber} created!`, 'success')
      setCreateForm({ orderId: '' })
      loadDeliveries()
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const handleUpdateStatus = async (deliveryId, status) => {
    try {
      const d = await apiClient.patch(`/delivery/${deliveryId}/status`, { status })
      addToast(`Status updated to ${status}`, 'success')
      setSelectedDelivery(d)
      loadDeliveries()
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleTrack = async () => {
    if (!trackingLookup.trim()) return
    setLoading(true)
    try {
      setTrackedDelivery(await apiClient.get(`/delivery/track/${encodeURIComponent(trackingLookup.trim())}`))
      setTab('track-result')
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const handleVerify = async (trackingNumber) => {
    try {
      const r = await apiClient.get(`/delivery/verify/${encodeURIComponent(trackingNumber)}`)
      addToast(r.verified ? `✓ Verified on blockchain (TX: ${r.txHash?.slice(0, 16)}...)` : `Not yet verified: ${r.reason || 'pending'}`, r.verified ? 'success' : 'info')
    } catch (e) { addToast(e.message, 'error') }
  }

  const barcodeUrl = (text) => `${API_BASE_URL}/delivery/barcode/${encodeURIComponent(text)}`

  const statusColors = {
    created: 'bg-gray-100 text-gray-700',
    dispatched: 'bg-blue-100 text-blue-700',
    in_transit: 'bg-yellow-100 text-yellow-700',
    out_for_delivery: 'bg-orange-100 text-orange-700',
    delivered: 'bg-green-100 text-green-700',
    returned: 'bg-red-100 text-red-700',
  }

  const statusFlow = ['created', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered']

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
          <span className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </span>
          Delivery & Barcode Tracking
        </h1>
        <p className="text-text-secondary mt-1">Barcode per product, delivery tracking with blockchain confirmation on delivery.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'deliveries', label: 'All Deliveries' },
          { id: 'create', label: 'Create Delivery' },
          { id: 'track', label: 'Track Package' },
          { id: 'detail', label: 'Detail View' },
          { id: 'track-result', label: 'Track Result' },
        ].filter((t) => t.id !== 'detail' || selectedDelivery).filter((t) => t.id !== 'track-result' || trackedDelivery)
          .map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
      </div>

      {loading && <div className="text-text-secondary py-8 text-center">Loading...</div>}

      {/* ── All Deliveries ── */}
      {!loading && tab === 'deliveries' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">Tracking #</th><th className="text-left p-3">Order #</th><th className="text-left p-3">Status</th><th className="text-left p-3">Blockchain</th><th className="text-left p-3">Created</th><th className="p-3">Barcode</th></tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d._id} className="border-t border-border cursor-pointer hover:bg-gray-50" onClick={() => { setSelectedDelivery(d); setTab('detail') }}>
                  <td className="p-3 font-mono text-primary">{d.trackingNumber}</td>
                  <td className="p-3">{d.orderNumber}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[d.status]}`}>{d.status.replace('_', ' ')}</span></td>
                  <td className="p-3">{d.blockchainConfirmed ? <span className="text-green-600 font-medium">✓ Confirmed</span> : <span className="text-text-secondary">—</span>}</td>
                  <td className="p-3 text-text-secondary">{new Date(d.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="p-3"><img src={barcodeUrl(d.barcode)} alt="barcode" className="h-8" /></td>
                </tr>
              ))}
              {deliveries.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-text-secondary">No deliveries yet. Create one from a sales order.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Delivery ── */}
      {!loading && tab === 'create' && (
        <div className="bg-white rounded-xl shadow-sm border border-border p-6 max-w-md space-y-4">
          <h3 className="font-semibold text-text-primary">Create Delivery from Order</h3>
          <input value={createForm.orderId} onChange={(e) => setCreateForm({ orderId: e.target.value })} placeholder="Sales Order ID" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleCreate} disabled={loading} className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">Create Delivery</button>
        </div>
      )}

      {/* ── Track Package ── */}
      {tab === 'track' && (
        <div className="bg-white rounded-xl shadow-sm border border-border p-6 max-w-md space-y-4">
          <h3 className="font-semibold text-text-primary">Track by Tracking Number</h3>
          <div className="flex gap-2">
            <input value={trackingLookup} onChange={(e) => setTrackingLookup(e.target.value)} placeholder="TRK-XXXXX-XXXXXX" className="flex-1 border border-border rounded-lg px-3 py-2 text-sm" onKeyDown={(e) => e.key === 'Enter' && handleTrack()} />
            <button onClick={handleTrack} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium">Track</button>
          </div>
        </div>
      )}

      {/* ── Track Result ── */}
      {tab === 'track-result' && trackedDelivery && (
        <DeliveryDetail delivery={trackedDelivery} statusColors={statusColors} statusFlow={statusFlow} barcodeUrl={barcodeUrl} onVerify={handleVerify} onUpdateStatus={null} />
      )}

      {/* ── Detail View ── */}
      {tab === 'detail' && selectedDelivery && (
        <DeliveryDetail delivery={selectedDelivery} statusColors={statusColors} statusFlow={statusFlow} barcodeUrl={barcodeUrl} onVerify={handleVerify} onUpdateStatus={handleUpdateStatus} />
      )}
    </div>
  )
}

function DeliveryDetail({ delivery, statusColors, statusFlow, barcodeUrl, onVerify, onUpdateStatus }) {
  const currentIdx = statusFlow.indexOf(delivery.status)
  const nextStatus = statusFlow[currentIdx + 1]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-text-primary">{delivery.trackingNumber}</h3>
            <p className="text-text-secondary text-sm">Order: {delivery.orderNumber}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[delivery.status]}`}>{delivery.status.replace('_', ' ')}</span>
        </div>

        {/* Status progress bar */}
        <div className="flex items-center gap-1 mt-4">
          {statusFlow.map((s, i) => (
            <div key={s} className="flex-1 flex items-center">
              <div className={`w-full h-2 rounded-full ${i <= currentIdx ? 'bg-primary' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-text-secondary mt-1">
          {statusFlow.map((s) => <span key={s}>{s.replace('_', ' ')}</span>)}
        </div>
      </div>

      {/* Barcode */}
      <div className="bg-white rounded-xl shadow-sm border border-border p-6 text-center">
        <img src={barcodeUrl(delivery.barcode)} alt="Delivery barcode" className="mx-auto" />
        <p className="text-xs font-mono text-text-secondary mt-2">{delivery.barcode}</p>
      </div>

      {/* Items with barcodes */}
      {delivery.items?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">Product</th><th className="text-left p-3">SKU</th><th className="text-right p-3">Qty</th><th className="p-3">Item Barcode</th></tr>
            </thead>
            <tbody>
              {delivery.items.map((item, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3">{item.name}</td>
                  <td className="p-3 font-mono">{item.sku || '—'}</td>
                  <td className="p-3 text-right">{item.quantity}</td>
                  <td className="p-3 text-center"><img src={barcodeUrl(item.barcode)} alt="barcode" className="h-6 mx-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tracking Events */}
      {delivery.trackingEvents?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-border p-6">
          <h3 className="font-semibold text-text-primary mb-3">Tracking History</h3>
          <div className="space-y-3">
            {delivery.trackingEvents.map((ev, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-3 h-3 mt-1 rounded-full ${i === delivery.trackingEvents.length - 1 ? 'bg-primary' : 'bg-gray-300'}`} />
                <div>
                  <p className="text-sm font-medium text-text-primary">{ev.status.replace('_', ' ')}</p>
                  {ev.location && <p className="text-xs text-text-secondary">{ev.location}</p>}
                  {ev.note && <p className="text-xs text-text-secondary">{ev.note}</p>}
                  <p className="text-xs text-text-secondary">{new Date(ev.timestamp).toLocaleString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blockchain proof */}
      {delivery.blockchainConfirmed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
          <p className="font-medium text-green-800">✓ Delivery confirmed on blockchain</p>
          <p className="text-green-700 font-mono text-xs mt-1 break-all">TX: {delivery.blockchainTxHash}</p>
          <p className="text-green-700 text-xs mt-1">Delivered: {delivery.actualDelivery ? new Date(delivery.actualDelivery).toLocaleString('en-IN') : '—'}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {onUpdateStatus && nextStatus && (
          <button onClick={() => onUpdateStatus(delivery._id, nextStatus)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Advance to: {nextStatus.replace('_', ' ')}
          </button>
        )}
        <button onClick={() => onVerify(delivery.trackingNumber)} className="border border-border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
          🔗 Verify Blockchain Proof
        </button>
      </div>
    </div>
  )
}
