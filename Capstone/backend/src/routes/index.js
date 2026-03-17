import { Router } from 'express'

import authRouter from './auth.routes.js'
import auditRouter from './audit.routes.js'
import blockchainRouter from './blockchain.routes.js'
import dashboardRouter from './dashboard.routes.js'
import inventoryRouter from './inventory.routes.js'
import invoicesRouter from './invoices.routes.js'
import { productRouter, storeRouter, supplierRouter } from './master-data.routes.js'
import ordersRouter from './orders.routes.js'
import procurementRouter from './procurement.routes.js'
import walletRouter from './wallet.routes.js'

const router = Router()

router.use('/auth', authRouter)
router.use('/wallet', walletRouter)
router.use('/products', productRouter)
router.use('/suppliers', supplierRouter)
router.use('/stores', storeRouter)
router.use('/inventory', inventoryRouter)
router.use('/procurement', procurementRouter)
router.use('/orders', ordersRouter)
router.use('/invoices', invoicesRouter)
router.use('/audit', auditRouter)
router.use('/dashboard', dashboardRouter)
router.use('/blockchain', blockchainRouter)

export default router
