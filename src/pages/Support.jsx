import { useEffect, useMemo, useState } from 'react'

import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import AnimatedNumber from '../components/UI/AnimatedNumber'
import Badge from '../components/UI/Badge'
import { apiClient } from '../services/api/client'
import { useStore } from '../store/useStore'

export default function Support() {
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const user = useStore((state) => state.user)

  const [tickets, setTickets] = useState([])
  const [assignees, setAssignees] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    assignee: '',
    customerName: '',
  })

  const loadSupport = async () => {
    setLoading(true)
    try {
      const data = await apiClient.get('/support')
      setTickets(data?.tickets || [])
      setAssignees(data?.assignees || [])
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSupport()
  }, [])

  const stats = useMemo(() => ({
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'in-progress').length,
    resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
    critical: tickets.filter((ticket) => ticket.priority === 'CRITICAL').length,
  }), [tickets])

  const filteredTickets = useMemo(() => {
    const query = (localSearch || searchQuery || '').toLowerCase()
    return tickets.filter((ticket) => {
      const matchesSearch = !query
        || ticket.title?.toLowerCase().includes(query)
        || ticket.ticketNumber?.toLowerCase().includes(query)
        || ticket.customerName?.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter
      const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [tickets, localSearch, searchQuery, statusFilter, priorityFilter])

  const handleStatusChange = async (ticket) => {
    const nextStatus = ticket.status === 'open'
      ? 'in-progress'
      : ticket.status === 'in-progress'
        ? 'resolved'
        : ticket.status === 'resolved'
          ? 'closed'
          : null

    if (!nextStatus) return

    try {
      await apiClient.patch(`/support/${ticket._id}`, { status: nextStatus })
      addToast(`Ticket ${ticket.ticketNumber} updated to ${nextStatus}`, 'success')
      await loadSupport()
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const getActionButton = (ticket) => {
    switch (ticket.status) {
      case 'open': return { text: 'Start', variant: 'primary' }
      case 'in-progress': return { text: 'Resolve', variant: 'success' }
      case 'resolved': return { text: 'Close', variant: 'secondary' }
      default: return null
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!newTicket.title.trim()) {
      addToast('Please enter a title', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const selectedAssignee = assignees.find((assignee) => assignee._id === newTicket.assignee)
      await apiClient.post('/support', {
        title: newTicket.title,
        description: newTicket.description,
        priority: newTicket.priority,
        customerName: newTicket.customerName,
        assignee: newTicket.assignee || null,
        assigneeName: selectedAssignee?.name || user.name,
      })
      addToast('Ticket created successfully', 'success')
      setNewTicket({ title: '', description: '', priority: 'MEDIUM', assignee: '', customerName: '' })
      setShowModal(false)
      await loadSupport()
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Support</h1>
          <p className="text-text-secondary mt-1">Manage customer support tickets from MongoDB-backed ERP activity.</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Open</p>
          <p className="text-2xl font-bold text-blue mt-1"><AnimatedNumber value={stats.open} /></p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">In Progress</p>
          <p className="text-2xl font-bold text-orange mt-1"><AnimatedNumber value={stats.inProgress} /></p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Resolved</p>
          <p className="text-2xl font-bold text-green mt-1"><AnimatedNumber value={stats.resolved} /></p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Critical</p>
          <p className="text-2xl font-bold text-red mt-1"><AnimatedNumber value={stats.critical} /></p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search tickets..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="px-4 py-2 bg-white border border-border rounded-lg text-sm">
          <option value="all">All Priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-border text-sm text-text-secondary">
            Loading support tickets...
          </div>
        )}
        {!loading && filteredTickets.map((ticket) => {
          const action = getActionButton(ticket)
          return (
            <div
              key={ticket._id}
              className={`bg-white rounded-xl p-5 shadow-sm border border-border hover:shadow-md transition-all ${
                ticket.status === 'resolved' ? 'animate-highlight-green' : ticket.status === 'in-progress' ? 'animate-highlight-orange' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-mono text-text-muted">{ticket.ticketNumber}</span>
                    <Badge variant={ticket.status}>{ticket.status}</Badge>
                    <Badge variant={ticket.priority}>{ticket.priority}</Badge>
                  </div>
                  <h3 className="font-semibold text-text-primary">{ticket.title}</h3>
                  <p className="text-sm text-text-secondary mt-1 line-clamp-1">{ticket.description}</p>
                  {ticket.customerName && (
                    <p className="text-xs text-text-muted mt-2">Customer: {ticket.customerName}</p>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="text-sm text-text-secondary">{ticket.assignee?.name || ticket.assigneeName || 'Unassigned'}</div>
                  <div className="text-xs text-text-muted">{new Date(ticket.createdAt).toLocaleDateString('en-IN')}</div>
                  {action && (
                    <Button size="sm" variant={action.variant} onClick={() => handleStatusChange(ticket)}>
                      {action.text}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {!loading && filteredTickets.length === 0 && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-border text-center text-sm text-text-muted">
            No support tickets found.
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Create Support Ticket" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Title *</label>
              <input
                type="text"
                value={newTicket.title}
                onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                placeholder="Brief description of the issue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
              <textarea
                value={newTicket.description}
                onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                rows={3}
                placeholder="Detailed description..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Priority</label>
                <select
                  value={newTicket.priority}
                  onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Assignee</label>
                <select
                  value={newTicket.assignee}
                  onChange={(e) => setNewTicket({ ...newTicket, assignee: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                >
                  <option value="">Auto-assign</option>
                  {assignees.map((assignee) => (
                    <option key={assignee._id} value={assignee._id}>{assignee.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Customer</label>
              <input
                type="text"
                value={newTicket.customerName}
                onChange={(e) => setNewTicket({ ...newTicket, customerName: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                placeholder="Customer name"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Ticket'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
