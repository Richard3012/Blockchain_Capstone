import bwipjs from 'bwip-js'
import crypto from 'crypto'

import { Product } from '../models/product.model.js'
import { logger } from '../utils/logger.js'

export const barcodeService = {
  /**
   * Generate a barcode image (PNG buffer) for a given value.
   * @param {string} text - The value to encode
   * @param {'code128'|'ean13'|'qrcode'} format - Barcode symbology
   * @returns {Promise<Buffer>} PNG image buffer
   */
  async generateImage(text, format = 'code128') {
    const opts = {
      bcid: format,
      text,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    }
    if (format === 'qrcode') {
      opts.height = undefined
      opts.width = 200
      opts.height = 200
    }
    return bwipjs.toBuffer(opts)
  },

  /**
   * Auto-assign a barcode to a product if it doesn't already have one.
   */
  async ensureProductBarcode(productId) {
    const product = await Product.findById(productId)
    if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 })

    if (product.barcode) return product

    product.barcode = `BLK-${product.sku}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    await product.save()
    logger.info('barcode.assigned', { productId: product._id, barcode: product.barcode })
    return product
  },

  /**
   * Generate a unique tracking number for a delivery.
   */
  generateTrackingNumber() {
    const ts = Date.now().toString(36).toUpperCase()
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
    return `TRK-${ts}-${rand}`
  },

  /**
   * Generate a delivery barcode from a tracking number.
   */
  generateDeliveryBarcode(trackingNumber) {
    return `DLVR-${trackingNumber}`
  },
}
