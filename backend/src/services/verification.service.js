import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { blockchainService } from './blockchain.service.js'
import { ipfsService } from './ipfs.service.js'
import { canonicalizeRecord, hashRecord } from '../utils/hash-record.js'
import { logger } from '../utils/logger.js'

const normalizeDate = (value) => {
  if (!value) return null
  return new Date(value).toISOString()
}

const normalizeItems = (items = [], mapper) => items.map(mapper)

const buildRecordLabel = (entityType, entity) => {
  const identifier = entity?.orderNumber
    || entity?.invoiceNumber
    || entity?.receiptNumber
    || entity?.transactionType
    || entity?._id?.toString?.()
    || entity?._id

  const labels = {
    sales_order: 'Sales Order',
    invoice: 'Invoice',
    purchase_order: 'Purchase Order',
    goods_receipt: 'Goods Receipt',
    inventory_transaction: 'Inventory Transaction',
  }

  return identifier ? `${labels[entityType] || 'Record'} ${identifier}` : (labels[entityType] || 'Record')
}

const canonicalBuilders = {
  sales_order: (entity) => ({
    orderNumber: entity.orderNumber,
    customer: entity.customer?._id?.toString?.() || entity.customer?.toString?.() || entity.customer || null,
    store: entity.store?._id?.toString?.() || entity.store?.toString?.() || entity.store || null,
    status: entity.status,
    orderDate: normalizeDate(entity.orderDate),
    dueDate: normalizeDate(entity.dueDate),
    subtotal: entity.subtotal ?? 0,
    taxAmount: entity.taxAmount ?? 0,
    totalAmount: entity.totalAmount ?? 0,
    items: normalizeItems(entity.items, (item) => ({
      product: item.product?._id?.toString?.() || item.product?.toString?.() || item.product || null,
      quantity: item.quantity ?? 0,
      unitPrice: item.unitPrice ?? 0,
    })),
  }),
  invoice: (entity) => ({
    invoiceNumber: entity.invoiceNumber,
    order: entity.order?._id?.toString?.() || entity.order?.toString?.() || entity.order || null,
    customer: entity.customer?._id?.toString?.() || entity.customer?.toString?.() || entity.customer || null,
    store: entity.store?._id?.toString?.() || entity.store?.toString?.() || entity.store || null,
    dueDate: normalizeDate(entity.dueDate),
    subtotal: entity.subtotal ?? 0,
    taxAmount: entity.taxAmount ?? 0,
    totalAmount: entity.totalAmount ?? 0,
    amountPaid: entity.amountPaid ?? 0,
    balanceDue: entity.balanceDue ?? 0,
    status: entity.status,
  }),
  purchase_order: (entity) => ({
    orderNumber: entity.orderNumber,
    supplier: entity.supplier?._id?.toString?.() || entity.supplier?.toString?.() || entity.supplier || null,
    store: entity.store?._id?.toString?.() || entity.store?.toString?.() || entity.store || null,
    status: entity.status,
    expectedDeliveryDate: normalizeDate(entity.expectedDeliveryDate),
    subtotal: entity.subtotal ?? 0,
    taxAmount: entity.taxAmount ?? 0,
    totalAmount: entity.totalAmount ?? 0,
    items: normalizeItems(entity.items, (item) => ({
      product: item.product?._id?.toString?.() || item.product?.toString?.() || item.product || null,
      quantity: item.quantity ?? 0,
      unitCost: item.unitCost ?? 0,
      receivedQuantity: item.receivedQuantity ?? 0,
    })),
  }),
  goods_receipt: (entity) => ({
    receiptNumber: entity.receiptNumber,
    purchaseOrder: entity.purchaseOrder?._id?.toString?.() || entity.purchaseOrder?.toString?.() || entity.purchaseOrder || null,
    store: entity.store?._id?.toString?.() || entity.store?.toString?.() || entity.store || null,
    status: entity.status,
    receivedAt: normalizeDate(entity.receivedAt),
    supplierInvoiceReference: entity.supplierInvoiceReference || '',
    items: normalizeItems(entity.items, (item) => ({
      product: item.product?._id?.toString?.() || item.product?.toString?.() || item.product || null,
      quantityReceived: item.quantityReceived ?? 0,
      unitCost: item.unitCost ?? 0,
    })),
  }),
  inventory_transaction: (entity) => ({
    transactionType: entity.transactionType,
    product: entity.product?._id?.toString?.() || entity.product?.toString?.() || entity.product || null,
    store: entity.store?._id?.toString?.() || entity.store?.toString?.() || entity.store || null,
    relatedStore: entity.relatedStore?._id?.toString?.() || entity.relatedStore?.toString?.() || entity.relatedStore || null,
    quantity: entity.quantity ?? 0,
    unitCost: entity.unitCost ?? 0,
    referenceType: entity.referenceType || '',
    referenceId: entity.referenceId?._id?.toString?.() || entity.referenceId?.toString?.() || entity.referenceId || null,
    notes: entity.notes || '',
  }),
}

