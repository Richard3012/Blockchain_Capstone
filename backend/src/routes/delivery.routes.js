import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { deliveryController } from '../controllers/delivery.controller.js'

const router = Router()

// Public tracking (customer-facing) — must be before /:id
router.get('/track/:trackingNumber', deliveryController.track)
router.get('/verify/:trackingNumber', deliveryController.verifyProof)

// Barcode image generation
router.get('/barcode/:text', deliveryController.barcodeImage)
router.post('/products/:productId/barcode', requireAuth, deliveryController.ensureProductBarcode)

// Authenticated delivery management
router.post('/', requireAuth, deliveryController.create)
router.get('/', requireAuth, deliveryController.list)
router.get('/:id', requireAuth, deliveryController.getById)
router.patch('/:id/status', requireAuth, deliveryController.updateStatus)

export default router
