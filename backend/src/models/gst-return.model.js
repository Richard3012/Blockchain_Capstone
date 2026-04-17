import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const gstReturnSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    returnType: { type: String, enum: ['GSTR1', 'GSTR3B', 'GSTR9'], required: true },
    period: { type: String, required: true, trim: true },
    filingDate: { type: Date },
    status: { type: String, enum: ['draft', 'filed', 'accepted', 'rejected', 'error'], default: 'draft' },
    totalTaxableValue: { type: Number, default: 0, min: 0 },
    totalCGST: { type: Number, default: 0, min: 0 },
    totalSGST: { type: Number, default: 0, min: 0 },
    totalIGST: { type: Number, default: 0, min: 0 },
    totalCess: { type: Number, default: 0, min: 0 },
    invoiceCount: { type: Number, default: 0, min: 0 },
    data: { type: Object, default: {} },
    validationErrors: [{ field: String, message: String }],
    validationWarnings: [{ field: String, message: String }],
    periodLocked: { type: Boolean, default: false },
    blockchainTxHash: { type: String, trim: true },
    blockchainRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockchainRecord' },
    filedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: Number, default: 0 },
  },
  baseSchemaOptions,
)

gstReturnSchema.index({ companyId: 1, returnType: 1, period: 1 }, { unique: true })
gstReturnSchema.index({ companyId: 1, status: 1 })

export const GSTReturn = mongoose.model('GSTReturn', gstReturnSchema)
