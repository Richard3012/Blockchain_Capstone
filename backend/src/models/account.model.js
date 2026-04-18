import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense']
const ACCOUNT_SUBTYPES = [
  'group', 'cash', 'bank', 'receivable', 'payable', 'inventory', 'tax',
  'fixed', 'capital', 'retained', 'operating', 'cogs', 'depreciation', 'other',
]

const accountSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    subType: { type: String, enum: ACCOUNT_SUBTYPES, default: 'other' },
    normalSide: { type: String, enum: ['debit', 'credit'], required: true },
    parentAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    path: { type: String, index: true },
    level: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    isReconciliation: { type: Boolean, default: false },
    lockedSystem: { type: Boolean, default: false },
    allowsDimensions: { type: Boolean, default: true },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

accountSchema.index({ companyId: 1, code: 1 }, { unique: true })
accountSchema.index({ companyId: 1, type: 1, isActive: 1 })
accountSchema.index({ companyId: 1, subType: 1 })

accountSchema.pre('validate', function (next) {
  if (!this.normalSide && this.type) {
    this.normalSide = (this.type === 'asset' || this.type === 'expense') ? 'debit' : 'credit'
  }
  if (!this.path) {
    this.path = this.code
  }
  next()
})

accountSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  if (this.lockedSystem) return next(new Error('Cannot delete a system-locked account'))
  if (Math.abs(this.balance || 0) > 0.01) {
    return next(new Error('Cannot delete an account with a non-zero balance'))
  }
  next()
})

export const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES
export const ACCOUNT_SUBTYPE_VALUES = ACCOUNT_SUBTYPES
export const Account = mongoose.model('Account', accountSchema)
