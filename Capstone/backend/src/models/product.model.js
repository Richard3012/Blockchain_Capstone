import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const productSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    sku: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: String, trim: true },
    barcode: { type: String, trim: true },
    unit: { type: String, default: 'pcs', trim: true },
    costPrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    currentStock: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    metadata: { type: Object, default: {} },
  },
  baseSchemaOptions,
)

export const Product = mongoose.model('Product', productSchema)
