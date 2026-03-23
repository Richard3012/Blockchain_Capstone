import { Router } from 'express'

import { demandForecastController } from '../controllers/demand-forecast.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/forecast', demandForecastController.forecast)
router.get('/history', demandForecastController.history)
router.get('/top-products', demandForecastController.topProducts)

export default router
