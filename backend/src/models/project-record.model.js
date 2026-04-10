import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const milestoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    due: { type: Date, default: null },
    done: { type: Boolean, default: false },
  },
  { _id: false },
)

const projectRecordSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    projectNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    client: { type: String, trim: true, default: 'Internal' },
    manager: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Active', 'Planning', 'Completed', 'On Hold'], default: 'Planning' },
    budget: { type: Number, default: 0, min: 0 },
    spent: { type: Number, default: 0, min: 0 },
    start: { type: Date, default: null },
    end: { type: Date, default: null },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    milestones: [milestoneSchema],
  },
  baseSchemaOptions,
)

projectRecordSchema.index({ companyId: 1, projectNumber: 1 }, { unique: true })

export const ProjectRecord = mongoose.model('ProjectRecord', projectRecordSchema)
