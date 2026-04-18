import crypto from 'crypto'

import { Invoice } from '../models/invoice.model.js'
import { Payment } from '../models/payment.model.js'
import { Customer } from '../models/customer.model.js'
import { blockchainService } from './blockchain.service.js'
import { accountingService } from './accounting.service.js'
import { logger } from '../utils/logger.js'

/**
 * WhatsApp Payment Follow-up Bot Service
 *
 * Manages auto-reminders for overdue invoices via WhatsApp Cloud API,
 * generates UPI / Razorpay links, and on payment confirmation updates
 * the ledger and anchors the record on-chain.
 */

let config = null

export const whatsappBotService = {
  initialize({ phoneNumberId, accessToken, businessId, upiId, razorpayKeyId }) {
    if (!phoneNumberId || !accessToken) {
      logger.warn('whatsapp.skipped', { reason: 'Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN' })
      return
    }
    config = { phoneNumberId, accessToken, businessId, upiId, razorpayKeyId }
    logger.info('whatsapp.initialized', { phoneNumberId })
  },

  isActive() {
    return config !== null
  },

  // ─── Send a WhatsApp message via Cloud API ─────────────────────────
  async sendMessage(to, body) {
    if (!config) return { sent: false, reason: 'WhatsApp not configured' }

    // Normalise the phone number (must include country code, no +)
    const phone = to.replace(/[^0-9]/g, '')

    const res = await fetch(`https://graph.facebook.com/v19.0/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      logger.error('whatsapp.send_failed', { to: phone, error: err })
      return { sent: false, reason: err }
    }

    logger.info('whatsapp.message_sent', { to: phone })
    return { sent: true }
  },

  // ─── Generate a UPI payment link ──────────────────────────────────
  generateUPILink(amount, invoiceNumber) {
    const upiId = config?.upiId || 'merchant@upi'
    const name = 'BlockERP'
    const txnRef = invoiceNumber
    return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&tn=${encodeURIComponent(`Invoice ${txnRef}`)}&cu=INR`
  },

  // ─── Send payment reminder for a single invoice ────────────────────
  async sendPaymentReminder(companyId, invoiceId) {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId }).populate('customer')
    if (!invoice) {
      const err = new Error('Invoice not found')
      err.statusCode = 404
      throw err
    }

    const customer = invoice.customer || (await Customer.findById(invoice.customer))
    const phone = customer?.phone
    if (!phone) {
      return { sent: false, reason: 'Customer has no phone number' }
    }

    const upiLink = this.generateUPILink(invoice.balanceDue, invoice.invoiceNumber)
    const dueStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'N/A'

    const message = [
      `🔔 *Payment Reminder — BlockERP*`,
      ``,
      `Invoice: *${invoice.invoiceNumber}*`,
      `Amount Due: *₹${invoice.balanceDue.toLocaleString('en-IN')}*`,
      `Due Date: ${dueStr}`,
      ``,
      `Pay now via UPI:`,
      upiLink,
      ``,
      `Reply PAID <reference> once you've completed the payment.`,
    ].join('\n')

    const result = await this.sendMessage(phone, message)
    logger.info('whatsapp.reminder_sent', { invoiceId: invoice._id, phone })
    return { ...result, invoiceNumber: invoice.invoiceNumber, phone }
  },

  // ─── Bulk-send reminders for all overdue invoices ──────────────────
  async sendOverdueReminders(companyId) {
    const overdueInvoices = await Invoice.find({
      companyId,
      status: { $in: ['issued', 'overdue'] },
      balanceDue: { $gt: 0 },
      dueDate: { $lt: new Date() },
    }).populate('customer')

    const results = []
    for (const inv of overdueInvoices) {
      try {
        const r = await this.sendPaymentReminder(companyId, inv._id)
        results.push({ invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, ...r })
      } catch (e) {
        results.push({ invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, sent: false, reason: e.message })
      }
    }

    logger.info('whatsapp.bulk_reminders', { companyId: companyId?.toString(), total: overdueInvoices.length })
    return results
  },

  // ─── Confirm payment (called when customer replies or webhook fires) ─
  async confirmPayment(companyId, { invoiceId, amount, method, reference, userId }) {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId })
    if (!invoice) {
      const err = new Error('Invoice not found')
      err.statusCode = 404
      throw err
    }

    const payAmount = amount || invoice.balanceDue

    // Record payment
    const payment = await Payment.create({
      companyId,
      paymentNumber: `PAY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      invoice: invoice._id,
      customer: invoice.customer,
      amount: payAmount,
      method: method || 'upi',
      reference: reference || '',
      createdBy: userId,
    })

    // Update invoice
    invoice.amountPaid = (invoice.amountPaid || 0) + payAmount
    invoice.balanceDue = Math.max(0, invoice.totalAmount - invoice.amountPaid)
    if (invoice.balanceDue <= 0) invoice.status = 'paid'
    await invoice.save()

    // Push journal entry to ledger (Cash debit, AR credit)
    try {
      const accounts = await accountingService.getAccounts(companyId)
      const findBy = (subType, fallbackCode) =>
        accounts.find((a) => a.subType === subType) || accounts.find((a) => a.code === fallbackCode)
      const cashAccount = findBy('cash', '1000')
      const arAccount = findBy('receivable', '1100')

      if (cashAccount && arAccount) {
        await accountingService.createJournalEntry(companyId, {
          description: `WhatsApp payment — ${invoice.invoiceNumber} ref:${reference || 'N/A'}`,
          lines: [
            { account: cashAccount._id, debit: payAmount, credit: 0 },
            { account: arAccount._id, debit: 0, credit: payAmount },
          ],
        }, userId)
      }
    } catch (err) {
      logger.warn('whatsapp.ledger_push_skipped', { invoiceId: invoice._id, error: err.message })
    }

    // Anchor on blockchain
    let blockchainRecord = null
    try {
      const proofPayload = JSON.stringify({
        paymentId: payment._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        amount: payAmount,
        method,
        reference,
        confirmedAt: new Date().toISOString(),
      })
      const hash = '0x' + crypto.createHash('sha256').update(proofPayload).digest('hex')

      blockchainRecord = await blockchainService.anchorRecord({
        companyId,
        entityType: 'payment',
        entityId: payment.paymentNumber,
        recordHash: hash,
        ipfsCid: '',
        requestedBy: userId,
      })
    } catch (err) {
      logger.error('whatsapp.blockchain_failed', { paymentId: payment._id, error: err.message })
    }

    // Send confirmation back via WhatsApp
    try {
      const customer = await Customer.findById(invoice.customer)
      if (customer?.phone) {
        await this.sendMessage(customer.phone, [
          `✅ *Payment Confirmed — BlockERP*`,
          ``,
          `Invoice: *${invoice.invoiceNumber}*`,
          `Amount: *₹${payAmount.toLocaleString('en-IN')}*`,
          `Reference: ${reference || 'N/A'}`,
          blockchainRecord?.txHash ? `Blockchain TX: ${blockchainRecord.txHash}` : '',
          ``,
          `Thank you for your payment!`,
        ].filter(Boolean).join('\n'))
      }
    } catch (err) {
      logger.warn('whatsapp.confirmation_message_failed', { error: err.message })
    }

    return { payment, invoice, blockchainRecord }
  },

  // ─── Process incoming webhook message ─────────────────────────────
  async processIncomingMessage(body) {
    // WhatsApp Cloud API webhook structure
    const entry = body?.entry?.[0]
    const change = entry?.changes?.[0]
    const message = change?.value?.messages?.[0]

    if (!message || message.type !== 'text') return { processed: false, reason: 'not a text message' }

    const from = message.from
    const text = message.text?.body?.trim() || ''

    // Match "PAID <reference>" pattern
    const paidMatch = text.match(/^PAID\s+(.+)/i)
    if (!paidMatch) return { processed: false, reason: 'Not a payment confirmation' }

    const reference = paidMatch[1].trim()

    // Find customer by phone
    const customer = await Customer.findOne({ phone: { $regex: from.slice(-10) } })
    if (!customer) return { processed: false, reason: 'Customer not found' }

    // Find their oldest unpaid invoice
    const invoice = await Invoice.findOne({
      customer: customer._id,
      status: { $in: ['issued', 'overdue'] },
      balanceDue: { $gt: 0 },
    }).sort({ dueDate: 1 })

    if (!invoice) {
      await this.sendMessage(from, '⚠️ No outstanding invoices found for your account.')
      return { processed: false, reason: 'No unpaid invoice' }
    }

    const result = await this.confirmPayment(invoice.companyId, {
      invoiceId: invoice._id,
      reference,
      method: 'upi',
    })

    return { processed: true, invoiceNumber: invoice.invoiceNumber, reference }
  },
}
