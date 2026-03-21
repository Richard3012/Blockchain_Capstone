import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const warehouseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['warehouse', 'store'], default: 'warehouse' },
    address: { type: String, trim: true },
    managerName: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

export const Warehouse = mongoose.model('Warehouse', warehouseSchema)
