import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { ScannedInvoice } from '../backend/src/models/scanned-invoice.model.js'
import { Invoice } from '../backend/src/models/invoice.model.js'
import { invoiceScannerService } from '../backend/src/services/invoice-scanner.service.js'
import { invoiceValidationService } from '../backend/src/services/invoice-validation.service.js'

let mongoServer

before(async () => {
  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri())
})

after(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

/* ─── parseOCRText tests ─────────────────────────────────────────── */

describe('Invoice Scanner — parseOCRText', () => {
  const SAMPLE_INVOICE = `ABC Traders Pvt Ltd
GSTIN: 27AABCT1234F1ZK
Invoice No: INV-2026-0042
Date: 15/03/2026

1  Widget Pro  10  500.00  5000.00
2  Gadget X    5   1200.00 6000.00

Subtotal: ₹11,000.00
CGST 9%: ₹990.00
SGST 9%: ₹990.00
Total: ₹12,980.00`

  it('should extract vendor name', () => {
    const result = invoiceScannerService.parseOCRText(SAMPLE_INVOICE)
    assert.equal(result.vendorName, 'ABC Traders Pvt Ltd')
  })

  it('should extract GSTIN', () => {
    const result = invoiceScannerService.parseOCRText(SAMPLE_INVOICE)
    assert.equal(result.gstin, '27AABCT1234F1ZK')
  })

  it('should extract invoice number', () => {
    const result = invoiceScannerService.parseOCRText(SAMPLE_INVOICE)
    assert.equal(result.invoiceNumber, 'INV-2026-0042')
  })

  it('should extract date', () => {
    const result = invoiceScannerService.parseOCRText(SAMPLE_INVOICE)
    assert.equal(result.invoiceDate, '15/03/2026')
  })

  it('should extract amounts', () => {
    const result = invoiceScannerService.parseOCRText(SAMPLE_INVOICE)
    assert.ok(result.subtotal >= 11000, 'subtotal should be >= 11000')
    assert.ok(result.taxAmount > 0, 'taxAmount should be > 0')
    assert.ok(result.totalAmount >= 12980, 'totalAmount should be >= 12980')
  })

  it('should extract line items', () => {
    const result = invoiceScannerService.parseOCRText(SAMPLE_INVOICE)
    assert.ok(result.lineItems.length >= 2, 'should have at least 2 line items')
    assert.ok(result.lineItems[0].description.includes('Widget Pro'), 'first item should contain Widget Pro')
    assert.equal(result.lineItems[0].quantity, 10)
    assert.equal(result.lineItems[0].amount, 5000)
  })

  it('should compute confidence scores', () => {
    const result = invoiceScannerService.parseOCRText(SAMPLE_INVOICE)
    assert.ok(result.fieldConfidence, 'should have fieldConfidence')
    assert.ok(result.fieldConfidence.vendorName.confidence > 0)
    assert.ok(result.fieldConfidence.gstin.confidence >= 0.9, 'GSTIN should have high confidence')
    assert.ok(result.avgConfidence > 0)
    assert.ok(['high', 'medium', 'low'].includes(result.confidence))
  })

  it('should auto-fill tax from subtotal and total when missing', () => {
    const text = `Vendor ABC
Invoice No: INV-001
Subtotal: ₹10,000.00
Grand Total: ₹11,800.00`
    const result = invoiceScannerService.parseOCRText(text)
    assert.equal(result.subtotal, 10000)
    assert.equal(result.totalAmount, 11800)
    assert.equal(result.taxAmount, 1800)
  })

  it('should handle empty text gracefully', () => {
    const result = invoiceScannerService.parseOCRText('')
    assert.equal(result.vendorName, null)
    assert.equal(result.gstin, null)
    assert.equal(result.totalAmount, 0)
    assert.equal(result.lineItems.length, 0)
    assert.equal(result.confidence, 'low')
  })
})

/* ─── Validation tests ───────────────────────────────────────────── */

describe('Invoice Validation', () => {
  const companyId = new mongoose.Types.ObjectId()

  it('should pass valid invoice', async () => {
    const parsed = {
      vendorName: 'ABC Corp',
      gstin: '27AABCT1234F1ZK',
      invoiceNumber: 'INV-001',
      invoiceDate: '15/03/2026',
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      lineItems: [{ sno: 1, description: 'Widget', quantity: 10, unitPrice: 1000, tax: 180, amount: 10000 }],
    }
    const result = await invoiceValidationService.validate(parsed, companyId)
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
    assert.equal(result.canPost, true)
  })

  it('should error on missing vendor name', async () => {
    const parsed = {
      vendorName: '',
      invoiceNumber: 'INV-002',
      totalAmount: 1000,
      lineItems: [],
    }
    const result = await invoiceValidationService.validate(parsed, companyId)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.field === 'vendorName'))
  })

  it('should error on missing total amount', async () => {
    const parsed = {
      vendorName: 'ABC',
      invoiceNumber: 'INV-003',
      totalAmount: 0,
      lineItems: [],
    }
    const result = await invoiceValidationService.validate(parsed, companyId)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.field === 'totalAmount'))
  })

  it('should error on invalid GSTIN format', async () => {
    const parsed = {
      vendorName: 'ABC',
      gstin: '1234567890ABCDE',
      invoiceNumber: 'INV-004',
      totalAmount: 1000,
      lineItems: [],
    }
    const result = await invoiceValidationService.validate(parsed, companyId)
    assert.ok(result.errors.some((e) => e.field === 'gstin'))
  })

  it('should error on major arithmetic mismatch', async () => {
    const parsed = {
      vendorName: 'ABC',
      invoiceNumber: 'INV-005',
      subtotal: 5000,
      taxAmount: 900,
      totalAmount: 10000,
      lineItems: [{ sno: 1, description: 'Item', quantity: 1, unitPrice: 5000, tax: 0, amount: 5000 }],
    }
    const result = await invoiceValidationService.validate(parsed, companyId)
    assert.ok(result.errors.some((e) => e.field === 'totalAmount'))
  })

  it('should error on low confidence critical fields', async () => {
    const parsed = {
      vendorName: 'ABC',
      invoiceNumber: 'INV-006',
      totalAmount: 1000,
      lineItems: [],
      fieldConfidence: {
        vendorName: { value: 'ABC', confidence: 0.1 },
        invoiceNumber: { value: 'INV-006', confidence: 0.9 },
        totalAmount: { value: 1000, confidence: 0.9 },
      },
    }
    const result = await invoiceValidationService.validate(parsed, companyId)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.field === 'confidence'))
  })

  it('should detect duplicate invoices', async () => {
    const invoiceCompanyId = new mongoose.Types.ObjectId()
    await Invoice.create({
      companyId: invoiceCompanyId,
      invoiceNumber: 'DUP-INV-001',
      totalAmount: 5000,
      status: 'issued',
      source: 'scanner',
      createdBy: new mongoose.Types.ObjectId(),
      metadata: { vendorName: 'Dup Vendor' },
    })
    await Invoice.ensureIndexes()

    const parsed = {
      vendorName: 'Dup Vendor',
      invoiceNumber: 'DUP-INV-001',
      totalAmount: 5000,
      lineItems: [],
    }
    const result = await invoiceValidationService.validate(parsed, invoiceCompanyId)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.field === 'invoiceNumber'))
  })
})

