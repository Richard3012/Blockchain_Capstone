import { Router } from 'express'

import { blockchainController } from '../controllers/blockchain.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.post('/anchor/:entityType/:entityId', blockchainController.anchor)
router.get('/verify/:entityType/:entityId', blockchainController.verify)
router.get('/ledger', blockchainController.ledger)

export default router
