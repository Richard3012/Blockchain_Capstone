import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const gstReturnSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    returnType: { type: String, enum: ['GSTR1', 'GSTR3B', 'GSTR9'], required: true },
    period: { type: String, required: true, trim: true },
    filingDate: { type: Date },
    status: { type: String, enum: ['draft', 'filed', 'accepted', 'rejected'], default: 'draft' },
    totalTaxableValue: { type: Number, default: 0, min: 0 },
    totalCGST: { type: Number, default: 0, min: 0 },
    totalSGST: { type: Number, default: 0, min: 0 },
    totalIGST: { type: Number, default: 0, min: 0 },
    totalCess: { type: Number, default: 0, min: 0 },
    invoiceCount: { type: Number, default: 0, min: 0 },
    data: { type: Object, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

gstReturnSchema.index({ companyId: 1, returnType: 1, period: 1 }, { unique: true })

export const GSTReturn = mongoose.model('GSTReturn', gstReturnSchema)
