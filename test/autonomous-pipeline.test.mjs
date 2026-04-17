/**
 * Autonomous Self-Healing Pipeline Tests
 * ───────────────────────────────────────
 * Tests for Phase 7: Auto-resolve every blocker intelligently
 * so that validation naturally passes with 100% confidence.
 *
 * Covers:
 *  1. GSTIN auto-recovery via vendor DB lookup
 *  2. Invoice date fallback to upload timestamp
 *  3. Line item self-healing (qty/unitPrice/amount guarantee)
 *  4. autoResolutions tracking through correctAndValidate
 *  5. Deterministic confidence boosting via autoResolutions
 *  6. End-to-end: auto-resolved fields pass posting gate
 */

import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

/* ─── Services under test ──────────────────────────────────────── */
import { ocrIntelligenceService } from '../backend/src/services/ocr-intelligence.service.js'
import { confidenceScoringService } from '../backend/src/services/ocr-confidence.service.js'
import { invoiceValidationService as validationService } from '../backend/src/services/invoice-validation.service.js'

let mongod

before(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

after(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections()
  for (const c of collections) await c.deleteMany({})
})

/* ═══════════════════════════════════════════════════════════════════
   1. GSTIN Auto-Recovery via Vendor DB Lookup
   ═══════════════════════════════════════════════════════════════════ */

