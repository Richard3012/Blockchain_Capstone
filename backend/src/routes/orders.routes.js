import { Router } from 'express'

import { ordersController } from '../controllers/orders.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { validateObjectIdParams } from '../middlewares/validate-object-id.js'

const router = Router()
router.use(requireAuth)

router.post('/', ordersController.create)
router.get('/', ordersController.list)
router.get('/:id', validateObjectIdParams('id'), ordersController.getById)
router.patch('/:id', validateObjectIdParams('id'), ordersController.update)
router.put('/:id/status', validateObjectIdParams('id'), ordersController.updateStatus)

export default router
