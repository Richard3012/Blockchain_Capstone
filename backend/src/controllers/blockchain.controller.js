import { asyncHandler } from '../middlewares/async-handler.js'
import { GoodsReceipt } from '../models/goods-receipt.model.js'
import { Invoice } from '../models/invoice.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { PurchaseOrder } from '../models/purchase-order.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { blockchainService } from '../services/blockchain.service.js'
import { ipfsService } from '../services/ipfs.service.js'
import { verificationService } from '../services/verification.service.js'
import { hashRecord } from '../utils/hash-record.js'
import { logger } from '../utils/logger.js'

const entityModelMap = {
  invoice: Invoice,
  purchase_order: PurchaseOrder,
  goods_receipt: GoodsReceipt,
  inventory_transaction: InventoryTransaction,
  sales_order: SalesOrder,
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
    const recordHash = hashRecord(payload)
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
    })

    const onChainVerification = verification.expectedHash
      ? await blockchainService.verifyRecord(req.params.entityType, req.params.entityId, verification.expectedHash)
      : { verified: false, configured: false }

    res.json({ success: true, data: { ...verification, onChainVerification } })
  }),

  ledger: asyncHandler(async (req, res) => {
    const data = await blockchainService.getLedger(req.user.companyId)
    logger.info('blockchain.ledger_fetched', {
      companyId: req.user.companyId?.toString?.() || req.user.companyId,
      count: data.length,
    })
    res.json({ success: true, data })
  }),
}
