import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const fiscalPeriodSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    fiscalYear: { type: Number, required: true },
    month: { type: Number, min: 1, max: 12, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['open', 'closed', 'locked'], default: 'open' },
    closedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closingEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
    closingTxHash: { type: String },
  },
  baseSchemaOptions,
)

fiscalPeriodSchema.index({ companyId: 1, fiscalYear: 1, month: 1 }, { unique: true })

export const FiscalPeriod = mongoose.model('FiscalPeriod', fiscalPeriodSchema)
