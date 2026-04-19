import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const invoiceSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    status: { type: String, enum: ['draft', 'issued', 'paid', 'overdue', 'cancelled'], default: 'draft' },
    issueDate: { type: Date, default: Date.now },
    paymentDate: { type: Date },
    dueDate: { type: Date },
    subtotal: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    documentCid: { type: String, trim: true },
    hash: { type: String, trim: true },
    integrityOriginalHash: { type: String, trim: true },
    integrityPreviousHash: { type: String, trim: true, default: '' },
    integritySnapshot: { type: String, trim: true, default: '' },
    verificationStatus: { type: String, enum: ['not_requested', 'pending', 'verified', 'failed'], default: 'not_requested' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // ── Scanner fields ──────────────────────────────
    vendorName: { type: String, trim: true },
    gstin: { type: String, trim: true, index: true },
    source: { type: String, enum: ['manual', 'scanner', 'api'], default: 'manual' },
    lineItems: [
      {
        sno: Number,
        description: String,
        quantity: Number,
        unitPrice: Number,
        tax: Number,
        amount: Number,
      },
    ],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  baseSchemaOptions,
)

invoiceSchema.index({ companyId: 1, invoiceNumber: 1 }, { unique: true })
invoiceSchema.index({ companyId: 1, status: 1 })
invoiceSchema.index({ companyId: 1, issueDate: -1 })

export const Invoice = mongoose.model('Invoice', invoiceSchema)
