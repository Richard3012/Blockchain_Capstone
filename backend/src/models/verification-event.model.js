import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const fieldDiffSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
)

const verificationEventSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, required: true, trim: true, index: true },
    recordLabel: { type: String, trim: true },
    status: {
      type: String,
      enum: ['verified', 'tampered', 'pending', 'not_requested'],
      required: true,
      index: true,
    },
    storedHash: { type: String, trim: true },
    recomputedHash: { type: String, trim: true },
    message: { type: String, trim: true, default: '' },
    fieldDiffs: { type: [fieldDiffSchema], default: [] },
    tamperSource: { type: String, trim: true },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseSchemaOptions,
)

verificationEventSchema.index({ companyId: 1, createdAt: -1 })
verificationEventSchema.index({ companyId: 1, status: 1, createdAt: -1 })

export const VerificationEvent = mongoose.model('VerificationEvent', verificationEventSchema)
