import { Router } from 'express'

import { verificationEventsController } from '../controllers/verification-events.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', verificationEventsController.list)

export default router
