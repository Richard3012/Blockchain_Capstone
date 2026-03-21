import { asyncHandler } from '../middlewares/async-handler.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { GoodsReceipt } from '../models/goods-receipt.model.js'
import { Invoice } from '../models/invoice.model.js'
import { InventoryTransaction } from '../models/inventory-transaction.model.js'
import { PurchaseOrder } from '../models/purchase-order.model.js'
import { blockchainService } from '../services/blockchain.service.js'
import { ipfsService } from '../services/ipfs.service.js'
import { hashRecord } from '../utils/hash-record.js'

const entityModelMap = {
  invoice: Invoice,
  purchase_order: PurchaseOrder,
  goods_receipt: GoodsReceipt,
  inventory_transaction: InventoryTransaction,
}

export const blockchainController = {
  anchor: asyncHandler(async (req, res) => {
    const Model = entityModelMap[req.params.entityType]
    if (!Model) {
      const error = new Error('Entity type is not supported for anchoring')
      error.statusCode = 400
      throw error
    }

    const entity = await Model.findOne({ _id: req.params.entityId, companyId: req.user.companyId }).lean()
    if (!entity) {
      const error = new Error('Entity not found')
      error.statusCode = 404
      throw error
    }

    const recordHash = hashRecord(entity)
    const upload = await ipfsService.uploadJson(`${req.params.entityType}-${req.params.entityId}`, entity)
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
    const record = await BlockchainRecord.findOne({
      companyId: req.user.companyId,
      entityType: req.params.entityType,
      entityId: req.params.entityId,
    }).sort({ createdAt: -1 })

    res.json({ success: true, data: record })
  }),
  ledger: asyncHandler(async (req, res) => {
    const data = await blockchainService.getLedger(req.user.companyId)
    res.json({ success: true, data })
  }),
}
