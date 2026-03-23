import { Router } from 'express'

import { customersController } from '../controllers/customers.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', customersController.list)
router.get('/:id', customersController.getById)
router.post('/', customersController.create)
router.patch('/:id', customersController.update)
router.delete('/:id', customersController.remove)

export default router
