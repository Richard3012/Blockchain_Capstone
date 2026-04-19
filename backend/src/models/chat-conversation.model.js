import mongoose from 'mongoose'

/**
 * ChatConversation
 *
 * Per-user chat thread with the BlockERP AI assistant. Each turn is either
 * a user message or a model reply. We cap the in-document history at ~40
 * turns (20 round-trips) to keep the doc bounded; older turns drop off.
 *
 * Tool-call metadata is stored alongside model turns so the frontend can
 * render breadcrumbs ("called getInvoices with status=overdue").
 */

const TurnSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'model'], required: true },
    text: { type: String, default: '' },
    intent: { type: String },
    provider: { type: String },
    toolCalls: [
      {
        name: String,
        args: mongoose.Schema.Types.Mixed,
      },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const ChatConversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, default: '' },
    turns: { type: [TurnSchema], default: [] },
  },
  { timestamps: true },
)

ChatConversationSchema.index({ userId: 1, updatedAt: -1 })

export const ChatConversation =
  mongoose.models.ChatConversation || mongoose.model('ChatConversation', ChatConversationSchema)
