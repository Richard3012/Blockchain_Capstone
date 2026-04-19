import crypto from 'crypto'

import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { ROLES } from '../constants/roles.js'
import { Product } from '../models/product.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { AuditLog } from '../models/audit-log.model.js'
import { auditService } from '../services/audit.service.js'
import { verificationService } from '../services/verification.service.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'

const orderSchema = z.object({
  customer: z.string(),
  store: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(z.object({
    product: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
  })).min(1),
  taxAmount: z.number().nonnegative().optional(),
})

const statusSchema = z.object({
  status: z.enum(['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'cancelled']),
})

const updateOrderSchema = z.object({
  dueDate: z.string().optional().nullable(),
  taxAmount: z.number().nonnegative().optional(),
  items: z.array(z.object({
    product: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
  })).min(1).optional(),
})

const mapWithVerification = async (companyId, order) => {
  const verification = await verificationService.verifyEntity({
    companyId,
    entityType: 'sales_order',
    entity: order,
    verifiedBy: null,
    logEvent: false,
  })

  return {
    ...order.toObject(),
    blockchainHash: verification.expectedHash || order.hash || '',
    verificationStatus: verification.verificationStatus,
    tamperSource: verification.tamperSource || null,
    mismatchReasons: verification.mismatchReasons || [],
    fieldDiffs: verification.fieldDiffs || [],
    integrityOriginalHash: verification.originalHash || null,
    integrityRecomputedHash: verification.recomputedHash || null,
  }
}

export const ordersController = {
  create: asyncHandler(async (req, res) => {
    const payload = orderSchema.parse(req.body)
    const storeId = payload.store || req.user.storeId?.toString?.() || req.user.storeId

    if (!storeId) {
      const error = new Error('Store is required to create a sales order')
      error.statusCode = 400
      throw error
    }

    for (const item of payload.items) {
      const product = await Product.findOne({ _id: item.product, companyId: req.user.companyId })
      if (!product || product.currentStock < item.quantity) {
        const error = new Error(`Insufficient stock for product ${item.product}`)
        error.statusCode = 400
        throw error
      }

      product.currentStock -= item.quantity
      await product.save()

      await InventoryTransaction.create({
        companyId: req.user.companyId,
        transactionType: 'order_allocation',
        product: item.product,
        store: storeId,
        quantity: -item.quantity,
        referenceType: 'sales_order',
        createdBy: req.user._id,
      })
    }

    const subtotal = payload.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    const order = await SalesOrder.create({
      companyId: req.user.companyId,
      orderNumber: `SO-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      customer: payload.customer,
      store: storeId,
      dueDate: payload.dueDate,
      items: payload.items,
      subtotal,
      taxAmount: payload.taxAmount || 0,
      totalAmount: subtotal + (payload.taxAmount || 0),
      createdBy: req.user._id,
      status: 'processing',
    })

    const blockchainRecord = await verificationService.anchorEntity({
      companyId: req.user.companyId,
      entityType: 'sales_order',
      entity: order,
      requestedBy: req.user._id,
      actorAddress: req.user.linkedWalletAddress || null,
    })

    await auditService.record({
      companyId: req.user.companyId,
      action: 'sales.order_created',
      entityType: 'sales_order',
      entityId: order._id,
      summary: `Sales order ${order.orderNumber} created`,
      actor: req.user._id,
    })

    logger.info('sales.order_created', {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      actor: req.user.email,
    })

    res.status(201).json({
      success: true,
      data: {
        ...(await mapWithVerification(req.user.companyId, order)),
        blockchainRecord,
      },
    })
  }),

  list: asyncHandler(async (req, res) => {
    const rows = await SalesOrder.find(companyFilter(req.user)).populate('customer store createdBy').sort({ createdAt: -1 })
    const data = await Promise.all(rows.map((row) => mapWithVerification(req.user.companyId, row)))
    res.json({ success: true, data })
  }),

  getById: asyncHandler(async (req, res) => {
    const order = await SalesOrder.findOne({ _id: req.params.id, companyId: req.user.companyId }).populate('customer store createdBy items.product')
    if (!order) {
      const error = new Error('Sales order not found')
      error.statusCode = 404
      throw error
    }

    const auditTrail = await AuditLog.find({
      companyId: req.user.companyId,
      entityType: 'sales_order',
      entityId: req.params.id,
    }).populate('actor').sort({ createdAt: -1 })

    res.json({
      success: true,
      data: {
        ...(await mapWithVerification(req.user.companyId, order)),
        auditTrail: auditTrail.map((entry) => ({
          _id: entry._id,
          action: entry.action,
          summary: entry.summary,
          createdAt: entry.createdAt,
          hash: entry.hash,
          metadata: entry.metadata || {},
          actor: entry.actor ? {
            _id: entry.actor._id,
            name: entry.actor.name,
            email: entry.actor.email,
            role: entry.actor.role,
            linkedWalletAddress: entry.actor.linkedWalletAddress || null,
          } : null,
        })),
      },
    })
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body)
    const order = await SalesOrder.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { status },
      { new: true },
    ).populate('customer store createdBy items.product')

    if (!order) {
      const error = new Error('Sales order not found')
      error.statusCode = 404
      throw error
    }

    await auditService.record({
      companyId: req.user.companyId,
      action: 'sales.order_status_updated',
      entityType: 'sales_order',
      entityId: req.params.id,
      summary: `Sales order status updated to ${status}`,
      actor: req.user._id,
    })

    logger.info('sales.order_status_updated', {
      orderId: req.params.id,
      status,
      actor: req.user.email,
    })

    await verificationService.advanceIntegrityChain({
      entityType: 'sales_order',
      entity: order,
    })

    const refreshed = await SalesOrder.findOne({ _id: order._id, companyId: req.user.companyId }).populate('customer store createdBy items.product')
    res.json({ success: true, data: await mapWithVerification(req.user.companyId, refreshed) })
  }),

  update: asyncHandler(async (req, res) => {
    if (![ROLES.ADMIN, ROLES.INVENTORY_MANAGER].includes(req.user.role)) {
      const error = new Error('Only Admin or Inventory Manager can modify orders')
      error.statusCode = 403
      throw error
    }

    const payload = updateOrderSchema.parse(req.body)
    const order = await SalesOrder.findOne({ _id: req.params.id, companyId: req.user.companyId })
    if (!order) {
      const error = new Error('Sales order not found')
      error.statusCode = 404
      throw error
    }

    const before = {
      dueDate: order.dueDate ? new Date(order.dueDate).toISOString() : null,
      taxAmount: order.taxAmount,
      items: order.items.map((item) => ({
        product: item.product.toString(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      totalAmount: order.totalAmount,
    }

    if (payload.items) {
      order.items = payload.items
      order.subtotal = payload.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    }

    if (payload.taxAmount !== undefined) {
      order.taxAmount = payload.taxAmount
    }

    if (payload.dueDate !== undefined) {
      order.dueDate = payload.dueDate || null
    }

    order.totalAmount = (order.subtotal || 0) + (order.taxAmount || 0)
    await order.save()

    await verificationService.advanceIntegrityChain({
      entityType: 'sales_order',
      entity: order,
    })

    const after = {
      dueDate: order.dueDate ? new Date(order.dueDate).toISOString() : null,
      taxAmount: order.taxAmount,
      items: order.items.map((item) => ({
        product: item.product.toString(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      totalAmount: order.totalAmount,
    }

    const changedFields = Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]))

    await auditService.record({
      companyId: req.user.companyId,
      action: 'sales.order_modified',
      entityType: 'sales_order',
      entityId: order._id,
      summary: `${req.user.name} (${req.user.role}) modified ${order.orderNumber}: ${changedFields.join(', ')}`,
      actor: req.user._id,
      metadata: {
        changedFields,
        before,
        after,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        wallet: req.user.linkedWalletAddress || null,
      },
    })

    logger.warn('sales.order_modified', {
      security: true,
      modifiedAt: new Date().toISOString(),
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      actorId: req.user._id.toString(),
      actorName: req.user.name,
      actorRole: req.user.role,
      actorEmail: req.user.email,
      actorWallet: req.user.linkedWalletAddress || null,
      changedFields,
      before,
      after,
    })

    res.json({ success: true, data: await mapWithVerification(req.user.companyId, order) })
  }),
}
