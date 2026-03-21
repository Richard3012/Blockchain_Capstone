import { Router } from 'express'

import { walletController } from '../controllers/wallet.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()

router.post('/request-link-nonce', requireAuth, walletController.requestLinkNonce)
router.post('/verify-link', requireAuth, walletController.verifyLink)
router.get('/status', requireAuth, walletController.status)

export default router
