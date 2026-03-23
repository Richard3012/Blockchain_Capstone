import { Router } from 'express'

import { gstController } from '../controllers/gst.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/summary', gstController.summary)
router.get('/gstr1', gstController.generateGSTR1)
router.post('/file-return', gstController.fileReturn)
router.get('/returns', gstController.getReturns)
router.get('/state-codes', gstController.stateCodes)
router.get('/hsn', gstController.hsnSearch)

export default router
