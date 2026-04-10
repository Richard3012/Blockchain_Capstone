import bcrypt from 'bcryptjs'

import { AssetRecord } from '../models/asset-record.model.js'
import { databaseState } from '../config/database.js'
import { ROLES } from '../constants/roles.js'
import { AuditLog } from '../models/audit-log.model.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import Company from '../models/company.model.js'
import { Customer } from '../models/customer.model.js'
import { EmployeeRecord } from '../models/employee-record.model.js'
import { Invoice } from '../models/invoice.model.js'
import { ManagedDocument } from '../models/managed-document.model.js'
import { MaterialPlan } from '../models/material-plan.model.js'
import { Payment } from '../models/payment.model.js'
import { Product } from '../models/product.model.js'
import { ProjectRecord } from '../models/project-record.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { Store } from '../models/store.model.js'
import { Supplier } from '../models/supplier.model.js'
import { SupportTicket } from '../models/support-ticket.model.js'
import { User } from '../models/user.model.js'
import { WorkflowRequest } from '../models/workflow-request.model.js'
import { WorkOrder } from '../models/work-order.model.js'
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

const supportTicketSeed = [
  { ticketNumber: 'TKT-0001', title: 'Barcode scanner not syncing at Main Store', description: 'POS scanner intermittently disconnects during billing.', priority: 'HIGH', status: 'open', customerName: 'Default Retail Customer', assigneeEmail: 'support@blockerp.local', createdByEmail: 'storemanager@blockerp.local', storeCode: 'MAIN-STORE' },
  { ticketNumber: 'TKT-0002', title: 'Invoice PDF missing GST line', description: 'Customer invoice preview is not showing CGST/SGST split.', priority: 'MEDIUM', status: 'in-progress', customerName: 'Aarav Retail Partners', assigneeEmail: 'support@blockerp.local', createdByEmail: 'finance@blockerp.local', storeCode: 'CITY-STORE' },
  { ticketNumber: 'TKT-0003', title: 'Delayed goods receipt confirmation', description: 'Warehouse team needs GRN visibility after procurement update.', priority: 'CRITICAL', status: 'resolved', customerName: 'Metro Wholesale Distributors', assigneeEmail: 'support@blockerp.local', createdByEmail: 'procurement@blockerp.local', storeCode: 'CENTRAL-WH' },
]

const documentSeed = [
  { documentNumber: 'DOC-0001', name: 'Vendor Agreement - Retail Source Ltd', category: 'Contract', sizeLabel: '2.4 MB', uploadedByEmail: 'admin@blockerp.local', version: 'v3', status: 'approved', tags: ['vendor', 'legal'] },
  { documentNumber: 'DOC-0002', name: 'Monthly GST Return - March 2026', category: 'Compliance', sizeLabel: '890 KB', uploadedByEmail: 'finance@blockerp.local', version: 'v1', status: 'review', tags: ['gst', 'tax'] },
  { documentNumber: 'DOC-0003', name: 'Warehouse Safety Policy', category: 'Policy', sizeLabel: '1.1 MB', uploadedByEmail: 'admin@blockerp.local', version: 'v2', status: 'approved', tags: ['safety', 'warehouse'] },
]

const workflowSeed = [
  { requestNumber: 'WF-3001', title: 'PO-8847 - Steel Plates (2 tons)', type: 'Purchase Order', requesterEmail: 'procurement@blockerp.local', requesterName: 'Priya Procurement', amount: 240000, submittedDate: invoiceMonthDate(0), level: 2, maxLevel: 3, status: 'Pending', approvers: ['Rajesh Kumar', 'Deepa Joshi', 'CFO'] },
  { requestNumber: 'WF-3002', title: 'Invoice INV-DEMO-003 approval', type: 'Invoice Approval', requesterEmail: 'finance@blockerp.local', requesterName: 'Farah Finance', amount: 10608.2, submittedDate: invoiceMonthDate(1), level: 3, maxLevel: 3, status: 'Approved', approvers: ['Accounts', 'Manager', 'CFO'] },
  { requestNumber: 'WF-3003', title: 'Vendor onboarding - Metro Wholesale', type: 'Vendor Onboarding', requesterEmail: 'procurement@blockerp.local', requesterName: 'Priya Procurement', amount: null, submittedDate: invoiceMonthDate(0), level: 1, maxLevel: 3, status: 'Escalated', approvers: ['Procurement', 'Compliance', 'Director'] },
]

