import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const correctionEntrySchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedByName: { type: String, default: '' },
    editedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
  },
  { _id: false },
)

const attendanceLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeRecord', required: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    status: {
      type: String,
      enum: ['present', 'absent', 'half-day', 'late', 'on-leave', 'holiday'],
      default: 'present',
    },
    hoursWorked: { type: Number, default: 0, min: 0 },
    overtimeHours: { type: Number, default: 0, min: 0 },
    remarks: { type: String, default: '' },
    corrections: [correctionEntrySchema],
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions,
)

attendanceLogSchema.index({ companyId: 1, employee: 1, date: 1 }, { unique: true })
attendanceLogSchema.index({ companyId: 1, date: 1 })

export const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema)
