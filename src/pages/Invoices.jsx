import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import InvoiceGenerator from '../components/Invoice/InvoiceGenerator'

export default function Invoices() {
  const invoices = useStore((state) => state.invoices)
  const updateInvoiceStatus = useStore((state) => state.updateInvoiceStatus)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getInvoiceStats = useStore((state) => state.getInvoiceStats)
  const user = useStore((state) => state.user)

  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false)
  const pageSize = 20

  const stats = getInvoiceStats()

  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query || 
        invoice.id.toLowerCase().includes(query) ||
        invoice.customer.toLowerCase().includes(query)
      let matchesStatus = statusFilter === 'all'
      if (statusFilter === 'paid') matchesStatus = invoice.status === 'Paid'
      if (statusFilter === 'overdue') matchesStatus = invoice.status === 'Overdue'
      if (statusFilter === 'pending') matchesStatus = invoice.status === 'Draft' || invoice.status === 'Sent'
      return matchesSearch && matchesStatus
    })
  }, [invoices, localSearch, searchQuery, statusFilter])

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredInvoices.slice(start, start + pageSize)
  }, [filteredInvoices, currentPage])

  const totalPages = Math.ceil(filteredInvoices.length / pageSize)

  const handleStatusUpdate = (invoiceId, newStatus) => {
    if (user.role === 'viewer') {
      addToast('Viewers cannot update invoice status', 'error')
      return
    }
    updateInvoiceStatus(invoiceId, newStatus)
    addToast(`Invoice ${invoiceId} marked as ${newStatus}`, 'success')
  }

  const getStatusBadge = (status) => {
    const variants = {
      Paid: 'success',
      Draft: 'default',
      Sent: 'warning',
      Overdue: 'error'
    }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString()
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value)
  }

  const getDaysOverdue = (dueDate, status) => {
    if (status !== 'overdue') return null
    const due = new Date(dueDate)
    const today = new Date()
    const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Invoices</h1>
          <p className="text-text-secondary mt-1">Manage billing and payment tracking</p>
        </div>
        {user.role !== 'viewer' && (
          <Button onClick={() => setShowInvoiceGenerator(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Invoice
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Invoices</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            <AnimatedNumber value={stats.total} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Paid</p>
          <p className="text-2xl font-bold text-green mt-1">
            <AnimatedNumber value={stats.paid} />
          </p>
          <p className="text-xs text-text-muted mt-1">{formatCurrency(stats.paidValue)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Pending</p>
          <p className="text-2xl font-bold text-orange mt-1">
            <AnimatedNumber value={stats.pending} />
          </p>
          <p className="text-xs text-text-muted mt-1">{formatCurrency(stats.pendingValue)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Overdue</p>
          <p className="text-2xl font-bold text-red mt-1">
            <AnimatedNumber value={stats.overdue} />
          </p>
          <p className="text-xs text-text-muted mt-1">{formatCurrency(stats.overdueValue)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Total Value</p>
          <p className="text-2xl font-bold text-blue mt-1">
            ${Math.round(stats.totalValue / 1000)}K
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-xs">
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search invoices..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'paid', 'pending', 'overdue'].map(status => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setCurrentPage(1) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === status 
                  ? 'bg-blue text-white' 
                  : 'bg-white border border-border hover:bg-gray-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Invoice ID</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Customer</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Issue Date</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Due Date</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Amount</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.map((invoice) => {
                const daysOverdue = getDaysOverdue(invoice.dueDate, invoice.status)
                return (
                  <tr 
                    key={invoice.id} 
                    className={`border-b border-border last:border-0 hover:bg-gray-50 transition-colors cursor-pointer ${
                      invoice.status === 'overdue' ? 'bg-red/5' : ''
                    }`}
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <td className="py-3 px-6 text-sm font-medium text-blue">{invoice.id}</td>
                    <td className="py-3 px-6 text-sm text-text-primary">{invoice.customer}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">{formatDate(invoice.issueDate)}</td>
                    <td className="py-3 px-6 text-sm text-text-secondary">
                      {formatDate(invoice.dueDate)}
                      {daysOverdue && (
                        <span className="ml-2 text-xs text-red">({daysOverdue}d overdue)</span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-sm font-medium text-text-primary">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="py-3 px-6">{getStatusBadge(invoice.status)}</td>
                    <td className="py-3 px-6" onClick={(e) => e.stopPropagation()}>
                      {user.role !== 'viewer' && invoice.status !== 'paid' && (
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => handleStatusUpdate(invoice.id, 'paid')}
                        >
                          Mark Paid
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredInvoices.length)} of {filteredInvoices.length} invoices
          </p>
          <div className="flex gap-2">
            <Button 
              variant="secondary" 
              size="sm" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <Modal 
          title={`Invoice ${selectedInvoice.id}`} 
          onClose={() => setSelectedInvoice(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-text-muted">Customer</label>
                <p className="font-medium text-text-primary">{selectedInvoice.customer}</p>
              </div>
              <div>
                <label className="text-sm text-text-muted">Amount</label>
                <p className="font-medium text-text-primary">{formatCurrency(selectedInvoice.amount)}</p>
              </div>
              <div>
                <label className="text-sm text-text-muted">Issue Date</label>
                <p className="font-medium text-text-primary">{formatDate(selectedInvoice.issueDate)}</p>
              </div>
              <div>
                <label className="text-sm text-text-muted">Due Date</label>
                <p className="font-medium text-text-primary">{formatDate(selectedInvoice.dueDate)}</p>
              </div>
            </div>

            <div>
              <label className="text-sm text-text-muted">Status</label>
              <div className="mt-1">{getStatusBadge(selectedInvoice.status)}</div>
            </div>

            {selectedInvoice.blockchainHash && (
              <div>
                <label className="text-sm text-text-muted">Blockchain Hash</label>
                <p className="font-mono text-xs text-green break-all mt-1">
                  {selectedInvoice.blockchainHash}
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-border flex gap-2">
              <Button variant="secondary" onClick={() => addToast('Downloading PDF...', 'info')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </Button>
              <Button variant="secondary" onClick={() => addToast('Email sent', 'success')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send Reminder
              </Button>
              {user.role !== 'viewer' && selectedInvoice.status !== 'paid' && (
                <Button onClick={() => handleStatusUpdate(selectedInvoice.id, 'paid')}>
                  Mark as Paid
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Invoice Generator Modal */}
      <InvoiceGenerator 
        isOpen={showInvoiceGenerator} 
        onClose={() => setShowInvoiceGenerator(false)} 
      />
    </div>
  )
}
