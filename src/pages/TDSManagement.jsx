import { useEffect, useState } from 'react'
import { tdsService } from '../services/erpServices'
import { useStore } from '../store/useStore'

const getCurrentFinancialYear = () => {
  const now = new Date()
  const year = now.getFullYear()
  return now.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

// Indian TDS quarter: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
const getCurrentTDSQuarter = () => {
  const m = new Date().getMonth() + 1
  if (m >= 4 && m <= 6) return 1
  if (m >= 7 && m <= 9) return 2
  if (m >= 10 && m <= 12) return 3
  return 4
}

const QUARTER_RANGES = { 1: 'Apr–Jun', 2: 'Jul–Sep', 3: 'Oct–Dec', 4: 'Jan–Mar' }
const FORM_26Q_DUE = { 1: 'Jul 31', 2: 'Oct 31', 3: 'Jan 31', 4: 'May 31' }

export default function TDSManagement() {
  const addToast = useStore((s) => s.addToast)
  const [tab, setTab] = useState('entries')
  const [sections, setSections] = useState([])
  const [entries, setEntries] = useState([])
  const [quarterly, setQuarterly] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showNewDeduction, setShowNewDeduction] = useState(false)
  const [calcResult, setCalcResult] = useState(null)
  const [fy, setFy] = useState(getCurrentFinancialYear)
  const [quarter, setQuarter] = useState(getCurrentTDSQuarter)
  const [form, setForm] = useState({ section: '', deductee: '', deducteePAN: '', paymentAmount: '', tdsRate: '', tdsAmount: '', paymentDate: new Date().toISOString().split('T')[0] })

  useEffect(() => { loadSections() }, [])
  useEffect(() => { if (tab === 'entries') loadEntries(); if (tab === 'quarterly') loadQuarterly() }, [tab, fy, quarter])

  const loadSections = async () => { try { setSections(await tdsService.getSections()) } catch (e) { addToast(e.message, 'error') } }
  const loadEntries = async () => {
    setLoading(true)
    try {
      const rows = await tdsService.getEntries(fy ? { financialYear: fy } : {})
      setEntries(rows)
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }
  const loadQuarterly = async () => { setLoading(true); try { setQuarterly(await tdsService.getQuarterlySummary(fy, quarter)) } catch (e) { addToast(e.message, 'error') } setLoading(false) }

  const handleCalculate = async () => {
    if (!form.section || !form.paymentAmount) return
    try {
      const result = await tdsService.calculate(form.section, Number(form.paymentAmount))
      setCalcResult(result)
      setForm({ ...form, tdsRate: result.rate, tdsAmount: result.tdsAmount })
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleRecord = async () => {
    try {
      await tdsService.recordDeduction({ ...form, paymentAmount: Number(form.paymentAmount), tdsRate: Number(form.tdsRate), tdsAmount: Number(form.tdsAmount) })
      addToast('TDS deduction recorded', 'success')
      setShowNewDeduction(false)
      setForm({ section: '', deductee: '', deducteePAN: '', paymentAmount: '', tdsRate: '', tdsAmount: '', paymentDate: new Date().toISOString().split('T')[0] })
      setCalcResult(null)
      loadEntries()
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleDeposit = async (entryId) => {
    const challan = prompt('Enter challan number:')
    if (!challan) return
    try {
      await tdsService.markDeposited(entryId, challan)
      addToast('Marked as deposited', 'success')
      loadEntries()
    } catch (e) { addToast(e.message, 'error') }
  }

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  const tabs = [{ id: 'entries', label: 'Deductions' }, { id: 'quarterly', label: 'Quarterly Summary' }, { id: 'sections', label: 'TDS Sections' }]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">TDS Management</h1>
          <p className="text-text-secondary mt-1">Track TDS deductions, deposits, and quarterly summaries.</p>
        </div>
        <button onClick={() => setShowNewDeduction(true)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">Record Deduction</button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-text-secondary">FY:</label>
          <input value={fy} onChange={(e) => setFy(e.target.value)} className="border border-border rounded-lg px-2 py-1.5 text-sm w-28" />
          <label className="text-sm text-text-secondary">Q:</label>
          <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className="border border-border rounded-lg px-2 py-1.5 text-sm">
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q} ({QUARTER_RANGES[q]})</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="text-text-secondary py-8 text-center">Loading...</div>}

      {!loading && tab === 'entries' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">Section</th><th className="text-left p-3">Deductee</th><th className="text-left p-3">PAN</th><th className="text-right p-3">Payment</th><th className="text-right p-3">TDS</th><th className="text-left p-3">Status</th><th className="p-3">Action</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id} className="border-t border-border">
                  <td className="p-3 font-mono">{e.section}</td>
                  <td className="p-3">{e.deductee}</td>
                  <td className="p-3 font-mono text-text-secondary">{e.deducteePAN || '—'}</td>
                  <td className="p-3 text-right">{fmt(e.paymentAmount)}</td>
                  <td className="p-3 text-right font-medium">{fmt(e.tdsAmount)}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.status === 'deposited' ? 'bg-green-100 text-green-700' : e.status === 'filed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>{e.status}</span></td>
                  <td className="p-3 text-center">{e.status === 'pending' && <button onClick={() => handleDeposit(e._id)} className="text-xs text-primary hover:underline">Mark Deposited</button>}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-text-secondary">No TDS deductions recorded</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'quarterly' && quarterly && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-blue-900">FY {quarterly.financialYear} · Q{quarterly.quarter} ({QUARTER_RANGES[quarterly.quarter]})</p>
              <p className="text-xs text-blue-700 mt-1">Form 26Q filing due: <span className="font-semibold">{FORM_26Q_DUE[quarterly.quarter]}</span></p>
            </div>
            {quarterly.pendingAmount > 0 && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">{fmt(quarterly.pendingAmount)} pending deposit</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Entries', value: quarterly.entryCount },
              { label: 'Total Payments', value: fmt(quarterly.totalPayment) },
              { label: 'Total TDS', value: fmt(quarterly.totalTDS) },
              { label: 'Pending Deposit', value: fmt(quarterly.pendingAmount) },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-xl p-4 shadow-sm border border-border">
                <p className="text-xs text-text-secondary">{c.label}</p>
                <p className="text-lg font-bold text-text-primary mt-1">{c.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === 'sections' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary"><tr><th className="text-left p-3">Section</th><th className="text-left p-3">Description</th><th className="text-right p-3">Rate</th></tr></thead>
            <tbody>
              {sections.map((s, i) => (
                <tr key={i} className="border-t border-border"><td className="p-3 font-mono font-medium">{s.section}</td><td className="p-3">{s.description}</td><td className="p-3 text-right">{s.rate}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNewDeduction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewDeduction(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-text-primary mb-4">Record TDS Deduction</h2>
            <div className="space-y-3">
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                <option value="">Select section</option>
                {sections.map((s) => <option key={s.section} value={s.section}>{s.section} — {s.description}</option>)}
              </select>
              <input value={form.deductee} onChange={(e) => setForm({ ...form, deductee: e.target.value })} placeholder="Deductee name" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <input value={form.deducteePAN} onChange={(e) => setForm({ ...form, deducteePAN: e.target.value })} placeholder="PAN (optional)" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input type="number" value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })} placeholder="Payment amount" className="flex-1 border border-border rounded-lg px-3 py-2 text-sm" />
                <button onClick={handleCalculate} className="bg-gray-100 px-3 py-2 rounded-lg text-sm hover:bg-gray-200">Calculate</button>
              </div>
              {calcResult && <div className="bg-blue-50 p-3 rounded-lg text-sm">TDS @ {calcResult.rate}% = {fmt(calcResult.tdsAmount)}</div>}
              <input type="number" value={form.tdsRate} onChange={(e) => setForm({ ...form, tdsRate: e.target.value })} placeholder="TDS Rate %" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={form.tdsAmount} onChange={(e) => setForm({ ...form, tdsAmount: e.target.value })} placeholder="TDS Amount" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setShowNewDeduction(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={handleRecord} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">Record</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
