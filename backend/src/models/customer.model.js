import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const customerSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    billingAddress: { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
    taxId: { type: String, trim: true },
    creditLimit: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

export const Customer = mongoose.model('Customer', customerSchema)
