import { useEffect, useState } from 'react'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

export default function WhatsAppBot() {
  const addToast = useStore((s) => s.addToast)
  const [tab, setTab] = useState('overview')
  const [botActive, setBotActive] = useState(false)
  const [overdueInvoices, setOverdueInvoices] = useState([])
  const [reminderResults, setReminderResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmForm, setConfirmForm] = useState({ invoiceId: '', amount: '', reference: '', method: 'upi' })

  useEffect(() => { loadStatus(); loadOverdue() }, [])

  const loadStatus = async () => {
    try {
      const s = await apiClient.get('/whatsapp/status')
      setBotActive(s.active)
    } catch {}
  }

  const loadOverdue = async () => {
    setLoading(true)
    try { setOverdueInvoices(await apiClient.get('/whatsapp/overdue')) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const handleSendReminder = async (invoiceId) => {
    try {
      const r = await apiClient.post(`/whatsapp/remind/${invoiceId}`)
      addToast(r.sent ? 'Reminder sent via WhatsApp' : `Not sent: ${r.reason}`, r.sent ? 'success' : 'error')
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleBulkReminders = async () => {
    setLoading(true)
    try {
      const results = await apiClient.post('/whatsapp/remind-all')
      setReminderResults(results)
      setTab('results')
      const sent = results.filter((r) => r.sent).length
      addToast(`${sent}/${results.length} reminders sent`, 'success')
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const handleConfirmPayment = async () => {
    if (!confirmForm.invoiceId) return addToast('Select an invoice', 'error')
    setLoading(true)
    try {
      await apiClient.post('/whatsapp/confirm-payment', {
        invoiceId: confirmForm.invoiceId,
        amount: confirmForm.amount ? Number(confirmForm.amount) : undefined,
        method: confirmForm.method,
        reference: confirmForm.reference,
      })
      addToast('Payment confirmed, ledger updated, blockchain anchored!', 'success')
      setConfirmForm({ invoiceId: '', amount: '', reference: '', method: 'upi' })
      loadOverdue()
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.257-.154-2.87.852.852-2.87-.154-.257A8 8 0 1112 20z" />
              </svg>
            </span>
            WhatsApp Payment Bot
          </h1>
          <p className="text-text-secondary mt-1">Auto-send payment reminders with UPI links. On payment → update ledger on-chain.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${botActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
          <span className="text-sm text-text-secondary">{botActive ? 'WhatsApp Connected' : 'Not Configured'}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'overview', label: 'Overdue Invoices' },
          { id: 'confirm', label: 'Confirm Payment' },
          { id: 'results', label: 'Reminder Results' },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
        <button onClick={handleBulkReminders} disabled={loading}
          className="ml-auto bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? 'Sending...' : '📤 Send All Reminders'}
        </button>
      </div>

      {loading && <div className="text-text-secondary py-8 text-center">Loading...</div>}

      {/* ── Overdue Invoices ── */}
      {!loading && tab === 'overview' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">Invoice #</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Phone</th><th className="text-right p-3">Balance Due</th><th className="text-left p-3">Due Date</th><th className="p-3">Action</th></tr>
            </thead>
            <tbody>
              {overdueInvoices.map((inv) => (
                <tr key={inv._id} className="border-t border-border">
                  <td className="p-3 font-mono">{inv.invoiceNumber}</td>
                  <td className="p-3">{inv.customer?.name || '—'}</td>
                  <td className="p-3 text-text-secondary">{inv.customer?.phone || '—'}</td>
                  <td className="p-3 text-right font-medium text-red-600">{fmt(inv.balanceDue)}</td>
                  <td className="p-3 text-text-secondary">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleSendReminder(inv._id)} className="text-xs text-green-600 hover:underline font-medium">
                      📲 Remind
                    </button>
                  </td>
                </tr>
              ))}
              {overdueInvoices.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-text-secondary">No overdue invoices 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Confirm Payment ── */}
      {!loading && tab === 'confirm' && (
        <div className="bg-white rounded-xl shadow-sm border border-border p-6 max-w-md space-y-4">
          <h3 className="font-semibold text-text-primary">Manual Payment Confirmation</h3>
          <p className="text-sm text-text-secondary">Use this when a customer has paid outside WhatsApp. This will update the invoice, push a journal entry, and anchor on blockchain.</p>
          <select value={confirmForm.invoiceId} onChange={(e) => setConfirmForm({ ...confirmForm, invoiceId: e.target.value })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm">
            <option value="">Select overdue invoice...</option>
            {overdueInvoices.map((inv) => (
              <option key={inv._id} value={inv._id}>{inv.invoiceNumber} — {fmt(inv.balanceDue)}</option>
            ))}
          </select>
          <input type="number" value={confirmForm.amount} onChange={(e) => setConfirmForm({ ...confirmForm, amount: e.target.value })} placeholder="Amount (blank = full balance)" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          <select value={confirmForm.method} onChange={(e) => setConfirmForm({ ...confirmForm, method: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
            <option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="card">Card</option>
          </select>
          <input value={confirmForm.reference} onChange={(e) => setConfirmForm({ ...confirmForm, reference: e.target.value })} placeholder="Payment reference / UTR" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleConfirmPayment} disabled={loading} className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
            Confirm Payment + Anchor On-Chain
          </button>
        </div>
      )}

      {/* ── Reminder Results ── */}
      {!loading && tab === 'results' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">Invoice #</th><th className="text-left p-3">Status</th><th className="text-left p-3">Details</th></tr>
            </thead>
            <tbody>
              {reminderResults.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-mono">{r.invoiceNumber}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.sent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {r.sent ? 'Sent' : 'Failed'}
                    </span>
                  </td>
                  <td className="p-3 text-text-secondary">{r.reason || '—'}</td>
                </tr>
              ))}
              {reminderResults.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-text-secondary">No results yet. Click "Send All Reminders".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── How It Works ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-800 mb-3">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-blue-700">
          <div className="flex items-start gap-2"><span className="font-bold text-lg">1</span><p>System detects overdue invoices and sends WhatsApp messages with UPI payment links</p></div>
          <div className="flex items-start gap-2"><span className="font-bold text-lg">2</span><p>Customer clicks UPI link and pays via any UPI app (GPay, PhonePe, Paytm)</p></div>
          <div className="flex items-start gap-2"><span className="font-bold text-lg">3</span><p>Customer replies "PAID &lt;reference&gt;" on WhatsApp — webhook auto-processes it</p></div>
          <div className="flex items-start gap-2"><span className="font-bold text-lg">4</span><p>Ledger is updated, journal entry created, and payment proof anchored on blockchain</p></div>
        </div>
      </div>
    </div>
  )
}
