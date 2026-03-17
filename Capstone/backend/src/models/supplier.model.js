import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const supplierSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    contactName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    taxId: { type: String, trim: true },
    paymentTermsDays: { type: Number, default: 30, min: 0 },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

export const Supplier = mongoose.model('Supplier', supplierSchema)
