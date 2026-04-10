import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const workOrderSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    workOrderNumber: { type: String, required: true, trim: true },
    product: { type: String, required: true, trim: true },
    bom: { type: String, trim: true, default: '' },
    qty: { type: Number, default: 0, min: 0 },
    completed: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['Planned', 'In Progress', 'Completed', 'On Hold'], default: 'Planned' },
    start: { type: Date, default: null },
    due: { type: Date, default: null },
    line: { type: String, trim: true, default: 'Line A' },
  },
  baseSchemaOptions,
)

workOrderSchema.index({ companyId: 1, workOrderNumber: 1 }, { unique: true })

export const WorkOrder = mongoose.model('WorkOrder', workOrderSchema)
