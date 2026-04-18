// Comprehensive page-level smoke test: GET + write operations for every module
const BASE = 'http://localhost:4000'
const results = []

const call = async (label, method, path, body, expectStatuses = [200, 201]) => {
  const t0 = Date.now()
  try {
    const headers = { 'content-type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let json = null; try { json = JSON.parse(text) } catch {}
    const ok = expectStatuses.includes(res.status) && json?.success !== false
    results.push({ label, method, path, status: res.status, ok, ms: Date.now() - t0, msg: ok ? '' : (json?.message || text.slice(0, 150)) })
    return json?.data
  } catch (e) {
    results.push({ label, method, path, status: 0, ok: false, ms: Date.now() - t0, msg: e.message })
  }
}

let token = null
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@blockerp.local', password: 'ChangeMe123!' }) }).then((r) => r.json())
token = login?.data?.token
if (!token) { console.error('Login failed'); process.exit(1) }

// ── Master Data: create-then-read ─────────────────────────────────
const sku = `SMK-${Date.now()}`
const newProduct = await call('products.create', 'POST', '/api/products', { name: 'Smoke Test Product', sku, costPrice: 100, salePrice: 150, currentStock: 50, reorderLevel: 10, unit: 'pcs', category: 'Test' })
const newSupplier = await call('suppliers.create', 'POST', '/api/suppliers', { code: `SUP-${Date.now().toString(36).toUpperCase()}`, name: `SmokeSupplier-${Date.now()}`, email: `smk${Date.now()}@test.com`, phone: '9999999999', taxId: '29AAAAA0000A1Z5', address: 'Karnataka' })
const newCustomer = await call('customers.create', 'POST', '/api/customers', { code: `CUST-${Date.now().toString(36).toUpperCase()}`, name: `SmokeCustomer-${Date.now()}`, company: 'SmokeCo', email: `cust${Date.now()}@test.com`, phone: '8888888888' })

// ── Inventory ─────────────────────────────────────────────────────
if (newProduct?._id) {
  const stores0 = await fetch(`${BASE}/api/stores`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json())
  const stId = stores0?.data?.[0]?._id
  await call('inventory.stockIn', 'POST', '/api/inventory/stock-in', { productId: newProduct._id, quantity: 25, storeId: stId, notes: 'Smoke test' })
  await call('inventory.lowStock', 'GET', '/api/inventory/low-stock')
  await call('inventory.history', 'GET', `/api/inventory/history/${newProduct._id}`)
}

// ── Procurement ───────────────────────────────────────────────────
const stores = await call('stores.list', 'GET', '/api/stores')
const storeId = stores?.[0]?._id
if (newSupplier?._id && newProduct?._id && storeId) {
  await call('procurement.po.create', 'POST', '/api/procurement/purchase-orders', {
    supplier: newSupplier._id, store: storeId,
    items: [{ product: newProduct._id, quantity: 10, unitCost: 100 }],
    expectedDeliveryDate: new Date(Date.now() + 7 * 86400000).toISOString(),
  })
}

// ── Orders ────────────────────────────────────────────────────────
let newOrder
if (newCustomer?._id && newProduct?._id && storeId) {
  newOrder = await call('orders.create', 'POST', '/api/orders', {
    customer: newCustomer._id, store: storeId,
    items: [{ product: newProduct._id, quantity: 2, unitPrice: 150 }],
  })
}

// ── Invoices ──────────────────────────────────────────────────────
if (newCustomer?._id && storeId) {
  await call('invoices.create', 'POST', '/api/invoices', {
    customer: newCustomer._id, store: storeId,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    subtotal: 300, taxAmount: 54, totalAmount: 354,
    metadata: { customerName: newCustomer.name, lineItems: [{ product: 'Smoke Test Product', quantity: 2, unitPrice: 150 }] },
  })
}

// ── Delivery ──────────────────────────────────────────────────────
if (newOrder?._id) {
  await call('delivery.create', 'POST', '/api/delivery', { orderId: newOrder._id })
}

// ── HR ────────────────────────────────────────────────────────────
const newEmp = await call('employees.create', 'POST', '/api/employees', { name: `Smoke Emp ${Date.now()}`, dept: 'Warehouse', roleTitle: 'Tester', shift: 'Day', status: 'active', salary: 50000 })
if (newEmp?._id) {
  await call('hr.attendance.mark', 'POST', '/api/hr/attendance', { employee: newEmp._id, date: new Date().toISOString(), status: 'present' })
  await call('hr.leave.apply', 'POST', '/api/hr/leaves', { employee: newEmp._id, leaveType: 'casual', startDate: new Date(Date.now() + 86400000).toISOString(), endDate: new Date(Date.now() + 2 * 86400000).toISOString(), reason: 'Smoke test' })
}

// ── Operations: Assets / Documents / Projects / Support / Workflow / Manufacturing ─
await call('assets.create', 'POST', '/api/assets', { name: `Smoke Asset ${Date.now()}`, type: 'Vehicle', location: 'Bangalore', cost: 25000, condition: 'Good', purchaseDate: new Date().toISOString().slice(0, 10) })
await call('documents.create', 'POST', '/api/documents', { name: `Smoke Doc ${Date.now()}`, category: 'Invoice', tags: ['smoke'], uploadedByName: 'Admin', status: 'pending' })
await call('projects.create', 'POST', '/api/projects', { name: `Smoke Project ${Date.now()}`, client: 'Acme', manager: 'Smoke Manager', status: 'Planning', budget: 100000, start: new Date().toISOString().slice(0, 10) })
await call('support.create', 'POST', '/api/support', { title: `Smoke Ticket ${Date.now()}`, description: 'Test', priority: 'LOW', customerName: 'Test' })
await call('manufacturing.create', 'POST', '/api/manufacturing/work-orders', { product: 'Smoke Test', qty: 100, line: 'Line A', status: 'Planned' })

// ── Accounting: end-to-end JE ─────────────────────────────────────
const accounts = await call('accounting.accounts', 'GET', '/api/accounting/accounts')
const cash = accounts?.find((a) => a.code === '1000')
const sales = accounts?.find((a) => a.code === '4000') || accounts?.find((a) => a.type === 'revenue' && a.subType !== 'group')
if (cash && sales) {
  await call('accounting.journal.create', 'POST', '/api/accounting/journal-entries', {
    date: new Date().toISOString(),
    description: 'Smoke test JE',
    lines: [
      { account: cash._id, debit: 1000, credit: 0 },
      { account: sales._id, debit: 0, credit: 1000 },
    ],
  })
}

// ── GST / TDS / Blockchain (read-only spot checks) ────────────────
await call('blockchain.ledger', 'GET', '/api/blockchain/ledger')
await call('audit.list', 'GET', '/api/audit')
await call('whatsapp.overdue', 'GET', '/api/whatsapp/overdue')
await call('assistant.query', 'POST', '/api/assistant/query', { query: 'help' })

// ── Report ────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
console.log('\n┌─────────────────────────────────────────────────────────────┐')
console.log('│ BlockERP Page-Level Mutation Smoke Test                     │')
console.log('└─────────────────────────────────────────────────────────────┘\n')
let pass = 0, fail = 0
for (const r of results) {
  const tag = r.ok ? '✅' : '❌'
  if (r.ok) pass++; else fail++
  console.log(`${tag} ${pad(r.label, 32)} ${pad(r.method, 5)} ${pad(r.status, 4)} ${pad(r.ms + 'ms', 7)} ${r.msg ? '— ' + r.msg.slice(0, 100) : ''}`)
}
console.log(`\n  ${pass}/${results.length} passed\n`)
if (fail > 0) {
  console.log('Failures:')
  for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.label} (${r.method} ${r.path}) → ${r.status}: ${r.msg}`)
}
process.exit(fail > 0 ? 1 : 0)
