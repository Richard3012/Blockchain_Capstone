import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { aiAssistantController } from '../controllers/ai-assistant.controller.js'

const router = Router()

router.post('/query', requireAuth, aiAssistantController.query)

export default router
