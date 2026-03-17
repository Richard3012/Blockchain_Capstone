import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
)

export const Company = mongoose.model('Company', companySchema)
export default Company
