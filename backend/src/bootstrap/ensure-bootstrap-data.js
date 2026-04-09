import bcrypt from 'bcryptjs'

import { databaseState } from '../config/database.js'
import { ROLES } from '../constants/roles.js'
import { AuditLog } from '../models/audit-log.model.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import Company from '../models/company.model.js'
import { Customer } from '../models/customer.model.js'
import { Invoice } from '../models/invoice.model.js'
import { Payment } from '../models/payment.model.js'
import { Product } from '../models/product.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { Store } from '../models/store.model.js'
import { Supplier } from '../models/supplier.model.js'
import { User } from '../models/user.model.js'
import { verificationService } from '../services/verification.service.js'
import { logger } from '../utils/logger.js'
import { hashRecord } from '../utils/hash-record.js'

const PASSWORD = 'ChangeMe123!'

const storeSeed = [
  { code: 'MAIN-STORE', name: 'Main Store', type: 'store', address: 'MG Road, Bengaluru', phone: '+91-80-4000-1000' },
  { code: 'CITY-STORE', name: 'City Store', type: 'store', address: 'Church Street, Bengaluru', phone: '+91-80-4000-1001' },
  { code: 'CENTRAL-WH', name: 'Central Warehouse', type: 'warehouse', address: 'Peenya Industrial Area, Bengaluru', phone: '+91-80-4000-1099' },
]

const supplierSeed = [
  { code: 'SUP-001', name: 'Retail Source Ltd', contactName: 'Amit Kulkarni', email: 'purchasing@retailsource.demo', paymentTermsDays: 30, taxId: '29AAACR1001L1ZC' },
  { code: 'SUP-002', name: 'Metro Wholesale Distributors', contactName: 'Neha Shah', email: 'sales@metro-wholesale.demo', paymentTermsDays: 21, taxId: '29AAACM2002L1Z2' },
]

const productSeed = [
  { sku: 'SKU-001', name: 'Point of Sale Scanner', category: 'POS Hardware', unit: 'pcs', costPrice: 2500, salePrice: 3400, reorderLevel: 5, currentStock: 18 },
  { sku: 'SKU-002', name: 'Thermal Receipt Printer', category: 'POS Hardware', unit: 'pcs', costPrice: 4800, salePrice: 6200, reorderLevel: 4, currentStock: 12 },
  { sku: 'SKU-003', name: 'Barcode Label Roll', category: 'Store Supplies', unit: 'roll', costPrice: 180, salePrice: 250, reorderLevel: 25, currentStock: 64 },
  { sku: 'SKU-004', name: 'Handheld Inventory Scanner', category: 'Warehouse Tools', unit: 'pcs', costPrice: 7200, salePrice: 8990, reorderLevel: 3, currentStock: 7 },
]

const customerSeed = [
  { code: 'CUST-001', name: 'Default Retail Customer', email: 'customer@blockerp.local', phone: '+91-90000-10001', billingAddress: 'Brigade Road, Bengaluru' },
  { code: 'CUST-002', name: 'Aarav Retail Partners', email: 'ops@aarav-retail.demo', phone: '+91-90000-10002', billingAddress: 'Indiranagar, Bengaluru' },
  { code: 'CUST-003', name: 'Storefront Demo Buyer', email: 'buyer@storefront-demo.demo', phone: '+91-90000-10003', billingAddress: 'JP Nagar, Bengaluru' },
]

const userSeed = [
  { email: 'admin@blockerp.local', name: 'BlockERP Admin', role: ROLES.ADMIN, storeCode: 'MAIN-STORE' },
  { email: 'procurement@blockerp.local', name: 'Priya Procurement', role: ROLES.PROCUREMENT_MANAGER, storeCode: 'CENTRAL-WH' },
  { email: 'inventory@blockerp.local', name: 'Ishaan Inventory', role: ROLES.INVENTORY_MANAGER, storeCode: 'CENTRAL-WH' },
  { email: 'finance@blockerp.local', name: 'Farah Finance', role: ROLES.FINANCE_MANAGER, storeCode: 'MAIN-STORE' },
  { email: 'sales@blockerp.local', name: 'Sanjay Sales', role: ROLES.SALES_STAFF, storeCode: 'CITY-STORE' },
  { email: 'storemanager@blockerp.local', name: 'Meera Store Manager', role: ROLES.STORE_MANAGER, storeCode: 'MAIN-STORE' },
  { email: 'support@blockerp.local', name: 'Rohan Support', role: ROLES.SUPPORT_STAFF, storeCode: 'CITY-STORE' },
]

const invoiceMonthDate = (offset) => new Date(new Date().getFullYear(), new Date().getMonth() - offset, 12)

