import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { Customer } from '../models/customer.model.js'
import { Invoice } from '../models/invoice.model.js'
import { SalesOrder } from '../models/sales-order.model.js'
import { companyFilter } from '../utils/scope.js'
import { logger } from '../utils/logger.js'

const customerSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  company: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  taxId: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
})

export const customersController = {
  list: asyncHandler(async (req, res) => {
    const filter = companyFilter(req.user)
    const customers = await Customer.find(filter).sort({ createdAt: -1 }).lean()

    const customerIds = customers.map((c) => c._id)

    const [orderAgg, invoiceAgg] = await Promise.all([
      SalesOrder.aggregate([
        { $match: { companyId: filter.companyId, customer: { $in: customerIds } } },
        { $group: { _id: '$customer', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      ]),
      Invoice.aggregate([
        { $match: { companyId: filter.companyId, customer: { $in: customerIds }, status: 'paid' } },
        { $group: { _id: '$customer', total: { $sum: '$totalAmount' } } },
      ]),
    ])

    const orderMap = new Map(orderAgg.map((r) => [String(r._id), r]))
    const invoiceMap = new Map(invoiceAgg.map((r) => [String(r._id), r]))

    const data = customers.map((c) => {
      const ord = orderMap.get(String(c._id))
      const inv = invoiceMap.get(String(c._id))
      return {
        ...c,
        totalOrders: ord?.count || 0,
        totalPurchases: inv?.total || ord?.total || 0,
      }
    })

    res.json({ success: true, data })
  }),
  getById: asyncHandler(async (req, res) => {
    const data = await Customer.findOne({ _id: req.params.id, companyId: req.user.companyId })
    if (!data) {
      const error = new Error('Customer not found')
      error.statusCode = 404
      throw error
    }
    res.json({ success: true, data })
  }),
  create: asyncHandler(async (req, res) => {
    const payload = customerSchema.parse(req.body)
    const data = await Customer.create({ ...payload, companyId: req.user.companyId })
    logger.info('customer.created', { id: data._id.toString(), userId: req.user._id.toString() })
    res.status(201).json({ success: true, data })
  }),
  update: asyncHandler(async (req, res) => {
    const payload = customerSchema.partial().parse(req.body)
    const data = await Customer.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      payload,
      { new: true, runValidators: true },
    )
    if (!data) {
      const error = new Error('Customer not found')
      error.statusCode = 404
      throw error
    }
    res.json({ success: true, data })
  }),
  remove: asyncHandler(async (req, res) => {
    await Customer.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId })
    res.status(204).send()
  }),
}
