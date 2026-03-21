import crypto from 'crypto'

import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { GoodsReceipt } from '../models/goods-receipt.model.js'
import { Product } from '../models/product.model.js'
import { PurchaseOrder } from '../models/purchase-order.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { auditService } from '../services/audit.service.js'
import { verificationService } from '../services/verification.service.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'

const purchaseOrderSchema = z.object({
  supplier: z.string(),
  store: z.string(),
  expectedDeliveryDate: z.string().optional(),
  items: z.array(z.object({
    product: z.string(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative(),
  })).min(1),
  taxAmount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
})

const goodsReceiptSchema = z.object({
  purchaseOrder: z.string(),
  store: z.string(),
  supplierInvoiceReference: z.string().optional(),
  items: z.array(z.object({
    product: z.string(),
    quantityReceived: z.number().positive(),
    unitCost: z.number().nonnegative().optional(),
  })).min(1),
})

export const procurementController = {
  createPurchaseOrder: asyncHandler(async (req, res) => {
    const payload = purchaseOrderSchema.parse(req.body)
    const subtotal = payload.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0)
    const purchaseOrder = await PurchaseOrder.create({
      companyId: req.user.companyId,
      orderNumber: `PO-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      supplier: payload.supplier,
      store: payload.store,
      expectedDeliveryDate: payload.expectedDeliveryDate,
      items: payload.items,
      subtotal,
      taxAmount: payload.taxAmount || 0,
      totalAmount: subtotal + (payload.taxAmount || 0),
      notes: payload.notes,
      createdBy: req.user._id,
      status: 'ordered',
    })

    await auditService.record({
      companyId: req.user.companyId,
      action: 'procurement.purchase_order_created',
      entityType: 'purchase_order',
      entityId: purchaseOrder._id,
      summary: `Purchase order ${purchaseOrder.orderNumber} created`,
      actor: req.user._id,
    })

    const purchaseOrderPayload = {
      orderNumber: purchaseOrder.orderNumber,
      supplier: purchaseOrder.supplier.toString(),
      store: purchaseOrder.store.toString(),
      items: purchaseOrder.items,
      subtotal: purchaseOrder.subtotal,
      taxAmount: purchaseOrder.taxAmount,
      totalAmount: purchaseOrder.totalAmount,
    }

    const blockchainRecord = await verificationService.anchorEntity({
      companyId: req.user.companyId,
      entityType: 'purchase_order',
      entity: purchaseOrder,
      payload: purchaseOrderPayload,
      requestedBy: req.user._id,
      actorAddress: req.user.linkedWalletAddress || null,
    })

    logger.info('procurement.purchase_order_created', { purchaseOrderId: purchaseOrder._id.toString(), orderNumber: purchaseOrder.orderNumber })
    res.status(201).json({ success: true, data: { purchaseOrder, blockchainRecord } })
  }),
  listPurchaseOrders: asyncHandler(async (req, res) => {
    const data = await PurchaseOrder.find(companyFilter(req.user)).populate('supplier store createdBy').sort({ createdAt: -1 })
    res.json({ success: true, data })
  }),
  createGoodsReceipt: asyncHandler(async (req, res) => {
    const payload = goodsReceiptSchema.parse(req.body)
    const goodsReceipt = await GoodsReceipt.create({
      companyId: req.user.companyId,
      receiptNumber: `GRN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      purchaseOrder: payload.purchaseOrder,
      store: payload.store,
      supplierInvoiceReference: payload.supplierInvoiceReference,
      items: payload.items,
      receivedAt: new Date(),
      status: 'received',
      createdBy: req.user._id,
    })

    for (const item of payload.items) {
      await Product.findOneAndUpdate(
        { _id: item.product, companyId: req.user.companyId },
        { $inc: { currentStock: item.quantityReceived } },
      )

      await InventoryTransaction.create({
        companyId: req.user.companyId,
        transactionType: 'goods_receipt',
        product: item.product,
        store: payload.store,
        quantity: item.quantityReceived,
        unitCost: item.unitCost || 0,
        referenceType: 'goods_receipt',
        referenceId: goodsReceipt._id,
        createdBy: req.user._id,
      })
    }

    await PurchaseOrder.findByIdAndUpdate(payload.purchaseOrder, { status: 'received' })

    await auditService.record({
      companyId: req.user.companyId,
      action: 'procurement.goods_receipt_processed',
      entityType: 'goods_receipt',
      entityId: goodsReceipt._id,
      summary: `Goods receipt ${goodsReceipt.receiptNumber} processed`,
      actor: req.user._id,
    })

    const goodsReceiptPayload = {
      receiptNumber: goodsReceipt.receiptNumber,
      purchaseOrder: goodsReceipt.purchaseOrder.toString(),
      store: goodsReceipt.store.toString(),
      supplierInvoiceReference: goodsReceipt.supplierInvoiceReference,
      items: goodsReceipt.items,
      receivedAt: goodsReceipt.receivedAt,
    }

    const blockchainRecord = await verificationService.anchorEntity({
      companyId: req.user.companyId,
      entityType: 'goods_receipt',
      entity: goodsReceipt,
      payload: goodsReceiptPayload,
      requestedBy: req.user._id,
      actorAddress: req.user.linkedWalletAddress || null,
    })

    logger.info('procurement.goods_receipt_processed', { goodsReceiptId: goodsReceipt._id.toString(), receiptNumber: goodsReceipt.receiptNumber })
    res.status(201).json({ success: true, data: { goodsReceipt, blockchainRecord } })
  }),
  listGoodsReceipts: asyncHandler(async (req, res) => {
    const data = await GoodsReceipt.find(companyFilter(req.user)).populate('purchaseOrder store createdBy').sort({ createdAt: -1 })
    res.json({ success: true, data })
  }),
}
