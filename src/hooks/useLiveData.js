import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { apiClient } from '../services/api/client'

/**
 * Fetches live data from the backend API and populates the Zustand store.
 * Call this from any page that needs backend-driven data.
 * Prevents duplicate fetches with a simple "already fetched" guard.
 */

const fetched = {}
const warnedIntegrity = new Set()

const normalizeOrderStatus = (status) => {
  const value = String(status || 'pending').toLowerCase()
  if (['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'cancelled'].includes(value)) {
    return value
  }
  return 'pending'
}

const normalizeBlockchainStatus = (status) => {
  const value = String(status || 'pending').toLowerCase()
  if (['anchored', 'verified', 'confirmed'].includes(value)) return 'confirmed'
  if (value === 'failed') return 'failed'
  return 'pending'
}

const normalizeBlockchainError = (message) => {
  const value = String(message || '')
  if (!value) return ''
  if (value.toLowerCase().includes('could not coalesce error')) {
    return 'Blockchain node is temporarily unavailable. The ERP record is still stored and can be verified from the MongoDB integrity baseline.'
  }
  return value
}

const normalizeInvoiceStatus = (status) => {
  const value = String(status || 'draft').toLowerCase()
  if (['draft', 'issued', 'paid', 'overdue', 'cancelled'].includes(value)) {
    return value
  }
  return 'draft'
}

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
  const addToast = useStore((s) => s.addToast)

  const collectionsRef = useRef(collections)
  collectionsRef.current = collections

  useEffect(() => {
    const cols = collectionsRef.current.length > 0 ? collectionsRef.current : ['orders', 'invoices', 'customers', 'inventory']

    for (const col of cols) {
      switch (col) {
        case 'orders':
          safeFetch('orders', () => apiClient.get('/orders'), (rows) => {
            const mapped = rows.map((o) => ({
              mongoId: o._id,
              id: o.orderNumber || o._id,
              customer: o.customer?.name || o.customerName || '-',
              amount: o.totalAmount || 0,
              total: o.totalAmount || 0,
              items: Array.isArray(o.items) ? o.items.length : Number(o.items || 0),
              status: normalizeOrderStatus(o.status),
              date: o.createdAt,
              blockchainHash: o.blockchainHash || o.hash || '',
              verificationStatus: o.verificationStatus || 'not_requested',
              tamperSource: o.tamperSource || null,
              mismatchReasons: o.mismatchReasons || [],
              fieldDiffs: o.fieldDiffs || [],
            }))
            mapped
              .filter((order) => order.verificationStatus === 'failed' && order.tamperSource === 'external_or_untracked')
              .forEach((order) => {
                const warningKey = `order:${order.mongoId}:${order.verificationStatus}:${order.tamperSource}`
                if (!warnedIntegrity.has(warningKey)) {
                  warnedIntegrity.add(warningKey)
                  addToast(`${order.id} was modified outside the trusted application flow`, 'error')
                }
              })
            setOrders(mapped)
          })
          break
        case 'invoices':
          safeFetch('invoices', () => apiClient.get('/invoices'), (rows) => {
            const mapped = rows.map((i) => ({
              mongoId: i._id,
              id: i.invoiceNumber || i._id,
              order: i.order?.orderNumber || i.orderNumber || '-',
              customer: i.customer?.name || i.vendorName || '-',
              store: i.store?.name || i.storeName || '-',
              amount: i.totalAmount || 0,
              subtotal: i.subtotal,
              taxAmount: i.taxAmount,
              balanceDue: i.balanceDue,
              amountPaid: i.amountPaid,
              status: normalizeInvoiceStatus(i.status),
              issueDate: i.issueDate || i.invoiceDate || i.createdAt,
              date: i.issueDate || i.invoiceDate || i.createdAt,
              dueDate: i.dueDate,
              paymentDate: i.paymentDate,
              lineItems: i.lineItems,
              blockchainHash: i.hash || '',
              verificationStatus: i.verificationStatus || 'not_requested',
              tamperSource: i.tamperSource || null,
              mismatchReasons: i.mismatchReasons || [],
              fieldDiffs: i.fieldDiffs || [],
            }))
            mapped
              .filter((invoice) => invoice.verificationStatus === 'failed' && invoice.tamperSource === 'external_or_untracked')
              .forEach((invoice) => {
                const warningKey = `invoice:${invoice.mongoId}:${invoice.verificationStatus}:${invoice.tamperSource}`
                if (!warnedIntegrity.has(warningKey)) {
                  warnedIntegrity.add(warningKey)
                  addToast(`${invoice.id} was modified outside the trusted application flow`, 'error')
                }
              })
            setInvoices(mapped)
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
                unit: p.unit || 'pcs',
                costPrice: p.costPrice || 0,
                salePrice: p.salePrice || p.costPrice || 0,
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
              hash: a.hash || a.txHash || '',
              timestamp: a.createdAt,
              details: a.summary || a.details || '',
              metadata: a.metadata || {},
            })))
          })
          break
        case 'blockchain':
          safeFetch('blockchain', () => apiClient.get('/blockchain/ledger').catch(() => []), (rows) => {
            const mapped = rows.map((b) => ({
              id: b._id,
              type: b.entityType || 'Record',
              entityId: b.entityId || '-',
              entityLabel: b.entityLabel || b.entityId || '-',
              hash: b.txHash || b.recordHash || b.trustedHash || b.contentHash || '',
              status: normalizeBlockchainStatus(b.status || (b.verified ? 'confirmed' : 'pending')),
              timestamp: b.createdAt,
              blockNumber: b.blockNumber,
              errorMessage: normalizeBlockchainError(b.errorMessage || ''),
              verificationStatus: b.verificationStatus || 'not_requested',
              tamperSource: b.tamperSource || null,
              currentHash: b.currentHash || null,
              trustedHash: b.trustedHash || b.recordHash || null,
              virtual: Boolean(b.virtual),
            }))
            mapped
              .filter((entry) => entry.status === 'failed' && entry.tamperSource === 'external_or_untracked')
              .forEach((entry) => {
                const warningKey = `ledger:${entry.id}:${entry.status}:${entry.tamperSource}`
                if (!warnedIntegrity.has(warningKey)) {
                  warnedIntegrity.add(warningKey)
                  addToast(`${entry.entityLabel} was modified outside the trusted application flow`, 'error')
                }
              })
            setBlockchainTxs(mapped)
          })
          break
      }
    }
  }, [setOrders, setInvoices, setCustomers, setInventory, setAuditLog, setBlockchainTxs, addToast])
}

/** Reset the fetch cache so the next useLiveData call re-fetches */
export function invalidateLiveData(...keys) {
  if (keys.length === 0) {
    Object.keys(fetched).forEach((k) => { fetched[k] = false })
  } else {
    keys.forEach((k) => { fetched[k] = false })
  }
}
