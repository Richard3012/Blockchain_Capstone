import { asyncHandler } from '../middlewares/async-handler.js'
import { whatsappBotService } from '../services/whatsapp-bot.service.js'

export const whatsappBotController = {
  status: asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: { active: whatsappBotService.isActive() },
    })
  }),

  sendReminder: asyncHandler(async (req, res) => {
    const result = await whatsappBotService.sendPaymentReminder(
      req.user.companyId,
      req.params.invoiceId,
    )
    res.json({ success: true, data: result })
  }),

  bulkReminders: asyncHandler(async (req, res) => {
    const results = await whatsappBotService.sendOverdueReminders(req.user.companyId)
    res.json({ success: true, data: results })
  }),

  confirmPayment: asyncHandler(async (req, res) => {
    const result = await whatsappBotService.confirmPayment(req.user.companyId, {
      invoiceId: req.body.invoiceId,
      amount: req.body.amount,
      method: req.body.method || 'upi',
      reference: req.body.reference,
      userId: req.user._id,
    })
    res.json({ success: true, data: result })
  }),

  // WhatsApp Cloud API webhook verification
  webhookVerify: asyncHandler(async (req, res) => {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge)
    } else {
      res.sendStatus(403)
    }
  }),

  // Incoming WhatsApp webhook messages
  webhookReceive: asyncHandler(async (req, res) => {
    // Acknowledge immediately per WhatsApp API requirement
    res.sendStatus(200)

    try {
      await whatsappBotService.processIncomingMessage(req.body)
    } catch (err) {
      // Already acknowledged — just log
      console.error('WhatsApp webhook processing error:', err.message)
    }
  }),

  getOverdueInvoices: asyncHandler(async (req, res) => {
    const { Invoice } = await import('../models/invoice.model.js')
    const invoices = await Invoice.find({
      companyId: req.user.companyId,
      status: { $in: ['issued', 'overdue'] },
      balanceDue: { $gt: 0 },
    })
      .populate('customer')
      .sort({ dueDate: 1 })
      .limit(50)

    res.json({ success: true, data: invoices })
  }),
}
