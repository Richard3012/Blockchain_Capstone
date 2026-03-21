import { Router } from 'express'

import { procurementController } from '../controllers/procurement.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.post('/purchase-orders', procurementController.createPurchaseOrder)
router.get('/purchase-orders', procurementController.listPurchaseOrders)
router.post('/goods-receipts', procurementController.createGoodsReceipt)
router.get('/goods-receipts', procurementController.listGoodsReceipts)

export default router
