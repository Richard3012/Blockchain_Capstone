import mongoose from 'mongoose'

import { ROLE_OPTIONS } from '../constants/roles.js'
import { baseSchemaOptions } from './base-options.js'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLE_OPTIONS, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    linkedWalletAddress: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    walletLinkedAt: { type: Date },
    walletLinkNonce: { type: String, trim: true },
    walletLinkNonceExpiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  baseSchemaOptions,
)

userSchema.index({ companyId: 1, role: 1 })

export const User = mongoose.model('User', userSchema)
