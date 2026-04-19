// Vertex AI (Gemini) service — provides:
//   • extractInvoiceFields(text) → strict JSON of invoice fields
//   • chat(messages, tools)      → multi-turn chat with function-calling
//
// Returns null when GCP credentials or project ID are missing so the
// caller can fall back to the regex-based assistant or Anthropic Claude.

import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { googleAuthService } from './google-auth.service.js'

let cachedClient = null

const getClient = async () => {
  if (cachedClient !== null) return cachedClient || null
  if (!(await googleAuthService.isConfigured())) { cachedClient = false; return null }
  const projectId = await googleAuthService.projectId()
  if (!projectId) { cachedClient = false; return null }
  try {
    const { VertexAI } = await import('@google-cloud/vertexai')
    cachedClient = new VertexAI({ project: projectId, location: env.gcpLocation || 'us-central1' })
    return cachedClient
  } catch (err) {
    logger.error('vertex.init_failed', { message: err.message })
    cachedClient = false
    return null
  }
}

const truncate = (text) => {
  if (!text) return ''
  const max = env.aiMaxInputChars || 60000
  if (text.length <= max) return text
  return text.slice(0, max) + '\n…[truncated]'
}

const redact = (text) => {
  if (!env.aiRedactPii || !text) return text
  return text
    // GSTIN
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/g, '[GSTIN]')
    // Indian phone numbers
    .replace(/\b[6-9]\d{9}\b/g, '[PHONE]')
    // Emails
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    // PAN
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[PAN]')
}

const INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    invoice_number: { type: 'string' },
    vendor: { type: 'string' },
    gstin: { type: 'string' },
    total: { type: 'number' },
    subtotal: { type: 'number' },
    tax_amount: { type: 'number' },
    date: { type: 'string', description: 'ISO 8601 date (YYYY-MM-DD)' },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          amount: { type: 'number' },
          hsn: { type: 'string' },
        },
      },
    },
  },
}

export const vertexAiService = {
  async isAvailable() { return Boolean(await getClient()) },

  /**
   * Strict-JSON extraction of invoice fields from messy OCR text.
   * @param {string} rawText
   * @param {object} [opts]
   * @param {string} [opts.modelName]
   * @returns {Promise<object|null>} parsed invoice or null if Vertex unavailable
   */
  async extractInvoiceFields(rawText, opts = {}) {
    const vertex = await getClient()
    if (!vertex) return null
    const modelName = opts.modelName || env.vertexAiReextractModel || 'gemini-1.5-pro'
    const model = vertex.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: INVOICE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    })
    const prompt = [
      'Extract invoice details from the OCR text below. Return clean JSON matching the schema.',
      'If a field is unclear, leave it empty/zero rather than guessing.',
      'Currency: convert ₹ → numeric value only (no symbols).',
      '',
      'OCR TEXT:',
      truncate(redact(rawText)),
    ].join('\n')
    const start = Date.now()
    try {
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      const txt = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const parsed = JSON.parse(txt)
      logger.info('vertex.invoice_extracted', { chars: rawText.length, durationMs: Date.now() - start, fields: Object.keys(parsed).length })
      return { ...parsed, provider: 'vertex_ai', model: modelName }
    } catch (err) {
      logger.warn('vertex.extract_failed', { message: err.message })
      return null
    }
  },

  /**
   * Multi-turn chat with optional function-calling. Returns the final text
   * response and any tool-call requests the model wants to make.
   *
   * @param {Array<{role:'user'|'model', text:string}>} messages
   * @param {object} [opts]
   * @param {Array<{name,description,parameters}>} [opts.tools] function declarations
   * @param {string} [opts.systemInstruction]
   * @param {string} [opts.modelName]
   * @returns {Promise<{ text: string, toolCalls: Array, finishReason: string }|null>}
   */
  async chat(messages, opts = {}) {
    const vertex = await getClient()
    if (!vertex) return null
    const modelName = opts.modelName || env.vertexAiModel || 'gemini-1.5-flash'
    const model = vertex.getGenerativeModel({
      model: modelName,
      systemInstruction: opts.systemInstruction
        ? { role: 'system', parts: [{ text: opts.systemInstruction }] }
        : undefined,
      tools: opts.tools && opts.tools.length
        ? [{ functionDeclarations: opts.tools }]
        : undefined,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    })
    const contents = messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: m.parts || [{ text: truncate(redact(m.text || '')) }],
    }))
    const start = Date.now()
    try {
      const result = await model.generateContent({ contents })
      const candidate = result.response?.candidates?.[0]
      const parts = candidate?.content?.parts || []
      const toolCalls = []
      let textOut = ''
      for (const part of parts) {
        if (part.functionCall) {
          toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args || {} })
        } else if (part.text) {
          textOut += part.text
        }
      }
      logger.info('vertex.chat', {
        model: modelName, turns: messages.length, toolCalls: toolCalls.length,
        chars: textOut.length, finish: candidate?.finishReason, durationMs: Date.now() - start,
      })
      return { text: textOut.trim(), toolCalls, finishReason: candidate?.finishReason || 'STOP' }
    } catch (err) {
      logger.warn('vertex.chat_failed', { message: err.message })
      return null
    }
  },

  /**
   * Continue a chat after providing tool results. Returns the final natural
   * language answer.
   */
  async chatWithToolResults(history, toolResults, opts = {}) {
    const vertex = await getClient()
    if (!vertex) return null
    const modelName = opts.modelName || env.vertexAiModel || 'gemini-1.5-flash'
    const model = vertex.getGenerativeModel({
      model: modelName,
      systemInstruction: opts.systemInstruction
        ? { role: 'system', parts: [{ text: opts.systemInstruction }] }
        : undefined,
      tools: opts.tools && opts.tools.length ? [{ functionDeclarations: opts.tools }] : undefined,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    })
    const contents = [
      ...history.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: m.parts || [{ text: truncate(redact(m.text || '')) }],
      })),
      {
        role: 'function',
        parts: toolResults.map((r) => ({
          functionResponse: { name: r.name, response: r.response },
        })),
      },
    ]
    try {
      const result = await model.generateContent({ contents })
      const candidate = result.response?.candidates?.[0]
      const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('').trim()
      return { text, finishReason: candidate?.finishReason || 'STOP' }
    } catch (err) {
      logger.warn('vertex.chat_continue_failed', { message: err.message })
      return null
    }
  },
}
