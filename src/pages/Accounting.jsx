import { useEffect, useState } from 'react'
import { accountingService } from '../services/erpServices'
import { useStore } from '../store/useStore'

const TYPE_BADGE = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  revenue: 'bg-green-100 text-green-700',
  expense: 'bg-orange-100 text-orange-700',
  equity: 'bg-purple-100 text-purple-700',
}

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

function AccountTreeRow({ account, depth = 0 }) {
  return (
    <>
      <tr className="border-t border-border">
        <td className="p-3 font-mono" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          {depth > 0 && <span className="text-text-secondary mr-1">└</span>}
          {account.code}
        </td>
        <td className="p-3 font-medium">
          {account.subType === 'group' ? <strong>{account.name}</strong> : account.name}
          {account.lockedSystem && <span className="ml-2 text-xs text-text-secondary">🔒 system</span>}
          {account.isReconciliation && <span className="ml-2 text-xs text-text-secondary">↔ reconcile</span>}
        </td>
        <td className="p-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[account.type] || 'bg-gray-100 text-gray-700'}`}>{account.type}</span>
        </td>
        <td className="p-3 text-text-secondary text-xs">{account.subType}</td>
        <td className="p-3 text-right">{fmt(account.balance)}</td>
      </tr>
      {account.children?.map((c) => <AccountTreeRow key={c._id} account={c} depth={depth + 1} />)}
    </>
  )
}

