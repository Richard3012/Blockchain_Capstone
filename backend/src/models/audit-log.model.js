import mongoose from 'mongoose'

import { ENTITY_TYPES } from '../constants/entity-types.js'
import { baseSchemaOptions } from './base-options.js'

const auditLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: String, required: true },
    summary: { type: String, required: true, trim: true },
    metadata: { type: Object, default: {} },
    hash: { type: String, trim: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    syncStatus: { type: String, enum: ['synced', 'pending_sync'], default: 'synced' },
  },
  baseSchemaOptions,
)

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)
