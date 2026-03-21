import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const settingSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    companyEmail: { type: String, trim: true, lowercase: true },
    companyPhone: { type: String, trim: true },
    defaultCurrency: { type: String, default: 'INR', trim: true },
    defaultTimezone: { type: String, default: 'Asia/Kolkata', trim: true },
    taxRate: { type: Number, default: 0, min: 0 },
    invoiceAutoAnchor: { type: Boolean, default: false },
    purchaseOrderAutoAnchor: { type: Boolean, default: false },
    goodsReceiptAutoAnchor: { type: Boolean, default: false },
  },
  baseSchemaOptions,
)

export const Setting = mongoose.model('Setting', settingSchema)
