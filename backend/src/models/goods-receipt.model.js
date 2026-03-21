import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const goodsReceiptItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantityReceived: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0 },
  },
  { _id: false },
)

const goodsReceiptSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    receiptNumber: { type: String, required: true, trim: true, unique: true },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    supplierInvoiceReference: { type: String, trim: true },
    documentCid: { type: String, trim: true },
    hash: { type: String, trim: true },
    verificationStatus: { type: String, enum: ['not_requested', 'pending', 'verified', 'failed'], default: 'not_requested' },
    status: { type: String, enum: ['draft', 'received', 'verified'], default: 'draft' },
    receivedAt: { type: Date },
    items: { type: [goodsReceiptItemSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

export const GoodsReceipt = mongoose.model('GoodsReceipt', goodsReceiptSchema)
