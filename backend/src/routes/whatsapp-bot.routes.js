import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { whatsappBotController } from '../controllers/whatsapp-bot.controller.js'
import { webhookLimiter, heavyComputeLimiter } from '../middlewares/ai-rate-limit.js'

const router = Router()

// Dashboard / management (authenticated)
router.get('/status', requireAuth, whatsappBotController.status)
router.get('/overdue', requireAuth, whatsappBotController.getOverdueInvoices)
router.post('/remind/:invoiceId', requireAuth, whatsappBotController.sendReminder)
router.post('/remind-all', requireAuth, heavyComputeLimiter, whatsappBotController.bulkReminders)
router.post('/confirm-payment', requireAuth, whatsappBotController.confirmPayment)

// WhatsApp Cloud API webhook (public)
router.get('/webhook', webhookLimiter, whatsappBotController.webhookVerify)
router.post('/webhook', webhookLimiter, whatsappBotController.webhookReceive)

export default router
