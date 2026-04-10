import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const assetRecordSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    assetNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: '' },
    purchaseDate: { type: Date, default: null },
    cost: { type: Number, default: 0, min: 0 },
    depValue: { type: Number, default: 0, min: 0 },
    condition: { type: String, enum: ['Excellent', 'Good', 'Fair', 'Needs Repair'], default: 'Good' },
    nextService: { type: Date, default: null },
  },
  baseSchemaOptions,
)

assetRecordSchema.index({ companyId: 1, assetNumber: 1 }, { unique: true })

export const AssetRecord = mongoose.model('AssetRecord', assetRecordSchema)
