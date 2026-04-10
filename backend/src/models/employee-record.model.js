import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const employeeRecordSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    dept: { type: String, required: true, trim: true },
    roleTitle: { type: String, required: true, trim: true },
    shift: { type: String, enum: ['Day', 'Night', 'Rotational'], default: 'Day' },
    status: { type: String, enum: ['active', 'on-leave'], default: 'active' },
    attendance: { type: Number, default: 0, min: 0, max: 100 },
    salary: { type: Number, default: 0, min: 0 },
  },
  baseSchemaOptions,
)

employeeRecordSchema.index({ companyId: 1, employeeNumber: 1 }, { unique: true })

export const EmployeeRecord = mongoose.model('EmployeeRecord', employeeRecordSchema)