export const ensureBootstrapData = async () => {
  if (!databaseState.connected) {
    logger.warn('bootstrap.skipped', { reason: 'database unavailable', mode: databaseState.mode })
    return
  }

  const company = await Company.findOneAndUpdate(
    { code: 'BLOCKERP' },
    {
      name: 'BlockERP Retail',
      code: 'BLOCKERP',
      email: 'ops@blockerp.demo',
      phone: '+91-80-4400-4400',
      address: 'Bengaluru, Karnataka',
    },
    { new: true, upsert: true },
  )

  const stores = {}
  for (const item of storeSeed) {
    stores[item.code] = await Store.findOneAndUpdate(
      { code: item.code },
      { ...item, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const users = {}
  for (const user of userSeed) {
    users[user.email] = await User.findOneAndUpdate(
      { email: user.email },
      {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        companyId: company._id,
        storeId: stores[user.storeCode]._id,
        isActive: true,
      },
      { new: true, upsert: true },
    )
  }

  const suppliers = {}
  for (const supplier of supplierSeed) {
    suppliers[supplier.code] = await Supplier.findOneAndUpdate(
      { code: supplier.code },
      { ...supplier, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  const products = {}
  for (const product of productSeed) {
    products[product.sku] = await Product.findOneAndUpdate(
      { sku: product.sku },
      { ...product, companyId: company._id, isActive: true },
      { new: true, upsert: true },
    )
  }

  const customers = {}
  for (const customer of customerSeed) {
    customers[customer.code] = await Customer.findOneAndUpdate(
      { code: customer.code },
      { ...customer, companyId: company._id, isActive: true },
      { new: true, upsert: true },
    )
  }

  const salesOrders = [
    {
      orderNumber: 'SO-DEMO-001',
      customer: customers['CUST-001']._id,
      store: stores['MAIN-STORE']._id,
      createdBy: users['storemanager@blockerp.local']._id,
      status: 'delivered',
      orderDate: invoiceMonthDate(5),
      dueDate: invoiceMonthDate(5),
      items: [{ product: products['SKU-001']._id, quantity: 2, unitPrice: 3400 }],
      subtotal: 6800,
      taxAmount: 1224,
      totalAmount: 8024,
      verificationStatus: 'verified',
    },
    {
      orderNumber: 'SO-DEMO-002',
      customer: customers['CUST-002']._id,
      store: stores['CITY-STORE']._id,
      createdBy: users['sales@blockerp.local']._id,
      status: 'shipped',
      orderDate: invoiceMonthDate(4),
      dueDate: invoiceMonthDate(4),
      items: [{ product: products['SKU-002']._id, quantity: 1, unitPrice: 6200 }],
      subtotal: 6200,
      taxAmount: 1116,
      totalAmount: 7316,
      verificationStatus: 'verified',
    },
    {
      orderNumber: 'SO-DEMO-003',
      customer: customers['CUST-003']._id,
      store: stores['MAIN-STORE']._id,
      createdBy: users['storemanager@blockerp.local']._id,
      status: 'processing',
      orderDate: invoiceMonthDate(2),
      dueDate: invoiceMonthDate(2),
      items: [{ product: products['SKU-004']._id, quantity: 1, unitPrice: 8990 }],
      subtotal: 8990,
      taxAmount: 1618.2,
      totalAmount: 10608.2,
      verificationStatus: 'verified',
    },
    {
      orderNumber: 'SO-DEMO-004',
      customer: customers['CUST-002']._id,
      store: stores['CITY-STORE']._id,
      createdBy: users['procurement@blockerp.local']._id,
      status: 'pending',
      orderDate: invoiceMonthDate(1),
      dueDate: invoiceMonthDate(1),
      items: [{ product: products['SKU-003']._id, quantity: 40, unitPrice: 250 }],
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      verificationStatus: 'verified',
    },
  ]

  const orderDocs = {}
  for (const order of salesOrders) {
    orderDocs[order.orderNumber] = await SalesOrder.findOneAndUpdate(
      { orderNumber: order.orderNumber },
      { ...order, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  const invoices = [
    {
      invoiceNumber: 'INV-DEMO-001',
      order: orderDocs['SO-DEMO-001']._id,
      customer: customers['CUST-001']._id,
      store: stores['MAIN-STORE']._id,
      status: 'paid',
      issueDate: invoiceMonthDate(5),
      dueDate: invoiceMonthDate(4),
      subtotal: 6800,
      taxAmount: 1224,
      totalAmount: 8024,
      amountPaid: 8024,
      balanceDue: 0,
      verificationStatus: 'verified',
      createdBy: users['finance@blockerp.local']._id,
    },
    {
      invoiceNumber: 'INV-DEMO-002',
      order: orderDocs['SO-DEMO-002']._id,
      customer: customers['CUST-002']._id,
      store: stores['CITY-STORE']._id,
      status: 'paid',
      issueDate: invoiceMonthDate(4),
      dueDate: invoiceMonthDate(3),
      subtotal: 6200,
      taxAmount: 1116,
      totalAmount: 7316,
      amountPaid: 7316,
      balanceDue: 0,
      verificationStatus: 'verified',
      createdBy: users['finance@blockerp.local']._id,
    },
    {
      invoiceNumber: 'INV-DEMO-003',
      order: orderDocs['SO-DEMO-003']._id,
      customer: customers['CUST-003']._id,
      store: stores['MAIN-STORE']._id,
      status: 'issued',
      issueDate: invoiceMonthDate(2),
      dueDate: invoiceMonthDate(1),
      subtotal: 8990,
      taxAmount: 1618.2,
      totalAmount: 10608.2,
      amountPaid: 0,
      balanceDue: 10608.2,
      verificationStatus: 'verified',
      createdBy: users['finance@blockerp.local']._id,
    },
    {
      invoiceNumber: 'INV-DEMO-004',
      order: orderDocs['SO-DEMO-004']._id,
      customer: customers['CUST-002']._id,
      store: stores['CITY-STORE']._id,
      status: 'overdue',
      issueDate: invoiceMonthDate(1),
      dueDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 2),
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      amountPaid: 0,
      balanceDue: 11800,
      verificationStatus: 'verified',
      createdBy: users['finance@blockerp.local']._id,
    },
  ]

  const invoiceDocs = {}
  for (const invoice of invoices) {
    invoiceDocs[invoice.invoiceNumber] = await Invoice.findOneAndUpdate(
      { invoiceNumber: invoice.invoiceNumber },
      { ...invoice, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  await Payment.findOneAndUpdate(
    { paymentNumber: 'PAY-DEMO-001' },
    {
      companyId: company._id,
      paymentNumber: 'PAY-DEMO-001',
      invoice: invoiceDocs['INV-DEMO-001']._id,
      customer: customers['CUST-001']._id,
      amount: 8024,
      paymentDate: invoiceMonthDate(4),
      method: 'upi',
      reference: 'UPI-DEMO-001',
      createdBy: users['finance@blockerp.local']._id,
    },
    { new: true, upsert: true },
  )

  await Payment.findOneAndUpdate(
    { paymentNumber: 'PAY-DEMO-002' },
    {
      companyId: company._id,
      paymentNumber: 'PAY-DEMO-002',
      invoice: invoiceDocs['INV-DEMO-002']._id,
      customer: customers['CUST-002']._id,
      amount: 7316,
      paymentDate: invoiceMonthDate(3),
      method: 'bank_transfer',
      reference: 'BT-DEMO-002',
      createdBy: users['finance@blockerp.local']._id,
    },
    { new: true, upsert: true },
  )

  const verificationSeed = [
    { entityType: 'sales_order', entity: orderDocs['SO-DEMO-001'] },
    { entityType: 'sales_order', entity: orderDocs['SO-DEMO-002'] },
    { entityType: 'invoice', entity: invoiceDocs['INV-DEMO-001'] },
    { entityType: 'invoice', entity: invoiceDocs['INV-DEMO-003'] },
  ]

  for (const item of verificationSeed) {
    const canonicalPayload = verificationService.buildCanonicalPayload(item.entityType, item.entity)
    const resolvedHash = hashRecord(canonicalPayload)
    if ('hash' in item.entity) item.entity.hash = resolvedHash
    if ('verificationStatus' in item.entity) item.entity.verificationStatus = 'verified'
    await item.entity.save()

    await BlockchainRecord.findOneAndUpdate(
      { companyId: company._id, entityType: item.entityType, entityId: item.entity._id.toString() },
      {
        companyId: company._id,
        entityType: item.entityType,
        entityId: item.entity._id.toString(),
        recordHash: resolvedHash,
        status: 'anchored',
        contractAddress: 'local-demo',
        requestedBy: users['admin@blockerp.local']._id,
        anchoredAt: new Date(),
      },
      { new: true, upsert: true },
    )
  }

  await AuditLog.findOneAndUpdate(
    { companyId: company._id, action: 'system.bootstrap_completed', entityId: company._id.toString() },
    {
      companyId: company._id,
      action: 'system.bootstrap_completed',
      entityType: 'company',
      entityId: company._id.toString(),
      summary: 'Retail ERP demo data is ready',
      actor: users['admin@blockerp.local']._id,
      hash: '0xbootstrap',
      metadata: {
        stores: Object.keys(stores).length,
        products: Object.keys(products).length,
        customers: Object.keys(customers).length,
        users: Object.keys(users).length,
      },
    },
    { new: true, upsert: true },
  )

  logger.info('bootstrap.completed', {
    companyId: company._id.toString(),
    stores: Object.keys(stores).length,
    products: Object.keys(products).length,
    customers: Object.keys(customers).length,
    users: Object.keys(users).length,
    demoPassword: PASSWORD,
  })
}
