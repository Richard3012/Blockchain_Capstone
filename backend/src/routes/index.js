import { Router } from 'express'

import authRouter from './auth.routes.js'
import accountingRouter from './accounting.routes.js'
import aiAssistantRouter from './ai-assistant.routes.js'
import auditRouter from './audit.routes.js'
import blockchainRouter from './blockchain.routes.js'
import customersRouter from './customers.routes.js'
import dashboardRouter from './dashboard.routes.js'
import deliveryRouter from './delivery.routes.js'
import demandForecastRouter from './demand-forecast.routes.js'
import gstRouter from './gst.routes.js'
import inventoryRouter from './inventory.routes.js'
import invoicesRouter from './invoices.routes.js'
import invoiceScannerRouter from './invoice-scanner.routes.js'
import { productRouter, storeRouter, supplierRouter } from './master-data.routes.js'
import ordersRouter from './orders.routes.js'
import operationsRouter from './operations.routes.js'
import procurementRouter from './procurement.routes.js'
import tdsRouter from './tds.routes.js'
import walletRouter from './wallet.routes.js'
import whatsappBotRouter from './whatsapp-bot.routes.js'

const router = Router()

router.use('/auth', authRouter)
router.use('/wallet', walletRouter)
router.use('/customers', customersRouter)
router.use('/products', productRouter)
router.use('/suppliers', supplierRouter)
router.use('/stores', storeRouter)
router.use('/inventory', inventoryRouter)
router.use('/procurement', procurementRouter)
router.use('/orders', ordersRouter)
router.use('/', operationsRouter)
router.use('/invoices', invoicesRouter)
router.use('/audit', auditRouter)
router.use('/dashboard', dashboardRouter)
router.use('/blockchain', blockchainRouter)
router.use('/accounting', accountingRouter)
router.use('/gst', gstRouter)
router.use('/tds', tdsRouter)
router.use('/demand', demandForecastRouter)
router.use('/delivery', deliveryRouter)
router.use('/invoice-scanner', invoiceScannerRouter)
router.use('/whatsapp', whatsappBotRouter)
router.use('/assistant', aiAssistantRouter)

export default router
