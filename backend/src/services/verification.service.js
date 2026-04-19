import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { AuditLog } from '../models/audit-log.model.js'
import { auditService } from './audit.service.js'
import { blockchainService } from './blockchain.service.js'
import { ipfsService } from './ipfs.service.js'
import { verificationEventService } from './verification-event.service.js'
import { canonicalizeRecord, chainIntegrityHash } from '../utils/hash-record.js'
import { diffCanonicalObjects } from '../utils/canonical-diff.js'
import { logger } from '../utils/logger.js'

const normalizeDate = (value) => {
  if (!value) return null
  return new Date(value).toISOString()
}

const normalizeItems = (items = [], mapper) => items.map(mapper)
const EPSILON = 0.01

const nearlyEqual = (a = 0, b = 0) => Math.abs((a || 0) - (b || 0)) < EPSILON

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

const evaluateBusinessInvariants = (entityType, entity) => {
  const reasons = []

  if (entityType === 'sales_order') {
    const calculatedSubtotal = (entity.items || []).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0)
    const expectedTotal = calculatedSubtotal + (entity.taxAmount || 0)

    if (!nearlyEqual(calculatedSubtotal, entity.subtotal || 0)) {
      reasons.push({
        field: 'subtotal',
        expected: calculatedSubtotal,
        actual: entity.subtotal || 0,
        message: 'Subtotal does not match the sum of order items.',
      })
    }

    if (!nearlyEqual(expectedTotal, entity.totalAmount || 0)) {
      reasons.push({
        field: 'totalAmount',
        expected: expectedTotal,
        actual: entity.totalAmount || 0,
        message: 'Total amount does not match subtotal plus tax.',
      })
    }
  }

  if (entityType === 'invoice') {
    const expectedTotal = (entity.subtotal || 0) + (entity.taxAmount || 0)
    const expectedBalance = (entity.totalAmount || 0) - (entity.amountPaid || 0)

    if (!nearlyEqual(expectedTotal, entity.totalAmount || 0)) {
      reasons.push({
        field: 'totalAmount',
        expected: expectedTotal,
        actual: entity.totalAmount || 0,
        message: 'Invoice total does not match subtotal plus tax.',
      })
    }

    if (!nearlyEqual(expectedBalance, entity.balanceDue || 0)) {
      reasons.push({
        field: 'balanceDue',
        expected: expectedBalance,
        actual: entity.balanceDue || 0,
        message: 'Balance due does not match total minus paid amount.',
      })
    }
  }

  return reasons
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

const applicationModificationActions = [
  'sales.order_modified',
  'sales.order_status_updated',
  'finance.invoice_modified',
  'procurement.purchase_order_modified',
  'procurement.goods_receipt_modified',
  'inventory.transaction_modified',
]

