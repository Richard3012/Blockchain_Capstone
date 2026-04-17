import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const hsnCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    gstRate: { type: Number, required: true, min: 0, max: 50 },
    cgstRate: { type: Number, min: 0, max: 25 },
    sgstRate: { type: Number, min: 0, max: 25 },
    igstRate: { type: Number, min: 0, max: 50 },
    cessRate: { type: Number, default: 0, min: 0 },
    category: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

hsnCodeSchema.index({ code: 1 }, { unique: true })
hsnCodeSchema.index({ description: 'text' })

export const HSNCode = mongoose.model('HSNCode', hsnCodeSchema)