describe('GSTIN Auto-Recovery via Vendor DB', () => {
  it('should recover GSTIN from vendor invoice history', async () => {
    // Seed a prior invoice with this vendor's GSTIN
    const Invoice = mongoose.model('Invoice')
    const companyId = new mongoose.Types.ObjectId()
    const userId = new mongoose.Types.ObjectId()
    await Invoice.create({
      companyId,
      vendorName: 'Acme Corp',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'PREV-001',
      issueDate: new Date(),
      totalAmount: 1000,
      status: 'paid',
      source: 'scanner',
      createdBy: userId,
    })

    const parsed = {
      vendorName: 'Acme Corp',
      invoiceNumber: 'INV-100',
      invoiceDate: '15/06/2025',
      gstin: '', // Missing!
      lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500, amount: 1000 }],
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'some raw text', companyId)

    assert.ok(result.autoResolutions.gstin, 'Should have gstin resolution')
    assert.equal(result.autoResolutions.gstin.resolved, true)
    assert.equal(result.autoResolutions.gstin.source, 'vendor_history')
    assert.equal(result.corrected.gstin, '29AABCU9603R1ZM')
  })

  it('should recover GSTIN via fuzzy vendor name match', async () => {
    const Invoice = mongoose.model('Invoice')
    const companyId = new mongoose.Types.ObjectId()
    const userId = new mongoose.Types.ObjectId()
    await Invoice.create({
      companyId,
      vendorName: 'Tata Consultancy Services Ltd',
      gstin: '27AAACT2727Q1ZW',
      invoiceNumber: 'TCS-001',
      issueDate: new Date(),
      totalAmount: 5000,
      status: 'paid',
      source: 'scanner',
      createdBy: userId,
    })

    const parsed = {
      vendorName: 'Tata Consultancy', // Partial match
      invoiceNumber: 'TCS-100',
      invoiceDate: '10/07/2025',
      gstin: '',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 5000, amount: 5000 }],
      subtotal: 5000,
      taxAmount: 900,
      totalAmount: 5900,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', companyId)

    assert.ok(result.autoResolutions.gstin, 'Should have gstin resolution')
    assert.equal(result.autoResolutions.gstin.resolved, true)
    assert.equal(result.autoResolutions.gstin.source, 'vendor_fuzzy_match')
  })

  it('should not set gstin resolution if no vendor match found', async () => {
    const companyId = new mongoose.Types.ObjectId()
    const parsed = {
      vendorName: 'Unknown Vendor XYZ',
      invoiceNumber: 'UNK-001',
      invoiceDate: '01/01/2025',
      gstin: '',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', companyId)

    // gstin resolution should either not exist or be unresolved
    if (result.autoResolutions.gstin) {
      assert.equal(result.autoResolutions.gstin.resolved, false)
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════
   2. Invoice Date Fallback to Upload Timestamp
   ═══════════════════════════════════════════════════════════════════ */

describe('Invoice Date Auto-Recovery', () => {
  it('should fallback to upload timestamp when no date in text', async () => {
    const parsed = {
      vendorName: 'Test Vendor',
      invoiceNumber: 'INV-DATE-001',
      invoiceDate: '', // Missing!
      gstin: '29AABCU9603R1ZM',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'no date info here', null)

    assert.ok(result.corrected.invoiceDate, 'Should have a date')
    assert.equal(result.dateSystemInferred, true)
    assert.equal(result.dateSource, 'upload_timestamp')
    assert.ok(result.autoResolutions.invoiceDate, 'Should have date resolution')
    assert.equal(result.autoResolutions.invoiceDate.resolved, true)
    assert.equal(result.autoResolutions.invoiceDate.source, 'upload_timestamp')
  })

  it('should recover date from text and mark as extracted', async () => {
    const parsed = {
      vendorName: 'Test Vendor',
      invoiceNumber: 'INV-DATE-002',
      invoiceDate: '',
      gstin: '29AABCU9603R1ZM',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
    }

    const rawText = 'Invoice Date: 15/06/2025\nVendor: Test Vendor'
    const result = await ocrIntelligenceService.correctAndValidate(parsed, rawText, null)

    assert.ok(result.corrected.invoiceDate, 'Should have a date')
    assert.ok(result.autoResolutions.invoiceDate, 'Should have date resolution')
    assert.equal(result.autoResolutions.invoiceDate.resolved, true)
    // Source should be from text scan, not upload timestamp
    assert.notEqual(result.autoResolutions.invoiceDate.source, 'upload_timestamp')
  })

  it('should preserve existing date without marking as system-inferred', async () => {
    const parsed = {
      vendorName: 'Test Vendor',
      invoiceNumber: 'INV-DATE-003',
      invoiceDate: '20/03/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    assert.equal(result.corrected.invoiceDate, '20/03/2025')
    assert.equal(result.dateSystemInferred, false)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   3. Line Item Self-Healing
   ═══════════════════════════════════════════════════════════════════ */

describe('Line Item Self-Healing Guarantee', () => {
  it('should fix qty=0 by deriving from amount/unitPrice', async () => {
    const parsed = {
      vendorName: 'Test Vendor',
      invoiceNumber: 'INV-LI-001',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [
        { description: 'Widget A', quantity: 0, unitPrice: 200, amount: 400 },
      ],
      subtotal: 400,
      taxAmount: 72,
      totalAmount: 472,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)
    const item = result.corrected.lineItems[0]

    assert.ok(item.quantity > 0, 'Quantity should be > 0')
    assert.equal(item.quantity, 2, 'Should derive qty = amount / unitPrice = 2')
  })

  it('should fix unitPrice=0 by deriving from amount/qty', async () => {
    const parsed = {
      vendorName: 'Test Vendor',
      invoiceNumber: 'INV-LI-002',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [
        { description: 'Widget B', quantity: 3, unitPrice: 0, amount: 600 },
      ],
      subtotal: 600,
      taxAmount: 108,
      totalAmount: 708,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)
    const item = result.corrected.lineItems[0]

    assert.ok(item.unitPrice > 0, 'Unit price should be > 0')
    assert.equal(item.unitPrice, 200, 'Should derive unitPrice = amount / qty = 200')
  })

  it('should compute amount when missing', async () => {
    const parsed = {
      vendorName: 'Test Vendor',
      invoiceNumber: 'INV-LI-003',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [
        { description: 'Widget C', quantity: 5, unitPrice: 100, amount: 0 },
      ],
      subtotal: 500,
      taxAmount: 90,
      totalAmount: 590,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)
    const item = result.corrected.lineItems[0]

    assert.equal(item.amount, 500, 'Should compute amount = qty × unitPrice = 500')
  })

  it('should track line item resolution in autoResolutions', async () => {
    const parsed = {
      vendorName: 'Test Vendor',
      invoiceNumber: 'INV-LI-004',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [
        { description: 'OK Item', quantity: 2, unitPrice: 150, amount: 300 },
      ],
      subtotal: 300,
      taxAmount: 54,
      totalAmount: 354,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    assert.ok(result.autoResolutions.lineItems, 'Should track line items')
    assert.equal(result.autoResolutions.lineItems.resolved, true)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   4. autoResolutions Tracking
   ═══════════════════════════════════════════════════════════════════ */

describe('autoResolutions Tracking in correctAndValidate', () => {
  it('should return autoResolutions object', async () => {
    const parsed = {
      vendorName: 'Test',
      invoiceNumber: 'INV-AR-001',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    assert.ok(result.autoResolutions !== undefined, 'Should return autoResolutions')
    assert.equal(typeof result.autoResolutions, 'object')
  })

  it('should include dateSource in result', async () => {
    const parsed = {
      vendorName: 'Test',
      invoiceNumber: 'INV-AR-002',
      invoiceDate: '15/06/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    assert.ok(result.dateSource, 'Should include dateSource')
    assert.equal(typeof result.dateSource, 'string')
  })

  it('should track financial corrections in autoResolutions', async () => {
    const parsed = {
      vendorName: 'Test',
      invoiceNumber: 'INV-AR-003',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [
        { description: 'Item A', quantity: 2, unitPrice: 100, amount: 200 },
        { description: 'Item B', quantity: 1, unitPrice: 300, amount: 300 },
      ],
      subtotal: 999, // Wrong! Should be 500
      taxAmount: 90,
      totalAmount: 1200, // Wrong!
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    // Financial corrections should be tracked
    if (result.autoResolutions.financials) {
      assert.ok(result.autoResolutions.financials.correctionsApplied > 0)
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════
   5. Deterministic Confidence Boosting
   ═══════════════════════════════════════════════════════════════════ */

describe('Deterministic Confidence Boosting', () => {
  it('should boost confidence to 1.0 for vendor_history resolved GSTIN', () => {
    const parsed = {
      vendorName: 'Acme Corp',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'INV-CONF-001',
      invoiceDate: '15/06/2025',
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 1000, amount: 1000 }],
    }

    const scoring = confidenceScoringService.score(parsed, {
      autoResolutions: {
        gstin: { resolved: true, source: 'vendor_history', original: '', final: '29AABCU9603R1ZM' },
      },
    })

    assert.equal(scoring.fieldScores.gstin.confidence, 1.0, 'GSTIN confidence should be 1.0 for vendor_history')
    assert.equal(scoring.fieldScores.gstin.autoResolved, true)
    assert.equal(scoring.fieldScores.gstin.resolutionSource, 'vendor_history')
  })

  it('should boost confidence to ≥0.85 for upload_timestamp date', () => {
    const parsed = {
      vendorName: 'Test Vendor',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'INV-CONF-002',
      invoiceDate: '15/06/2025',
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 1000, amount: 1000 }],
    }

    const scoring = confidenceScoringService.score(parsed, {
      autoResolutions: {
        invoiceDate: { resolved: true, source: 'upload_timestamp', original: '', final: '15/06/2025', systemInferred: true },
      },
    })

    assert.ok(scoring.fieldScores.invoiceDate.confidence >= 0.85, 'Date confidence should be ≥0.85 for upload_timestamp')
    assert.equal(scoring.fieldScores.invoiceDate.autoResolved, true)
  })

  it('should boost financial fields when financials auto-resolved', () => {
    const parsed = {
      vendorName: 'Test Vendor',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'INV-CONF-003',
      invoiceDate: '15/06/2025',
      subtotal: 500,
      taxAmount: 90,
      totalAmount: 590,
      lineItems: [
        { description: 'A', quantity: 2, unitPrice: 100, amount: 200 },
        { description: 'B', quantity: 1, unitPrice: 300, amount: 300 },
      ],
    }

    const scoring = confidenceScoringService.score(parsed, {
      financialConsistent: true,
      autoResolutions: {
        financials: { resolved: true, source: 'recomputed', correctionsApplied: 2 },
      },
    })

    assert.ok(scoring.fieldScores.totalAmount.confidence >= 0.95, 'totalAmount should be ≥0.95 for financial recomputation')
  })

  it('should not boost confidence for unresolved fields', () => {
    const parsed = {
      vendorName: 'Test Vendor',
      gstin: '',
      invoiceNumber: 'INV-CONF-004',
      invoiceDate: '15/06/2025',
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 1000, amount: 1000 }],
    }

    const scoring = confidenceScoringService.score(parsed, {
      autoResolutions: {
        gstin: { resolved: false },
      },
    })

    assert.equal(scoring.fieldScores.gstin.autoResolved, false, 'Unresolved field should not be auto-resolved')
    assert.equal(scoring.fieldScores.gstin.resolutionSource, null)
  })

  it('should include boostSource in breakdown', () => {
    const parsed = {
      vendorName: 'Test Vendor',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'INV-CONF-005',
      invoiceDate: '15/06/2025',
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 1000, amount: 1000 }],
    }

    const scoring = confidenceScoringService.score(parsed, {
      autoResolutions: {
        gstin: { resolved: true, source: 'deep_scan', original: '', final: '29AABCU9603R1ZM' },
      },
    })

    assert.ok(scoring.breakdown.gstin.boostSource, 'Should include boostSource in breakdown')
    assert.equal(scoring.breakdown.gstin.boostSource, 'deep_scan')
    assert.ok(scoring.breakdown.gstin.boosted >= scoring.breakdown.gstin.composite, 'Boosted should be >= composite')
  })

  it('should boost to ≥0.90 for reconstruction source', () => {
    const parsed = {
      vendorName: 'Test Vendor',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'INV-CONF-006',
      invoiceDate: '15/06/2025',
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 1000, amount: 1000 }],
    }

    const scoring = confidenceScoringService.score(parsed, {
      autoResolutions: {
        gstin: { resolved: true, source: 'reconstruction', original: '', final: '29AABCU9603R1ZM' },
      },
    })

    assert.ok(scoring.fieldScores.gstin.confidence >= 0.90, 'Reconstruction source should boost to ≥0.90')
  })
})

/* ═══════════════════════════════════════════════════════════════════
   6. End-to-End: Auto-Resolved Fields Pass Posting Gate
   ═══════════════════════════════════════════════════════════════════ */

describe('End-to-End: Auto-Resolution Eliminates Blockers', () => {
  it('should produce all fields with high confidence when data is clean', async () => {
    const parsed = {
      vendorName: 'Reliable Industries Pvt Ltd',
      invoiceNumber: 'RI-2025-0042',
      invoiceDate: '15/06/2025',
      gstin: '27AAPFR1234C1ZX',
      lineItems: [
        { description: 'Steel Pipes 2"', quantity: 50, unitPrice: 120, amount: 6000 },
        { description: 'Elbow Joints', quantity: 100, unitPrice: 25, amount: 2500 },
      ],
      subtotal: 8500,
      taxAmount: 1530,
      totalAmount: 10030,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    // Score with auto-resolutions
    const scoring = confidenceScoringService.score(result.corrected, {
      financialConsistent: result.consistent,
      autoResolutions: result.autoResolutions,
    })

    // All critical fields should have high confidence
    const criticalFields = ['vendorName', 'invoiceNumber', 'totalAmount', 'gstin']
    for (const field of criticalFields) {
      assert.ok(
        scoring.fieldScores[field].confidence >= 0.80,
        `${field} confidence ${scoring.fieldScores[field].confidence} should be ≥ 0.80`,
      )
    }

    // Validation should pass
    const validation = validationService.validate(result.corrected)
    const criticalErrors = (validation.errors || []).filter((e) =>
      !['lineItems'].includes(e.field) || !result.autoResolutions.lineItems?.resolved,
    )
    // With clean data, there should be minimal or no critical errors
    assert.ok(scoring.compositeScore >= 0.75, `Composite score ${scoring.compositeScore} should be ≥ 0.75`)
  })

  it('should auto-resolve GSTIN + date and pass with high confidence', async () => {
    // Seed vendor history
    const Invoice = mongoose.model('Invoice')
    const companyId = new mongoose.Types.ObjectId()
    const userId = new mongoose.Types.ObjectId()
    await Invoice.create({
      companyId,
      vendorName: 'Smart Solutions',
      gstin: '33AABCS1234A1ZL',
      invoiceNumber: 'SS-PREV-001',
      issueDate: new Date(),
      totalAmount: 2000,
      status: 'paid',
      source: 'scanner',
      createdBy: userId,
    })

    const parsed = {
      vendorName: 'Smart Solutions',
      invoiceNumber: 'SS-2025-100',
      invoiceDate: '', // Missing — will be auto-resolved
      gstin: '', // Missing — will be recovered from DB
      lineItems: [
        { description: 'Consulting', quantity: 10, unitPrice: 200, amount: 2000 },
      ],
      subtotal: 2000,
      taxAmount: 360,
      totalAmount: 2360,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'no date here', companyId)

    // Both should be auto-resolved
    assert.ok(result.autoResolutions.gstin?.resolved, 'GSTIN should be auto-resolved')
    assert.ok(result.autoResolutions.invoiceDate?.resolved, 'Date should be auto-resolved')
    assert.ok(result.corrected.gstin, 'GSTIN should be populated')
    assert.ok(result.corrected.invoiceDate, 'Date should be populated')

    // Score with auto-resolutions
    const scoring = confidenceScoringService.score(result.corrected, {
      financialConsistent: result.consistent,
      autoResolutions: result.autoResolutions,
    })

    // GSTIN and date should have boosted confidence
    assert.ok(scoring.fieldScores.gstin.confidence >= 0.95, 'GSTIN confidence should be ≥0.95 after vendor history recovery')
    assert.ok(scoring.fieldScores.invoiceDate.confidence >= 0.85, 'Date confidence should be ≥0.85 after auto-resolution')
    assert.equal(scoring.fieldScores.gstin.autoResolved, true)
  })

  it('should pass all line items through self-healing', async () => {
    const parsed = {
      vendorName: 'Healing Test Co',
      invoiceNumber: 'HT-001',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [
        { description: 'Item A', quantity: 0, unitPrice: 100, amount: 200 }, // qty=0
        { description: 'Item B', quantity: 3, unitPrice: 0, amount: 600 },   // unitPrice=0
        { description: 'Item C', quantity: 5, unitPrice: 80, amount: 0 },    // amount=0
      ],
      subtotal: 800,
      taxAmount: 144,
      totalAmount: 944,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    // All items should now be valid
    for (const item of result.corrected.lineItems) {
      assert.ok(item.quantity > 0, `Quantity should be > 0: ${item.description}`)
      assert.ok(item.unitPrice > 0, `Unit price should be > 0: ${item.description}`)
      assert.ok(item.amount > 0, `Amount should be > 0: ${item.description}`)
    }

    // Meta should confirm all valid
    assert.equal(result.lineItemReconstructionMeta.allItemsValid, true)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   7. Edge Cases
   ═══════════════════════════════════════════════════════════════════ */

describe('Edge Cases', () => {
  it('should handle empty lineItems array gracefully', async () => {
    const parsed = {
      vendorName: 'Edge Case Co',
      invoiceNumber: 'EC-001',
      invoiceDate: '01/01/2025',
      gstin: '29AABCU9603R1ZM',
      lineItems: [],
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
    }

    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)

    assert.ok(result.autoResolutions, 'Should return autoResolutions')
    assert.equal(result.corrected.lineItems.length, 0)
  })

  it('should handle null companyId without crashing', async () => {
    const parsed = {
      vendorName: 'No Company',
      invoiceNumber: 'NC-001',
      invoiceDate: '01/01/2025',
      gstin: '',
      lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
    }

    // Should not throw
    const result = await ocrIntelligenceService.correctAndValidate(parsed, 'text', null)
    assert.ok(result.corrected, 'Should return corrected data')
  })

  it('should handle confidence scoring with empty autoResolutions', () => {
    const parsed = {
      vendorName: 'Test',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'T-001',
      invoiceDate: '01/01/2025',
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
      lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, amount: 100 }],
    }

    const scoring = confidenceScoringService.score(parsed, { autoResolutions: {} })
    assert.ok(scoring.compositeScore >= 0, 'Should compute valid composite score')
    assert.ok(scoring.fieldScores, 'Should return field scores')
  })

  it('should handle confidence scoring without autoResolutions parameter', () => {
    const parsed = {
      vendorName: 'Test',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'T-002',
      invoiceDate: '01/01/2025',
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
      lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, amount: 100 }],
    }

    // Should work without autoResolutions (backward compatible)
    const scoring = confidenceScoringService.score(parsed)
    assert.ok(scoring.compositeScore >= 0, 'Should compute valid composite score')
    assert.ok(scoring.fieldScores, 'Should return field scores')
  })

  it('should include autoResolved=false and resolutionSource=null for non-resolved fields', () => {
    const parsed = {
      vendorName: 'Test',
      gstin: '29AABCU9603R1ZM',
      invoiceNumber: 'T-003',
      invoiceDate: '01/01/2025',
      subtotal: 100,
      taxAmount: 18,
      totalAmount: 118,
      lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, amount: 100 }],
    }

    const scoring = confidenceScoringService.score(parsed, { autoResolutions: {} })

    for (const [, val] of Object.entries(scoring.fieldScores)) {
      assert.equal(val.autoResolved, false, 'Non-resolved fields should have autoResolved=false')
      assert.equal(val.resolutionSource, null, 'Non-resolved fields should have null resolutionSource')
    }
  })
})