const assetSeed = [
  { assetNumber: 'AST-0001', name: 'Tata 407 Delivery Truck', type: 'Vehicle', location: 'Fleet Yard', purchaseDate: '2023-06-15', cost: 850000, depValue: 620000, condition: 'Good', nextService: '2026-05-10' },
  { assetNumber: 'AST-0002', name: 'Crown Reach Forklift', type: 'Machinery', location: 'Central Warehouse', purchaseDate: '2022-01-20', cost: 1200000, depValue: 780000, condition: 'Excellent', nextService: '2026-06-01' },
  { assetNumber: 'AST-0003', name: 'Dell PowerEdge R750 Server', type: 'IT Equipment', location: 'Server Room', purchaseDate: '2024-03-01', cost: 420000, depValue: 350000, condition: 'Excellent', nextService: '2026-09-01' },
]

const employeeSeed = [
  { employeeNumber: 'EMP-0001', name: 'Rajesh Kumar', dept: 'Warehouse', roleTitle: 'Supervisor', shift: 'Day', status: 'active', attendance: 96, salary: 35000 },
  { employeeNumber: 'EMP-0002', name: 'Priya Sharma', dept: 'Finance', roleTitle: 'Accountant', shift: 'Day', status: 'active', attendance: 98, salary: 42000 },
  { employeeNumber: 'EMP-0003', name: 'Amit Patel', dept: 'Logistics', roleTitle: 'Driver', shift: 'Rotational', status: 'active', attendance: 91, salary: 28000 },
]

const workOrderSeed = [
  { workOrderNumber: 'WO-0001', product: 'Retail Checkout Kit', bom: 'BOM-RCK-12', qty: 120, completed: 90, status: 'In Progress', start: invoiceMonthDate(0), due: new Date(new Date().getFullYear(), new Date().getMonth(), 28), line: 'Line A' },
  { workOrderNumber: 'WO-0002', product: 'Inventory Scanner Bundle', bom: 'BOM-ISB-07', qty: 80, completed: 80, status: 'Completed', start: invoiceMonthDate(1), due: invoiceMonthDate(0), line: 'Line B' },
]

const materialPlanSeed = [
  { code: 'RM-STL-01', name: 'Carbon Steel Plate (10mm)', stock: 450, required: 600, unit: 'kg', status: 'low' },
  { code: 'RM-ALU-03', name: 'Aluminium Bar (25mm)', stock: 1200, required: 800, unit: 'kg', status: 'ok' },
  { code: 'RM-COP-02', name: 'Copper Wire (2.5mm)', stock: 80, required: 120, unit: 'kg', status: 'critical' },
]

