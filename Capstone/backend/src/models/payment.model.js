import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const paymentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    paymentNumber: { type: String, required: true, trim: true, unique: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, default: Date.now },
    method: { type: String, enum: ['cash', 'bank_transfer', 'card', 'upi', 'other'], default: 'bank_transfer' },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

export const Payment = mongoose.model('Payment', paymentSchema)
