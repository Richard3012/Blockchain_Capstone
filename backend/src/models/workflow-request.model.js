import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const workflowApproverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'escalated'], default: 'pending' },
  },
  { _id: false },
)

const workflowRequestSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    requestNumber: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    requesterName: { type: String, required: true, trim: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    amount: { type: Number, default: null, min: 0 },
    submittedDate: { type: Date, default: Date.now },
    level: { type: Number, default: 1, min: 1 },
    maxLevel: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Escalated'], default: 'Pending' },
    approvers: [workflowApproverSchema],
  },
  baseSchemaOptions,
)

workflowRequestSchema.index({ companyId: 1, requestNumber: 1 }, { unique: true })
workflowRequestSchema.index({ companyId: 1, status: 1, type: 1 })

export const WorkflowRequest = mongoose.model('WorkflowRequest', workflowRequestSchema)
