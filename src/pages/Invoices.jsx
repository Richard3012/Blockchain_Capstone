import { useMemo, useState } from 'react'

import InvoiceGenerator from '../components/Invoice/InvoiceGenerator'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import { invalidateLiveData, useLiveData } from '../hooks/useLiveData'
import { apiClient } from '../services/api/client'
import { generateInvoicePDF } from '../services/invoicePdf'
import { useStore } from '../store/useStore'

export default function Invoices() {
  useLiveData('invoices', 'customers', 'inventory')
  const invoices = useStore((state) => state.invoices)
  const customers = useStore((state) => state.customers)
  const user = useStore((state) => state.user)
  const searchQuery = useStore((state) => state.searchQuery)
  const getInvoiceStats = useStore((state) => state.getInvoiceStats)
  const addToast = useStore((state) => state.addToast)
  const hasPermission = useStore((state) => state.hasPermission)

  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false)
  const [busyInvoiceId, setBusyInvoiceId] = useState('')

  const pageSize = 20
  const stats = getInvoiceStats()
  const canManageInvoices = hasPermission('view_finance') || hasPermission('view_all') || user.role === 'admin'

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query
        || String(invoice.id).toLowerCase().includes(query)
        || String(invoice.customer).toLowerCase().includes(query)
        || String(invoice.order || '').toLowerCase().includes(query)
      const normalizedStatus = String(invoice.status || '').toLowerCase()
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [invoices, localSearch, searchQuery, statusFilter])

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredInvoices.slice(start, start + pageSize)
  }, [filteredInvoices, currentPage])

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize))

  const reloadInvoices = async () => {
    invalidateLiveData('invoices', 'audit', 'blockchain')
    const rows = await apiClient.get('/invoices')
    useStore.getState().setInvoices(rows.map((invoice) => ({
      mongoId: invoice._id,
      id: invoice.invoiceNumber || invoice._id,
      order: invoice.order?.orderNumber || '-',
      customer: invoice.customer?.name || invoice.vendorName || '-',
      store: invoice.store?.name || '-',
      amount: invoice.totalAmount || 0,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      balanceDue: invoice.balanceDue,
      amountPaid: invoice.amountPaid,
      status: String(invoice.status || 'draft').toLowerCase(),
      issueDate: invoice.issueDate || invoice.createdAt,
      date: invoice.issueDate || invoice.createdAt,
      dueDate: invoice.dueDate,
      paymentDate: invoice.paymentDate,
      lineItems: invoice.lineItems?.length ? invoice.lineItems : (invoice.metadata?.lineItems || []),
      vendorName: invoice.vendorName,
      gstin: invoice.gstin,
      blockchainHash: invoice.hash || '',
      verificationStatus: invoice.verificationStatus || 'not_requested',
      mismatchReasons: invoice.mismatchReasons || [],
      fieldDiffs: invoice.fieldDiffs || [],
    })))
  }

  const handleMarkPaid = async (invoice) => {
    const oid = String(invoice.mongoId || '')
    if (!/^[a-f0-9]{24}$/i.test(oid)) {
      addToast('Invalid invoice id — refresh the page and try again.', 'error')
      return
    }
    setBusyInvoiceId(invoice.id)
    try {
      await apiClient.put(`/invoices/${oid}/mark-paid`, {})
      await reloadInvoices()
      addToast(`${invoice.id} marked as paid`, 'success')
    } catch (error) {
      addToast(error.message || 'Unable to update invoice', 'error')
    } finally {
      setBusyInvoiceId('')
    }
  }

  const handleCreateInvoice = async (payload) => {
    const customer = customers.find((item) => String(item.id) === String(payload.customerId))
    const storeId = user.storeId

    if (!payload.customerId || !storeId) {
      throw new Error('Customer and store are required to create an invoice')
    }

    await apiClient.post('/invoices', {
      customer: payload.customerId,
      store: storeId,
      dueDate: payload.dueDate,
      subtotal: payload.subtotal,
      taxAmount: payload.taxAmount,
      totalAmount: payload.totalAmount,
      metadata: {
        customerName: customer?.name || payload.customerName,
        lineItems: payload.items,
        notes: payload.notes,
      },
    })

    await reloadInvoices()
    setShowInvoiceGenerator(false)
  }

  const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-')
  const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0)
  const labelizeStatus = (status) => String(status || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Invoices</h1>
          <p className="text-text-secondary mt-1">Live billing and payment data from MongoDB-backed invoice records.</p>
        </div>
        {canManageInvoices && (
          <Button onClick={() => setShowInvoiceGenerator(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Invoices" value={<AnimatedNumber value={stats.total} />} />
        <StatCard label="Paid" value={<AnimatedNumber value={stats.paid} />} subtext={formatCurrency(stats.paidValue)} accent="text-green" />
        <StatCard label="Pending" value={<AnimatedNumber value={stats.pending} />} subtext={formatCurrency(stats.pendingValue)} accent="text-orange" />
        <StatCard label="Overdue" value={<AnimatedNumber value={stats.overdue} />} subtext={formatCurrency(stats.overdueValue)} accent="text-red" />
        <StatCard label="Total Value" value={formatCurrency(stats.totalValue)} accent="text-blue" />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Search invoices..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'paid', 'issued', 'overdue', 'draft'].map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status)
                setCurrentPage(1)
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === status ? 'bg-blue text-white' : 'bg-white border border-border hover:bg-gray-50'
              }`}
            >
              {status === 'issued' ? 'pending' : status}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Invoice</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Order</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Customer</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Store</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Issue Date</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Amount</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-6 text-sm font-medium text-blue">{invoice.id}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{invoice.order || '-'}</td>
                  <td className="py-3 px-6 text-sm text-text-primary">{invoice.customer}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{invoice.store}</td>
                  <td className="py-3 px-6 text-sm text-text-secondary">{formatDate(invoice.issueDate)}</td>
                  <td className="py-3 px-6 text-sm font-medium text-text-primary">{formatCurrency(invoice.amount)}</td>
                  <td className="py-3 px-6">
                    <div className="flex gap-2">
                      <Badge>{labelizeStatus(invoice.status)}</Badge>
                      {invoice.verificationStatus && <Badge variant={invoice.verificationStatus}>{labelizeStatus(invoice.verificationStatus)}</Badge>}
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setSelectedInvoice(invoice)}>View</Button>
                      <Button size="sm" variant="secondary" onClick={() => generateInvoicePDF(invoice)} title="Download PDF">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </Button>
                      {canManageInvoices && invoice.status !== 'paid' && (
                        <Button size="sm" onClick={() => handleMarkPaid(invoice)} disabled={busyInvoiceId === invoice.id}>
                          {busyInvoiceId === invoice.id ? 'Saving...' : 'Mark Paid'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {filteredInvoices.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredInvoices.length)} of {filteredInvoices.length} invoices
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {selectedInvoice && (
        <Modal title={`Invoice ${selectedInvoice.id}`} onClose={() => setSelectedInvoice(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Detail label="Order" value={selectedInvoice.order || '-'} />
              <Detail label="Customer" value={selectedInvoice.customer} />
              <Detail label="Store" value={selectedInvoice.store || '-'} />
              <Detail label="Amount" value={formatCurrency(selectedInvoice.amount)} />
              <Detail label="Issue Date" value={formatDate(selectedInvoice.issueDate)} />
              <Detail label="Due Date" value={formatDate(selectedInvoice.dueDate)} />
              <Detail label="Payment Date" value={formatDate(selectedInvoice.paymentDate)} />
            </div>
            <div className="flex gap-2">
              <Badge>{labelizeStatus(selectedInvoice.status)}</Badge>
              {selectedInvoice.verificationStatus && <Badge variant={selectedInvoice.verificationStatus}>{labelizeStatus(selectedInvoice.verificationStatus)}</Badge>}
            </div>
            {selectedInvoice.blockchainHash && (
              <div>
                <label className="text-sm text-text-muted">Blockchain Hash</label>
                <p className="font-mono text-xs text-green break-all mt-1">{selectedInvoice.blockchainHash}</p>
              </div>
            )}
            <div className="pt-4 border-t border-border flex gap-2">
              <Button variant="secondary" onClick={() => { generateInvoicePDF(selectedInvoice); addToast('PDF downloaded', 'success') }}>Download PDF</Button>
              {canManageInvoices && selectedInvoice.status !== 'paid' && (
                <Button onClick={() => handleMarkPaid(selectedInvoice)}>Mark as Paid</Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      <InvoiceGenerator
        isOpen={showInvoiceGenerator}
        onClose={() => setShowInvoiceGenerator(false)}
        onSaveInvoice={handleCreateInvoice}
      />
    </div>
  )
}

function StatCard({ label, value, subtext, accent = 'text-text-primary' }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      {subtext && <p className="text-xs text-text-muted mt-1">{subtext}</p>}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <label className="text-sm text-text-muted">{label}</label>
      <p className="font-medium text-text-primary">{value}</p>
    </div>
  )
}
