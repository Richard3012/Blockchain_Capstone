import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const leaveRequestSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    leaveNumber: { type: String, required: true, trim: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeRecord', required: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    leaveType: {
      type: String,
      enum: ['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid', 'compensatory'],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approverName: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: Number, default: 0 },
  },
  baseSchemaOptions,
)

leaveRequestSchema.index({ companyId: 1, leaveNumber: 1 }, { unique: true })
leaveRequestSchema.index({ employee: 1, status: 1 })
leaveRequestSchema.index({ companyId: 1, status: 1 })

export const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema)
