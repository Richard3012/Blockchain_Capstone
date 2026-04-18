import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const DIMENSION_KINDS = ['cost_center', 'project', 'department', 'location', 'class']

const dimensionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    kind: { type: String, enum: DIMENSION_KINDS, required: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Dimension', default: null },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

dimensionSchema.index({ companyId: 1, kind: 1, code: 1 }, { unique: true })

export const DIMENSION_KIND_VALUES = DIMENSION_KINDS
export const Dimension = mongoose.model('Dimension', dimensionSchema)
