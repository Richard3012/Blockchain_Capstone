import mongoose from 'mongoose'

import { asyncHandler } from '../middlewares/async-handler.js'
import { GoodsReceipt } from '../models/goods-receipt.model.js'
import { Invoice } from '../models/invoice.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { PurchaseOrder } from '../models/purchase-order.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { blockchainService } from '../services/blockchain.service.js'
import { ipfsService } from '../services/ipfs.service.js'
import { verificationService } from '../services/verification.service.js'
import { chainIntegrityHash } from '../utils/hash-record.js'
import { logger } from '../utils/logger.js'

const entityModelMap = {
  invoice: Invoice,
  purchase_order: PurchaseOrder,
  goods_receipt: GoodsReceipt,
  inventory_transaction: InventoryTransaction,
  sales_order: SalesOrder,
}

const buildEntityLabel = (entityType, entity) => {
  if (!entity) return null

  const identifier = entity.orderNumber
    || entity.invoiceNumber
    || entity.receiptNumber
    || entity.transactionType
    || entity._id?.toString?.()
    || entity._id

  const labels = {
    invoice: 'Invoice',
    purchase_order: 'Purchase Order',
    goods_receipt: 'Goods Receipt',
    inventory_transaction: 'Inventory Transaction',
    sales_order: 'Sales Order',
  }

  return identifier ? `${labels[entityType] || 'Record'} ${identifier}` : (labels[entityType] || 'Record')
}

export const blockchainController = {
  anchor: asyncHandler(async (req, res) => {
    const Model = entityModelMap[req.params.entityType]
    if (!Model) {
      const error = new Error('Entity type is not supported for anchoring')
      error.statusCode = 400
      throw error
    }

    const entity = await Model.findOne({ _id: req.params.entityId, companyId: req.user.companyId })
    if (!entity) {
      const error = new Error('Entity not found')
      error.statusCode = 404
      throw error
    }

    const payload = verificationService.buildCanonicalPayload(req.params.entityType, entity)
    const recordHash = chainIntegrityHash(payload, entity.integrityPreviousHash ?? '')
    const upload = await ipfsService.uploadJson(`${req.params.entityType}-${req.params.entityId}`, payload)
    const blockchainRecord = await blockchainService.anchorRecord({
      companyId: req.user.companyId,
      entityType: req.params.entityType,
      entityId: req.params.entityId,
      recordHash,
      ipfsCid: upload.cid,
      requestedBy: req.user._id,
      actorAddress: req.user.linkedWalletAddress || null,
    })

    res.status(201).json({ success: true, data: blockchainRecord })
  }),

  verify: asyncHandler(async (req, res) => {
    const Model = entityModelMap[req.params.entityType]
    if (!Model) {
      const error = new Error('Entity type is not supported for verification')
      error.statusCode = 400
      throw error
    }

    const entity = await Model.findOne({ _id: req.params.entityId, companyId: req.user.companyId })
    if (!entity) {
      const error = new Error('Entity not found')
      error.statusCode = 404
      throw error
    }

    const verification = await verificationService.verifyEntity({
      companyId: req.user.companyId,
      entityType: req.params.entityType,
      entity,
      verifiedBy: req.user._id,
      logEvent: true,
    })

    const onChainVerification = verification.expectedHash
      ? await blockchainService.verifyRecord(req.params.entityType, req.params.entityId, verification.expectedHash)
      : { verified: false, configured: false }

    res.json({ success: true, data: { ...verification, onChainVerification } })
  }),

  ledger: asyncHandler(async (req, res) => {
    const rows = await blockchainService.getLedger(req.user.companyId)
    const data = await Promise.all(rows.map(async (row) => {
      const Model = entityModelMap[row.entityType]
      if (!Model) {
        return {
          ...row.toObject(),
          entityLabel: row.entityId,
        }
      }

      const idOk = mongoose.Types.ObjectId.isValid(String(row.entityId)) && String(row.entityId).length === 24
      const entity = idOk
        ? await Model.findOne({ _id: row.entityId, companyId: req.user.companyId })
        : null
      const verification = entity
        ? await verificationService.verifyEntity({
          companyId: req.user.companyId,
          entityType: row.entityType,
          entity,
          verifiedBy: null,
          logEvent: false,
        })
        : null

      return {
        ...row.toObject(),
        entityLabel: buildEntityLabel(row.entityType, entity),
        status: verification?.verificationStatus === 'failed' ? 'failed' : row.status,
        verificationStatus: verification?.verificationStatus || 'not_requested',
        tamperSource: verification?.tamperSource || null,
        currentHash: verification?.currentHash || null,
        trustedHash: verification?.expectedHash || row.recordHash || null,
        errorMessage: verification?.tamperSource === 'external_or_untracked'
          ? 'Detected mismatch from external / untracked modification.'
          : row.errorMessage,
      }
    }))

    const existingSalesOrderIds = new Set(
      rows
        .filter((row) => row.entityType === 'sales_order')
        .map((row) => String(row.entityId)),
    )

    const additionalSalesOrders = await SalesOrder.find({
      companyId: req.user.companyId,
      _id: { $nin: Array.from(existingSalesOrderIds) },
    }).sort({ createdAt: -1 })

    const additionalOrderRows = await Promise.all(additionalSalesOrders.map(async (order) => {
      const verification = await verificationService.verifyEntity({
        companyId: req.user.companyId,
        entityType: 'sales_order',
        entity: order,
        verifiedBy: null,
        logEvent: false,
      })

      return {
        _id: `virtual-sales_order-${order._id.toString()}`,
        entityType: 'sales_order',
        entityId: order._id.toString(),
        entityLabel: buildEntityLabel('sales_order', order),
        recordHash: verification.expectedHash || order.hash || '',
        txHash: '',
        status: verification.verificationStatus === 'failed'
          ? 'failed'
          : verification.verificationStatus === 'verified'
            ? 'anchored'
            : 'pending',
        verificationStatus: verification.verificationStatus,
        tamperSource: verification.tamperSource || null,
        currentHash: verification.currentHash || null,
        trustedHash: verification.expectedHash || order.hash || null,
        errorMessage: verification.tamperSource === 'external_or_untracked'
          ? 'Detected mismatch from external / untracked modification.'
          : '',
        blockNumber: null,
        contractAddress: '',
        createdAt: order.createdAt,
        virtual: true,
      }
    }))

    const mergedData = [...data, ...additionalOrderRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    logger.info('blockchain.ledger_fetched', {
      companyId: req.user.companyId?.toString?.() || req.user.companyId,
      count: mergedData.length,
    })
    res.json({ success: true, data: mergedData })
  }),
}
