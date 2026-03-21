import { Router } from 'express'

import { invoicesController } from '../controllers/invoices.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.post('/', invoicesController.create)
router.get('/', invoicesController.list)
router.put('/:id/mark-paid', invoicesController.markPaid)
router.get('/:id/verify', invoicesController.verify)

export default router
