import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const salesOrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const salesOrderSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    status: { type: String, enum: ['pending', 'processing', 'delivered', 'cancelled'], default: 'pending' },
    orderDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    items: { type: [salesOrderItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    syncStatus: { type: String, enum: ['synced', 'pending_sync'], default: 'synced' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

export const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema)
