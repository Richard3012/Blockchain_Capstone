import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { whatsappBotController } from '../controllers/whatsapp-bot.controller.js'

const router = Router()

// Dashboard / management (authenticated)
router.get('/status', requireAuth, whatsappBotController.status)
router.get('/overdue', requireAuth, whatsappBotController.getOverdueInvoices)
router.post('/remind/:invoiceId', requireAuth, whatsappBotController.sendReminder)
router.post('/remind-all', requireAuth, whatsappBotController.bulkReminders)
router.post('/confirm-payment', requireAuth, whatsappBotController.confirmPayment)

// WhatsApp Cloud API webhook (public)
router.get('/webhook', whatsappBotController.webhookVerify)
router.post('/webhook', whatsappBotController.webhookReceive)

export default router
