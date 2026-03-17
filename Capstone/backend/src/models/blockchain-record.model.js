import mongoose from 'mongoose'

import { ENTITY_TYPES } from '../constants/entity-types.js'
import { baseSchemaOptions } from './base-options.js'

const blockchainRecordSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: String, required: true },
    recordHash: { type: String, required: true, trim: true },
    ipfsCid: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'anchored', 'failed'], default: 'pending' },
    txHash: { type: String, trim: true },
    blockNumber: { type: Number },
    contractAddress: { type: String, trim: true },
    anchoredAt: { type: Date },
    errorMessage: { type: String, trim: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

export const BlockchainRecord = mongoose.model('BlockchainRecord', blockchainRecordSchema)
