import crypto from 'crypto'

import mongoose from 'mongoose'
import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { Customer } from '../models/customer.model.js'
import { Invoice } from '../models/invoice.model.js'
import { Payment } from '../models/payment.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { Store } from '../models/store.model.js'
import { User } from '../models/user.model.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { auditService } from '../services/audit.service.js'
import { blockchainService } from '../services/blockchain.service.js'
import { verificationService } from '../services/verification.service.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'
import { broadcastFromReq } from '../utils/realtime.js'

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

const isOid24 = (v) => {
  if (v == null || v === '') return false
  const s = String(v)
  return s.length === 24 && mongoose.Types.ObjectId.isValid(s)
}

/** Avoid Mongoose populate CastErrors when legacy rows have invalid ref strings (e.g. bad order id). */
const batchEnrichInvoices = async (rows, companyId) => {
  if (!rows.length) return []
  const customerIds = [...new Set(rows.map((r) => r.customer).filter(isOid24))]
  const storeIds = [...new Set(rows.map((r) => r.store).filter(isOid24))]
  const orderIds = [...new Set(rows.map((r) => r.order).filter(isOid24))]
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter(isOid24))]

  const [customers, stores, orders, users] = await Promise.all([
    customerIds.length ? Customer.find({ _id: { $in: customerIds }, companyId }).lean() : [],
    storeIds.length ? Store.find({ _id: { $in: storeIds }, companyId }).lean() : [],
    orderIds.length ? SalesOrder.find({ _id: { $in: orderIds }, companyId }).lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('name email role').lean() : [],
  ])

  const cm = new Map(customers.map((c) => [String(c._id), c]))
  const sm = new Map(stores.map((s) => [String(s._id), s]))
  const om = new Map(orders.map((o) => [String(o._id), o]))
  const um = new Map(users.map((u) => [String(u._id), u]))

  return rows.map((r) => ({
    ...r,
    customer: isOid24(r.customer) ? (cm.get(String(r.customer)) || r.customer) : r.customer,
    store: isOid24(r.store) ? (sm.get(String(r.store)) || r.store) : r.store,
    order: isOid24(r.order) ? (om.get(String(r.order)) || r.order) : null,
    createdBy: isOid24(r.createdBy) ? (um.get(String(r.createdBy)) || r.createdBy) : r.createdBy,
  }))
}

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

    broadcastFromReq(req, 'revenue-trend')
    broadcastFromReq(req, 'expense-breakdown')
    broadcastFromReq(req, 'gst-summary')
    broadcastFromReq(req, 'vendor-spending')

    res.status(201).json({ success: true, data: { invoice, blockchainRecord } })
  }),
  list: asyncHandler(async (req, res) => {
    const rows = await Invoice.find(companyFilter(req.user)).sort({ createdAt: -1 }).lean()
    const populated = await batchEnrichInvoices(rows, req.user.companyId)
    const data = await Promise.all(
      populated.map(async (invoice) => {
        const verification = await verificationService.verifyEntity({
          companyId: req.user.companyId,
          entityType: 'invoice',
          entity: invoice,
          verifiedBy: null,
          logEvent: false,
        })
        return {
          ...invoice,
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
    const row = await Invoice.findOne({ _id: req.params.id, companyId: req.user.companyId }).lean()
    if (!row) {
      const error = new Error('Invoice not found')
      error.statusCode = 404
      throw error
    }
    const [data] = await batchEnrichInvoices([row], req.user.companyId)
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

    broadcastFromReq(req, 'revenue-trend')

    const refreshedRow = await Invoice.findOne({ _id: invoice._id, companyId: req.user.companyId }).lean()
    const [refreshed] = await batchEnrichInvoices(refreshedRow ? [refreshedRow] : [], req.user.companyId)
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
