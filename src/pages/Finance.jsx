import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../services/api/client'
import { useLiveData } from '../hooks/useLiveData'
import { useStore } from '../store/useStore'

const TABS = ['overview', 'receivables', 'payables', 'expenses']
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export default function Finance() {
  useLiveData('orders', 'invoices')

  const invoices = useStore((s) => s.invoices)
  const orders = useStore((s) => s.orders)
  const searchQuery = useStore((s) => s.searchQuery)

  const [tab, setTab] = useState('overview')
  const [trialBalance, setTrialBalance] = useState(null)
  const [journalEntries, setJournalEntries] = useState([])
  const [profitAndLoss, setProfitAndLoss] = useState(null)
  const [purchaseOrders, setPurchaseOrders] = useState([])

  useEffect(() => {
    apiClient.get('/accounting/trial-balance').then(setTrialBalance).catch(() => {})
    apiClient.get('/accounting/journal-entries').then((rows) => setJournalEntries(Array.isArray(rows) ? rows.slice(0, 20) : [])).catch(() => {})
    apiClient.get('/accounting/profit-and-loss').then(setProfitAndLoss).catch(() => {})
    apiClient.get('/procurement/purchase-orders').then((rows) => setPurchaseOrders(Array.isArray(rows) ? rows : [])).catch(() => {})
  }, [])

  const receivables = useMemo(
    () => (invoices || []).filter((invoice) => ['issued', 'overdue'].includes(String(invoice.status).toLowerCase()) && invoice.source !== 'scanner'),
    [invoices],
  )

  const paidInvoices = useMemo(
    () => (invoices || []).filter((invoice) => String(invoice.status).toLowerCase() === 'paid' && invoice.source !== 'scanner'),
    [invoices],
  )

  const scannedPayables = useMemo(
    () => (invoices || []).filter((invoice) => invoice.source === 'scanner'),
    [invoices],
  )

  const fulfilledOrders = useMemo(
    () => (orders || []).filter((order) => ['fulfilled', 'delivered'].includes(String(order.status).toLowerCase())),
    [orders],
  )

  const trialBalanceRows = trialBalance?.rows || []
  const totalReceivable = receivables.reduce((sum, invoice) => sum + (invoice.totalAmount || invoice.amount || 0), 0)
  const totalPaid = paidInvoices.reduce((sum, invoice) => sum + (invoice.totalAmount || invoice.amount || 0), 0)
  const orderRevenue = fulfilledOrders.reduce((sum, order) => sum + (order.totalAmount || order.total || order.amount || 0), 0)

  const openPayables = purchaseOrders.filter((po) =>
    ['draft', 'approved', 'ordered', 'partially_received'].includes(String(po.status).toLowerCase()),
  )
  const overduePayables = openPayables.filter(
    (po) => po.expectedDeliveryDate && new Date(po.expectedDeliveryDate) < new Date(),
  )
  const totalPayables = openPayables.reduce((sum, po) => sum + (po.totalAmount || 0), 0)
  const scannedPayableTotal = scannedPayables.reduce((sum, inv) => sum + (inv.totalAmount || inv.amount || 0), 0)
  const totalPayablesCombined = totalPayables + scannedPayableTotal
  const overduePayableAmount = overduePayables.reduce((sum, po) => sum + (po.totalAmount || 0), 0)
  const expenseAccounts = profitAndLoss?.expenses || []

  const q = (searchQuery || '').toLowerCase()
  const filteredReceivables = receivables.filter((invoice) => JSON.stringify(invoice).toLowerCase().includes(q))
  const filteredJournal = journalEntries.filter((entry) => JSON.stringify(entry).toLowerCase().includes(q))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Finance</h1>
        <p className="text-text-secondary mt-1">Accounts receivable, payable, cash flow, and ledger summaries derived from live MongoDB ERP data.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Accounts Receivable', value: fmt(totalReceivable), sub: `${receivables.length} open invoices` },
          { label: 'Accounts Payable', value: fmt(totalPayablesCombined), sub: `${openPayables.length} POs + ${scannedPayables.length} scanned` },
          { label: 'Revenue Collected', value: fmt(totalPaid), sub: `${paidInvoices.length} paid invoices` },
          { label: 'Fulfilled Orders', value: fmt(orderRevenue), sub: `${fulfilledOrders.length} orders` },
          { label: 'Journal Entries', value: journalEntries.length, sub: 'Accounting ledger' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-4 shadow-sm border border-border">
            <p className="text-xs uppercase tracking-wide text-text-muted">{kpi.label}</p>
            <p className="text-xl font-bold text-text-primary mt-1">{kpi.value}</p>
            <p className="text-xs text-text-secondary mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition capitalize ${tab === value ? 'bg-white shadow text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {trialBalanceRows.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-text-primary">Trial Balance Snapshot</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      {['Account', 'Type', 'Debit', 'Credit'].map((heading) => (
                        <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalanceRows.slice(0, 15).map((account, index) => (
                      <tr key={index} className="border-b border-border hover:bg-gray-50 transition">
                        <td className="p-3 font-medium text-text-primary">{account.name}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{account.type}</span>
                        </td>
                        <td className="p-3 text-text-primary">{account.debit ? fmt(account.debit) : '-'}</td>
                        <td className="p-3 text-text-primary">{account.credit ? fmt(account.credit) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Recent Journal Entries</h2>
            </div>
            {filteredJournal.length === 0 ? (
              <p className="text-center text-sm text-text-muted py-8">No journal entries found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      {['Date', 'Description', 'Status', 'Reference'].map((heading) => (
                        <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJournal.map((entry) => (
                      <tr key={entry._id} className="border-b border-border hover:bg-gray-50 transition">
                        <td className="p-3 text-text-secondary text-xs">{entry.date ? new Date(entry.date).toLocaleDateString('en-IN') : '-'}</td>
                        <td className="p-3 font-medium text-text-primary">{entry.description || '-'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${entry.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {entry.status || 'draft'}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs text-text-secondary">{entry.reference || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'receivables' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Accounts Receivable</h2>
            <p className="text-xs text-text-secondary mt-1">Outstanding invoices pending payment from customers.</p>
          </div>
          {filteredReceivables.length === 0 ? (
            <p className="text-center text-sm text-text-muted py-8">No outstanding receivables.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    {['Invoice #', 'Customer', 'Amount', 'Status', 'Date'].map((heading) => (
                      <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredReceivables.map((invoice) => (
                    <tr key={invoice._id || invoice.id} className="border-b border-border hover:bg-gray-50 transition">
                      <td className="p-3 font-mono text-xs text-blue-600">{invoice.invoiceNumber || invoice.id}</td>
                      <td className="p-3 font-medium text-text-primary">{invoice.customer?.name || invoice.customer || '-'}</td>
                      <td className="p-3 font-semibold text-text-primary">{fmt(invoice.totalAmount || invoice.amount)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${invoice.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="p-3 text-text-secondary text-xs">{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('en-IN') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'payables' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
            <h2 className="text-lg font-semibold text-text-primary mb-2">Accounts Payable</h2>
            <p className="text-sm text-text-secondary mb-4">Vendor obligations derived from live purchase orders, receipts, and scanned purchase invoices.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Payables', value: fmt(totalPayablesCombined), sub: `POs + scanned invoices` },
                { label: 'PO Payables', value: fmt(totalPayables), sub: `${openPayables.length} open purchase orders` },
                { label: 'Scanned Invoices', value: fmt(scannedPayableTotal), sub: `${scannedPayables.length} vendor invoices` },
                { label: 'Overdue Payables', value: fmt(overduePayableAmount), sub: `${overduePayables.length} delayed supplier orders` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">{item.label}</p>
                  <p className="text-xl font-bold text-text-primary mt-1">{item.value}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {scannedPayables.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-text-primary">Scanned Purchase Invoices</h2>
                <p className="text-xs text-text-secondary mt-1">Vendor invoices captured via the invoice scanner.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      {['Invoice #', 'Vendor', 'Amount', 'Status', 'Date'].map((heading) => (
                        <th key={heading} className="text-left p-3 text-xs font-medium text-text-muted uppercase tracking-wide">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scannedPayables.map((invoice) => (
                      <tr key={invoice._id || invoice.id} className="border-b border-border hover:bg-gray-50 transition">
                        <td className="p-3 font-mono text-xs text-blue-600">{invoice.invoiceNumber || invoice.id}</td>
                        <td className="p-3 font-medium text-text-primary">{invoice.vendorName || invoice.customer || '-'}</td>
                        <td className="p-3 font-semibold text-text-primary">{fmt(invoice.totalAmount || invoice.amount)}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">{invoice.status}</span>
                        </td>
                        <td className="p-3 text-text-secondary text-xs">{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('en-IN') : invoice.date ? new Date(invoice.date).toLocaleDateString('en-IN') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-2">Expense Tracking</h2>
          <p className="text-sm text-text-secondary mb-4">Expense balances are read from live accounting accounts in MongoDB.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {expenseAccounts.map((account) => (
              <div key={account.code} className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">{account.name}</p>
                <p className="text-xl font-bold text-text-primary mt-1">{fmt(account.amount)}</p>
                <p className="text-xs text-text-secondary mt-0.5">{account.code}</p>
              </div>
            ))}
            {expenseAccounts.length === 0 && (
              <div className="rounded-lg border border-border bg-background p-4 md:col-span-2 xl:col-span-3">
                <p className="text-sm text-text-secondary">No expense balances have been posted yet.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
