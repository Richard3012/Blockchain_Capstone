import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { Product } from '../models/product.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { auditService } from '../services/audit.service.js'
import { logger } from '../utils/logger.js'
import { companyFilter } from '../utils/scope.js'

const stockMutationSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
})

const adjustSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  quantity: z.number(),
  unitCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
})

const transferSchema = z.object({
  productId: z.string(),
  fromStoreId: z.string(),
  toStoreId: z.string(),
  quantity: z.number().positive(),
  notes: z.string().optional(),
})

const mutateStock = async ({ req, transactionType, quantity, storeId, relatedStoreId, notes, unitCost }) => {
  const product = await Product.findOne({ _id: req.body.productId, companyId: req.user.companyId })
  if (!product) {
    const error = new Error('Product not found')
    error.statusCode = 404
    throw error
  }

  if (transactionType !== 'stock_in' && product.currentStock + quantity < 0) {
    const error = new Error('Insufficient stock')
    error.statusCode = 400
    throw error
  }

  product.currentStock += quantity
  await product.save()

  const transaction = await InventoryTransaction.create({
    companyId: req.user.companyId,
    transactionType,
    product: product._id,
    store: storeId,
    relatedStore: relatedStoreId || null,
    quantity,
    unitCost,
    notes,
    createdBy: req.user._id,
  })

  await auditService.record({
    companyId: req.user.companyId,
    action: `inventory.${transactionType}`,
    entityType: 'inventory_transaction',
    entityId: transaction._id,
    summary: `${transactionType} processed for ${product.name}`,
    actor: req.user._id,
    metadata: { productId: product._id, quantity },
  })

  logger.info('inventory.updated', { productId: product._id.toString(), transactionType, quantity, currentStock: product.currentStock })

  return { product, transaction }
}

export const inventoryController = {
  stockIn: asyncHandler(async (req, res) => {
    const payload = stockMutationSchema.parse(req.body)
    const result = await mutateStock({ req: { ...req, body: payload }, transactionType: 'stock_in', quantity: payload.quantity, storeId: payload.storeId, notes: payload.notes, unitCost: payload.unitCost })
    res.status(201).json({ success: true, data: result })
  }),
  stockOut: asyncHandler(async (req, res) => {
    const payload = stockMutationSchema.parse(req.body)
    const result = await mutateStock({ req: { ...req, body: payload }, transactionType: 'stock_out', quantity: -payload.quantity, storeId: payload.storeId, notes: payload.notes, unitCost: payload.unitCost })
    res.status(201).json({ success: true, data: result })
  }),
  adjust: asyncHandler(async (req, res) => {
    const payload = adjustSchema.parse(req.body)
    const result = await mutateStock({ req: { ...req, body: payload }, transactionType: 'adjustment', quantity: payload.quantity, storeId: payload.storeId, notes: payload.notes, unitCost: payload.unitCost })
    res.status(201).json({ success: true, data: result })
  }),
  transfer: asyncHandler(async (req, res) => {
    const payload = transferSchema.parse(req.body)
    const result = await mutateStock({ req: { ...req, body: { productId: payload.productId } }, transactionType: 'transfer_out', quantity: -payload.quantity, storeId: payload.fromStoreId, relatedStoreId: payload.toStoreId, notes: payload.notes })
    await InventoryTransaction.create({
      companyId: req.user.companyId,
      transactionType: 'transfer_in',
      product: result.product._id,
      store: payload.toStoreId,
      relatedStore: payload.fromStoreId,
      quantity: payload.quantity,
      notes: payload.notes,
      createdBy: req.user._id,
    })
    logger.info('inventory.transfer_processed', { productId: result.product._id.toString(), fromStoreId: payload.fromStoreId, toStoreId: payload.toStoreId, quantity: payload.quantity })
    res.status(201).json({ success: true, data: result })
  }),
  lowStock: asyncHandler(async (req, res) => {
    const data = await Product.find(companyFilter(req.user, { $expr: { $lte: ['$currentStock', '$reorderLevel'] } }))
    res.json({ success: true, data })
  }),
  history: asyncHandler(async (req, res) => {
    const data = await InventoryTransaction.find(companyFilter(req.user, { product: req.params.productId }))
      .populate('product store relatedStore createdBy')
      .sort({ createdAt: -1 })
    res.json({ success: true, data })
  }),
}
