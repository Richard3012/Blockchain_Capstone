import { useEffect, useState, useCallback, useRef } from 'react'
import io from 'socket.io-client'
import { gstService } from '../services/erpServices'
import { useStore } from '../store/useStore'

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4000'

const currentPeriod = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

const RETURN_TYPES = ['GSTR1', 'GSTR3B']

export default function GSTCompliance() {
  const addToast = useStore((s) => s.addToast)
  const [tab, setTab] = useState('summary')
  const [period, setPeriod] = useState(currentPeriod())
  const [summary, setSummary] = useState(null)
  const [gstr1, setGstr1] = useState(null)
  const [gstr3b, setGstr3b] = useState(null)
  const [returns, setReturns] = useState([])
  const [hsnQuery, setHsnQuery] = useState('')
  const [hsnResults, setHsnResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [filing, setFiling] = useState(false)
  const [stats, setStats] = useState(null)
  const [gstinInput, setGstinInput] = useState('')
  const [gstinResult, setGstinResult] = useState(null)
  const [selectedReturn, setSelectedReturn] = useState(null)

  const summaryView = summary || {
    invoiceCount: 0,
    totalTaxableValue: 0,
    totalCGST: 0,
    totalSGST: 0,
    totalIGST: 0,
    totalTax: 0,
    totalCess: 0,
    periodLocked: false,
    validation: null,
  }

  /* ── Data loaders ──────────────────────────────── */

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try { setSummary(await gstService.getSummary(period)) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }, [period, addToast])

  const loadGSTR1 = useCallback(async () => {
    setLoading(true)
    try { setGstr1(await gstService.generateGSTR1(period)) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }, [period, addToast])

  const loadGSTR3B = useCallback(async () => {
    setLoading(true)
    try { setGstr3b(await gstService.generateGSTR3B(period)) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }, [period, addToast])

  const loadReturns = useCallback(async () => {
    setLoading(true)
    try { setReturns(await gstService.getReturns()) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }, [addToast])

  const initialPeriodSet = useRef(false)

  const loadStats = useCallback(async () => {
    try {
      const data = await gstService.getStats()
      setStats(data)
      // Default to the latest period that has invoices on first load
      if (data.latestInvoicePeriod && !initialPeriodSet.current) {
        setPeriod(data.latestInvoicePeriod)
        initialPeriodSet.current = true
      }
    } catch (e) { /* silent */ }
  }, [])

  useEffect(() => {
    if (tab === 'summary') { loadSummary(); loadStats() }
    if (tab === 'gstr1') loadGSTR1()
    if (tab === 'gstr3b') loadGSTR3B()
    if (tab === 'returns') loadReturns()
  }, [tab, period])

  useEffect(() => { loadStats() }, [])

  /* ── Socket.IO real-time ────────────────────────── */

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })

    socket.on('gst:return-filed', () => {
      loadReturns()
      loadStats()
      if (tab === 'summary') loadSummary()
      if (tab === 'gstr1') loadGSTR1()
      if (tab === 'gstr3b') loadGSTR3B()
    })

    return () => socket.disconnect()
  }, [tab, period])

  /* ── Actions ───────────────────────────────────── */

  const handleFileReturn = async (returnType) => {
    if (filing) return
    setFiling(true)
    try {
      await gstService.fileReturn(returnType, period)
      addToast(`${returnType} filed successfully for ${period}`, 'success')
      loadReturns()
      loadStats()
      if (tab === 'gstr1') loadGSTR1()
      if (tab === 'gstr3b') loadGSTR3B()
      if (tab === 'summary') loadSummary()
    } catch (e) { addToast(e.message, 'error') }
    setFiling(false)
  }

  const handleHSNSearch = async () => {
    if (hsnQuery.length < 2) return
    try { setHsnResults(await gstService.searchHSN(hsnQuery)) } catch (e) { addToast(e.message, 'error') }
  }

  const handleGSTINValidate = async () => {
    if (gstinInput.length !== 15) { addToast('GSTIN must be 15 characters', 'error'); return }
    try { setGstinResult(await gstService.validateGSTIN(gstinInput)) } catch (e) { addToast(e.message, 'error') }
  }

  const handleViewReturn = async (returnId) => {
    try {
      const data = await gstService.getReturnById(returnId)
      setSelectedReturn(data)
    } catch (e) { addToast(e.message, 'error') }
  }

  /* ── UI helpers ────────────────────────────────── */

  const tabs = [
    { id: 'summary', label: 'GST Summary' },
    { id: 'gstr1', label: 'GSTR-1' },
    { id: 'gstr3b', label: 'GSTR-3B' },
    { id: 'returns', label: 'Filed Returns' },
    { id: 'hsn', label: 'HSN Lookup' },
    { id: 'validate', label: 'GSTIN Validator' },
  ]

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

  const statusBadge = (status) => {
    const colors = {
      filed: 'bg-green-100 text-green-700',
      accepted: 'bg-blue-100 text-blue-700',
      draft: 'bg-yellow-100 text-yellow-700',
      rejected: 'bg-red-100 text-red-700',
      error: 'bg-red-100 text-red-700',
    }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>{status}</span>
  }

  const ValidationMessages = ({ validation }) => {
    if (!validation) return null
    const { errors = [], warnings = [] } = validation
    if (errors.length === 0 && warnings.length === 0) return null
    return (
      <div className="space-y-1.5 mt-3">
        {errors.map((e, i) => (
          <div key={`e${i}`} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            <span className="font-bold shrink-0">✕</span>
            <span><b>{e.field}:</b> {e.message}</span>
          </div>
        ))}
        {warnings.map((w, i) => (
          <div key={`w${i}`} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
            <span className="font-bold shrink-0">⚠</span>
            <span><b>{w.field}:</b> {w.message}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">GST Compliance</h1>
          <p className="text-text-secondary mt-1">Manage GST returns, summaries, HSN codes, and GSTIN validation.</p>
        </div>
        {stats && (
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-text-secondary">Returns Filed</p>
              <p className="text-lg font-bold text-text-primary">{stats.totalReturnsFiled}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-secondary">This Month Tax</p>
              <p className="text-lg font-bold text-green-600">{fmt(stats.currentMonthTax)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-secondary">This Month Invoices</p>
              <p className="text-lg font-bold text-text-primary">{stats.currentMonthInvoices}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Row (visible on summary tab) ───────── */}
      {tab === 'summary' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Returns Filed', value: stats.totalReturnsFiled, color: 'text-blue-600' },
            { label: 'Current Period', value: stats.currentPeriod, color: 'text-text-primary' },
            { label: 'Month Tax', value: fmt(stats.currentMonthTax), color: 'text-green-600' },
            { label: 'Period Status', value: stats.periodLocked ? 'Filed' : 'Open', color: stats.periodLocked ? 'text-green-600' : 'text-amber-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-xl p-4 shadow-sm border border-border">
              <p className="text-xs text-text-secondary">{kpi.label}</p>
              <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Period Selector ────────────────────────── */}
      {!['hsn', 'validate'].includes(tab) && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-secondary">Period (YYYYMM):</label>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={6}
            className="border border-border rounded-lg px-3 py-2 text-sm w-32" />
          {summaryView.periodLocked && tab === 'summary' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Period Locked (Filed)</span>
          )}
        </div>
      )}

      {loading && <div className="text-text-secondary py-8 text-center">Loading...</div>}

      {/* ══════════════════════════════════════════════ */}
      {/*  TAB: SUMMARY                                 */}
      {/* ══════════════════════════════════════════════ */}
      {!loading && tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Invoices', value: summaryView.invoiceCount },
              { label: 'Taxable Value', value: fmt(summaryView.totalTaxableValue) },
              { label: 'CGST', value: fmt(summaryView.totalCGST) },
              { label: 'SGST', value: fmt(summaryView.totalSGST) },
              { label: 'IGST', value: fmt(summaryView.totalIGST) },
              { label: 'Cess', value: fmt(summaryView.totalCess) },
              { label: 'Total Tax', value: fmt(summaryView.totalTax) },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm border border-border">
                <p className="text-xs text-text-secondary">{card.label}</p>
                <p className="text-lg font-bold text-text-primary mt-1">{card.value}</p>
              </div>
            ))}
          </div>

          <ValidationMessages validation={summaryView.validation} />

          {/* Quick file buttons */}
          {!summaryView.periodLocked && summaryView.invoiceCount > 0 && (
            <div className="flex gap-3 mt-4">
              {RETURN_TYPES.map((rt) => (
                <button key={rt} onClick={() => handleFileReturn(rt)} disabled={filing}
                  className="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
                  {filing ? 'Filing...' : `File ${rt}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*  TAB: GSTR-1                                  */}
      {/* ══════════════════════════════════════════════ */}
      {!loading && tab === 'gstr1' && gstr1 && (
        <div className="space-y-4">
          {/* Top bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <p className="text-sm text-text-secondary">{gstr1.invoiceCount} invoices for period {gstr1.period}</p>
              {gstr1.periodLocked && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Filed</span>
              )}
            </div>
            {!gstr1.periodLocked && gstr1.invoiceCount > 0 && (
              <button onClick={() => handleFileReturn('GSTR1')} disabled={filing}
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {filing ? 'Filing...' : 'File GSTR-1'}
              </button>
            )}
          </div>

          {/* Tax summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Taxable', value: fmt(gstr1.totalTaxableValue) },
              { label: 'CGST', value: fmt(gstr1.totalCGST) },
              { label: 'SGST', value: fmt(gstr1.totalSGST) },
              { label: 'IGST', value: fmt(gstr1.totalIGST) },
              { label: 'Total Tax', value: fmt(gstr1.totalTax) },
            ].map((c) => (
              <div key={c.label} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-text-secondary">{c.label}</p>
                <p className="font-bold text-text-primary mt-0.5">{c.value}</p>
              </div>
            ))}
          </div>

          <ValidationMessages validation={gstr1.validation} />

          {/* Invoice table */}
          <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary">
                <tr>
                  <th className="text-left p-3">Invoice #</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">GSTIN</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Taxable</th>
                  <th className="text-right p-3">Tax</th>
                  <th className="text-right p-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {(gstr1.invoices || []).map((inv, i) => (
                  <tr key={i} className="border-t border-border hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="p-3">{inv.customerName}</td>
                    <td className="p-3 font-mono text-xs">{inv.gstin || '—'}</td>
                    <td className="p-3 text-text-secondary">{inv.date ? new Date(inv.date).toLocaleDateString() : '—'}</td>
                    <td className="p-3">{statusBadge(inv.status)}</td>
                    <td className="p-3 text-right">{fmt(inv.taxableValue)}</td>
                    <td className="p-3 text-right">{fmt(inv.taxAmount)}</td>
                    <td className="p-3 text-right font-medium">{fmt(inv.totalAmount)}</td>
                  </tr>
                ))}
                {(!gstr1.invoices || gstr1.invoices.length === 0) && (
                  <tr><td colSpan={8} className="p-6 text-center text-text-secondary">No invoices for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*  TAB: GSTR-3B                                 */}
      {/* ══════════════════════════════════════════════ */}
      {!loading && tab === 'gstr3b' && gstr3b && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">GSTR-3B Summary — {period}</h2>
            <button onClick={() => handleFileReturn('GSTR3B')} disabled={filing}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {filing ? 'Filing...' : 'File GSTR-3B'}
            </button>
          </div>

          {/* Outward supplies */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-5">
            <h3 className="font-semibold text-text-primary mb-3">3.1 Outward Supplies (Sales)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><p className="text-xs text-text-secondary">Invoices</p><p className="font-bold">{gstr3b.outwardSupplies.invoiceCount}</p></div>
              <div><p className="text-xs text-text-secondary">Taxable Value</p><p className="font-bold">{fmt(gstr3b.outwardSupplies.totalTaxableValue)}</p></div>
              <div><p className="text-xs text-text-secondary">CGST</p><p className="font-bold">{fmt(gstr3b.outwardSupplies.totalCGST)}</p></div>
              <div><p className="text-xs text-text-secondary">SGST</p><p className="font-bold">{fmt(gstr3b.outwardSupplies.totalSGST)}</p></div>
              <div><p className="text-xs text-text-secondary">IGST</p><p className="font-bold">{fmt(gstr3b.outwardSupplies.totalIGST)}</p></div>
            </div>
          </div>

          {/* Inward supplies (ITC) */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-5">
            <h3 className="font-semibold text-text-primary mb-3">4. ITC Available (Inward Supplies)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><p className="text-xs text-text-secondary">Invoices</p><p className="font-bold">{gstr3b.inwardSupplies.invoiceCount}</p></div>
              <div><p className="text-xs text-text-secondary">Taxable Value</p><p className="font-bold">{fmt(gstr3b.inwardSupplies.totalTaxableValue)}</p></div>
              <div><p className="text-xs text-text-secondary">CGST</p><p className="font-bold text-green-600">{fmt(gstr3b.itcAvailable.totalCGST)}</p></div>
              <div><p className="text-xs text-text-secondary">SGST</p><p className="font-bold text-green-600">{fmt(gstr3b.itcAvailable.totalSGST)}</p></div>
              <div><p className="text-xs text-text-secondary">IGST</p><p className="font-bold text-green-600">{fmt(gstr3b.itcAvailable.totalIGST)}</p></div>
            </div>
          </div>

          {/* Net tax payable */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
            <h3 className="font-semibold text-blue-900 mb-3">6. Net Tax Payable</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><p className="text-xs text-blue-700">CGST</p><p className="font-bold text-blue-900">{fmt(gstr3b.netTaxPayable.cgst)}</p></div>
              <div><p className="text-xs text-blue-700">SGST</p><p className="font-bold text-blue-900">{fmt(gstr3b.netTaxPayable.sgst)}</p></div>
              <div><p className="text-xs text-blue-700">IGST</p><p className="font-bold text-blue-900">{fmt(gstr3b.netTaxPayable.igst)}</p></div>
              <div><p className="text-xs text-blue-700">Cess</p><p className="font-bold text-blue-900">{fmt(gstr3b.netTaxPayable.cess)}</p></div>
              <div><p className="text-xs text-blue-700">Total</p><p className="text-xl font-bold text-blue-900">{fmt(gstr3b.netTaxPayable.total)}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*  TAB: FILED RETURNS                           */}
      {/* ══════════════════════════════════════════════ */}
      {!loading && tab === 'returns' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary">
                <tr>
                  <th className="text-left p-3">Return Type</th>
                  <th className="text-left p-3">Period</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Taxable Value</th>
                  <th className="text-right p-3">Tax Liability</th>
                  <th className="text-right p-3">Invoices</th>
                  <th className="text-left p-3">Filed Date</th>
                  <th className="text-left p-3">Filed By</th>
                  <th className="text-left p-3">Blockchain</th>
                  <th className="text-center p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r, i) => (
                  <tr key={i} className="border-t border-border hover:bg-gray-50">
                    <td className="p-3 font-mono font-medium">{r.returnType}</td>
                    <td className="p-3">{r.period}</td>
                    <td className="p-3">{statusBadge(r.status)}</td>
                    <td className="p-3 text-right">{fmt(r.totalTaxableValue)}</td>
                    <td className="p-3 text-right font-medium">{fmt((r.totalCGST || 0) + (r.totalSGST || 0) + (r.totalIGST || 0))}</td>
                    <td className="p-3 text-right">{r.invoiceCount}</td>
                    <td className="p-3 text-text-secondary">{r.filingDate ? new Date(r.filingDate).toLocaleDateString() : '—'}</td>
                    <td className="p-3 text-text-secondary">{r.filedBy?.name || '—'}</td>
                    <td className="p-3">
                      {r.blockchainTxHash ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700" title={r.blockchainTxHash}>
                          Anchored
                        </span>
                      ) : (
                        <span className="text-xs text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleViewReturn(r._id)}
                        className="text-primary text-xs font-medium hover:underline">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-text-secondary">No returns filed yet</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Return detail modal */}
          {selectedReturn && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedReturn(null)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-text-primary">{selectedReturn.returnType} — {selectedReturn.period}</h3>
                  <button onClick={() => setSelectedReturn(null)} className="text-text-secondary hover:text-text-primary text-xl">×</button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-text-secondary">Status:</span> {statusBadge(selectedReturn.status)}</div>
                  <div><span className="text-text-secondary">Filing Date:</span> {selectedReturn.filingDate ? new Date(selectedReturn.filingDate).toLocaleString() : '—'}</div>
                  <div><span className="text-text-secondary">Taxable Value:</span> <b>{fmt(selectedReturn.totalTaxableValue)}</b></div>
                  <div><span className="text-text-secondary">Invoices:</span> <b>{selectedReturn.invoiceCount}</b></div>
                  <div><span className="text-text-secondary">CGST:</span> {fmt(selectedReturn.totalCGST)}</div>
                  <div><span className="text-text-secondary">SGST:</span> {fmt(selectedReturn.totalSGST)}</div>
                  <div><span className="text-text-secondary">IGST:</span> {fmt(selectedReturn.totalIGST)}</div>
                  <div><span className="text-text-secondary">Cess:</span> {fmt(selectedReturn.totalCess)}</div>
                  {selectedReturn.blockchainTxHash && (
                    <div className="col-span-2">
                      <span className="text-text-secondary">Blockchain Tx:</span>
                      <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded break-all">{selectedReturn.blockchainTxHash}</code>
                    </div>
                  )}
                  {selectedReturn.filedBy && (
                    <div className="col-span-2"><span className="text-text-secondary">Filed By:</span> {selectedReturn.filedBy.name} ({selectedReturn.filedBy.email})</div>
                  )}
                </div>
                {selectedReturn.validationWarnings?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-amber-700 mb-1">Warnings at time of filing:</p>
                    {selectedReturn.validationWarnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-600">⚠ {w.field}: {w.message}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*  TAB: HSN LOOKUP                              */}
      {/* ══════════════════════════════════════════════ */}
      {tab === 'hsn' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={hsnQuery} onChange={(e) => setHsnQuery(e.target.value)} placeholder="Search HSN code or description..."
              className="border border-border rounded-lg px-3 py-2 text-sm flex-1" onKeyDown={(e) => e.key === 'Enter' && handleHSNSearch()} />
            <button onClick={handleHSNSearch} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium">Search</button>
          </div>
          {hsnResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-text-secondary">
                  <tr>
                    <th className="text-left p-3">HSN Code</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-left p-3">Category</th>
                    <th className="text-right p-3">GST Rate</th>
                    <th className="text-right p-3">CGST</th>
                    <th className="text-right p-3">SGST</th>
                    <th className="text-right p-3">IGST</th>
                  </tr>
                </thead>
                <tbody>
                  {hsnResults.map((h, i) => (
                    <tr key={i} className="border-t border-border hover:bg-gray-50">
                      <td className="p-3 font-mono font-medium">{h.code}</td>
                      <td className="p-3">{h.description || '—'}</td>
                      <td className="p-3 text-text-secondary">{h.category || '—'}</td>
                      <td className="p-3 text-right font-medium">{h.rate}%</td>
                      <td className="p-3 text-right">{h.cgstRate ?? (h.rate / 2)}%</td>
                      <td className="p-3 text-right">{h.sgstRate ?? (h.rate / 2)}%</td>
                      <td className="p-3 text-right">{h.igstRate ?? h.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*  TAB: GSTIN VALIDATOR                         */}
      {/* ══════════════════════════════════════════════ */}
      {tab === 'validate' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={gstinInput} onChange={(e) => setGstinInput(e.target.value.toUpperCase())} placeholder="Enter 15-digit GSTIN..."
              maxLength={15}
              className="border border-border rounded-lg px-3 py-2 text-sm font-mono flex-1 uppercase" onKeyDown={(e) => e.key === 'Enter' && handleGSTINValidate()} />
            <button onClick={handleGSTINValidate} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium">Validate</button>
          </div>
          {gstinResult && (
            <div className={`rounded-xl border p-5 ${gstinResult.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-2xl ${gstinResult.valid ? 'text-green-500' : 'text-red-500'}`}>
                  {gstinResult.valid ? '✓' : '✕'}
                </span>
                <span className={`text-lg font-bold ${gstinResult.valid ? 'text-green-700' : 'text-red-700'}`}>
                  {gstinResult.valid ? 'Valid GSTIN' : 'Invalid GSTIN'}
                </span>
              </div>
              {gstinResult.valid ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-text-secondary">State Code:</span> <b>{gstinResult.stateCode}</b></div>
                  <div><span className="text-text-secondary">State:</span> <b>{gstinResult.stateName}</b></div>
                  <div className="col-span-2"><span className="text-text-secondary">GSTIN:</span> <code className="ml-2 bg-white px-2 py-1 rounded font-mono">{gstinInput}</code></div>
                </div>
              ) : (
                <p className="text-sm text-red-700">{gstinResult.message}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
