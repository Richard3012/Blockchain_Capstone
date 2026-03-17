import { Router } from 'express'

import { ordersController } from '../controllers/orders.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.post('/', ordersController.create)
router.get('/', ordersController.list)
router.put('/:id/status', ordersController.updateStatus)

export default router
