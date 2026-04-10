import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const supportTicketSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    ticketNumber: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    customerName: { type: String, trim: true, default: '' },
    assigneeName: { type: String, trim: true, default: '' },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
  },
  baseSchemaOptions,
)

supportTicketSchema.index({ companyId: 1, ticketNumber: 1 }, { unique: true })
supportTicketSchema.index({ companyId: 1, status: 1, priority: 1 })

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema)
