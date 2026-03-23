import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const tdsEntrySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    section: { type: String, required: true, trim: true },
    deductee: { type: String, required: true, trim: true },
    deducteePAN: { type: String, trim: true },
    paymentAmount: { type: Number, required: true, min: 0 },
    tdsRate: { type: Number, required: true, min: 0 },
    tdsAmount: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, required: true },
    depositDate: { type: Date },
    challanNumber: { type: String, trim: true },
    financialYear: { type: String, required: true, trim: true },
    quarter: { type: Number, required: true, enum: [1, 2, 3, 4] },
    status: { type: String, enum: ['pending', 'deposited', 'filed'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

tdsEntrySchema.index({ companyId: 1, financialYear: 1, quarter: 1 })

export const TDSEntry = mongoose.model('TDSEntry', tdsEntrySchema)
