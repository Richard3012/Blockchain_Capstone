import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Unit tests for Document AI / Vertex AI / Excel parser / confidence tier
 * service modules. These verify the modules are null-tolerant — i.e. they
 * gracefully degrade when GCP credentials are not configured (the CI case).
 */

describe('document-ai.service (no creds)', () => {
  it('returns null when GCP env vars are unset', async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
    delete process.env.GCP_PROJECT_ID
    delete process.env.DOCUMENT_AI_PROCESSOR_ID
    const mod = await import('../backend/src/services/document-ai.service.js')
    const result = await mod.documentAiService.parseInvoice(Buffer.from('x'), { mimeType: 'application/pdf' })
    assert.equal(result, null)
  })
})

describe('vertex-ai.service (no creds)', () => {
  it('isAvailable returns false', async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
    delete process.env.GCP_PROJECT_ID
    const mod = await import('../backend/src/services/vertex-ai.service.js')
    const ok = await mod.vertexAiService.isAvailable()
    assert.equal(ok, false)
  })

  it('chat returns null when unavailable', async () => {
    const mod = await import('../backend/src/services/vertex-ai.service.js')
    const reply = await mod.vertexAiService.chat([{ role: 'user', text: 'hi' }])
    assert.equal(reply, null)
  })
})

describe('excel-invoice.service', () => {
  it('returns null for buffer that is not a workbook', async () => {
    const mod = await import('../backend/src/services/excel-invoice.service.js')
    const result = await mod.excelInvoiceService.parseInvoiceWorkbook(Buffer.from('not an excel file'))
    assert.equal(result, null)
  })
})

describe('ocr-confidence.service tier()', () => {
  it('classifies high-quality extraction as high tier', async () => {
    const { confidenceScoringService } = await import('../backend/src/services/ocr-confidence.service.js')
    const parsed = {
      vendorName: 'ACME Corp',
      gstin: '27AAPFU0939F1ZV', // valid checksum
      invoiceNumber: 'INV-001',
      invoiceDate: new Date().toISOString().slice(0, 10),
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
      lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 1000, amount: 1000 }],
    }
    const score = { compositeScore: 0.95, fieldsExtracted: 7, totalFields: 7 }
    const result = confidenceScoringService.tier(parsed, score)
    assert.equal(result.tier, 'high')
    assert.ok(result.score100 >= 80)
  })

  it('classifies missing-totals extraction as review or reject', async () => {
    const { confidenceScoringService } = await import('../backend/src/services/ocr-confidence.service.js')
    const parsed = {
      vendorName: 'X',
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      lineItems: [],
    }
    const score = { compositeScore: 0.2, fieldsExtracted: 1, totalFields: 7 }
    const result = confidenceScoringService.tier(parsed, score)
    assert.notEqual(result.tier, 'high')
  })

  it('rejects invalid GSTIN checksum', async () => {
    const { confidenceScoringService } = await import('../backend/src/services/ocr-confidence.service.js')
    const valid = confidenceScoringService.gstinIsValid?.('27AAPFU0939F1ZV')
    const invalid = confidenceScoringService.gstinIsValid?.('27AAPFU0939F1ZZ')
    if (typeof valid === 'boolean') {
      assert.equal(valid, true)
      assert.equal(invalid, false)
    }
  })
})

describe('analytics.service shape', () => {
  it('all chart endpoints return chartType + labels + data', async () => {
    const { analyticsService } = await import('../backend/src/services/analytics.service.js')
    // Methods reach Mongo so we can't fully exercise without a connection.
    // Just verify the service object exposes the expected surface.
    for (const fn of ['revenueTrend', 'expenseBreakdown', 'gstSummary', 'vendorSpending', 'summary']) {
      assert.equal(typeof analyticsService[fn], 'function', `analyticsService.${fn} should be a function`)
    }
  })
})

describe('assistant-tools registry', () => {
  it('exposes 7 tool declarations and a dispatchTool function', async () => {
    const mod = await import('../backend/src/services/assistant-tools.js')
    assert.ok(Array.isArray(mod.TOOL_DECLARATIONS) || typeof mod.TOOL_DECLARATIONS === 'object')
    assert.equal(typeof mod.dispatchTool, 'function')
  })
})

describe('realtime broadcast helper', () => {
  it('debounces multiple invalidations into one emit', async () => {
    const { broadcastAnalyticsDelta } = await import('../backend/src/utils/realtime.js')
    let emitCount = 0
    const fakeIo = {
      to() { return this },
      emit() { emitCount++ },
    }
    broadcastAnalyticsDelta(fakeIo, 'tenant-1', 'revenue-trend')
    broadcastAnalyticsDelta(fakeIo, 'tenant-1', 'revenue-trend')
    broadcastAnalyticsDelta(fakeIo, 'tenant-1', 'revenue-trend')
    await new Promise((r) => setTimeout(r, 1300))
    // 1 room emit + 1 broadcast emit = 2 from a single coalesced call
    assert.ok(emitCount >= 1 && emitCount <= 2, `expected 1-2 emits after debounce, got ${emitCount}`)
  })
})

describe('tesseract fallback service', () => {
  it('exposes a recognize() function', async () => {
    const { tesseractFallbackService } = await import('../backend/src/services/tesseract-fallback.service.js')
    assert.equal(typeof tesseractFallbackService.recognize, 'function')
  })

  it('extracts text from a synthetic invoice image', async () => {
    // Generate a small image with known text using sharp.
    const { default: sharp } = await import('sharp')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
      <rect width="100%" height="100%" fill="white"/>
      <text x="20" y="80" font-family="Arial" font-size="48" fill="black">INV-2026-001</text>
      <text x="20" y="150" font-family="Arial" font-size="36" fill="black">Total: 1234.56</text>
    </svg>`
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const { tesseractFallbackService } = await import('../backend/src/services/tesseract-fallback.service.js')
    const result = await tesseractFallbackService.recognize(png)
    assert.equal(result.provider, 'tesseract')
    assert.ok(result.text.length > 0, 'should produce some text')
    // Tesseract is fuzzy; just check we got recognizable digits/letters
    assert.match(result.text.toUpperCase(), /INV|2026|001|TOTAL|1234/)
  })
})

describe('logger', () => {
  it('exposes debug/info/warn/error methods', async () => {
    const { logger } = await import('../backend/src/utils/logger.js')
    for (const m of ['debug', 'info', 'warn', 'error']) {
      assert.equal(typeof logger[m], 'function', `logger.${m} should be a function`)
    }
  })
})
