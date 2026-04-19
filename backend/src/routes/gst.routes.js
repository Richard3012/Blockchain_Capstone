import { Router } from 'express'

import { gstController } from '../controllers/gst.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { heavyComputeLimiter } from '../middlewares/ai-rate-limit.js'

const router = Router()
router.use(requireAuth)

router.get('/summary', gstController.summary)
router.get('/stats', gstController.stats)
router.get('/gstr1', heavyComputeLimiter, gstController.generateGSTR1)
router.get('/gstr3b', heavyComputeLimiter, gstController.generateGSTR3B)
router.post('/file-return', heavyComputeLimiter, gstController.fileReturn)
router.get('/returns', gstController.getReturns)
router.get('/returns/:id', gstController.getReturnById)
router.get('/state-codes', gstController.stateCodes)
router.get('/hsn', gstController.hsnSearch)
router.get('/validate-gstin', gstController.validateGSTIN)

export default router
