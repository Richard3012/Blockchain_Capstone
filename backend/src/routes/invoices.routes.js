import { Router } from 'express'

import { invoicesController } from '../controllers/invoices.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { validateObjectIdParams } from '../middlewares/validate-object-id.js'

const router = Router()
router.use(requireAuth)

router.post('/', invoicesController.create)
router.get('/', invoicesController.list)
router.get('/:id', validateObjectIdParams('id'), invoicesController.getById)
router.put('/:id/mark-paid', validateObjectIdParams('id'), invoicesController.markPaid)
router.get('/:id/verify', validateObjectIdParams('id'), invoicesController.verify)

export default router
