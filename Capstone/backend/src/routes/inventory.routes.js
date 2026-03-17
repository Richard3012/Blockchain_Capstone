import { Router } from 'express'

import { inventoryController } from '../controllers/inventory.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.post('/stock-in', inventoryController.stockIn)
router.post('/stock-out', inventoryController.stockOut)
router.post('/adjust', inventoryController.adjust)
router.post('/transfer', inventoryController.transfer)
router.get('/low-stock', inventoryController.lowStock)
router.get('/history/:productId', inventoryController.history)

export default router
