import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const invoiceSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true, unique: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    status: { type: String, enum: ['draft', 'issued', 'paid', 'overdue', 'cancelled'], default: 'draft' },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    subtotal: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    documentCid: { type: String, trim: true },
    hash: { type: String, trim: true },
    verificationStatus: { type: String, enum: ['not_requested', 'pending', 'verified', 'failed'], default: 'not_requested' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

export const Invoice = mongoose.model('Invoice', invoiceSchema)
