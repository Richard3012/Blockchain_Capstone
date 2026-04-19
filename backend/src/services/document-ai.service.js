// Google Document AI — Invoice Parser wrapper.
//
// Returns null when GCP credentials or processor ID are not configured so
// callers can fall back to pdf-parse + LLM extraction.

import { readFile } from 'node:fs/promises'

import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { googleAuthService } from './google-auth.service.js'

let cachedClient = null

const getClient = async () => {
  if (cachedClient !== null) return cachedClient || null
  if (!(await googleAuthService.isConfigured()) || !env.documentAiProcessorId) {
    cachedClient = false
    return null
  }
  try {
    const docai = await import('@google-cloud/documentai')
    const { DocumentProcessorServiceClient } = docai.v1
    const apiEndpoint = `${env.gcpLocation || 'us'}-documentai.googleapis.com`
    cachedClient = new DocumentProcessorServiceClient({
      apiEndpoint,
      keyFilename: env.googleApplicationCredentials || undefined,
      projectId: env.gcpProjectId || undefined,
    })
    return cachedClient
  } catch (err) {
    logger.error('documentai.init_failed', { message: err.message })
    cachedClient = false
    return null
  }
}

// Map Document AI's standard invoice entities into BlockERP's invoice fields.
// Reference: https://cloud.google.com/document-ai/docs/processors-list#processor_invoice-processor
const FIELD_MAP = {
  invoice_id: 'invoiceNumber',
  invoice_date: 'invoiceDate',
  due_date: 'dueDate',
  supplier_name: 'vendorName',
  supplier_tax_id: 'gstin',
  receiver_name: 'customerName',
  receiver_tax_id: 'customerGstin',
  total_amount: 'totalAmount',
  net_amount: 'subtotal',
  total_tax_amount: 'taxAmount',
  currency: 'currency',
  purchase_order: 'purchaseOrderNumber',
}

const extractValue = (entity) => {
  if (entity.normalizedValue?.text) return entity.normalizedValue.text
  if (entity.normalizedValue?.moneyValue) {
    const { units = '0', nanos = 0 } = entity.normalizedValue.moneyValue
    return Number(units) + nanos / 1e9
  }
  if (entity.normalizedValue?.dateValue) {
    const { year, month, day } = entity.normalizedValue.dateValue
    return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1)).toISOString()
  }
  return entity.mentionText || ''
}

const mapLineItem = (entity) => {
  const props = {}
  for (const child of entity.properties || []) {
    const key = child.type?.replace('line_item/', '')
    if (!key) continue
    props[key] = extractValue(child)
  }
  return {
    description: props.description || '',
    quantity: Number(props.quantity) || 1,
    unitPrice: Number(props.unit_price) || 0,
    amount: Number(props.amount) || 0,
    hsn: props.product_code || '',
    tax: Number(props.tax_amount) || 0,
  }
}

export const documentAiService = {
  async isAvailable() { return Boolean(await getClient()) },

  /**
   * Parse a PDF (or image of a page) with the configured Invoice Parser.
   * @param {Buffer|string} input  buffer or filesystem path
   * @param {object} [opts]
   * @param {string} [opts.mimeType='application/pdf']
   * @returns {Promise<{ text, fields, lineItems, confidence, provider } | null>}
   */
  async parseInvoice(input, opts = {}) {
    const client = await getClient()
    if (!client) return null
    const buffer = Buffer.isBuffer(input) ? input : await readFile(input)
    const mimeType = opts.mimeType || 'application/pdf'
    const projectId = await googleAuthService.projectId()
    const name = `projects/${projectId}/locations/${env.gcpLocation || 'us'}/processors/${env.documentAiProcessorId}`

    const start = Date.now()
    try {
      const [response] = await client.processDocument({
        name,
        rawDocument: { content: buffer.toString('base64'), mimeType },
      })
      const doc = response.document || {}
      const fields = {}
      const lineItems = []
      const fieldConfidence = {}

      for (const entity of doc.entities || []) {
        const type = entity.type
        if (!type) continue
        if (type === 'line_item') {
          lineItems.push(mapLineItem(entity))
          continue
        }
        const target = FIELD_MAP[type]
        if (!target) continue
        fields[target] = extractValue(entity)
        if (entity.confidence) fieldConfidence[target] = Math.round(entity.confidence * 100)
      }

      const confidences = Object.values(fieldConfidence)
      const avgConfidence = confidences.length
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 0

      logger.info('documentai.parsed', {
        fields: Object.keys(fields).length,
        lineItems: lineItems.length,
        confidence: avgConfidence,
        chars: doc.text?.length || 0,
        durationMs: Date.now() - start,
      })

      return {
        text: doc.text || '',
        fields,
        lineItems,
        fieldConfidence,
        confidence: avgConfidence,
        provider: 'document_ai',
      }
    } catch (err) {
      logger.error('documentai.process_failed', { message: err.message })
      return null
    }
  },
}
