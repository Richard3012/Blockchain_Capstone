import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const journalLineSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true },
  },
  { _id: false },
)

const journalEntrySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    entryNumber: { type: String, required: true, trim: true, unique: true },
    date: { type: Date, required: true, default: Date.now },
    description: { type: String, required: true, trim: true },
    lines: { type: [journalLineSchema], required: true },
    reference: { type: String, trim: true },
    status: { type: String, enum: ['draft', 'posted', 'reversed'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
)

journalEntrySchema.pre('validate', function (next) {
  if (this.lines && this.lines.length > 0) {
    const totalDebit = this.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const totalCredit = this.lines.reduce((sum, line) => sum + (line.credit || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      next(new Error(`Debits (${totalDebit}) must equal credits (${totalCredit})`))
      return
    }
  }
  next()
})

export const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema)
