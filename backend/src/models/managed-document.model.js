import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const managedDocumentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    documentNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    sizeLabel: { type: String, trim: true, default: '—' },
    uploadedByName: { type: String, trim: true, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    version: { type: String, trim: true, default: 'v1' },
    status: { type: String, enum: ['pending', 'review', 'approved'], default: 'pending' },
    tags: [{ type: String, trim: true }],
  },
  baseSchemaOptions,
)

managedDocumentSchema.index({ companyId: 1, documentNumber: 1 }, { unique: true })
managedDocumentSchema.index({ companyId: 1, category: 1, status: 1 })

export const ManagedDocument = mongoose.model('ManagedDocument', managedDocumentSchema)
