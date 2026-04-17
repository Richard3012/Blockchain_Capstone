import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { AssetRecord } from '../models/asset-record.model.js'
import { EmployeeRecord } from '../models/employee-record.model.js'
import { ManagedDocument } from '../models/managed-document.model.js'
import { MaterialPlan } from '../models/material-plan.model.js'
import { Product } from '../models/product.model.js'
import { ProjectRecord } from '../models/project-record.model.js'
import { SupportTicket } from '../models/support-ticket.model.js'
import { User } from '../models/user.model.js'
import { WorkflowRequest } from '../models/workflow-request.model.js'
import { WorkOrder } from '../models/work-order.model.js'
import { Invoice } from '../models/invoice.model.js'
import { LeaveRequest } from '../models/leave-request.model.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'

const supportSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assignee: z.string().optional().nullable(),
  assigneeName: z.string().optional(),
  customerName: z.string().optional(),
  store: z.string().optional().nullable(),
})

const documentSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  tags: z.array(z.string()).optional(),
  uploadedByName: z.string().optional(),
  status: z.enum(['pending', 'review', 'approved']).optional(),
})

const workflowActionSchema = z.object({
  status: z.enum(['Pending', 'Approved', 'Rejected', 'Escalated']),
})

const assetSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(2),
  location: z.string().optional(),
  cost: z.number().nonnegative(),
  condition: z.enum(['Excellent', 'Good', 'Fair', 'Needs Repair']).optional(),
  purchaseDate: z.string().optional().nullable(),
  nextService: z.string().optional().nullable(),
})

const employeeSchema = z.object({
  name: z.string().min(2),
  dept: z.string().min(2),
  roleTitle: z.string().min(2),
  shift: z.enum(['Day', 'Night', 'Rotational']).optional(),
  status: z.enum(['active', 'on-leave']).optional(),
  salary: z.number().nonnegative(),
})

const workOrderSchema = z.object({
  product: z.string().min(2),
  bom: z.string().optional(),
  qty: z.number().positive(),
  line: z.string().optional(),
  start: z.string().optional().nullable(),
  due: z.string().optional().nullable(),
  status: z.enum(['Planned', 'In Progress', 'Completed', 'On Hold']).optional(),
})

const projectSchema = z.object({
  name: z.string().min(2),
  client: z.string().optional(),
  manager: z.string().min(2),
  status: z.enum(['Active', 'Planning', 'Completed', 'On Hold']).optional(),
  budget: z.number().nonnegative(),
  start: z.string().optional().nullable(),
  end: z.string().optional().nullable(),
})

const serializeDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const nextCode = async (Model, companyId, field, prefix) => {
  const latest = await Model.findOne({ companyId }).sort({ createdAt: -1 }).select(field)
  const latestValue = latest?.[field] || ''
  const match = String(latestValue).match(/(\d+)$/)
  const next = match ? Number(match[1]) + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

export const operationsController = {
  listSupport: asyncHandler(async (req, res) => {
    const [tickets, assignees] = await Promise.all([
      SupportTicket.find(companyFilter(req.user))
        .populate('assignee', 'name email role')
        .sort({ createdAt: -1 }),
      User.find({
        companyId: req.user.companyId,
        role: { $in: ['support_staff', 'admin', 'store_manager', 'inventory_manager'] },
        isActive: true,
      }).select('name email role'),
    ])
    logger.info('support.fetched', { count: tickets.length, companyId: req.user.companyId.toString() })
    res.json({ success: true, data: { tickets, assignees } })
  }),

  createSupport: asyncHandler(async (req, res) => {
    const payload = supportSchema.parse(req.body)
    const ticketNumber = await nextCode(SupportTicket, req.user.companyId, 'ticketNumber', 'TKT-')
    const ticket = await SupportTicket.create({
      companyId: req.user.companyId,
      ticketNumber,
      title: payload.title,
      description: payload.description || '',
      priority: payload.priority || 'MEDIUM',
      assignee: payload.assignee || null,
      assigneeName: payload.assigneeName || '',
      customerName: payload.customerName || '',
      createdBy: req.user._id,
      store: payload.store || req.user.storeId || null,
    })
    logger.info('support.ticket_created', { ticketNumber, userId: req.user._id.toString() })
    res.status(201).json({ success: true, data: ticket })
  }),

  updateSupport: asyncHandler(async (req, res) => {
    const payload = supportSchema.partial().extend({
      status: z.enum(['open', 'in-progress', 'resolved', 'closed']).optional(),
    }).parse(req.body)
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { ...payload, ...(payload.assignee === '' ? { assignee: null } : {}) },
      { new: true, runValidators: true },
    )
    res.json({ success: true, data: ticket })
  }),

  listDocuments: asyncHandler(async (req, res) => {
    const documents = await ManagedDocument.find(companyFilter(req.user)).sort({ createdAt: -1 })
    logger.info('documents.fetched', { count: documents.length, companyId: req.user.companyId.toString() })
    res.json({ success: true, data: documents })
  }),

  createDocument: asyncHandler(async (req, res) => {
    const payload = documentSchema.parse(req.body)
    const documentNumber = await nextCode(ManagedDocument, req.user.companyId, 'documentNumber', 'DOC-')
    const version = 'v1'
    const document = await ManagedDocument.create({
      companyId: req.user.companyId,
      documentNumber,
      name: payload.name,
      category: payload.category,
      tags: payload.tags || [],
      uploadedByName: payload.uploadedByName || req.user.name,
      uploadedBy: req.user._id,
      status: payload.status || 'pending',
      version,
      sizeLabel: 'New upload',
    })
    logger.info('documents.created', { documentNumber, userId: req.user._id.toString() })
    res.status(201).json({ success: true, data: document })
  }),

  updateDocument: asyncHandler(async (req, res) => {
    const payload = documentSchema.partial().parse(req.body)
    const document = await ManagedDocument.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      payload,
      { new: true, runValidators: true },
    )
    res.json({ success: true, data: document })
  }),

  removeDocument: asyncHandler(async (req, res) => {
    await ManagedDocument.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId })
    res.status(204).send()
  }),

  listWorkflow: asyncHandler(async (req, res) => {
    const requests = await WorkflowRequest.find(companyFilter(req.user)).sort({ submittedDate: -1, createdAt: -1 })
    logger.info('workflow.fetched', { count: requests.length, companyId: req.user.companyId.toString() })
    res.json({ success: true, data: requests })
  }),

  updateWorkflowStatus: asyncHandler(async (req, res) => {
    const payload = workflowActionSchema.parse(req.body)
    const request = await WorkflowRequest.findOne({ _id: req.params.id, companyId: req.user.companyId })
    if (!request) {
      const error = new Error('Workflow request not found')
      error.statusCode = 404
      throw error
    }

    request.status = payload.status
    request.level = payload.status === 'Approved' ? request.maxLevel : request.level
    request.approvers = request.approvers.map((approver, index) => {
      if (payload.status === 'Escalated' && index === request.level - 1) {
        return { ...approver.toObject(), status: 'escalated' }
      }
      if (payload.status === 'Rejected' && index === request.level - 1) {
        return { ...approver.toObject(), status: 'rejected' }
      }
      if (payload.status === 'Approved' && index < request.maxLevel) {
        return { ...approver.toObject(), status: 'approved' }
      }
      return approver
    })
    await request.save()
    logger.info('workflow.status_updated', { requestNumber: request.requestNumber, status: request.status, userId: req.user._id.toString() })
    res.json({ success: true, data: request })
  }),

  listAssets: asyncHandler(async (req, res) => {
    const assets = await AssetRecord.find(companyFilter(req.user)).sort({ createdAt: -1 })
    res.json({ success: true, data: assets })
  }),

  createAsset: asyncHandler(async (req, res) => {
    const payload = assetSchema.parse(req.body)
    const assetNumber = await nextCode(AssetRecord, req.user.companyId, 'assetNumber', 'AST-')
    const cost = payload.cost
    const asset = await AssetRecord.create({
      companyId: req.user.companyId,
      assetNumber,
      name: payload.name,
      type: payload.type,
      location: payload.location || '',
      cost,
      depValue: Math.round(cost * 0.8),
      condition: payload.condition || 'Good',
      purchaseDate: serializeDate(payload.purchaseDate),
      nextService: serializeDate(payload.nextService),
    })
    res.status(201).json({ success: true, data: asset })
  }),

  updateAsset: asyncHandler(async (req, res) => {
    const payload = assetSchema.partial().parse(req.body)
    const update = {
      ...payload,
      ...(payload.purchaseDate !== undefined ? { purchaseDate: serializeDate(payload.purchaseDate) } : {}),
      ...(payload.nextService !== undefined ? { nextService: serializeDate(payload.nextService) } : {}),
      ...(payload.cost !== undefined ? { depValue: Math.round(payload.cost * 0.8) } : {}),
    }
    const asset = await AssetRecord.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      update,
      { new: true, runValidators: true },
    )
    res.json({ success: true, data: asset })
  }),

  removeAsset: asyncHandler(async (req, res) => {
    await AssetRecord.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId })
    res.status(204).send()
  }),

  listEmployees: asyncHandler(async (req, res) => {
    const employees = await EmployeeRecord.find(companyFilter(req.user)).sort({ createdAt: -1 })
    res.json({ success: true, data: employees })
  }),

  createEmployee: asyncHandler(async (req, res) => {
    const payload = employeeSchema.parse(req.body)
    const employeeNumber = await nextCode(EmployeeRecord, req.user.companyId, 'employeeNumber', 'EMP-')
    const employee = await EmployeeRecord.create({
      companyId: req.user.companyId,
      employeeNumber,
      ...payload,
      attendance: 0,
    })
    res.status(201).json({ success: true, data: employee })
  }),

  updateEmployee: asyncHandler(async (req, res) => {
    const payload = employeeSchema.partial().parse(req.body)
    const employee = await EmployeeRecord.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      payload,
      { new: true, runValidators: true },
    )
    res.json({ success: true, data: employee })
  }),

  removeEmployee: asyncHandler(async (req, res) => {
    await EmployeeRecord.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId })
    res.status(204).send()
  }),

  listManufacturing: asyncHandler(async (req, res) => {
    const [workOrders, materials] = await Promise.all([
      WorkOrder.find(companyFilter(req.user)).sort({ createdAt: -1 }),
      MaterialPlan.find(companyFilter(req.user)).sort({ createdAt: -1 }),
    ])
    res.json({ success: true, data: { workOrders, materials } })
  }),

  createWorkOrder: asyncHandler(async (req, res) => {
    const payload = workOrderSchema.parse(req.body)
    const workOrderNumber = await nextCode(WorkOrder, req.user.companyId, 'workOrderNumber', 'WO-')
    const workOrder = await WorkOrder.create({
      companyId: req.user.companyId,
      workOrderNumber,
      product: payload.product,
      bom: payload.bom || '',
      qty: payload.qty,
      completed: 0,
      status: payload.status || 'Planned',
      line: payload.line || 'Line A',
      start: serializeDate(payload.start),
      due: serializeDate(payload.due),
    })
    res.status(201).json({ success: true, data: workOrder })
  }),

  updateWorkOrder: asyncHandler(async (req, res) => {
    const payload = workOrderSchema.partial().extend({
      completed: z.number().nonnegative().optional(),
    }).parse(req.body)
    const workOrder = await WorkOrder.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      {
        ...payload,
        ...(payload.start !== undefined ? { start: serializeDate(payload.start) } : {}),
        ...(payload.due !== undefined ? { due: serializeDate(payload.due) } : {}),
      },
      { new: true, runValidators: true },
    )
    res.json({ success: true, data: workOrder })
  }),

  removeWorkOrder: asyncHandler(async (req, res) => {
    await WorkOrder.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId })
    res.status(204).send()
  }),

  listProjects: asyncHandler(async (req, res) => {
    const projects = await ProjectRecord.find(companyFilter(req.user)).sort({ createdAt: -1 })
    res.json({ success: true, data: projects })
  }),

  createProject: asyncHandler(async (req, res) => {
    const payload = projectSchema.parse(req.body)
    const projectNumber = await nextCode(ProjectRecord, req.user.companyId, 'projectNumber', 'PRJ-')
    const project = await ProjectRecord.create({
      companyId: req.user.companyId,
      projectNumber,
      ...payload,
      spent: 0,
      progress: 0,
      start: serializeDate(payload.start),
      end: serializeDate(payload.end),
      milestones: [],
    })
    res.status(201).json({ success: true, data: project })
  }),

  updateProject: asyncHandler(async (req, res) => {
    const payload = projectSchema.partial().extend({
      spent: z.number().nonnegative().optional(),
      progress: z.number().nonnegative().max(100).optional(),
      milestones: z.array(z.object({
        name: z.string(),
        due: z.string().nullable().optional(),
        done: z.boolean().optional(),
      })).optional(),
    }).parse(req.body)
    const project = await ProjectRecord.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      {
        ...payload,
        ...(payload.start !== undefined ? { start: serializeDate(payload.start) } : {}),
        ...(payload.end !== undefined ? { end: serializeDate(payload.end) } : {}),
        ...(payload.milestones
          ? { milestones: payload.milestones.map((item) => ({ ...item, due: serializeDate(item.due) })) }
          : {}),
      },
      { new: true, runValidators: true },
    )
    res.json({ success: true, data: project })
  }),

  removeProject: asyncHandler(async (req, res) => {
    await ProjectRecord.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId })
    res.status(204).send()
  }),

  notifications: asyncHandler(async (req, res) => {
    const [criticalTickets, lowStockProducts, overdueInvoices, pendingLeaves] = await Promise.all([
      SupportTicket.find(companyFilter(req.user, { status: { $in: ['open', 'in-progress'] } }))
        .sort({ updatedAt: -1 })
        .limit(5),
      Product.find(companyFilter(req.user, { $expr: { $lte: ['$currentStock', '$reorderLevel'] } }))
        .sort({ currentStock: 1 })
        .limit(5),
      Invoice.find(companyFilter(req.user, { status: 'overdue' }))
        .sort({ dueDate: 1 })
        .limit(5),
      LeaveRequest.find(companyFilter(req.user, { status: 'pending' }))
        .sort({ createdAt: -1 })
        .limit(5),
    ])

    const notifications = [
      ...criticalTickets.map((ticket) => ({
        id: `ticket-${ticket._id}`,
        severity: ticket.priority === 'CRITICAL' ? 'critical' : 'warning',
        title: `Support ticket ${ticket.ticketNumber}`,
        message: `${ticket.title} is ${ticket.status}`,
        timestamp: ticket.updatedAt || ticket.createdAt,
        link: 'support',
      })),
      ...lowStockProducts.map((product) => ({
        id: `stock-${product._id}`,
        severity: 'warning',
        title: `Low stock: ${product.name}`,
        message: `${product.currentStock} units left, reorder level ${product.reorderLevel}`,
        timestamp: product.updatedAt || product.createdAt,
        link: 'inventory',
      })),
      ...overdueInvoices.map((invoice) => ({
        id: `invoice-${invoice._id}`,
        severity: 'info',
        title: `Overdue invoice ${invoice.invoiceNumber}`,
        message: `Balance due ₹${(invoice.balanceDue || invoice.totalAmount || 0).toLocaleString('en-IN')}`,
        timestamp: invoice.updatedAt || invoice.createdAt,
        link: 'invoices',
      })),
      ...pendingLeaves.map((leave) => ({
        id: `leave-${leave._id}`,
        severity: 'warning',
        title: `Pending leave: ${leave.employeeName}`,
        message: `${leave.days} day(s) ${leave.leaveType} leave awaiting approval`,
        timestamp: leave.createdAt,
        link: 'hr',
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12)

    logger.info('notifications.fetched', { count: notifications.length, userId: req.user._id?.toString?.() || 'dev' })
    res.json({ success: true, data: notifications })
  }),
}
