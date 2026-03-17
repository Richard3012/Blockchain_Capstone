import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'
import AnimatedNumber from '../components/UI/AnimatedNumber'

const assignees = ['Emily Williams', 'Jessica Brown', 'Amanda Martinez', 'Jessica Martinez', 'John Smith', 'Emily Martinez', 'Robert Johnson', 'Michael Miller']

export default function Support() {
  const tickets = useStore((state) => state.tickets)
  const addTicket = useStore((state) => state.addTicket)
  const updateTicketStatus = useStore((state) => state.updateTicketStatus)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getTicketStats = useStore((state) => state.getTicketStats)

  const [showModal, setShowModal] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    assignee: assignees[0],
    customer: ''
  })

  const stats = getTicketStats()

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const query = (localSearch || searchQuery).toLowerCase()
      const matchesSearch = !query || 
        t.title.toLowerCase().includes(query) ||
        t.id.toLowerCase().includes(query) ||
        t.customer?.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter
      const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [tickets, localSearch, searchQuery, statusFilter, priorityFilter])

  const handleStatusChange = (ticket) => {
    let nextStatus
    switch (ticket.status) {
      case 'open': nextStatus = 'in-progress'; break
      case 'in-progress': nextStatus = 'resolved'; break
      case 'resolved': nextStatus = 'closed'; break
      default: return
    }
    updateTicketStatus(ticket.id, nextStatus)
    addToast(`Ticket ${ticket.id} updated to ${nextStatus}`, 'success')
  }

  const getActionButton = (ticket) => {
    switch (ticket.status) {
      case 'open': return { text: 'Start', variant: 'primary' }
      case 'in-progress': return { text: 'Resolve', variant: 'success' }
      case 'resolved': return { text: 'Close', variant: 'secondary' }
      default: return null
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!newTicket.title) {
      addToast('Please enter a title', 'warning')
      return
    }
    addTicket({
      ...newTicket,
      status: 'open'
    })
    addToast('Ticket created successfully', 'success')
    setNewTicket({ title: '', description: '', priority: 'MEDIUM', assignee: assignees[0], customer: '' })
    setShowModal(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Support</h1>
          <p className="text-text-secondary mt-1">Manage customer support tickets</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Ticket
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Open</p>
          <p className="text-2xl font-bold text-blue mt-1">
            <AnimatedNumber value={stats.open} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">In Progress</p>
          <p className="text-2xl font-bold text-orange mt-1">
            <AnimatedNumber value={stats.inProgress} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Resolved</p>
          <p className="text-2xl font-bold text-green mt-1">
            <AnimatedNumber value={stats.resolved} />
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <p className="text-sm text-text-secondary">Critical</p>
          <p className="text-2xl font-bold text-red mt-1">
            <AnimatedNumber value={stats.critical} />
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
            placeholder="Search tickets..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-border rounded-lg text-sm"
        >
          <option value="all">All Priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {/* Ticket List */}
      <div className="space-y-3">
        {filteredTickets.map((ticket) => {
          const action = getActionButton(ticket)
          
          return (
            <div 
              key={ticket.id} 
              className={`bg-white rounded-xl p-5 shadow-sm border border-border hover:shadow-md transition-all ${
                ticket.status === 'resolved' ? 'animate-highlight-green' : 
                ticket.status === 'in-progress' ? 'animate-highlight-orange' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-mono text-text-muted">{ticket.id}</span>
                    <Badge variant={ticket.status}>{ticket.status}</Badge>
                    <Badge variant={ticket.priority}>{ticket.priority}</Badge>
                  </div>
                  <h3 className="font-semibold text-text-primary">{ticket.title}</h3>
                  <p className="text-sm text-text-secondary mt-1 line-clamp-1">{ticket.description}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="text-sm text-text-secondary">{ticket.assignee}</div>
                  <div className="text-xs text-text-muted">{ticket.createdAt}</div>
                  {action && (
                    <Button 
                      size="sm" 
                      variant={action.variant}
                      onClick={() => handleStatusChange(ticket)}
                    >
                      {action.text}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Ticket Modal */}
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
                  {assignees.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Customer</label>
              <input
                type="text"
                value={newTicket.customer}
                onChange={(e) => setNewTicket({ ...newTicket, customer: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                placeholder="Customer name"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Create Ticket
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
