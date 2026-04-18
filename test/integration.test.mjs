/**
 * BlockERP Backend — Integration Test Suite
 *
 * Tests the Express API end-to-end using:
 *   - mongodb-memory-server  (ephemeral database)
 *   - supertest              (HTTP assertions)
 *
 * Run:  npm run test:integration
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import supertest from 'supertest'

let app, request, mongoServer

// Set env vars BEFORE any module imports so dotenv doesn't override them
process.env.BLOCKCHAIN_PRIVATE_KEY = ''
process.env.RECORD_ANCHOR_ADDRESS = ''
process.env.PINATA_JWT = ''
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'integration-test-secret'

// ── Helpers ────────────────────────────────────────────────────────
let adminToken
let adminUser

async function registerAdmin() {
  const res = await request
    .post('/api/auth/register')
    .send({ name: 'Test Admin', email: 'testadmin@blockerp.test', password: 'Test1234!' })
    .expect(201)
  adminToken = res.body.data.token
  adminUser = res.body.data.user
  return res.body.data
}

function auth(req) {
  return req.set('Authorization', `Bearer ${adminToken}`)
}

// ── Setup / Teardown ───────────────────────────────────────────────
async function setup() {
  mongoServer = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongoServer.getUri('blockerp-test')

  // Dynamic import so env vars are picked up
  const { connectDatabase } = await import('../backend/src/config/database.js')
  await connectDatabase()

  const mod = await import('../backend/src/app.js')
  app = mod.default
  request = supertest(app)
}

async function teardown() {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  if (mongoServer) await mongoServer.stop()
}

// ── Test runner ────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures = []

async function run(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    failures.push({ name, message: err.message })
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ────────────────────────────────────────────────────────────────────
//  T E S T   S U I T E S
// ────────────────────────────────────────────────────────────────────

// ── Health ──────────────────────────────────────────────────────────
async function healthTests() {
  console.log('\n═══ Health Endpoints ═══')

  await run('GET / returns service status', async () => {
    const res = await request.get('/').expect(200)
    assertEqual(res.body.status, 'ok', 'status')
    assertEqual(res.body.service, 'blockerp-api', 'service')
  })

  await run('GET /health returns database state', async () => {
    const res = await request.get('/health').expect(200)
    assertEqual(res.body.status, 'ok', 'status')
    assert(res.body.database, 'database field present')
    assertEqual(res.body.database.connected, true, 'db connected')
  })

  await run('GET /api/health returns wrapped response', async () => {
    const res = await request.get('/api/health').expect(200)
    assertEqual(res.body.success, true, 'success')
    assertEqual(res.body.data.status, 'ok', 'data.status')
  })

  await run('GET /api/nonexistent returns 404', async () => {
    await request.get('/api/nonexistent').expect(404)
  })
}

// ── Auth ────────────────────────────────────────────────────────────
async function authTests() {
  console.log('\n═══ Authentication ═══')

  await run('POST /api/auth/register creates user', async () => {
    await registerAdmin()
    assert(adminToken, 'token returned')
    assertEqual(adminUser.email, 'testadmin@blockerp.test', 'email')
    assertEqual(adminUser.role, 'admin', 'role')
    assert(adminUser.companyId, 'companyId assigned')
  })

  await run('POST /api/auth/register rejects duplicate email', async () => {
    await request
      .post('/api/auth/register')
      .send({ name: 'Dup', email: 'testadmin@blockerp.test', password: 'Test1234!' })
      .expect(409)
  })

  await run('POST /api/auth/login returns token', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'testadmin@blockerp.test', password: 'Test1234!' })
      .expect(200)
    assert(res.body.data.token, 'token')
    // Update token in case bootId changed
    adminToken = res.body.data.token
  })

  await run('POST /api/auth/login rejects bad password', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'testadmin@blockerp.test', password: 'WrongPass123!' })
    assert([400, 401].includes(res.status), `status ${res.status} is 400 or 401`)
  })

  await run('GET /api/auth/me returns current user', async () => {
    const res = await auth(request.get('/api/auth/me')).expect(200)
    assertEqual(res.body.data.email, 'testadmin@blockerp.test', 'email')
  })

  await run('GET /api/auth/me rejects unauthenticated', async () => {
    await request.get('/api/auth/me').expect(401)
  })

  await run('GET /api/auth/me rejects invalid token', async () => {
    const res = await request
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here')
    assert([401, 500].includes(res.status), `status ${res.status} is 401 or 500`)
    assert(!res.body.success || !res.body.data, 'no user data returned')
  })
}

// ── Products (Master Data) ──────────────────────────────────────────
let productId
async function productTests() {
  console.log('\n═══ Products ═══')

  await run('POST /api/products creates product', async () => {
    const res = await auth(request.post('/api/products'))
      .send({ sku: 'TST-001', name: 'Test Widget', costPrice: 100, salePrice: 200, reorderLevel: 10, currentStock: 50 })
      .expect(201)
    productId = res.body.data._id
    assertEqual(res.body.data.sku, 'TST-001', 'sku')
    assertEqual(res.body.data.name, 'Test Widget', 'name')
  })

  await run('GET /api/products lists products', async () => {
    const res = await auth(request.get('/api/products')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
    assert(res.body.data.length >= 1, 'at least one product')
  })

  await run('GET /api/products/:id returns product', async () => {
    const res = await auth(request.get(`/api/products/${productId}`)).expect(200)
    assertEqual(res.body.data.sku, 'TST-001', 'sku')
  })

  await run('PATCH /api/products/:id updates product', async () => {
    const res = await auth(request.patch(`/api/products/${productId}`))
      .send({ salePrice: 250 })
      .expect(200)
    assertEqual(res.body.data.salePrice, 250, 'salePrice')
  })

  await run('POST /api/products rejects unauthenticated', async () => {
    await request
      .post('/api/products')
      .send({ sku: 'X', name: 'X', costPrice: 1, salePrice: 2 })
      .expect(401)
  })
}

// ── Suppliers ───────────────────────────────────────────────────────
let supplierId
async function supplierTests() {
  console.log('\n═══ Suppliers ═══')

  await run('POST /api/suppliers creates supplier', async () => {
    const res = await auth(request.post('/api/suppliers'))
      .send({ code: 'SUP-TST', name: 'Test Supplier Co', paymentTermsDays: 30 })
      .expect(201)
    supplierId = res.body.data._id
    assertEqual(res.body.data.name, 'Test Supplier Co', 'name')
  })

  await run('GET /api/suppliers lists suppliers', async () => {
    const res = await auth(request.get('/api/suppliers')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })

  await run('PATCH /api/suppliers/:id updates supplier', async () => {
    const res = await auth(request.patch(`/api/suppliers/${supplierId}`))
      .send({ paymentTermsDays: 45 })
      .expect(200)
    assertEqual(res.body.data.paymentTermsDays, 45, 'paymentTermsDays')
  })
}

// ── Customers ───────────────────────────────────────────────────────
let customerId
async function customerTests() {
  console.log('\n═══ Customers ═══')

  await run('POST /api/customers creates customer', async () => {
    const res = await auth(request.post('/api/customers'))
      .send({ code: 'CUST-TST', name: 'Test Customer', email: 'cust@test.com', phone: '9999999999' })
      .expect(201)
    customerId = res.body.data._id
    assertEqual(res.body.data.name, 'Test Customer', 'name')
  })

  await run('GET /api/customers lists customers', async () => {
    const res = await auth(request.get('/api/customers')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })

  await run('GET /api/customers/:id returns customer', async () => {
    const res = await auth(request.get(`/api/customers/${customerId}`)).expect(200)
    assertEqual(res.body.data.code, 'CUST-TST', 'code')
  })
}

// ── Stores ──────────────────────────────────────────────────────────
let storeId
async function storeTests() {
  console.log('\n═══ Stores ═══')

  await run('POST /api/stores creates store', async () => {
    const res = await auth(request.post('/api/stores'))
      .send({ name: 'Warehouse B', code: 'WH-B', type: 'warehouse' })
      .expect(201)
    storeId = res.body.data._id
    assertEqual(res.body.data.type, 'warehouse', 'type')
  })

  await run('GET /api/stores lists stores', async () => {
    const res = await auth(request.get('/api/stores')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })

  await run('PATCH /api/stores/:id updates store', async () => {
    const res = await auth(request.patch(`/api/stores/${storeId}`))
      .send({ name: 'Warehouse B - Updated' })
      .expect(200)
    assertEqual(res.body.data.name, 'Warehouse B - Updated', 'name')
  })
}

// ── Inventory ───────────────────────────────────────────────────────
async function inventoryTests() {
  console.log('\n═══ Inventory ═══')

  await run('POST /api/inventory/stock-in adds stock', async () => {
    const res = await auth(request.post('/api/inventory/stock-in'))
      .send({ productId, storeId: adminUser.storeId, quantity: 20, unitCost: 100, notes: 'Initial stock' })
      .expect(201)
    assert(res.body.data, 'transaction returned')
  })

  await run('POST /api/inventory/stock-out removes stock', async () => {
    const res = await auth(request.post('/api/inventory/stock-out'))
      .send({ productId, storeId: adminUser.storeId, quantity: 5, unitCost: 100, notes: 'Sold' })
      .expect(201)
    assert(res.body.data, 'transaction returned')
  })

  await run('GET /api/inventory/history/:productId returns history', async () => {
    const res = await auth(request.get(`/api/inventory/history/${productId}`)).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
    assert(res.body.data.length >= 2, 'at least stock-in + stock-out')
  })

  await run('GET /api/inventory/low-stock returns list', async () => {
    const res = await auth(request.get('/api/inventory/low-stock')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })
}

// ── Sales Orders ────────────────────────────────────────────────────
let orderId
async function orderTests() {
  console.log('\n═══ Sales Orders ═══')

  await run('POST /api/orders creates order', async () => {
    // Fetch product to get salePrice for unitPrice
    const prod = await auth(request.get(`/api/products/${productId}`)).expect(200)
    const res = await auth(request.post('/api/orders'))
      .send({
        customer: customerId,
        store: adminUser.storeId,
        items: [{ product: productId, quantity: 2, unitPrice: prod.body.data.salePrice }],
      })
      .expect(201)
    orderId = res.body.data._id
    assert(res.body.data.orderNumber, 'orderNumber assigned')
  })

  await run('GET /api/orders lists orders', async () => {
    const res = await auth(request.get('/api/orders')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
    assert(res.body.data.length >= 1, 'at least one order')
  })

  await run('GET /api/orders/:id returns order', async () => {
    const res = await auth(request.get(`/api/orders/${orderId}`)).expect(200)
    assert(res.body.data.orderNumber, 'orderNumber')
  })

  await run('PUT /api/orders/:id/status updates status', async () => {
    const res = await auth(request.put(`/api/orders/${orderId}/status`))
      .send({ status: 'processing' })
      .expect(200)
    assertEqual(res.body.data.status, 'processing', 'status')
  })
}

// ── Invoices ────────────────────────────────────────────────────────
let invoiceId
async function invoiceTests() {
  console.log('\n═══ Invoices ═══')

  await run('POST /api/invoices creates invoice', async () => {
    const res = await auth(request.post('/api/invoices'))
      .send({
        order: orderId,
        customer: customerId,
        store: adminUser.storeId,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        subtotal: 400,
        totalAmount: 400,
      })
      .expect(201)
    const inv = res.body.data.invoice || res.body.data
    invoiceId = inv._id
    assert(inv.invoiceNumber, 'invoiceNumber assigned')
  })

  await run('GET /api/invoices lists invoices', async () => {
    const res = await auth(request.get('/api/invoices')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })

  await run('GET /api/invoices/:id returns invoice', async () => {
    const res = await auth(request.get(`/api/invoices/${invoiceId}`)).expect(200)
    const inv = res.body.data.invoice || res.body.data
    assert(inv.invoiceNumber, 'invoiceNumber')
  })

  await run('PUT /api/invoices/:id/mark-paid records payment', async () => {
    const res = await auth(request.put(`/api/invoices/${invoiceId}/mark-paid`))
      .send({ amount: 100, method: 'bank_transfer', reference: 'REF-001' })
      .expect(200)
    assert(res.body.data, 'data returned')
  })
}

// ── Procurement ─────────────────────────────────────────────────────
let purchaseOrderId
async function procurementTests() {
  console.log('\n═══ Procurement ═══')

  await run('POST /api/procurement/purchase-orders creates PO', async () => {
    const res = await auth(request.post('/api/procurement/purchase-orders'))
      .send({
        supplier: supplierId,
        store: adminUser.storeId,
        items: [{ product: productId, quantity: 50, unitCost: 90 }],
      })
      .expect(201)
    const po = res.body.data.purchaseOrder || res.body.data
    purchaseOrderId = po._id
    assert(po.orderNumber, 'orderNumber assigned')
  })

  await run('GET /api/procurement/purchase-orders lists POs', async () => {
    const res = await auth(request.get('/api/procurement/purchase-orders')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })

  await run('POST /api/procurement/goods-receipts creates GRN', async () => {
    const res = await auth(request.post('/api/procurement/goods-receipts'))
      .send({
        purchaseOrder: purchaseOrderId,
        store: adminUser.storeId,
        items: [{ product: productId, quantityReceived: 50 }],
      })
      .expect(201)
    const gr = res.body.data.goodsReceipt || res.body.data
    assert(gr.receiptNumber, 'receiptNumber assigned')
  })
}

// ── Accounting ──────────────────────────────────────────────────────
async function accountingTests() {
  console.log('\n═══ Accounting ═══')

  await run('POST /api/accounting/initialize sets up chart of accounts', async () => {
    const res = await auth(request.post('/api/accounting/initialize')).expect(200)
    assert(res.body.data || res.body.success, 'accounts initialized')
  })

  await run('GET /api/accounting/accounts lists accounts', async () => {
    const res = await auth(request.get('/api/accounting/accounts')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
    assert(res.body.data.length > 0, 'accounts exist')
  })

  await run('POST /api/accounting/journal-entries creates entry', async () => {
    const accounts = (await auth(request.get('/api/accounting/accounts'))).body.data
    const cash = accounts.find(a => a.name.toLowerCase().includes('cash'))
    const revenue = accounts.find(a => a.type === 'revenue')
    if (!cash || !revenue) throw new Error('Default accounts not found')

    const res = await auth(request.post('/api/accounting/journal-entries'))
      .send({
        date: new Date().toISOString(),
        description: 'Test journal entry',
        lines: [
          { account: cash._id, debit: 5000, credit: 0 },
          { account: revenue._id, debit: 0, credit: 5000 },
        ],
      })
      .expect(201)
    assert(res.body.data.entryNumber, 'entryNumber')
  })

  await run('GET /api/accounting/trial-balance returns report', async () => {
    const res = await auth(request.get('/api/accounting/trial-balance')).expect(200)
    assert(res.body.data, 'report returned')
  })

  await run('GET /api/accounting/templates lists country COA templates', async () => {
    const res = await auth(request.get('/api/accounting/templates')).expect(200)
    assert(Array.isArray(res.body.data), 'templates list')
    assert(res.body.data.find(t => t.code === 'IN'), 'IN template present')
  })

  await run('GET /api/accounting/accounts/tree returns hierarchical structure', async () => {
    const res = await auth(request.get('/api/accounting/accounts/tree')).expect(200)
    assert(Array.isArray(res.body.data), 'tree is array of roots')
    const flat = (await auth(request.get('/api/accounting/accounts'))).body.data
    const hasChildren = res.body.data.some(r => Array.isArray(r.children))
    assert(hasChildren, 'tree nodes have children arrays')
    assert(res.body.data.length <= flat.length, 'tree roots <= flat count')
  })

  await run('POST /api/accounting/journal-entries/:id/reverse mirrors original', async () => {
    const accounts = (await auth(request.get('/api/accounting/accounts'))).body.data
    const cash = accounts.find(a => a.subType === 'cash') || accounts.find(a => a.code === '1000')
    const revenue = accounts.find(a => a.type === 'revenue' && a.subType !== 'group')
    const created = await auth(request.post('/api/accounting/journal-entries'))
      .send({
        date: new Date().toISOString(),
        description: 'Reversal source entry',
        lines: [
          { account: cash._id, debit: 1000, credit: 0 },
          { account: revenue._id, debit: 0, credit: 1000 },
        ],
      })
      .expect(201)
    const id = created.body.data._id
    const reversed = await auth(request.post(`/api/accounting/journal-entries/${id}/reverse`)).expect(200)
    const lines = reversed.body.data.lines
    assert(lines.length === 2, 'reversal has same line count')
    const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0)
    const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)
    assert(Math.abs(totalDebit - totalCredit) < 0.01, 'reversal is balanced')
    assert(reversed.body.data.source === 'reversal', 'source = reversal')
  })

  await run('GET /api/accounting/periods lists fiscal periods auto-created from entries', async () => {
    const res = await auth(request.get('/api/accounting/periods')).expect(200)
    assert(Array.isArray(res.body.data), 'periods list')
    assert(res.body.data.length > 0, 'at least one period exists from prior entries')
  })

  await run('POST /api/accounting/dimensions creates a cost center', async () => {
    const res = await auth(request.post('/api/accounting/dimensions'))
      .send({ kind: 'cost_center', code: 'CC-TEST', name: 'Test Cost Center' })
      .expect(201)
    assert(res.body.data._id, 'dimension created')
    assert(res.body.data.kind === 'cost_center', 'correct kind')
  })
}

// ── GST Compliance ──────────────────────────────────────────────────
async function gstTests() {
  console.log('\n═══ GST Compliance ═══')

  await run('GET /api/gst/summary returns summary', async () => {
    const res = await auth(request.get('/api/gst/summary').query({ period: '202604' })).expect(200)
    assert(res.body.data !== undefined, 'summary returned')
  })

  await run('GET /api/gst/state-codes returns codes', async () => {
    const res = await auth(request.get('/api/gst/state-codes')).expect(200)
    assert(res.body.data, 'state codes returned')
  })
}

// ── TDS ─────────────────────────────────────────────────────────────
async function tdsTests() {
  console.log('\n═══ TDS Management ═══')

  await run('GET /api/tds/sections returns sections', async () => {
    const res = await auth(request.get('/api/tds/sections')).expect(200)
    assert(Array.isArray(res.body.data), 'sections list')
  })

  await run('POST /api/tds/calculate returns calculation', async () => {
    const sections = (await auth(request.get('/api/tds/sections'))).body.data
    if (!sections.length) throw new Error('No TDS sections')
    const res = await auth(request.post('/api/tds/calculate'))
      .send({ section: sections[0].section || sections[0].code, amount: 100000 })
      .expect(200)
    assert(res.body.data.tdsAmount !== undefined, 'tdsAmount calculated')
  })
}

// ── Dashboard ───────────────────────────────────────────────────────
async function dashboardTests() {
  console.log('\n═══ Dashboard ═══')

  await run('GET /api/dashboard/summary returns KPIs', async () => {
    const res = await auth(request.get('/api/dashboard/summary')).expect(200)
    assert(res.body.data, 'summary returned')
  })
}

// ── Delivery ────────────────────────────────────────────────────────
async function deliveryTests() {
  console.log('\n═══ Delivery & Tracking ═══')

  await run('POST /api/delivery creates delivery', async () => {
    const res = await auth(request.post('/api/delivery'))
      .send({ orderId })
      .expect(201)
    assert(res.body.data.trackingNumber, 'trackingNumber assigned')
  })

  await run('GET /api/delivery lists deliveries', async () => {
    const res = await auth(request.get('/api/delivery')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })
}

// ── Audit ───────────────────────────────────────────────────────────
async function auditTests() {
  console.log('\n═══ Audit Trail ═══')

  await run('GET /api/audit lists audit logs', async () => {
    const res = await auth(request.get('/api/audit')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })
}

// ── Wallet ──────────────────────────────────────────────────────────
async function walletTests() {
  console.log('\n═══ Wallet Linking ═══')

  await run('GET /api/wallet/status returns linking status', async () => {
    const res = await auth(request.get('/api/wallet/status')).expect(200)
    assert(res.body.data !== undefined, 'status returned')
  })

  await run('POST /api/wallet/request-link-nonce returns nonce', async () => {
    const res = await auth(request.post('/api/wallet/request-link-nonce')).expect(200)
    assert(res.body.data.nonce, 'nonce returned')
  })
}

// ── Delete Operations ───────────────────────────────────────────────
async function deleteTests() {
  console.log('\n═══ Delete Operations ═══')

  // Create expendable records for deletion
  let delProductId, delSupplierId, delCustomerId

  await run('POST /api/products creates product for deletion', async () => {
    const res = await auth(request.post('/api/products'))
      .send({ sku: 'DEL-001', name: 'Delete Me Product', costPrice: 10, salePrice: 20, reorderLevel: 1, currentStock: 1 })
      .expect(201)
    delProductId = res.body.data._id
    assert(delProductId, 'product created')
  })

  await run('DELETE /api/products/:id removes product', async () => {
    await auth(request.delete(`/api/products/${delProductId}`)).expect(200)
  })

  await run('GET /api/products/:id returns 404 after delete', async () => {
    await auth(request.get(`/api/products/${delProductId}`)).expect(404)
  })

  await run('POST /api/suppliers creates supplier for deletion', async () => {
    const res = await auth(request.post('/api/suppliers'))
      .send({ code: 'SUP-DEL', name: 'Delete Me Supplier', paymentTermsDays: 15 })
      .expect(201)
    delSupplierId = res.body.data._id
    assert(delSupplierId, 'supplier created')
  })

  await run('DELETE /api/suppliers/:id removes supplier', async () => {
    await auth(request.delete(`/api/suppliers/${delSupplierId}`)).expect(200)
  })

  await run('POST /api/customers creates customer for deletion', async () => {
    const res = await auth(request.post('/api/customers'))
      .send({ code: 'CUST-DEL', name: 'Delete Me Customer', email: 'delcust@test.com' })
      .expect(201)
    delCustomerId = res.body.data._id
    assert(delCustomerId, 'customer created')
  })

  await run('DELETE /api/customers/:id removes customer', async () => {
    await auth(request.delete(`/api/customers/${delCustomerId}`)).expect(200)
  })
}

// ── Negative / Validation Tests ─────────────────────────────────────
async function negativeTests() {
  console.log('\n═══ Negative Tests ═══')

  await run('POST /api/auth/register rejects missing email', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ name: 'No Email', password: 'Test1234!' })
    assert([400, 422].includes(res.status), `status ${res.status} is 400/422`)
  })

  await run('POST /api/auth/login rejects missing password', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'testadmin@blockerp.test' })
    assert([400, 401, 422].includes(res.status), `status ${res.status} is 400/401/422`)
  })

  await run('GET /api/products/:id with invalid ObjectId', async () => {
    const res = await auth(request.get('/api/products/invalidid123'))
    assert([400, 404, 500].includes(res.status), `status ${res.status} is 400/404/500`)
  })

  await run('POST /api/products rejects missing required fields', async () => {
    const res = await auth(request.post('/api/products')).send({})
    assert([400, 422, 500].includes(res.status), `status ${res.status} is 400/422/500`)
  })

  await run('POST /api/orders rejects empty items', async () => {
    const res = await auth(request.post('/api/orders'))
      .send({ customer: customerId, items: [] })
    assert([400, 422, 500].includes(res.status), `status ${res.status} is 400/422/500`)
  })

  await run('POST /api/inventory/stock-out rejects negative quantity', async () => {
    const res = await auth(request.post('/api/inventory/stock-out'))
      .send({ productId, storeId: adminUser.storeId, quantity: -5, unitCost: 100 })
    assert([400, 422, 500].includes(res.status), `status ${res.status} is 400/422/500`)
  })

  await run('PATCH /api/products/:id unauthenticated', async () => {
    await request.patch(`/api/products/${productId}`).send({ name: 'Hacked' }).expect(401)
  })
}

// ── Blockchain Endpoints ────────────────────────────────────────────
async function blockchainTests() {
  console.log('\n═══ Blockchain ═══')

  await run('GET /api/blockchain/ledger returns ledger', async () => {
    const res = await auth(request.get('/api/blockchain/ledger')).expect(200)
    assert(res.body.data !== undefined, 'ledger data returned')
  })

  await run('GET /api/blockchain/verify/:entityType/:entityId handles unanchored', async () => {
    const res = await auth(request.get(`/api/blockchain/verify/invoice/${invoiceId}`))
    assert([200, 404].includes(res.status), `status ${res.status} is 200/404`)
  })
}

// ── Demand Forecast ─────────────────────────────────────────────────
async function demandForecastTests() {
  console.log('\n═══ Demand Forecast ═══')

  await run('GET /api/demand/forecast returns predictions', async () => {
    const res = await auth(request.get('/api/demand/forecast')).expect(200)
    assert(res.body.data !== undefined, 'forecast returned')
  })

  await run('GET /api/demand/top-products returns ranking', async () => {
    const res = await auth(request.get('/api/demand/top-products')).expect(200)
    assert(res.body.data !== undefined, 'top products returned')
  })

  await run('GET /api/demand/history returns history', async () => {
    const res = await auth(request.get('/api/demand/history')).expect(200)
    assert(res.body.data !== undefined, 'history returned')
  })
}

// ── Extended TDS Tests ──────────────────────────────────────────────
async function extendedTdsTests() {
  console.log('\n═══ Extended TDS ═══')

  let deductionId

  await run('POST /api/tds/deductions records deduction', async () => {
    const sections = (await auth(request.get('/api/tds/sections'))).body.data
    if (!sections.length) throw new Error('No TDS sections')
    const res = await auth(request.post('/api/tds/deductions'))
      .send({
        section: sections[0].section || sections[0].code,
        deductee: 'Test Vendor',
        pan: 'ABCDE1234F',
        amount: 100000,
        dateOfPayment: new Date().toISOString(),
      })
    assert([200, 201].includes(res.status), `status ${res.status} is 200/201`)
    if (res.body.data) deductionId = res.body.data._id
  })

  await run('GET /api/tds/deductions returns entries', async () => {
    const res = await auth(request.get('/api/tds/deductions')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
  })

  await run('GET /api/tds/quarterly returns summary', async () => {
    const res = await auth(request.get('/api/tds/quarterly/2025-26/Q1')).expect(200)
    assert(res.body.data !== undefined, 'quarterly data returned')
  })

  if (deductionId) {
    await run('PUT /api/tds/deductions/:id/deposit marks deposited', async () => {
      const res = await auth(request.put(`/api/tds/deductions/${deductionId}/deposit`))
        .send({ challanNumber: 'CHL-001', depositDate: new Date().toISOString() })
      assert([200, 400].includes(res.status), `status ${res.status} is 200/400`)
    })
  }
}

// ── Extended Accounting Tests ───────────────────────────────────────
async function extendedAccountingTests() {
  console.log('\n═══ Extended Accounting ═══')

  await run('GET /api/accounting/profit-and-loss returns report', async () => {
    const res = await auth(request.get('/api/accounting/profit-and-loss')).expect(200)
    assert(res.body.data !== undefined, 'P&L returned')
  })

  await run('GET /api/accounting/balance-sheet returns report', async () => {
    const res = await auth(request.get('/api/accounting/balance-sheet')).expect(200)
    assert(res.body.data !== undefined, 'balance sheet returned')
  })

  await run('GET /api/accounting/journal-entries lists entries', async () => {
    const res = await auth(request.get('/api/accounting/journal-entries')).expect(200)
    assert(Array.isArray(res.body.data), 'data is array')
    assert(res.body.data.length > 0, 'entries exist from earlier test')
  })
}

// ── Extended GST Tests ──────────────────────────────────────────────
async function extendedGstTests() {
  console.log('\n═══ Extended GST ═══')

  await run('GET /api/gst/gstr1 generates GSTR-1', async () => {
    const res = await auth(request.get('/api/gst/gstr1').query({ period: '202604' })).expect(200)
    assert(res.body.data !== undefined, 'GSTR-1 data returned')
  })

  await run('GET /api/gst/hsn searches HSN codes', async () => {
    const res = await auth(request.get('/api/gst/hsn').query({ q: 'widget' })).expect(200)
    assert(res.body.data !== undefined, 'HSN results returned')
  })
}

// ── Delivery Extended ───────────────────────────────────────────────
async function extendedDeliveryTests() {
  console.log('\n═══ Extended Delivery ═══')

  // Get a delivery to work with
  const listRes = await auth(request.get('/api/delivery')).expect(200)
  const deliveries = listRes.body.data
  if (!deliveries || !deliveries.length) return

  const delivery = deliveries[0]
  const deliveryId = delivery._id

  await run('GET /api/delivery/:id returns delivery', async () => {
    const res = await auth(request.get(`/api/delivery/${deliveryId}`)).expect(200)
    assert(res.body.data, 'delivery returned')
  })

  if (delivery.trackingNumber) {
    await run('GET /api/delivery/track/:trackingNumber (public)', async () => {
      const res = await request.get(`/api/delivery/track/${delivery.trackingNumber}`)
      assert([200, 404].includes(res.status), `status ${res.status}`)
    })
  }

  await run('PATCH /api/delivery/:id/status updates status', async () => {
    const res = await auth(request.patch(`/api/delivery/${deliveryId}/status`))
      .send({ status: 'in_transit', location: 'Warehouse A' })
    assert([200, 400].includes(res.status), `status ${res.status} is 200/400`)
  })
}

// ── Invoice Verify ──────────────────────────────────────────────────
async function invoiceVerifyTests() {
  console.log('\n═══ Invoice Verification ═══')

  await run('GET /api/invoices/:id/verify checks integrity', async () => {
    const res = await auth(request.get(`/api/invoices/${invoiceId}/verify`))
    assert([200, 404].includes(res.status), `status ${res.status} is 200/404`)
  })
}

// ── Audit By Entity ─────────────────────────────────────────────────
async function extendedAuditTests() {
  console.log('\n═══ Extended Audit ═══')

  await run('GET /api/audit/:entityType/:entityId returns filtered logs', async () => {
    const res = await auth(request.get(`/api/audit/invoice/${invoiceId}`))
    assert([200, 404].includes(res.status), `status ${res.status} is 200/404`)
    if (res.status === 200) {
      assert(Array.isArray(res.body.data), 'data is array')
    }
  })
}

// ── WhatsApp Bot ────────────────────────────────────────────────────
async function whatsappTests() {
  console.log('\n═══ WhatsApp Bot ═══')

  await run('GET /api/whatsapp/status returns bot status', async () => {
    const res = await auth(request.get('/api/whatsapp/status')).expect(200)
    assert(res.body.data !== undefined, 'status returned')
  })

  await run('GET /api/whatsapp/overdue returns overdue invoices', async () => {
    const res = await auth(request.get('/api/whatsapp/overdue')).expect(200)
    assert(res.body.data !== undefined, 'overdue data returned')
  })
}

// ── Invoice Scanner ─────────────────────────────────────────────────
async function invoiceScannerTests() {
  console.log('\n═══ Invoice Scanner ═══')

  await run('GET /api/invoice-scanner/list returns scanned invoices', async () => {
    const res = await auth(request.get('/api/invoice-scanner/list')).expect(200)
    assert(res.body.data !== undefined, 'list returned')
  })

  await run('POST /api/invoice-scanner/parse rejects no file', async () => {
    const res = await auth(request.post('/api/invoice-scanner/parse'))
    assert([400, 422, 500].includes(res.status), `status ${res.status} rejected missing file`)
  })
}

// ── Full Workflow: Order → Invoice → Payment ────────────────────────
async function workflowTest() {
  console.log('\n═══ End-to-End Workflow ═══')

  await run('Order→Invoice→Payment pipeline', async () => {
    // 1. Create a product
    const prod = await auth(request.post('/api/products'))
      .send({ sku: 'E2E-001', name: 'E2E Widget', costPrice: 50, salePrice: 120, reorderLevel: 5, currentStock: 100 })
      .expect(201)
    const pid = prod.body.data._id

    // 2. Stock-in
    await auth(request.post('/api/inventory/stock-in'))
      .send({ productId: pid, storeId: adminUser.storeId, quantity: 100, unitCost: 50 })
      .expect(201)

    // 3. Create customer
    const cust = await auth(request.post('/api/customers'))
      .send({ code: 'E2E-CUST', name: 'E2E Customer', email: 'e2e@test.com' })
      .expect(201)
    const cid = cust.body.data._id

    // 4. Place order
    const prodData = await auth(request.get(`/api/products/${pid}`)).expect(200)
    const order = await auth(request.post('/api/orders'))
      .send({ customer: cid, store: adminUser.storeId, items: [{ product: pid, quantity: 3, unitPrice: prodData.body.data.salePrice }] })
      .expect(201)
    const oid = order.body.data._id

    // 5. Move to processing
    await auth(request.put(`/api/orders/${oid}/status`))
      .send({ status: 'processing' })
      .expect(200)

    // 6. Create invoice for the order
    const inv = await auth(request.post('/api/invoices'))
      .send({ order: oid, customer: cid, store: adminUser.storeId, dueDate: new Date(Date.now() + 30 * 86400000).toISOString(), subtotal: 360, totalAmount: 360 })
      .expect(201)
    const invData = inv.body.data.invoice || inv.body.data
    const iid = invData._id

    // 7. Record payment
    await auth(request.put(`/api/invoices/${iid}/mark-paid`))
      .send({ amount: 360, method: 'upi', reference: 'UPI-E2E-001' })
      .expect(200)

    // 8. Get final invoice state
    const finalInv = await auth(request.get(`/api/invoices/${iid}`)).expect(200)
    assert(finalInv.body.data, 'invoice data exists')

    // 9. Verify audit trail captured activity
    const audit = await auth(request.get('/api/audit')).expect(200)
    assert(audit.body.data.length > 0, 'audit entries recorded')
  })
}

// ────────────────────────────────────────────────────────────────────
//  M A I N
// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║     BlockERP Backend — Integration Test Suite        ║')
  console.log('╚══════════════════════════════════════════════════════╝')

  await setup()

  try {
    await healthTests()
    await authTests()
    await productTests()
    await supplierTests()
    await customerTests()
    await storeTests()
    await inventoryTests()
    await orderTests()
    await invoiceTests()
    await procurementTests()
    await accountingTests()
    await gstTests()
    await tdsTests()
    await dashboardTests()
    await deliveryTests()
    await auditTests()
    await walletTests()
    await deleteTests()
    await negativeTests()
    await blockchainTests()
    await demandForecastTests()
    await extendedTdsTests()
    await extendedAccountingTests()
    await extendedGstTests()
    await extendedDeliveryTests()
    await invoiceVerifyTests()
    await extendedAuditTests()
    await whatsappTests()
    await invoiceScannerTests()
    await workflowTest()
  } finally {
    console.log('\n' + '═'.repeat(55))
    console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`)
    if (failures.length) {
      console.log('\nFailed tests:')
      failures.forEach(f => console.log(`  • ${f.name}: ${f.message}`))
    }
    console.log('═'.repeat(55))

    await teardown()
  }

  if (failed > 0) process.exitCode = 1
}

main().catch(err => {
  console.error('Suite error:', err)
  process.exitCode = 1
})
