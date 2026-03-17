import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const storeSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true },
    type: { type: String, enum: ['store', 'warehouse'], default: 'store' },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

export const Store = mongoose.model('Store', storeSchema)
export default Store