export default function Accounting() {
  const addToast = useStore((s) => s.addToast)
  const [tab, setTab] = useState('accounts')
  const [accounts, setAccounts] = useState([])
  const [accountTree, setAccountTree] = useState([])
  const [entries, setEntries] = useState([])
  const [trialBalance, setTrialBalance] = useState(null)
  const [pnl, setPnl] = useState(null)
  const [balanceSheet, setBalanceSheet] = useState(null)
  const [periods, setPeriods] = useState([])
  const [dimensions, setDimensions] = useState([])
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('IN')
  const [loading, setLoading] = useState(false)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [showNewDim, setShowNewDim] = useState(false)
  const [entryForm, setEntryForm] = useState({ description: '', lines: [{ account: '', debit: 0, credit: 0 }, { account: '', debit: 0, credit: 0 }] })
  const [dimForm, setDimForm] = useState({ kind: 'cost_center', code: '', name: '' })

  useEffect(() => {
    accountingService.listTemplates()
      .then((all) => setTemplates(all.filter((t) => t.code === 'IN')))
      .catch(() => {})
    accountingService.getAccounts().then(setAccounts).catch(() => {})
  }, [])

  useEffect(() => { loadTab() }, [tab])

  const loadTab = async () => {
    setLoading(true)
    try {
      if (tab === 'accounts') setAccountTree(await accountingService.getAccountsTree())
      if (tab === 'journal') setEntries(await accountingService.getJournalEntries())
      if (tab === 'trial-balance') setTrialBalance(await accountingService.getTrialBalance())
      if (tab === 'pnl') setPnl(await accountingService.getProfitAndLoss())
      if (tab === 'balance-sheet') setBalanceSheet(await accountingService.getBalanceSheet())
      if (tab === 'periods') setPeriods(await accountingService.listPeriods())
      if (tab === 'dimensions') setDimensions(await accountingService.listDimensions())
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const handleInitialize = async () => {
    try {
      const result = await accountingService.initializeFromTemplate(selectedTemplate)
      addToast(result.message, 'success')
      setAccounts(await accountingService.getAccounts())
      loadTab()
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleCreateEntry = async () => {
    try {
      await accountingService.createJournalEntry(entryForm)
      addToast('Journal entry created', 'success')
      setShowNewEntry(false)
      setEntryForm({ description: '', lines: [{ account: '', debit: 0, credit: 0 }, { account: '', debit: 0, credit: 0 }] })
      if (tab === 'journal') loadTab()
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleReverse = async (id) => {
    try {
      await accountingService.reverseJournalEntry(id)
      addToast('Entry reversed', 'success')
      loadTab()
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleClosePeriod = async (id) => {
    try {
      await accountingService.closePeriod(id)
      addToast('Period closed', 'success')
      loadTab()
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleCreateDimension = async () => {
    try {
      await accountingService.createDimension(dimForm)
      addToast('Dimension created', 'success')
      setShowNewDim(false)
      setDimForm({ kind: 'cost_center', code: '', name: '' })
      loadTab()
    } catch (e) { addToast(e.message, 'error') }
  }

  const updateLine = (idx, field, value) => {
    const lines = [...entryForm.lines]
    lines[idx] = { ...lines[idx], [field]: field === 'account' ? value : Number(value) || 0 }
    setEntryForm({ ...entryForm, lines })
  }

  const addLine = () => setEntryForm({ ...entryForm, lines: [...entryForm.lines, { account: '', debit: 0, credit: 0 }] })

  const tabs = [
    { id: 'accounts', label: 'Chart of Accounts' },
    { id: 'journal', label: 'Journal Entries' },
    { id: 'trial-balance', label: 'Trial Balance' },
    { id: 'pnl', label: 'Profit & Loss' },
    { id: 'balance-sheet', label: 'Balance Sheet' },
    { id: 'periods', label: 'Fiscal Periods' },
    { id: 'dimensions', label: 'Dimensions' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Double-Entry Accounting</h1>
          <p className="text-text-secondary mt-1">Indian Schedule III chart of accounts (INR ₹), GST/TDS/RCM ready, dimensions, fiscal periods, and on-chain anchored journal entries.</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
            className="border border-border px-3 py-2 rounded-lg text-sm">
            {templates.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.currency})</option>)}
          </select>
          <button onClick={handleInitialize} className="border border-border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Initialize from Template</button>
          <button onClick={() => setShowNewEntry(true)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">New Journal Entry</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-text-secondary py-8 text-center">Loading...</div>}

      {/* Chart of Accounts (tree) */}
      {!loading && tab === 'accounts' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Sub-type</th>
                <th className="text-right p-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {accountTree.map((a) => <AccountTreeRow key={a._id} account={a} />)}
              {accountTree.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-text-secondary">No accounts yet. Pick a country template and click "Initialize from Template".</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Journal Entries */}
      {!loading && tab === 'journal' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr>
                <th className="text-left p-3">Entry #</th>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Description</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Anchor</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id} className="border-t border-border">
                  <td className="p-3 font-mono">{e.entryNumber}</td>
                  <td className="p-3">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3 text-text-secondary text-xs">{e.source || 'manual'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      e.status === 'posted' ? 'bg-green-100 text-green-700'
                      : e.status === 'reversed' ? 'bg-gray-200 text-gray-700'
                      : 'bg-yellow-100 text-yellow-700'}`}>{e.status}</span>
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {e.blockchainTxHash ? `${e.blockchainTxHash.slice(0, 10)}…` : <span className="text-text-secondary">—</span>}
                  </td>
                  <td className="p-3 text-right">
                    {e.status === 'posted' && (
                      <button onClick={() => handleReverse(e._id)} className="text-xs text-red-600 hover:underline">Reverse</button>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-text-secondary">No journal entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Trial Balance */}
      {!loading && tab === 'trial-balance' && trialBalance && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">Code</th><th className="text-left p-3">Account</th><th className="text-left p-3">Type</th><th className="text-right p-3">Debit</th><th className="text-right p-3">Credit</th></tr>
            </thead>
            <tbody>
              {trialBalance.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-mono">{r.code}</td><td className="p-3">{r.name}</td><td className="p-3 text-text-secondary">{r.type}</td>
                  <td className="p-3 text-right">{r.debit > 0 ? fmt(r.debit) : ''}</td><td className="p-3 text-right">{r.credit > 0 ? fmt(r.credit) : ''}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-bold">
                <td colSpan={3} className="p-3">Total</td>
                <td className="p-3 text-right">{fmt(trialBalance.totalDebit)}</td>
                <td className="p-3 text-right">{fmt(trialBalance.totalCredit)}</td>
              </tr>
            </tbody>
          </table>
          <div className={`p-3 text-sm text-center ${trialBalance.balanced ? 'text-green-600' : 'text-red-600'}`}>
            {trialBalance.balanced ? '✓ Trial balance is balanced' : '✗ Trial balance is NOT balanced'}
          </div>
        </div>
      )}

      {/* Profit & Loss */}
      {!loading && tab === 'pnl' && pnl && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-xl p-4 border border-green-200"><p className="text-xs text-green-600">Total Revenue</p><p className="text-xl font-bold text-green-700">{fmt(pnl.totalRevenue)}</p></div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200"><p className="text-xs text-red-600">Total Expenses</p><p className="text-xl font-bold text-red-700">{fmt(pnl.totalExpenses)}</p></div>
            <div className={`rounded-xl p-4 border ${pnl.netIncome >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}><p className="text-xs text-text-secondary">Net Income</p><p className={`text-xl font-bold ${pnl.netIncome >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(pnl.netIncome)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3">Revenue</h3>
              {pnl.revenue.map((r, i) => <div key={i} className="flex justify-between py-1 text-sm"><span>{r.name}</span><span className="font-medium">{fmt(r.amount)}</span></div>)}
              {pnl.revenue.length === 0 && <p className="text-text-secondary text-sm">No revenue accounts</p>}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3">Expenses</h3>
              {pnl.expenses.map((r, i) => <div key={i} className="flex justify-between py-1 text-sm"><span>{r.name}</span><span className="font-medium">{fmt(r.amount)}</span></div>)}
              {pnl.expenses.length === 0 && <p className="text-text-secondary text-sm">No expense accounts</p>}
            </div>
          </div>
        </div>
      )}

      {/* Balance Sheet */}
      {!loading && tab === 'balance-sheet' && balanceSheet && (
        <div className="space-y-4">
          <div className={`text-center p-2 rounded-lg text-sm ${balanceSheet.balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {balanceSheet.balanced ? '✓ Balance sheet is balanced' : '✗ Balance sheet is NOT balanced'}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { title: 'Assets', items: balanceSheet.assets, total: balanceSheet.totalAssets, color: 'blue' },
              { title: 'Liabilities', items: balanceSheet.liabilities, total: balanceSheet.totalLiabilities, color: 'red' },
              { title: 'Equity', items: balanceSheet.equity, total: balanceSheet.totalEquity, color: 'purple' },
            ].map((section) => (
              <div key={section.title} className="bg-white rounded-xl shadow-sm border border-border p-4">
                <h3 className="font-semibold text-text-primary mb-3">{section.title}</h3>
                {section.items.map((a, i) => <div key={i} className="flex justify-between py-1 text-sm"><span>{a.name}</span><span className="font-medium">{fmt(a.amount)}</span></div>)}
                <div className={`mt-3 pt-2 border-t border-border flex justify-between font-bold text-${section.color}-700`}><span>Total</span><span>{fmt(section.total)}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fiscal Periods */}
      {!loading && tab === 'periods' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr>
                <th className="text-left p-3">Fiscal Year</th>
                <th className="text-left p-3">Month</th>
                <th className="text-left p-3">Period</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Closed At</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const fyLabel = `FY ${p.fiscalYear}-${String((p.fiscalYear + 1) % 100).padStart(2, '0')}`
                return (
                <tr key={p._id} className="border-t border-border">
                  <td className="p-3 font-mono">{fyLabel}</td>
                  <td className="p-3">{String(p.month).padStart(2, '0')}</td>
                  <td className="p-3 text-text-secondary">{new Date(p.startDate).toLocaleDateString('en-IN')} → {new Date(p.endDate).toLocaleDateString('en-IN')}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'open' ? 'bg-green-100 text-green-700'
                      : p.status === 'closed' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'}`}>{p.status}</span>
                  </td>
                  <td className="p-3 text-text-secondary text-xs">{p.closedAt ? new Date(p.closedAt).toLocaleString('en-IN') : '—'}</td>
                  <td className="p-3 text-right">
                    {p.status === 'open' && (
                      <button onClick={() => handleClosePeriod(p._id)} className="text-xs text-primary hover:underline">Close period</button>
                    )}
                  </td>
                </tr>
                )
              })}
              {periods.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-text-secondary">No periods yet — they'll be created automatically as you post entries.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Dimensions */}
      {!loading && tab === 'dimensions' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowNewDim(true)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">+ New Dimension</button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary">
                <tr>
                  <th className="text-left p-3">Kind</th>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Name</th>
                </tr>
              </thead>
              <tbody>
                {dimensions.map((d) => (
                  <tr key={d._id} className="border-t border-border">
                    <td className="p-3 text-xs text-text-secondary">{d.kind}</td>
                    <td className="p-3 font-mono">{d.code}</td>
                    <td className="p-3">{d.name}</td>
                  </tr>
                ))}
                {dimensions.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-text-secondary">No dimensions defined yet (cost centers, projects, departments, …)</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Journal Entry Modal */}
      {showNewEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewEntry(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-text-primary mb-4">New Journal Entry</h2>
            <div className="space-y-4">
              <input value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} placeholder="Description"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_100px_100px] gap-2 text-xs text-text-secondary font-medium">
                  <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
                </div>
                {entryForm.lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_100px_100px] gap-2">
                    <select value={line.account} onChange={(e) => updateLine(idx, 'account', e.target.value)}
                      className="border border-border rounded-lg px-2 py-1.5 text-sm">
                      <option value="">Select account</option>
                      {accounts.filter((a) => a.subType !== 'group').map((a) => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}
                    </select>
                    <input type="number" min="0" value={line.debit || ''} onChange={(e) => updateLine(idx, 'debit', e.target.value)} placeholder="0" className="border border-border rounded-lg px-2 py-1.5 text-sm text-right" />
                    <input type="number" min="0" value={line.credit || ''} onChange={(e) => updateLine(idx, 'credit', e.target.value)} placeholder="0" className="border border-border rounded-lg px-2 py-1.5 text-sm text-right" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={addLine} className="text-sm text-primary hover:underline">+ Add line</button>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowNewEntry(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreateEntry} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">Create Entry</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Dimension Modal */}
      {showNewDim && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewDim(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-text-primary mb-4">New Dimension</h2>
            <div className="space-y-3">
              <select value={dimForm.kind} onChange={(e) => setDimForm({ ...dimForm, kind: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                <option value="cost_center">Cost Center</option>
                <option value="project">Project</option>
                <option value="department">Department</option>
                <option value="location">Location</option>
                <option value="class">Class</option>
              </select>
              <input value={dimForm.code} onChange={(e) => setDimForm({ ...dimForm, code: e.target.value })} placeholder="Code (e.g., CC-100)" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <input value={dimForm.name} onChange={(e) => setDimForm({ ...dimForm, name: e.target.value })} placeholder="Name" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowNewDim(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreateDimension} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
