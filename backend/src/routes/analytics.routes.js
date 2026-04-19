import { Router } from 'express'

import { requireAuth } from '../middlewares/auth.js'
import { analyticsController } from '../controllers/analytics.controller.js'

const router = Router()

router.get('/revenue-trend', requireAuth, analyticsController.revenueTrend)
router.get('/expense-breakdown', requireAuth, analyticsController.expenseBreakdown)
router.get('/gst-summary', requireAuth, analyticsController.gstSummary)
router.get('/vendor-spending', requireAuth, analyticsController.vendorSpending)
router.get('/summary', requireAuth, analyticsController.summary)

export default router