/* ─── Scan History Model tests ───────────────────────────────────── */

describe('ScannedInvoice Model', () => {
  const companyId = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()

  it('should create a scan record', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'pending',
      rawText: 'Test invoice text',
      createdBy: userId,
      pipelineStages: [
        { stage: 'upload', status: 'pending' },
        { stage: 'extract', status: 'pending' },
      ],
    })
    assert.equal(scan.status, 'pending')
    assert.equal(scan.pipelineStages.length, 2)
    assert.ok(scan.createdAt)
  })

  it('should update scan status', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'pending',
      createdBy: userId,
    })
    scan.status = 'processed'
    scan.processedAt = new Date()
    await scan.save()

    const found = await ScannedInvoice.findById(scan._id)
    assert.equal(found.status, 'processed')
    assert.ok(found.processedAt)
  })

  it('should store extracted data', async () => {
    const scan = await ScannedInvoice.create({
      companyId,
      status: 'extracted',
      createdBy: userId,
      extractedData: {
        vendorName: 'Test Vendor',
        gstin: '27AABCT1234F1ZK',
        invoiceNumber: 'INV-TEST',
        totalAmount: 5000,
        lineItems: [{ sno: 1, description: 'Item 1', quantity: 2, unitPrice: 2500, tax: 0, amount: 5000 }],
      },
      confidence: 'high',
      avgConfidence: 0.85,
    })

    const found = await ScannedInvoice.findById(scan._id)
    assert.equal(found.extractedData.vendorName, 'Test Vendor')
    assert.equal(found.extractedData.lineItems.length, 1)
    assert.equal(found.confidence, 'high')
    assert.equal(found.avgConfidence, 0.85)
  })

  it('should track retry count and parent', async () => {
    const parent = await ScannedInvoice.create({
      companyId,
      status: 'failed',
      createdBy: userId,
      lastError: 'Validation failed',
    })

    const retry = await ScannedInvoice.create({
      companyId,
      status: 'pending',
      createdBy: userId,
      parentScanId: parent._id,
      retryCount: 1,
    })

    assert.equal(retry.parentScanId.toString(), parent._id.toString())
    assert.equal(retry.retryCount, 1)
  })
})

/* ─── Service integration tests ───────────────────────────────────── */

describe('Invoice Scanner Service — listScanned', () => {
  const companyId = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()

  it('should list scans with stats', async () => {
    await ScannedInvoice.create({
      companyId,
      status: 'processed',
      createdBy: userId,
    })
    await ScannedInvoice.create({
      companyId,
      status: 'failed',
      createdBy: userId,
      lastError: 'some error',
    })

    const result = await invoiceScannerService.listScanned(companyId)
    assert.ok(result.scans.length >= 2)
    assert.ok(result.stats)
    assert.ok(result.stats.processed >= 1)
    assert.ok(result.stats.failed >= 1)
    assert.ok(result.total >= 2)
  })

  it('should filter by status', async () => {
    const result = await invoiceScannerService.listScanned(companyId, { status: 'processed' })
    assert.ok(result.scans.every((s) => s.status === 'processed'))
  })
})
