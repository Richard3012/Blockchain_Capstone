import crypto from 'crypto'

import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { Invoice } from '../models/invoice.model.js'
import { Payment } from '../models/payment.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { auditService } from '../services/audit.service.js'
import { blockchainService } from '../services/blockchain.service.js'
import { verificationService } from '../services/verification.service.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'

const invoiceSchema = z.object({
  order: z.string().optional(),
  customer: z.string(),
  store: z.string(),
  dueDate: z.string().optional(),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().optional(),
  totalAmount: z.number().nonnegative(),
})

const paymentSchema = z.object({
  amount: z.number().positive().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

export const invoicesController = {
  create: asyncHandler(async (req, res) => {
    const payload = invoiceSchema.parse(req.body)
    const invoice = await Invoice.create({
      companyId: req.user.companyId,
      invoiceNumber: `INV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      order: payload.order || null,
      customer: payload.customer,
      store: payload.store,
      dueDate: payload.dueDate,
      subtotal: payload.subtotal,
      taxAmount: payload.taxAmount || 0,
      totalAmount: payload.totalAmount,
      balanceDue: payload.totalAmount,
      status: 'issued',
      createdBy: req.user._id,
    })

    const blockchainRecord = await verificationService.anchorEntity({
      companyId: req.user.companyId,
      entityType: 'invoice',
      entity: invoice,
      requestedBy: req.user._id,
      actorAddress: req.user.linkedWalletAddress || null,
    })

    if (payload.order) {
      await SalesOrder.findByIdAndUpdate(payload.order, { status: 'delivered' })
    }

    await auditService.record({
      companyId: req.user.companyId,
      action: 'finance.invoice_created',
      entityType: 'invoice',
      entityId: invoice._id,
      summary: `Invoice ${invoice.invoiceNumber} created`,
      actor: req.user._id,
    })

    res.status(201).json({ success: true, data: { invoice, blockchainRecord } })
  }),
  list: asyncHandler(async (req, res) => {
    const invoices = await Invoice.find(companyFilter(req.user)).populate('customer order store createdBy').sort({ createdAt: -1 })
    const data = await Promise.all(
      invoices.map(async (invoice) => {
        const verification = await verificationService.verifyEntity({
          companyId: req.user.companyId,
          entityType: 'invoice',
          entity: invoice,
          verifiedBy: null,
          logEvent: false,
        })
        return {
          ...invoice.toObject(),
          verificationStatus: verification?.verificationStatus || invoice.verificationStatus,
          tamperSource: verification?.tamperSource || null,
          mismatchReasons: verification?.mismatchReasons || [],
          fieldDiffs: verification?.fieldDiffs || [],
        }
      }),
    )

    logger.info('finance.invoices_fetched', { companyId: req.user.companyId.toString(), count: data.length })
    res.json({ success: true, data })
  }),
  getById: asyncHandler(async (req, res) => {
    const data = await Invoice.findOne({ _id: req.params.id, companyId: req.user.companyId }).populate('customer order store createdBy')
    if (!data) {
      const error = new Error('Invoice not found')
      error.statusCode = 404
      throw error
    }
    res.json({ success: true, data })
  }),
  markPaid: asyncHandler(async (req, res) => {
    const payload = paymentSchema.parse(req.body)
    const invoice = await Invoice.findOne({ _id: req.params.id, companyId: req.user.companyId })
    if (!invoice) {
      const error = new Error('Invoice not found')
      error.statusCode = 404
      throw error
    }

    const amount = payload.amount || invoice.balanceDue
    invoice.amountPaid += amount
    invoice.balanceDue = Math.max(0, invoice.totalAmount - invoice.amountPaid)
    invoice.status = invoice.balanceDue === 0 ? 'paid' : 'issued'
    if (invoice.balanceDue === 0) {
      invoice.paymentDate = new Date()
    }
    await invoice.save()

    await verificationService.advanceIntegrityChain({
      entityType: 'invoice',
      entity: invoice,
    })

    const payment = await Payment.create({
      companyId: req.user.companyId,
      paymentNumber: `PAY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      invoice: invoice._id,
      customer: invoice.customer,
      amount,
      method: payload.method || 'bank_transfer',
      reference: payload.reference,
      notes: payload.notes,
      createdBy: req.user._id,
    })

    await auditService.record({
      companyId: req.user.companyId,
      action: 'finance.payment_recorded',
      entityType: 'payment',
      entityId: payment._id,
      summary: `Payment recorded for invoice ${invoice.invoiceNumber}`,
      actor: req.user._id,
    })

    logger.info('finance.payment_recorded', { invoiceId: invoice._id.toString(), paymentId: payment._id.toString(), amount })

    const refreshed = await Invoice.findOne({ _id: invoice._id, companyId: req.user.companyId }).populate('customer order store createdBy')
    res.json({ success: true, data: { invoice: refreshed, payment } })
  }),
  verify: asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({ _id: req.params.id, companyId: req.user.companyId })
    if (!invoice) {
      const error = new Error('Invoice not found')
      error.statusCode = 404
      throw error
    }

    const blockchainRecord = await BlockchainRecord.findOne({ companyId: req.user.companyId, entityType: 'invoice', entityId: invoice._id.toString() }).sort({ createdAt: -1 })
    const integrity = await verificationService.verifyEntity({
      companyId: req.user.companyId,
      entityType: 'invoice',
      entity: invoice,
      verifiedBy: req.user._id,
      logEvent: true,
    })
    const chainVerification = integrity.recomputedHash && blockchainRecord
      ? await blockchainService.verifyRecord('invoice', invoice._id.toString(), integrity.recomputedHash)
      : { verified: false, configured: Boolean(blockchainRecord) }

    res.json({
      success: true,
      data: {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        hash: invoice.hash || null,
        storedHash: integrity.storedHash || null,
        currentHash: integrity.recomputedHash || null,
        originalHash: integrity.originalHash || null,
        documentCid: invoice.documentCid || null,
        verificationStatus: integrity.verificationStatus || (chainVerification.verified ? 'verified' : 'not_verified'),
        tamperSource: integrity.tamperSource || null,
        mismatchReasons: integrity.mismatchReasons || [],
        fieldDiffs: integrity.fieldDiffs || [],
        blockchainRecord,
        blockchainVerified: chainVerification.verified,
      },
    })
  }),
}
