import crypto from 'crypto'
import { ethers } from 'ethers'

import { Delivery } from '../models/delivery.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { blockchainService } from './blockchain.service.js'
import { barcodeService } from './barcode.service.js'
import { logger } from '../utils/logger.js'

const STATUS_ORDER = ['created', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned']

export const deliveryService = {
  /**
   * Create a delivery from a sales order.
   */
  async createFromOrder(companyId, orderId, customerInfo, userId) {
    const order = await SalesOrder.findOne({ _id: orderId, companyId })
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 })

    const existing = await Delivery.findOne({ orderId, companyId })
    if (existing) throw Object.assign(new Error('Delivery already exists for this order'), { statusCode: 409 })

    const trackingNumber = barcodeService.generateTrackingNumber()
    const barcode = barcodeService.generateDeliveryBarcode(trackingNumber)

    const items = (order.items || []).map((item) => ({
      productId: item.product,
      name: item.productName || item.name,
      sku: item.sku || '',
      quantity: item.quantity,
      barcode: `ITEM-${trackingNumber}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    }))

    const delivery = await Delivery.create({
      companyId,
      orderId,
      orderNumber: order.orderNumber,
      trackingNumber,
      barcode,
      customer: customerInfo || {},
      items,
      status: 'created',
      trackingEvents: [{ status: 'created', note: 'Delivery created', timestamp: new Date(), actor: userId?.toString() }],
      createdBy: userId,
    })

    logger.info('delivery.created', { deliveryId: delivery._id, trackingNumber })
    return delivery
  },

  /**
   * Update the tracking status (scans the barcode to advance).
   */
  async updateStatus(companyId, deliveryId, { status, location, note, scannedBarcode, actor }) {
    const delivery = await Delivery.findOne({ _id: deliveryId, companyId })
    if (!delivery) throw Object.assign(new Error('Delivery not found'), { statusCode: 404 })

    const currentIdx = STATUS_ORDER.indexOf(delivery.status)
    const nextIdx = STATUS_ORDER.indexOf(status)
    if (nextIdx < 0) throw Object.assign(new Error('Invalid status'), { statusCode: 400 })
    if (status !== 'returned' && nextIdx <= currentIdx) {
      throw Object.assign(new Error(`Cannot move from ${delivery.status} to ${status}`), { statusCode: 400 })
    }

    delivery.status = status
    delivery.trackingEvents.push({ status, location, note, scannedBarcode, timestamp: new Date(), actor })

    if (status === 'dispatched') delivery.dispatchedAt = new Date()
    if (status === 'delivered') delivery.actualDelivery = new Date()

    // Blockchain confirmation on delivery
    if (status === 'delivered') {
      try {
        const proofPayload = JSON.stringify({
          trackingNumber: delivery.trackingNumber,
          orderId: delivery.orderId.toString(),
          deliveredAt: delivery.actualDelivery.toISOString(),
          items: delivery.items.map((i) => ({ sku: i.sku, qty: i.quantity })),
        })
        const proofHash = ethers.keccak256(ethers.toUtf8Bytes(proofPayload))
        delivery.deliveryProofHash = proofHash

        const record = await blockchainService.anchorRecord({
          companyId,
          entityType: 'delivery',
          entityId: delivery.trackingNumber,
          recordHash: proofHash,
          ipfsCid: '',
          requestedBy: actor,
        })

        delivery.blockchainTxHash = record.txHash || ''
        delivery.blockchainConfirmed = !!record.txHash

        logger.info('delivery.blockchain_confirmed', { trackingNumber: delivery.trackingNumber, txHash: record.txHash })
      } catch (err) {
        logger.error('delivery.blockchain_failed', { trackingNumber: delivery.trackingNumber, error: err.message })
      }
    }

    await delivery.save()
    return delivery
  },

  /**
   * Get a delivery by tracking number (public-facing).
   */
  async getByTracking(trackingNumber) {
    const delivery = await Delivery.findOne({ trackingNumber })
    if (!delivery) throw Object.assign(new Error('Tracking number not found'), { statusCode: 404 })
    return delivery
  },

  /**
   * List deliveries for a company.
   */
  async list(companyId, { status, page = 1, limit = 20 } = {}) {
    const filter = { companyId }
    if (status) filter.status = status
    return Delivery.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
  },

  /**
   * Verify blockchain proof for a delivered package.
   */
  async verifyBlockchainProof(trackingNumber) {
    const delivery = await Delivery.findOne({ trackingNumber })
    if (!delivery) throw Object.assign(new Error('Delivery not found'), { statusCode: 404 })
    if (!delivery.deliveryProofHash) return { verified: false, reason: 'Not yet delivered' }

    const result = await blockchainService.verifyRecord('delivery', trackingNumber, delivery.deliveryProofHash)
    return { ...result, trackingNumber, txHash: delivery.blockchainTxHash, deliveredAt: delivery.actualDelivery }
  },

  /**
   * Get single delivery by id.
   */
  async getById(companyId, deliveryId) {
    const delivery = await Delivery.findOne({ _id: deliveryId, companyId })
    if (!delivery) throw Object.assign(new Error('Delivery not found'), { statusCode: 404 })
    return delivery
  },
}
