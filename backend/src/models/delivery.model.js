import mongoose from 'mongoose'
import { baseSchemaOptions } from './base-options.js'

const trackingEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: ['created', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned'],
    },
    location: { type: String, trim: true },
    note: { type: String, trim: true },
    scannedBarcode: { type: String, trim: true },
    timestamp: { type: Date, default: Date.now },
    actor: { type: String, trim: true },
  },
  { _id: false },
)

const deliverySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    orderNumber: { type: String, required: true, trim: true },
    trackingNumber: { type: String, required: true, unique: true, trim: true },
    barcode: { type: String, required: true, trim: true },

    customer: {
      name: { type: String, trim: true },
      email: { type: String, trim: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
    },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        sku: String,
        quantity: Number,
        barcode: String,
      },
    ],

    status: {
      type: String,
      required: true,
      enum: ['created', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned'],
      default: 'created',
    },

    trackingEvents: [trackingEventSchema],

    // Blockchain confirmation
    blockchainTxHash: { type: String },
    blockchainConfirmed: { type: Boolean, default: false },
    deliveryProofHash: { type: String },

    estimatedDelivery: { type: Date },
    actualDelivery: { type: Date },
    dispatchedAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions,
)

deliverySchema.index({ companyId: 1, status: 1 })
deliverySchema.index({ companyId: 1, estimatedDelivery: 1 })

export const Delivery = mongoose.model('Delivery', deliverySchema)
