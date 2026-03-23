import { Router } from 'express'

import { productController, storeController, supplierController } from '../controllers/master-data.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const productRouter = Router()
productRouter.use(requireAuth)
productRouter.get('/', productController.list)
productRouter.get('/:id', productController.getById)
productRouter.post('/', productController.create)
productRouter.patch('/:id', productController.update)
productRouter.delete('/:id', productController.remove)

const supplierRouter = Router()
supplierRouter.use(requireAuth)
supplierRouter.get('/', supplierController.list)
supplierRouter.get('/:id', supplierController.getById)
supplierRouter.post('/', supplierController.create)
supplierRouter.patch('/:id', supplierController.update)
supplierRouter.delete('/:id', supplierController.remove)

const storeRouter = Router()
storeRouter.use(requireAuth)
storeRouter.get('/', storeController.list)
storeRouter.get('/:id', storeController.getById)
storeRouter.post('/', storeController.create)
storeRouter.patch('/:id', storeController.update)
storeRouter.delete('/:id', storeController.remove)

export { productRouter, supplierRouter, storeRouter }
