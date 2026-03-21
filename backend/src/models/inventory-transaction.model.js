import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const inventoryTransactionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    transactionType: {
      type: String,
      enum: ['stock_in', 'stock_out', 'adjustment', 'transfer_in', 'transfer_out', 'goods_receipt', 'order_allocation'],
      required: true,
    },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    relatedStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, min: 0 },
    referenceType: { type: String, trim: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    notes: { type: String, trim: true },
    verificationRequired: { type: Boolean, default: false },
    syncStatus: { type: String, enum: ['synced', 'pending_sync'], default: 'synced' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

export const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema)