const parseSnapshot = (raw) => {
  if (!raw || typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const verificationService = {
  buildCanonicalPayload(entityType, entity, payload) {
    if (payload) return payload
    const builder = canonicalBuilders[entityType]
    if (builder) return builder(entity)
    return JSON.parse(JSON.stringify(entity))
  },

  /**
   * Advance the integrity chain after a trusted in-app mutation (hash links to prior head).
   */
  async advanceIntegrityChain({ entityType, entity }) {
    const canonicalPayload = this.buildCanonicalPayload(entityType, entity)
    const previousHead = entity.hash || ''
    const newHash = chainIntegrityHash(canonicalPayload, previousHead)

    entity.integrityPreviousHash = previousHead
    entity.hash = newHash
    entity.integritySnapshot = canonicalizeRecord(canonicalPayload)
    if ('verificationStatus' in entity) {
      entity.verificationStatus = 'verified'
    }
    await entity.save()

    logger.info('verification.chain_advanced', {
      entityType,
      entityId: entity._id.toString(),
      hash: newHash,
    })

    return newHash
  },

  async anchorEntity({ companyId, entityType, entity, payload, requestedBy, actorAddress }) {
    const canonicalPayload = this.buildCanonicalPayload(entityType, entity, payload)
    const previousLink = entity.integrityPreviousHash ?? ''
    const recordHash = chainIntegrityHash(canonicalPayload, previousLink)

    logger.info('verification.record_created', {
      entityType,
      entityId: entity._id.toString(),
      hash: recordHash,
      canonical: canonicalizeRecord(canonicalPayload),
    })

    const upload = await ipfsService.uploadJson(`${entityType}-${entity._id.toString()}`, canonicalPayload)

    entity.integrityPreviousHash = previousLink
    entity.integrityOriginalHash = entity.integrityOriginalHash || recordHash
    entity.integritySnapshot = canonicalizeRecord(canonicalPayload)
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

  async verifyEntity({
    companyId,
    entityType,
    entity,
    verifiedBy = null,
    logEvent = false,
  }) {
    const canonicalPayload = this.buildCanonicalPayload(entityType, entity)
    const previousLink = entity.integrityPreviousHash ?? ''
    const recomputedHash = chainIntegrityHash(canonicalPayload, previousLink)

    const blockchainRecord = await BlockchainRecord.findOne({
      companyId,
      entityType,
      entityId: entity._id.toString(),
    }).sort({ createdAt: -1 })

    const storedHash = entity.hash || blockchainRecord?.recordHash || null
    const mismatchReasons = evaluateBusinessInvariants(entityType, entity)
    const hashMatches = Boolean(storedHash && recomputedHash === storedHash)
    const verified = mismatchReasons.length === 0 && hashMatches

    let verificationStatus = 'not_requested'
    if (!storedHash) {
      verificationStatus = 'not_requested'
    } else if (mismatchReasons.length > 0 || !hashMatches) {
      verificationStatus = 'failed'
    } else {
      verificationStatus = 'verified'
    }

    let tamperSource = null
    let lastTrackedChange = null
    let fieldDiffs = []

    const snapshot = parseSnapshot(entity.integritySnapshot)
    if (snapshot && (verificationStatus === 'failed')) {
      fieldDiffs = diffCanonicalObjects(snapshot, canonicalPayload).map((row) => ({
        field: row.field,
        before: row.before,
        after: row.after,
      }))
    }

    if (verified) {
      logger.info('verification.pass', {
        entityType,
        entityId: entity._id.toString(),
        hash: recomputedHash,
      })
    } else if (storedHash || mismatchReasons.length > 0) {
      lastTrackedChange = await AuditLog.findOne({
        companyId,
        entityType,
        entityId: entity._id.toString(),
        action: { $in: applicationModificationActions },
      }).populate('actor').sort({ createdAt: -1 })

      tamperSource = lastTrackedChange ? 'application_user' : 'external_or_untracked'

      if (tamperSource === 'external_or_untracked') {
        const existingExternalAlert = await AuditLog.findOne({
          companyId,
          entityType,
          entityId: entity._id.toString(),
          action: 'security.external_modification_detected',
          'metadata.recomputedHash': recomputedHash,
        })

        if (!existingExternalAlert) {
          await auditService.record({
            companyId,
            action: 'security.external_modification_detected',
            entityType,
            entityId: entity._id,
            summary: `${buildRecordLabel(entityType, entity)} integrity mismatch — possible direct database change`,
            actor: verifiedBy || null,
            metadata: {
              source: 'external_or_untracked',
              expectedHash: storedHash,
              recomputedHash,
              createdBy: entity.createdBy?._id?.toString?.() || entity.createdBy?.toString?.() || null,
            },
          })
        }
      }

      logger.warn('verification.tampering_detected', {
        security: true,
        detectedAt: new Date().toISOString(),
        entityType,
        entityId: entity._id.toString(),
        recordLabel: buildRecordLabel(entityType, entity),
        storedHash,
        recomputedHash,
        mismatchReasons,
        tamperSource,
        createdBy: entity.createdBy?._id?.toString?.() || entity.createdBy?.toString?.() || null,
        orderNumber: entity.orderNumber || entity.invoiceNumber || entity.receiptNumber || null,
      })
    }

    if (logEvent) {
      await verificationEventService.append({
        companyId,
        entityType,
        entityId: entity._id.toString(),
        recordLabel: buildRecordLabel(entityType, entity),
        status: verificationStatus === 'failed' ? 'tampered' : verificationStatus === 'verified' ? 'verified' : verificationStatus === 'pending' ? 'pending' : 'not_requested',
        storedHash: storedHash || '',
        recomputedHash,
        message: verificationStatus === 'failed'
          ? (tamperSource === 'external_or_untracked'
            ? 'Recomputed hash does not match stored chain head — modified via external source or untracked path.'
            : 'Recomputed hash does not match stored chain head, or business invariants failed.')
          : 'Integrity chain verified against stored head.',
        fieldDiffs,
        tamperSource: verificationStatus === 'failed' ? tamperSource : undefined,
        triggeredBy: verifiedBy || null,
      })
    }

    return {
      entityType,
      entityId: entity._id.toString(),
      recordLabel: buildRecordLabel(entityType, entity),
      verificationStatus,
      expectedHash: storedHash,
      currentHash: recomputedHash,
      storedHash,
      recomputedHash,
      originalHash: entity.integrityOriginalHash || null,
      previousHash: previousLink,
      blockchainRecord,
      mismatchReasons,
      tamperSource,
      fieldDiffs,
      lastTrackedChange: lastTrackedChange ? {
        action: lastTrackedChange.action,
        createdAt: lastTrackedChange.createdAt,
        summary: lastTrackedChange.summary,
        actor: lastTrackedChange.actor ? {
          _id: lastTrackedChange.actor._id,
          name: lastTrackedChange.actor.name,
          email: lastTrackedChange.actor.email,
          role: lastTrackedChange.actor.role,
        } : null,
      } : null,
      verified,
    }
  },
}
