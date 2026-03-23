import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { Product } from '../models/product.model.js'
import { Store } from '../models/store.model.js'
import { Supplier } from '../models/supplier.model.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'

const productSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.string().optional(),
  barcode: z.string().optional(),
  unit: z.string().optional(),
  costPrice: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  reorderLevel: z.number().nonnegative().optional(),
  currentStock: z.number().nonnegative().optional(),
})

const supplierSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  paymentTermsDays: z.number().nonnegative().optional(),
  address: z.string().optional(),
})

const storeSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  type: z.enum(['store', 'warehouse']).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  managerId: z.string().optional().nullable(),
})

const buildCrudController = (Model, schema, eventName) => ({
  list: asyncHandler(async (req, res) => {
    const data = await Model.find(companyFilter(req.user)).sort({ createdAt: -1 })
    res.json({ success: true, data })
  }),
  getById: asyncHandler(async (req, res) => {
    const data = await Model.findOne({ _id: req.params.id, companyId: req.user.companyId })
    if (!data) {
      const error = new Error(`${Model.modelName} not found`)
      error.statusCode = 404
      throw error
    }
    res.json({ success: true, data })
  }),
  create: asyncHandler(async (req, res) => {
    const payload = schema.parse(req.body)
    const data = await Model.create({ ...payload, companyId: req.user.companyId })
    logger.info(`${eventName}.created`, { id: data._id.toString(), userId: req.user._id.toString() })
    res.status(201).json({ success: true, data })
  }),
  update: asyncHandler(async (req, res) => {
    const payload = schema.partial().parse(req.body)
    const data = await Model.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      payload,
      { new: true, runValidators: true },
    )
    res.json({ success: true, data })
  }),
  remove: asyncHandler(async (req, res) => {
    await Model.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId })
    res.status(204).send()
  }),
})

export const productController = buildCrudController(Product, productSchema, 'product')
export const supplierController = buildCrudController(Supplier, supplierSchema, 'supplier')
export const storeController = buildCrudController(Store, storeSchema, 'store')
