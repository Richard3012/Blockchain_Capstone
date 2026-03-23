import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const accountSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['asset', 'liability', 'equity', 'revenue', 'expense'], required: true },
    parentAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

accountSchema.index({ companyId: 1, code: 1 }, { unique: true })

export const Account = mongoose.model('Account', accountSchema)
