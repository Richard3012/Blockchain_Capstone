import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { aiAssistantLimiter } from '../middlewares/ai-rate-limit.js'
import { aiAssistantController } from '../controllers/ai-assistant.controller.js'

const router = Router()

router.post('/query', requireAuth, aiAssistantLimiter, aiAssistantController.query)
router.get('/history', requireAuth, aiAssistantController.history)
router.get('/diagnostics', requireAuth, aiAssistantController.diagnostics)

export default router
