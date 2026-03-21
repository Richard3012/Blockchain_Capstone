import { Router } from 'express'

import { auditController } from '../controllers/audit.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', auditController.list)
router.get('/:entityType/:entityId', auditController.byEntity)

export default router
