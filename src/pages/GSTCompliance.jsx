import { useEffect, useState } from 'react'
import { gstService } from '../services/erpServices'
import { useStore } from '../store/useStore'

const currentPeriod = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function GSTCompliance() {
  const addToast = useStore((s) => s.addToast)
  const [tab, setTab] = useState('summary')
  const [period, setPeriod] = useState(currentPeriod())
  const [summary, setSummary] = useState(null)
  const [gstr1, setGstr1] = useState(null)
  const [returns, setReturns] = useState([])
  const [hsnQuery, setHsnQuery] = useState('')
  const [hsnResults, setHsnResults] = useState([])
  const [loading, setLoading] = useState(false)

  const summaryView = summary || {
    invoiceCount: 0,
    totalTaxableValue: 0,
    totalCGST: 0,
    totalSGST: 0,
    totalIGST: 0,
    totalTax: 0,
  }

  useEffect(() => {
    if (tab === 'summary') loadSummary()
    if (tab === 'gstr1') loadGSTR1()
    if (tab === 'returns') loadReturns()
  }, [tab, period])

  useEffect(() => {
    loadReturns()
  }, [])

  const loadSummary = async () => {
    setLoading(true)
    try { setSummary(await gstService.getSummary(period)) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }
  const loadGSTR1 = async () => {
    setLoading(true)
    try { setGstr1(await gstService.generateGSTR1(period)) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }
  const loadReturns = async () => {
    setLoading(true)
    try { setReturns(await gstService.getReturns()) } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }
  const handleFileReturn = async (returnType) => {
    try {
      await gstService.fileReturn(returnType, period)
      addToast(`${returnType} filed for ${period}`, 'success')
      loadReturns()
    } catch (e) { addToast(e.message, 'error') }
  }
  const handleHSNSearch = async () => {
    if (hsnQuery.length < 2) return
    try { setHsnResults(await gstService.searchHSN(hsnQuery)) } catch (e) { addToast(e.message, 'error') }
  }

  const tabs = [
    { id: 'summary', label: 'GST Summary' },
    { id: 'gstr1', label: 'GSTR-1' },
    { id: 'returns', label: 'Filed Returns' },
    { id: 'hsn', label: 'HSN Lookup' },
  ]

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">GST Compliance</h1>
        <p className="text-text-secondary mt-1">Manage GST returns, summaries, and HSN codes.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'hsn' && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-secondary">Period (YYYYMM):</label>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={6}
            className="border border-border rounded-lg px-3 py-2 text-sm w-32" />
        </div>
      )}

      {loading && <div className="text-text-secondary py-8 text-center">Loading...</div>}

      {!loading && tab === 'summary' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Invoices', value: summaryView.invoiceCount },
            { label: 'Taxable Value', value: fmt(summaryView.totalTaxableValue) },
            { label: 'CGST', value: fmt(summaryView.totalCGST) },
            { label: 'SGST', value: fmt(summaryView.totalSGST) },
            { label: 'IGST', value: fmt(summaryView.totalIGST) },
            { label: 'Total Tax', value: fmt(summaryView.totalTax) },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm border border-border">
              <p className="text-xs text-text-secondary">{card.label}</p>
              <p className="text-lg font-bold text-text-primary mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'gstr1' && gstr1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">{gstr1.invoiceCount} invoices for period {gstr1.period}</p>
            <button onClick={() => handleFileReturn('GSTR1')} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
              File GSTR-1
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary">
                <tr>
                  <th className="text-left p-3">Invoice #</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-right p-3">Taxable</th>
                  <th className="text-right p-3">Tax</th>
                  <th className="text-right p-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {(gstr1.invoices || []).map((inv, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-3 font-mono">{inv.invoiceNumber}</td>
                    <td className="p-3">{inv.customerName}</td>
                    <td className="p-3 text-right">{fmt(inv.taxableValue)}</td>
                    <td className="p-3 text-right">{fmt(inv.taxAmount)}</td>
                    <td className="p-3 text-right font-medium">{fmt(inv.totalAmount)}</td>
                  </tr>
                ))}
                {(!gstr1.invoices || gstr1.invoices.length === 0) && (
                  <tr><td colSpan={5} className="p-6 text-center text-text-secondary">No invoices for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'returns' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr>
                <th className="text-left p-3">Return Type</th>
                <th className="text-left p-3">Period</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Tax Liability</th>
                <th className="text-left p-3">Filed Date</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-mono">{r.returnType}</td>
                  <td className="p-3">{r.period}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'filed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.status}</span></td>
                  <td className="p-3 text-right">{fmt(r.totalCGST + r.totalSGST + r.totalIGST)}</td>
                  <td className="p-3 text-text-secondary">{r.filingDate ? new Date(r.filingDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {returns.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-text-secondary">No returns filed yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'hsn' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={hsnQuery} onChange={(e) => setHsnQuery(e.target.value)} placeholder="Search HSN code..."
              className="border border-border rounded-lg px-3 py-2 text-sm flex-1" onKeyDown={(e) => e.key === 'Enter' && handleHSNSearch()} />
            <button onClick={handleHSNSearch} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium">Search</button>
          </div>
          {hsnResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-text-secondary">
                  <tr><th className="text-left p-3">HSN Code</th><th className="text-right p-3">GST Rate</th></tr>
                </thead>
                <tbody>
                  {hsnResults.map((h, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-3 font-mono">{h.code}</td>
                      <td className="p-3 text-right font-medium">{h.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
