import { asyncHandler } from '../middlewares/async-handler.js'
import { aiAssistantService } from '../services/ai-assistant.service.js'
import { ChatConversation } from '../models/chat-conversation.model.js'
import { env } from '../config/env.js'

const MAX_HISTORY_TURNS = 20

export const aiAssistantController = {
  query: asyncHandler(async (req, res) => {
    const { query, conversationId } = req.body
    if (!query || typeof query !== 'string') {
      const err = new Error('query string is required')
      err.statusCode = 400
      throw err
    }

    const companyId = req.user.companyId
    const userId = req.user._id || req.user.id

    // Load or create conversation thread (per-user)
    let conversation = null
    if (conversationId) {
      conversation = await ChatConversation.findOne({ _id: conversationId, userId, companyId })
    }
    if (!conversation) {
      conversation = await ChatConversation.create({ userId, companyId, turns: [] })
    }

    const history = (conversation.turns || []).slice(-MAX_HISTORY_TURNS).map((t) => ({
      role: t.role,
      text: t.text,
    }))

    const result = await aiAssistantService.processQuery(companyId, query, { userId, history })

    conversation.turns.push({ role: 'user', text: query })
    conversation.turns.push({
      role: 'model',
      text: result.text,
      intent: result.intent,
      toolCalls: result.toolCalls,
      provider: result.provider,
    })
    if (conversation.turns.length > MAX_HISTORY_TURNS * 2) {
      conversation.turns = conversation.turns.slice(-MAX_HISTORY_TURNS * 2)
    }
    conversation.updatedAt = new Date()
    await conversation.save()

    res.json({
      success: true,
      data: { ...result, conversationId: conversation._id },
    })
  }),

  history: asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id
    const conversations = await ChatConversation.find({ userId, companyId: req.user.companyId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('_id updatedAt turns')
      .lean()
    res.json({ success: true, data: conversations })
  }),

  /**
   * Diagnostics — reports which AI providers are wired up. Useful to
   * tell at a glance whether the assistant will actually use Vertex,
   * Document AI, the OCR queue, etc., or fall back to the canned path.
   * No secrets are returned — only booleans + safe metadata.
   */
  diagnostics: asyncHandler(async (_req, res) => {
    const [{ vertexAiService }, { documentAiService }, googleAuth, toolsMod, queueMod] = await Promise.all([
      import('../services/vertex-ai.service.js'),
      import('../services/document-ai.service.js'),
      import('../services/google-auth.service.js'),
      import('../services/assistant-tools.js'),
      import('../services/ocr-queue.service.js'),
    ])

    const vertexAvailable = await vertexAiService.isAvailable().catch(() => false)
    const documentAiConfigured = Boolean(env.gcpProjectId && env.documentAiProcessorId)
    const googleAuthConfigured = await googleAuth.googleAuthService.isConfigured().catch(() => false)
    const queueStats = await queueMod.ocrQueueStats().catch(() => ({ available: false }))
    const tools = (toolsMod.ASSISTANT_TOOLS || []).map((t) => ({
      name: t.name,
      description: t.description,
    }))

    res.json({
      success: true,
      data: {
        providers: {
          vertexAi: {
            available: vertexAvailable,
            model: env.vertexAiModel || null,
            reextractModel: env.vertexAiReextractModel || null,
          },
          documentAi: {
            configured: documentAiConfigured,
            processorId: env.documentAiProcessorId ? `${String(env.documentAiProcessorId).slice(0, 6)}…` : null,
            location: env.gcpLocation || null,
          },
          googleAuth: { configured: googleAuthConfigured },
          visionApiKey: { configured: Boolean(env.googleVisionApiKey) },
          anthropicFallback: { configured: Boolean(env.anthropicApiKey) },
        },
        ocrQueue: queueStats,
        toolsRegistered: tools.length,
        tools,
        piiRedaction: Boolean(env.aiRedactPii),
        maxInputChars: env.aiMaxInputChars || null,
        notes:
          vertexAvailable
            ? 'Vertex AI is wired up — non-regex queries will be answered by Gemini with function-calling.'
            : 'Vertex AI is NOT configured. Non-regex queries fall back to the canned response. Set GOOGLE_APPLICATION_CREDENTIALS + GCP_PROJECT_ID + DOCUMENT_AI_PROCESSOR_ID in .env to enable.',
      },
    })
  }),
}
