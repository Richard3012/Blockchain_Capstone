import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { apiClient } from '../services/api/client'

/**
 * Fetches live data from the backend API and populates the Zustand store.
 * Call this from any page that needs backend-driven data.
 * Prevents duplicate fetches with a simple "already fetched" guard.
 */

const fetched = {}

function safeFetch(key, apiFn, setter) {
  if (fetched[key]) return
  fetched[key] = true
  apiFn()
    .then((data) => {
      if (Array.isArray(data)) setter(data)
    })
    .catch(() => {
      fetched[key] = false // allow retry on failure
    })
}

export function useLiveData(...collections) {
  const setOrders = useStore((s) => s.setOrders)
  const setInvoices = useStore((s) => s.setInvoices)
  const setCustomers = useStore((s) => s.setCustomers)
  const setInventory = useStore((s) => s.setInventory)
  const setAuditLog = useStore((s) => s.setAuditLog)
  const setBlockchainTxs = useStore((s) => s.setBlockchainTxs)

  const collectionsRef = useRef(collections)
  collectionsRef.current = collections

  useEffect(() => {
    const cols = collectionsRef.current.length > 0 ? collectionsRef.current : ['orders', 'invoices', 'customers', 'inventory']

    for (const col of cols) {
      switch (col) {
        case 'orders':
          safeFetch('orders', () => apiClient.get('/orders'), (rows) => {
            setOrders(rows.map((o) => ({
              id: o.orderNumber || o._id,
              customer: o.customer?.name || o.customerName || '-',
              amount: o.totalAmount || 0,
              total: o.totalAmount || 0,
              status: o.status,
              date: o.createdAt,
            })))
          })
          break
        case 'invoices':
          safeFetch('invoices', () => apiClient.get('/invoices'), (rows) => {
            setInvoices(rows.map((i) => ({
              id: i.invoiceNumber || i._id,
              customer: i.customer?.name || i.vendorName || '-',
              amount: i.totalAmount || 0,
              status: i.status,
              date: i.invoiceDate || i.createdAt,
              dueDate: i.dueDate,
            })))
          })
          break
        case 'customers':
          safeFetch('customers', () => apiClient.get('/customers'), (rows) => {
            setCustomers(rows.map((c) => ({
              id: c._id,
              name: c.name,
              company: c.company || '-',
              email: c.email,
              phone: c.phone,
              status: c.isActive !== false ? 'active' : 'inactive',
              orders: c.totalOrders || 0,
              totalSpent: c.totalPurchases || 0,
              lifetimeValue: c.totalPurchases || 0,
              segment: c.segment || 'individual',
            })))
          })
          break
        case 'inventory':
          safeFetch('inventory', () => apiClient.get('/products'), (rows) => {
            setInventory(rows.map((p) => {
              const stock = p.currentStock ?? p.stock ?? 0
              const reorder = p.reorderLevel ?? 0
              let status = 'In Stock'
              if (stock <= 0) status = 'Out of Stock'
              else if (stock <= reorder) status = 'Low Stock'
              return {
                id: p._id,
                name: p.name,
                sku: p.sku,
                category: p.category || '-',
                price: p.salePrice || p.costPrice || 0,
                stock,
                reorderLevel: reorder,
                status,
                lastRestocked: p.updatedAt,
              }
            }))
          })
          break
        case 'audit':
          safeFetch('audit', () => apiClient.get('/audit'), (rows) => {
            setAuditLog(rows.map((a) => ({
              id: a._id,
              user: a.actor?.name || a.actorName || '-',
              action: a.action,
              entity: a.entityType,
              entityId: a.entityId,
              hash: a.txHash || '',
              timestamp: a.createdAt,
              details: a.details,
            })))
          })
          break
        case 'blockchain':
          safeFetch('blockchain', () => apiClient.get('/blockchain/ledger').catch(() => []), (rows) => {
            setBlockchainTxs(rows.map((b) => ({
              id: b._id,
              type: b.entityType || 'Record',
              entityId: b.entityId || '-',
              hash: b.txHash || b.contentHash || '',
              status: b.verified ? 'Verified' : 'Pending',
              timestamp: b.createdAt,
            })))
          })
          break
      }
    }
  }, [setOrders, setInvoices, setCustomers, setInventory, setAuditLog, setBlockchainTxs])
}

/** Reset the fetch cache so the next useLiveData call re-fetches */
export function invalidateLiveData(...keys) {
  if (keys.length === 0) {
    Object.keys(fetched).forEach((k) => { fetched[k] = false })
  } else {
    keys.forEach((k) => { fetched[k] = false })
  }
}
