import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { ocrIntelligenceService } from '../backend/src/services/ocr-intelligence.service.js'
import { confidenceScoringService } from '../backend/src/services/ocr-confidence.service.js'
import { VendorTemplate, UserCorrection, vendorLearningService } from '../backend/src/services/ocr-vendor-learning.service.js'
import { Invoice } from '../backend/src/models/invoice.model.js'
import { ScannedInvoice } from '../backend/src/models/scanned-invoice.model.js'

let mongoServer

before(async () => {
  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri())
})

after(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

/* ═══════════════════════════════════════════════════════════════════
 * 1. LINE ITEM RECONSTRUCTION ENGINE
 * ═══════════════════════════════════════════════════════════════════ */

describe('Line Item Reconstruction', () => {
  it('should fix missing amount from qty × unitPrice', () => {
    const items = [{ sno: 1, description: 'Widget', quantity: 10, unitPrice: 500, tax: 0, amount: 0 }]
    const result = ocrIntelligenceService.reconstructLineItems('', items)
    assert.equal(result.lineItems[0].amount, 5000)
    assert.ok(result.corrections.some((c) => c.field.includes('amount')))
  })

  it('should fix missing unitPrice from amount / qty', () => {
    const items = [{ sno: 1, description: 'Gadget', quantity: 5, unitPrice: 0, tax: 0, amount: 6000 }]
    const result = ocrIntelligenceService.reconstructLineItems('', items)
    assert.equal(result.lineItems[0].unitPrice, 1200)
    assert.ok(result.corrections.some((c) => c.field.includes('unitPrice')))
  })

  it('should fix missing quantity from amount / unitPrice', () => {
    const items = [{ sno: 1, description: 'Part', quantity: 0, unitPrice: 250, tax: 0, amount: 1000 }]
    const result = ocrIntelligenceService.reconstructLineItems('', items)
    assert.equal(result.lineItems[0].quantity, 4)
  })

  it('should correct arithmetic mismatch (qty × unit ≠ amount)', () => {
    const items = [{ sno: 1, description: 'Item', quantity: 10, unitPrice: 100, tax: 0, amount: 500 }]
    const result = ocrIntelligenceService.reconstructLineItems('', items)
    // Should recalculate unitPrice = 500/10 = 50
    assert.equal(result.lineItems[0].unitPrice, 50)
    assert.ok(result.corrections.length > 0)
  })

  it('should clean leading serial number from description', () => {
    const items = [{ sno: 1, description: '1  Widget Pro', quantity: 10, unitPrice: 500, tax: 0, amount: 5000 }]
    const result = ocrIntelligenceService.reconstructLineItems('', items)
    assert.equal(result.lineItems[0].description, 'Widget Pro')
    assert.ok(result.corrections.some((c) => c.rule.includes('serial number')))
  })

  it('should reconstruct items from raw text if none provided', () => {
    const rawText = `1. Widget Pro    10  500.00  5000.00
2. Gadget X       5  1200.00 6000.00`
    const result = ocrIntelligenceService.reconstructLineItems(rawText, [])
    assert.ok(result.lineItems.length >= 2, 'Should reconstruct at least 2 items')
    assert.ok(result.corrections.some((c) => c.rule.includes('reconstruction')))
  })
})

/* ═══════════════════════════════════════════════════════════════════
 * 2. FINANCIAL CONSISTENCY ENGINE
 * ═══════════════════════════════════════════════════════════════════ */

describe('Financial Consistency Engine', () => {
  it('should derive subtotal from line items when missing', () => {
    const parsed = {
      subtotal: 0,
      taxAmount: 1800,
      totalAmount: 11800,
      lineItems: [
        { amount: 5000 },
        { amount: 5000 },
      ],
    }
    const result = ocrIntelligenceService.enforceFinancialConsistency(parsed)
    assert.equal(result.corrected.subtotal, 10000)
    assert.ok(result.corrections.some((c) => c.field === 'subtotal'))
  })

  it('should auto-correct minor rounding (subtotal + tax ≈ total)', () => {
    const parsed = {
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11801, // off by ₹1
      lineItems: [],
    }
    const result = ocrIntelligenceService.enforceFinancialConsistency(parsed)
    assert.equal(result.corrected.totalAmount, 11800) // corrected
    assert.equal(result.consistent, true)
    assert.ok(result.corrections.some((c) => c.field === 'totalAmount' && c.rule.includes('rounding')))
  })

  it('should flag major mismatch (> 5% or > ₹100)', () => {
    const parsed = {
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 15000, // major mismatch
      lineItems: [],
    }
    const result = ocrIntelligenceService.enforceFinancialConsistency(parsed)
    assert.equal(result.consistent, false)
    assert.ok(result.flags.some((f) => f.field === 'totalAmount' && f.severity === 'error'))
  })

  it('should derive tax when only subtotal and total given', () => {
    const parsed = {
      subtotal: 10000,
      taxAmount: 0,
      totalAmount: 11800,
      lineItems: [],
    }
    const result = ocrIntelligenceService.enforceFinancialConsistency(parsed)
    assert.equal(result.corrected.taxAmount, 1800)
  })

  it('should derive total when only subtotal given', () => {
    const parsed = {
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 0,
      lineItems: [],
    }
    const result = ocrIntelligenceService.enforceFinancialConsistency(parsed)
    assert.equal(result.corrected.totalAmount, 11800)
  })

  it('should distribute tax to line items proportionally', () => {
    const parsed = {
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      lineItems: [
        { amount: 6000, tax: 0 },
        { amount: 4000, tax: 0 },
      ],
    }
    const result = ocrIntelligenceService.enforceFinancialConsistency(parsed)
    assert.ok(result.corrected.lineItems[0].tax > 0, 'First item should have tax')
    assert.ok(result.corrected.lineItems[1].tax > 0, 'Second item should have tax')
    // 18% of 6000 = 1080, 18% of 4000 = 720
    assert.equal(result.corrected.lineItems[0].tax, 1080)
    assert.equal(result.corrected.lineItems[1].tax, 720)
  })

  it('should flag unusual tax rates', () => {
    const parsed = {
      subtotal: 10000,
      taxAmount: 5000, // 50% — very unusual
      totalAmount: 15000,
      lineItems: [],
    }
    const result = ocrIntelligenceService.enforceFinancialConsistency(parsed)
    assert.ok(result.flags.some((f) => f.field === 'taxAmount'))
  })
})

/* ═══════════════════════════════════════════════════════════════════
 * 3. SELF-HEALING CORRECTION + FULL PIPELINE
 * ═══════════════════════════════════════════════════════════════════ */

describe('OCR Intelligence — correctAndValidate', () => {
  const companyId = new mongoose.Types.ObjectId()

  it('should clean OCR artifacts from vendor name', async () => {
    const parsed = {
      vendorName: 'ABC |Traders| {Pvt}  Ltd',
      gstin: '27AABCT1234F1ZK',
      invoiceNumber: 'INV-001',
      totalAmount: 10000,
      subtotal: 10000,
      taxAmount: 0,
      lineItems: [],
    }
    const result = await ocrIntelligenceService.correctAndValidate(parsed, '', companyId)
    assert.equal(result.corrected.vendorName, 'ABC Traders Pvt Ltd')
    assert.ok(result.corrections.some((c) => c.field === 'vendorName'))
  })

  it('should clean stray spaces from invoice number', async () => {
    const parsed = {
      vendorName: 'ABC Corp',
      invoiceNumber: 'INV - 2026 - 001',
      totalAmount: 5000,
      subtotal: 5000,
      taxAmount: 0,
      lineItems: [],
    }
    const result = await ocrIntelligenceService.correctAndValidate(parsed, '', companyId)
    assert.equal(result.corrected.invoiceNumber, 'INV-2026-001')
  })

  it('should self-heal total from currency amounts when total is 0', async () => {
    const rawText = 'Vendor XYZ\nGrand Total: ₹25,000.00'
    const parsed = {
      vendorName: 'Vendor XYZ',
      invoiceNumber: 'INV-099',
      totalAmount: 0,
      subtotal: 0,
      taxAmount: 0,
      lineItems: [],
    }
    const result = await ocrIntelligenceService.correctAndValidate(parsed, rawText, companyId)
    assert.equal(result.corrected.totalAmount, 25000)
  })

  it('should detect exact duplicate invoices', async () => {
    const dupCompanyId = new mongoose.Types.ObjectId()
    await Invoice.create({
      companyId: dupCompanyId,
      invoiceNumber: 'DUP-INTEL-001',
      totalAmount: 5000,
      status: 'issued',
      source: 'scanner',
      createdBy: new mongoose.Types.ObjectId(),
      metadata: { vendorName: 'DupVendor' },
    })
    await Invoice.ensureIndexes()

    const parsed = {
      vendorName: 'DupVendor',
      invoiceNumber: 'DUP-INTEL-001',
      totalAmount: 5000,
      subtotal: 5000,
      taxAmount: 0,
      lineItems: [],
    }
    const result = await ocrIntelligenceService.correctAndValidate(parsed, '', dupCompanyId)
    assert.ok(result.duplicates.length > 0)
    assert.ok(result.duplicates.some((d) => d.type === 'exact'))
  })

  it('should return correctionCount', async () => {
    const parsed = {
      vendorName: 'ABC  Corp',
      invoiceNumber: 'INV 001',
      totalAmount: 5000,
      subtotal: 4000,
      taxAmount: 0,
      lineItems: [{ sno: 1, description: '1  Widget', quantity: 10, unitPrice: 400, tax: 0, amount: 0 }],
    }
    const result = await ocrIntelligenceService.correctAndValidate(parsed, '', companyId)
    assert.ok(result.correctionCount > 0, 'Should have corrections')
  })
})

/* ═══════════════════════════════════════════════════════════════════
 * 4. CONFIDENCE SCORING 2.0
 * ═══════════════════════════════════════════════════════════════════ */

describe('Confidence Scoring 2.0', () => {
  it('should return field-level scores with breakdown', () => {
    const parsed = {
      vendorName: 'ABC Traders Pvt Ltd',
      gstin: '27AABCT1234F1ZK',
      invoiceNumber: 'INV-2026-042',
      invoiceDate: '15/03/2026',
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      lineItems: [{ amount: 10000 }],
    }
    const result = confidenceScoringService.score(parsed, { financialConsistent: true })

    assert.ok(result.fieldScores.vendorName, 'Should have vendorName score')
    assert.ok(result.fieldScores.gstin, 'Should have gstin score')
    assert.ok(result.compositeScore > 0, 'Composite should be > 0')
    assert.ok(['high', 'medium', 'low'].includes(result.overallLevel))
    assert.ok(result.breakdown.vendorName, 'Should have breakdown')
    assert.ok(result.breakdown.vendorName.ocr !== undefined)
    assert.ok(result.breakdown.vendorName.pattern !== undefined)
    assert.ok(result.breakdown.vendorName.crossValidation !== undefined)
    assert.ok(result.breakdown.vendorName.financial !== undefined)
  })

  it('should give high confidence for complete valid invoice', () => {
    const parsed = {
      vendorName: 'Good Corp',
      gstin: '27AABCT1234F1ZK',
      invoiceNumber: 'INV-001',
      invoiceDate: '15/03/2026',
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      lineItems: [{ amount: 10000 }],
    }
    const result = confidenceScoringService.score(parsed, { financialConsistent: true })
    assert.ok(result.compositeScore >= 0.5, `Composite ${result.compositeScore} should be >= 0.5`)
    assert.equal(result.fieldScores.gstin.level, 'high')
  })

  it('should give low confidence for empty fields', () => {
    const parsed = {
      vendorName: '',
      gstin: '',
      invoiceNumber: '',
      invoiceDate: '',
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      lineItems: [],
    }
    const result = confidenceScoringService.score(parsed, { financialConsistent: false })
    assert.ok(result.compositeScore < 0.4, `Composite ${result.compositeScore} should be < 0.4`)
    assert.equal(result.overallLevel, 'low')
  })

  it('should lower confidence when financial consistency fails', () => {
    const parsed = {
      vendorName: 'ABC Corp',
      invoiceNumber: 'INV-001',
      totalAmount: 10000,
      subtotal: 5000,
      taxAmount: 1000,
      lineItems: [],
    }
    const consistent = confidenceScoringService.score(parsed, { financialConsistent: true })
    const inconsistent = confidenceScoringService.score(parsed, { financialConsistent: false })
    assert.ok(consistent.compositeScore >= inconsistent.compositeScore, 'Consistent should score >= inconsistent')
  })
})

/* ═══════════════════════════════════════════════════════════════════
 * 5. VENDOR LEARNING LAYER
 * ═══════════════════════════════════════════════════════════════════ */

describe('Vendor Learning Service', () => {
  const companyId = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()

  it('should record a scan and create a vendor template', async () => {
    const template = await vendorLearningService.recordScan(companyId, {
      vendorName: 'Test Vendor Corp',
      gstin: '27AABCT1234F1ZK',
      confidence: 0.85,
      success: true,
      taxRate: 18,
      lineItemCount: 5,
      invoiceNumberPrefix: 'INV-',
    })

    assert.ok(template)
    assert.equal(template.vendorName, 'Test Vendor Corp')
    assert.equal(template.gstin, '27AABCT1234F1ZK')
    assert.equal(template.scanCount, 1)
    assert.equal(template.patterns.typicalTaxRate, 18)
  })

  it('should find template by vendor name', async () => {
    const found = await vendorLearningService.findTemplate(companyId, {
      vendorName: 'Test Vendor Corp',
    })
    assert.ok(found)
    assert.equal(found.vendorName, 'Test Vendor Corp')
  })

  it('should find template by GSTIN', async () => {
    const found = await vendorLearningService.findTemplate(companyId, {
      gstin: '27AABCT1234F1ZK',
    })
    assert.ok(found)
    assert.equal(found.gstin, '27AABCT1234F1ZK')
  })

  it('should record user correction', async () => {
    await vendorLearningService.recordCorrection(companyId, {
      vendorName: 'Test Vendor Corp',
      field: 'vendorName',
      originalValue: 'Test Vendro Corp',
      correctedValue: 'Test Vendor Corp',
      correctedBy: userId,
    })

    const corrections = await vendorLearningService.listCorrections(companyId)
    assert.ok(corrections.length > 0)
    assert.equal(corrections[0].field, 'vendorName')
  })

  it('should apply vendor template hints', () => {
    const template = {
      vendorName: 'Test Vendor',
      gstin: '27AABCT1234F1ZK',
      patterns: { typicalTaxRate: 18, invoiceNumberPrefix: 'INV-' },
      fieldCorrections: {},
    }
    const parsed = {
      vendorName: 'Test Vendor',
      gstin: null,
      subtotal: 10000,
      taxAmount: 500, // way off from 18%
    }
    const { parsed: result, hints } = vendorLearningService.applyTemplate(parsed, template)
    assert.equal(result.gstin, '27AABCT1234F1ZK') // filled from template
    assert.ok(hints.length > 0)
    assert.ok(hints.some((h) => h.field === 'gstin' && h.autoApplied))
    assert.ok(hints.some((h) => h.field === 'taxAmount'))
  })

  it('should list templates ordered by scan count', async () => {
    const templates = await vendorLearningService.listTemplates(companyId)
    assert.ok(templates.length > 0)
  })
})

/* ═══════════════════════════════════════════════════════════════════
 * 6. EXTENDED SCANNED INVOICE MODEL
 * ═══════════════════════════════════════════════════════════════════ */

describe('ScannedInvoice Model — Extended Fields', () => {
  const companyId = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()

  it('should store ocrRawText and ocrParsedData', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'extracted',
      createdBy: userId,
      ocrRawText: 'Raw OCR text here',
      ocrParsedData: {
        vendorName: 'Raw Vendor',
        totalAmount: 5000,
      },
    })
    const found = await ScannedInvoice.findById(scan._id)
    assert.equal(found.ocrRawText, 'Raw OCR text here')
    assert.equal(found.ocrParsedData.vendorName, 'Raw Vendor')
  })

  it('should store ocrCorrections array', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'correcting',
      createdBy: userId,
      ocrCorrections: [
        { field: 'subtotal', from: 0, to: 10000, rule: 'Derived from line items' },
        { field: 'vendorName', from: 'ABC |Corp|', to: 'ABC Corp', rule: 'OCR artifact cleanup' },
      ],
    })
    const found = await ScannedInvoice.findById(scan._id)
    assert.equal(found.ocrCorrections.length, 2)
    assert.equal(found.ocrCorrections[0].field, 'subtotal')
    assert.equal(found.ocrCorrections[1].to, 'ABC Corp')
  })

  it('should store confidenceBreakdown', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'validated',
      createdBy: userId,
      confidenceBreakdown: {
        vendorName: { ocr: 0.8, pattern: 1.0, crossValidation: 0.9, financial: 1.0, composite: 0.92 },
      },
    })
    const found = await ScannedInvoice.findById(scan._id)
    assert.ok(found.confidenceBreakdown.vendorName)
    assert.equal(found.confidenceBreakdown.vendorName.ocr, 0.8)
  })

  it('should store duplicates and vendorHints', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'validated',
      createdBy: userId,
      duplicates: [{ type: 'exact', field: 'invoiceNumber', message: 'Already exists', existingId: 'abc123' }],
      vendorHints: [{ field: 'gstin', message: 'Applied from template', autoApplied: true }],
    })
    const found = await ScannedInvoice.findById(scan._id)
    assert.equal(found.duplicates.length, 1)
    assert.equal(found.vendorHints.length, 1)
    assert.equal(found.vendorHints[0].autoApplied, true)
  })

  it('should support preprocess and correct pipeline stages', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'pending',
      createdBy: userId,
      pipelineStages: [
        { stage: 'upload', status: 'success' },
        { stage: 'preprocess', status: 'success', message: 'Best: grayscale_normalized (87.2%)' },
        { stage: 'extract', status: 'success' },
        { stage: 'correct', status: 'success', message: '3 corrections applied' },
        { stage: 'validate', status: 'success' },
      ],
    })
    const found = await ScannedInvoice.findById(scan._id)
    assert.equal(found.pipelineStages.length, 5)
    assert.ok(found.pipelineStages.find((s) => s.stage === 'preprocess'))
    assert.ok(found.pipelineStages.find((s) => s.stage === 'correct'))
  })
})