const projectSeed = [
  {
    projectNumber: 'PRJ-0001',
    name: 'Warehouse Expansion Phase II',
    client: 'Internal',
    manager: 'BlockERP Admin',
    status: 'Active',
    budget: 1500000,
    spent: 820000,
    start: new Date(new Date().getFullYear(), 0, 15),
    end: new Date(new Date().getFullYear(), 5, 30),
    progress: 55,
    milestones: [
      { name: 'Foundation Complete', due: new Date(new Date().getFullYear(), 1, 28), done: true },
      { name: 'Steel Structure Erected', due: new Date(new Date().getFullYear(), 3, 15), done: false },
    ],
  },
  {
    projectNumber: 'PRJ-0002',
    name: 'ERP System Migration',
    client: 'Internal',
    manager: 'Anjali Nair',
    status: 'Active',
    budget: 800000,
    spent: 450000,
    start: new Date(new Date().getFullYear(), 1, 1),
    end: new Date(new Date().getFullYear(), 4, 31),
    progress: 60,
    milestones: [
      { name: 'Data Migration Dry Run', due: new Date(new Date().getFullYear(), 2, 15), done: true },
      { name: 'UAT Sign-off', due: new Date(new Date().getFullYear(), 3, 30), done: false },
    ],
  },
]

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

  for (const ticket of supportTicketSeed) {
    await SupportTicket.findOneAndUpdate(
      { companyId: company._id, ticketNumber: ticket.ticketNumber },
      {
        companyId: company._id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
        status: ticket.status,
        customerName: ticket.customerName,
        assignee: users[ticket.assigneeEmail]?._id || null,
        assigneeName: users[ticket.assigneeEmail]?.name || '',
        createdBy: users[ticket.createdByEmail]._id,
        store: stores[ticket.storeCode]._id,
      },
      { new: true, upsert: true },
    )
  }

  for (const document of documentSeed) {
    await ManagedDocument.findOneAndUpdate(
      { companyId: company._id, documentNumber: document.documentNumber },
      {
        companyId: company._id,
        documentNumber: document.documentNumber,
        name: document.name,
        category: document.category,
        sizeLabel: document.sizeLabel,
        uploadedBy: users[document.uploadedByEmail]._id,
        uploadedByName: users[document.uploadedByEmail].name,
        version: document.version,
        status: document.status,
        tags: document.tags,
      },
      { new: true, upsert: true },
    )
  }

  for (const workflow of workflowSeed) {
    await WorkflowRequest.findOneAndUpdate(
      { companyId: company._id, requestNumber: workflow.requestNumber },
      {
        companyId: company._id,
        requestNumber: workflow.requestNumber,
        title: workflow.title,
        type: workflow.type,
        requester: users[workflow.requesterEmail]?._id || null,
        requesterName: workflow.requesterName,
        amount: workflow.amount,
        submittedDate: workflow.submittedDate,
        level: workflow.level,
        maxLevel: workflow.maxLevel,
        status: workflow.status,
        approvers: workflow.approvers.map((name, index) => ({
          name,
          status: workflow.status === 'Approved'
            ? 'approved'
            : workflow.status === 'Rejected' && index === workflow.level - 1
              ? 'rejected'
              : workflow.status === 'Escalated' && index === workflow.level - 1
                ? 'escalated'
                : index < workflow.level - 1
                  ? 'approved'
                  : 'pending',
        })),
      },
      { new: true, upsert: true },
    )
  }

  for (const asset of assetSeed) {
    await AssetRecord.findOneAndUpdate(
      { companyId: company._id, assetNumber: asset.assetNumber },
      { ...asset, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  for (const employee of employeeSeed) {
    await EmployeeRecord.findOneAndUpdate(
      { companyId: company._id, employeeNumber: employee.employeeNumber },
      { ...employee, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  for (const workOrder of workOrderSeed) {
    await WorkOrder.findOneAndUpdate(
      { companyId: company._id, workOrderNumber: workOrder.workOrderNumber },
      { ...workOrder, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  for (const material of materialPlanSeed) {
    await MaterialPlan.findOneAndUpdate(
      { companyId: company._id, code: material.code },
      { ...material, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  for (const project of projectSeed) {
    await ProjectRecord.findOneAndUpdate(
      { companyId: company._id, projectNumber: project.projectNumber },
      { ...project, companyId: company._id },
      { new: true, upsert: true },
    )
  }

  logger.info('bootstrap.completed', {
    companyId: company._id.toString(),
    stores: Object.keys(stores).length,
    products: Object.keys(products).length,
    customers: Object.keys(customers).length,
    users: Object.keys(users).length,
    supportTickets: supportTicketSeed.length,
    documents: documentSeed.length,
    workflowRequests: workflowSeed.length,
    demoPassword: PASSWORD,
  })
}
