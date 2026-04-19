import { Router } from 'express'

import { blockchainController } from '../controllers/blockchain.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { validateObjectIdParams } from '../middlewares/validate-object-id.js'

const router = Router()
router.use(requireAuth)

router.get('/ledger', blockchainController.ledger)
router.get('/verification-log', blockchainController.verificationLog)
router.post('/anchor/:entityType/:entityId', validateObjectIdParams('entityId'), blockchainController.anchor)
router.get('/verify/:entityType/:entityId', validateObjectIdParams('entityId'), blockchainController.verify)

export default router