const attachVerificationStatus = async (entity, verificationStatus, recordHash = undefined, documentCid = undefined) => {
  if (!entity || typeof entity.save !== 'function') return
  if ('hash' in entity && recordHash !== undefined) {
    entity.hash = recordHash
  }
  if ('documentCid' in entity && documentCid !== undefined) {
    entity.documentCid = documentCid
  }
  if ('verificationStatus' in entity) {
    entity.verificationStatus = verificationStatus
  }
  await entity.save()
}

export const verificationService = {
  buildCanonicalPayload(entityType, entity, payload) {
    if (payload) return payload
    const builder = canonicalBuilders[entityType]
    if (builder) return builder(entity)
    return JSON.parse(JSON.stringify(entity))
  },

  async anchorEntity({ companyId, entityType, entity, payload, requestedBy, actorAddress }) {
    const canonicalPayload = this.buildCanonicalPayload(entityType, entity, payload)
    const recordHash = hashRecord(canonicalPayload)

    logger.info('verification.record_created', {
      entityType,
      entityId: entity._id.toString(),
      hash: recordHash,
      canonical: canonicalizeRecord(canonicalPayload),
    })

    const upload = await ipfsService.uploadJson(`${entityType}-${entity._id.toString()}`, canonicalPayload)
    await attachVerificationStatus(entity, 'pending', recordHash, upload.cid || '')

    const blockchainRecord = await blockchainService.anchorRecord({
      companyId,
      entityType,
      entityId: entity._id,
      recordHash,
      ipfsCid: upload.cid || '',
      requestedBy,
      actorAddress,
    })

    const verificationStatus = blockchainRecord.status === 'anchored' ? 'verified' : 'pending'
    await attachVerificationStatus(entity, verificationStatus, recordHash, upload.cid || '')

    logger.info('verification.hash_stored', {
      entityType,
      entityId: entity._id.toString(),
      hash: recordHash,
      blockchainStatus: blockchainRecord.status,
    })

    return blockchainRecord
  },

  async verifyEntity({ companyId, entityType, entity }) {
    const canonicalPayload = this.buildCanonicalPayload(entityType, entity)
    const currentHash = hashRecord(canonicalPayload)
    const blockchainRecord = await BlockchainRecord.findOne({
      companyId,
      entityType,
      entityId: entity._id.toString(),
    }).sort({ createdAt: -1 })

    const expectedHash = blockchainRecord?.recordHash || entity.hash || null
    const verified = Boolean(expectedHash && expectedHash === currentHash)
    const verificationStatus = !expectedHash ? 'not_requested' : verified ? 'verified' : 'failed'

    await attachVerificationStatus(entity, verificationStatus)

    if (verified) {
      logger.info('verification.pass', {
        entityType,
        entityId: entity._id.toString(),
        hash: currentHash,
      })
    } else if (expectedHash) {
      logger.warn('verification.tampering_detected', {
        security: true,
        detectedAt: new Date().toISOString(),
        entityType,
        entityId: entity._id.toString(),
        expectedHash,
        currentHash,
        createdBy: entity.createdBy?._id?.toString?.() || entity.createdBy?.toString?.() || null,
        orderNumber: entity.orderNumber || entity.invoiceNumber || entity.receiptNumber || null,
      })
    }

    return {
      entityType,
      entityId: entity._id.toString(),
      recordLabel: buildRecordLabel(entityType, entity),
      verificationStatus,
      expectedHash,
      currentHash,
      blockchainRecord,
      verified,
    }
  },
}
