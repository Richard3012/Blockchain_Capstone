import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { useLiveData } from '../hooks/useLiveData'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Modal from '../components/UI/Modal'

const colorPalette = ['#4361ee', '#2ecc71', '#f39c12', '#e74c3c', '#7c3aed', '#00bcd4', '#ff5722', '#9c27b0']

function getAvatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colorPalette[Math.abs(hash) % colorPalette.length]
}

export default function Customers() {
  useLiveData('customers')
  const customers = useStore((state) => state.customers)
  const addCustomer = useStore((state) => state.addCustomer)
  const addToast = useStore((state) => state.addToast)
  const searchQuery = useStore((state) => state.searchQuery)
  const getCustomerStats = useStore((state) => state.getCustomerStats)

  const [showModal, setShowModal] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    status: 'active'
  })

  const stats = getCustomerStats()

  const filteredCustomers = useMemo(() => {
    const query = (localSearch || searchQuery).toLowerCase()
    if (!query) return customers
    return customers.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.company.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query)
    )
  }, [customers, localSearch, searchQuery])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!newCustomer.name || !newCustomer.company || !newCustomer.email) {
      addToast('Please fill in all required fields', 'warning')
      return
    }
    addCustomer({
      ...newCustomer,
      orders: 0,
      totalSpent: 0,
      lifetimeValue: 0,
      segment: 'individual'
    })
    addToast(`Customer ${newCustomer.name} added successfully`, 'success')
    setNewCustomer({ name: '', company: '', email: '', phone: '', status: 'active' })
    setShowModal(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Customers</h1>
          <p className="text-text-secondary mt-1">Customer master data for sales orders, invoices, and payment history</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Customer
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-text-primary">{stats.total}</span>
          <span className="text-text-secondary">Total</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-green">{stats.active}</span>
          <span className="text-text-secondary">Active</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-orange">{stats.withOrders}</span>
          <span className="text-text-secondary">With Orders</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-purple">{stats.inactive}</span>
          <span className="text-text-secondary">Inactive</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
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
          placeholder="Search customers..."
          className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm"
        />
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((customer) => (
          <div key={customer.id} className="bg-white rounded-xl p-5 shadow-sm border border-border hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: getAvatarColor(customer.name) }}
                >
                  {customer.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="font-semibold text-text-primary">{customer.name}</p>
                  <p className="text-sm text-text-secondary">{customer.company}</p>
                </div>
              </div>
              <Badge>{customer.status}</Badge>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="truncate">{customer.email}</span>
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>{customer.phone}</span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border text-sm">
              <span className="text-text-secondary">Orders: <span className="text-text-primary font-medium">{customer.orders}</span></span>
              <span className="text-text-secondary">Total: <span className="text-text-primary font-medium">₹{customer.totalSpent.toLocaleString()}</span></span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <Modal title="Add New Customer" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Full Name *</label>
              <input
                type="text"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Company *</label>
              <input
                type="text"
                value={newCustomer.company}
                onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                placeholder="Acme Inc"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Email *</label>
              <input
                type="email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                placeholder="john@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Phone</label>
              <input
                type="text"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
              <select
                value={newCustomer.status}
                onChange={(e) => setNewCustomer({ ...newCustomer, status: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-blue"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Add Customer
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
