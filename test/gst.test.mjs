import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { GSTReturn } from '../backend/src/models/gst-return.model.js'
import { HSNCode } from '../backend/src/models/hsn-code.model.js'
import { Invoice } from '../backend/src/models/invoice.model.js'

let mongoServer

before(async () => {
  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri())
})

after(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('GST Models', () => {
  const companyId = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()

  it('should create a GST return', async () => {
    const ret = await GSTReturn.create({
      companyId,
      returnType: 'GSTR1',
      period: '202601',
      status: 'filed',
      filingDate: new Date(),
      totalTaxableValue: 100000,
      totalCGST: 9000,
      totalSGST: 9000,
      totalIGST: 0,
      invoiceCount: 5,
      createdBy: userId,
    })
    assert.equal(ret.returnType, 'GSTR1')
    assert.equal(ret.period, '202601')
    assert.equal(ret.status, 'filed')
    assert.equal(ret.totalTaxableValue, 100000)
    assert.equal(ret.totalCGST, 9000)
    assert.equal(ret.invoiceCount, 5)
    assert.equal(ret.version, 0)
    assert.equal(ret.periodLocked, false)
    await GSTReturn.ensureIndexes()
  })

  it('should enforce unique companyId + returnType + period', async () => {
    await assert.rejects(
      () =>
        GSTReturn.create({
          companyId,
          returnType: 'GSTR1',
          period: '202601',
          createdBy: userId,
        }),
      (err) => err.code === 11000,
    )
  })

  it('should allow different return types for same period', async () => {
    const ret = await GSTReturn.create({
      companyId,
      returnType: 'GSTR3B',
      period: '202601',
      status: 'draft',
      totalTaxableValue: 50000,
      totalCGST: 4500,
      totalSGST: 4500,
      invoiceCount: 3,
      createdBy: userId,
    })
    assert.equal(ret.returnType, 'GSTR3B')
    assert.equal(ret.period, '202601')
  })

  it('should store validation errors and warnings', async () => {
    const ret = await GSTReturn.create({
      companyId,
      returnType: 'GSTR1',
      period: '202602',
      createdBy: userId,
      validationErrors: [{ field: 'totalTax', message: 'Tax is negative' }],
      validationWarnings: [{ field: 'invoices', message: 'No invoices found' }],
    })
    assert.equal(ret.validationErrors.length, 1)
    assert.equal(ret.validationErrors[0].field, 'totalTax')
    assert.equal(ret.validationWarnings.length, 1)
  })

  it('should store blockchain references', async () => {
    const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const bcRecordId = new mongoose.Types.ObjectId()
    const ret = await GSTReturn.findOneAndUpdate(
      { companyId, returnType: 'GSTR1', period: '202602' },
      { blockchainTxHash: txHash, blockchainRecordId: bcRecordId, periodLocked: true },
      { new: true },
    )
    assert.equal(ret.blockchainTxHash, txHash)
    assert.equal(ret.blockchainRecordId.toString(), bcRecordId.toString())
    assert.equal(ret.periodLocked, true)
  })
})

describe('HSN Code Model', () => {
  it('should create an HSN code entry', async () => {
    const hsn = await HSNCode.create({
      code: '8471',
      description: 'Computers and peripherals',
      gstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 18,
      category: 'Electronics',
    })
    assert.equal(hsn.code, '8471')
    assert.equal(hsn.gstRate, 18)
    assert.equal(hsn.cgstRate, 9)
    assert.equal(hsn.category, 'Electronics')
    assert.equal(hsn.isActive, true)
    await HSNCode.ensureIndexes()
  })

  it('should enforce unique HSN code', async () => {
    await assert.rejects(
      () =>
        HSNCode.create({
          code: '8471',
          description: 'Duplicate',
          gstRate: 18,
        }),
      (err) => err.code === 11000,
    )
  })

  it('should create zero-rated HSN codes', async () => {
    const hsn = await HSNCode.create({
      code: '4901',
      description: 'Printed books, newspapers',
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      category: 'Publishing',
    })
    assert.equal(hsn.gstRate, 0)
    assert.equal(hsn.cessRate, 0)
  })
})

describe('GST Invoice Integration', () => {
  const companyId = new mongoose.Types.ObjectId()
  const userId = new mongoose.Types.ObjectId()

  it('should create invoices with GST-relevant fields', async () => {
    const inv = await Invoice.create({
      companyId,
      invoiceNumber: 'GST-INV-001',
      status: 'issued',
      issueDate: new Date(2026, 0, 15),
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      gstin: '29AABCB4499L1ZP',
      createdBy: userId,
      metadata: { cgst: 900, sgst: 900, igst: 0 },
    })
    assert.equal(inv.gstin, '29AABCB4499L1ZP')
    assert.equal(inv.taxAmount, 1800)
    assert.equal(inv.metadata.cgst, 900)
  })

  it('should query invoices by period for GST summary', async () => {
    // Create another invoice in same period
    await Invoice.create({
      companyId,
      invoiceNumber: 'GST-INV-002',
      status: 'paid',
      issueDate: new Date(2026, 0, 20),
      subtotal: 20000,
      taxAmount: 3600,
      totalAmount: 23600,
      createdBy: userId,
    })

    const startDate = new Date(2026, 0, 1)
    const endDate = new Date(2026, 0, 31, 23, 59, 59)

    const invoices = await Invoice.find({
      companyId,
      issueDate: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' },
    }).lean()

    assert.equal(invoices.length, 2)
    const totalTax = invoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0)
    assert.equal(totalTax, 5400)
  })

  it('should exclude cancelled invoices from GST summary', async () => {
    await Invoice.create({
      companyId,
      invoiceNumber: 'GST-INV-003',
      status: 'cancelled',
      issueDate: new Date(2026, 0, 25),
      subtotal: 5000,
      taxAmount: 900,
      totalAmount: 5900,
      createdBy: userId,
    })

    const startDate = new Date(2026, 0, 1)
    const endDate = new Date(2026, 0, 31, 23, 59, 59)

    const invoices = await Invoice.find({
      companyId,
      issueDate: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' },
    }).lean()

    assert.equal(invoices.length, 2)
  })
})
