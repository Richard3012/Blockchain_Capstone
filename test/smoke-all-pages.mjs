// Live smoke test: exercise every backend endpoint against a running server.
// Usage: node test/smoke-all-pages.mjs
const BASE = process.env.BASE || 'http://localhost:4000'
const EMAIL = process.env.EMAIL || 'admin@blockerp.local'
const PASS = process.env.PASS || 'ChangeMe123!'

let token = null
const results = []

const call = async (label, method, path, body) => {
  const t0 = Date.now()
  try {
    const headers = { 'content-type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    const ok = res.ok && (json?.success !== false)
    results.push({ label, method, path, status: res.status, ok, ms: Date.now() - t0, msg: json?.message || (ok ? '' : text.slice(0, 200)) })
    return { res, json }
  } catch (e) {
    results.push({ label, method, path, status: 0, ok: false, ms: Date.now() - t0, msg: e.message })
    return { res: null, json: null }
  }
}

// ── Auth ─────────────────────────────────────────────────────────────
const login = await call('auth.login', 'POST', '/api/auth/login', { email: EMAIL, password: PASS })
token = login.json?.data?.token
if (!token) { console.error('Login failed'); process.exit(1) }
await call('auth.me', 'GET', '/api/auth/me')

// ── Dashboard ────────────────────────────────────────────────────────
await call('dashboard.summary', 'GET', '/api/dashboard/summary')

// ── Master Data ──────────────────────────────────────────────────────
await call('products.list', 'GET', '/api/products')
await call('suppliers.list', 'GET', '/api/suppliers')
await call('stores.list', 'GET', '/api/stores')
await call('customers.list', 'GET', '/api/customers')

// ── Inventory ────────────────────────────────────────────────────────
await call('inventory.low-stock', 'GET', '/api/inventory/low-stock')

// ── Procurement ──────────────────────────────────────────────────────
await call('procurement.purchase-orders', 'GET', '/api/procurement/purchase-orders')
await call('procurement.goods-receipts', 'GET', '/api/procurement/goods-receipts')

// ── Orders ───────────────────────────────────────────────────────────
await call('orders.list', 'GET', '/api/orders')

// ── Invoices ─────────────────────────────────────────────────────────
await call('invoices.list', 'GET', '/api/invoices')

// ── Operations (delivery/forecasts/...) ──────────────────────────────
await call('delivery.list', 'GET', '/api/delivery')
await call('demand.top', 'GET', '/api/demand/top-products?limit=5')

// ── Finance / Wallet ─────────────────────────────────────────────────
await call('wallet.status', 'GET', '/api/wallet/status')

// ── Accounting ───────────────────────────────────────────────────────
await call('accounting.templates', 'GET', '/api/accounting/templates')
await call('accounting.accounts', 'GET', '/api/accounting/accounts')
await call('accounting.tree', 'GET', '/api/accounting/accounts/tree')
await call('accounting.journal-entries', 'GET', '/api/accounting/journal-entries')
await call('accounting.trial-balance', 'GET', '/api/accounting/trial-balance')
await call('accounting.pnl', 'GET', '/api/accounting/profit-and-loss')
await call('accounting.balance-sheet', 'GET', '/api/accounting/balance-sheet')
await call('accounting.dimensions', 'GET', '/api/accounting/dimensions')
await call('accounting.periods', 'GET', '/api/accounting/periods')

// ── GST ──────────────────────────────────────────────────────────────
const period = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
await call('gst.summary', 'GET', `/api/gst/summary?period=${period}`)
await call('gst.gstr1', 'GET', `/api/gst/gstr1?period=${period}`)
await call('gst.gstr3b', 'GET', `/api/gst/gstr3b?period=${period}`)
await call('gst.returns', 'GET', '/api/gst/returns')
await call('gst.state-codes', 'GET', '/api/gst/state-codes')
await call('gst.hsn', 'GET', '/api/gst/hsn?q=rice')
await call('gst.stats', 'GET', '/api/gst/stats')

// ── TDS (already verified, smoke only) ───────────────────────────────
await call('tds.sections', 'GET', '/api/tds/sections')
await call('tds.deductions', 'GET', '/api/tds/deductions')

// ── HR ───────────────────────────────────────────────────────────────
await call('hr.employees', 'GET', '/api/employees')
await call('hr.attendance', 'GET', '/api/hr/attendance')
await call('hr.payroll', 'GET', '/api/hr/payroll')
await call('hr.leaves', 'GET', '/api/hr/leaves')
await call('hr.stats', 'GET', '/api/hr/stats')

// ── Audit ────────────────────────────────────────────────────────────
await call('audit.logs', 'GET', '/api/audit')

// ── Blockchain ───────────────────────────────────────────────────────
await call('blockchain.ledger', 'GET', '/api/blockchain/ledger')

// ── AI Assistant ─────────────────────────────────────────────────────
await call('assistant.query', 'POST', '/api/assistant/query', { query: 'ping' })
await call('assistant.history', 'GET', '/api/assistant/history')

// ── Analytics (real-time) ────────────────────────────────────────────
await call('analytics.summary', 'GET', '/api/analytics/summary')
await call('analytics.revenue-trend', 'GET', '/api/analytics/revenue-trend?period=month')
await call('analytics.expense-breakdown', 'GET', '/api/analytics/expense-breakdown?period=month')
await call('analytics.gst-summary', 'GET', '/api/analytics/gst-summary?period=month')
await call('analytics.vendor-spending', 'GET', '/api/analytics/vendor-spending?period=month&limit=5')

// ── WhatsApp Bot ─────────────────────────────────────────────────────
await call('whatsapp.status', 'GET', '/api/whatsapp/status')

// ── Operations (manufacturing/projects/assets/docs/approvals/support) ─
await call('ops.manufacturing', 'GET', '/api/manufacturing')
await call('ops.projects', 'GET', '/api/projects')
await call('ops.assets', 'GET', '/api/assets')
await call('ops.documents', 'GET', '/api/documents')
await call('ops.workflow-requests', 'GET', '/api/workflow-requests')
await call('ops.support', 'GET', '/api/support')
await call('ops.employees', 'GET', '/api/employees')
await call('ops.notifications', 'GET', '/api/notifications')

// ── Report ───────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
console.log('\n┌─────────────────────────────────────────────────────────────┐')
console.log('│ BlockERP Page-by-Page Smoke Test                            │')
console.log('└─────────────────────────────────────────────────────────────┘\n')
let pass = 0, fail = 0
for (const r of results) {
  const tag = r.ok ? '✅' : '❌'
  if (r.ok) pass++; else fail++
  console.log(`${tag} ${pad(r.label, 32)} ${pad(r.method, 5)} ${pad(r.status, 4)} ${pad(r.ms + 'ms', 7)} ${r.msg ? '— ' + r.msg.slice(0, 80) : ''}`)
}
console.log(`\n  ${pass} passed · ${fail} failed · ${results.length} total\n`)
if (fail > 0) {
  console.log('Failures:')
  for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.label} (${r.method} ${r.path}) → ${r.status}: ${r.msg}`)
}
process.exit(fail > 0 ? 1 : 0)
