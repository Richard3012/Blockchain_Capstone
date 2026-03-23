import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const purchaseOrderSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true, unique: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    status: { type: String, enum: ['draft', 'approved', 'ordered', 'partially_received', 'received', 'cancelled'], default: 'draft' },
    expectedDeliveryDate: { type: Date },
    items: { type: [purchaseOrderItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    hash: { type: String, trim: true },
    documentCid: { type: String, trim: true },
    verificationStatus: { type: String, enum: ['not_requested', 'pending', 'verified', 'failed'], default: 'not_requested' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema)
