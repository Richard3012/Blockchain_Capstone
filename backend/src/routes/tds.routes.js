import { Router } from 'express'

import { tdsController } from '../controllers/tds.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/sections', tdsController.getSections)
router.post('/calculate', tdsController.calculate)
router.post('/deductions', tdsController.recordDeduction)
router.get('/deductions', tdsController.getEntries)
router.get('/quarterly/:financialYear/:quarter', tdsController.getQuarterlySummary)
router.put('/deductions/:id/deposit', tdsController.markDeposited)

export default router
