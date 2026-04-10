import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const materialPlanSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    stock: { type: Number, default: 0, min: 0 },
    required: { type: Number, default: 0, min: 0 },
    unit: { type: String, trim: true, default: 'pcs' },
    status: { type: String, enum: ['ok', 'low', 'critical'], default: 'ok' },
  },
  baseSchemaOptions,
)

materialPlanSchema.index({ companyId: 1, code: 1 }, { unique: true })

export const MaterialPlan = mongoose.model('MaterialPlan', materialPlanSchema)
