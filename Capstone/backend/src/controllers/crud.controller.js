import { asyncHandler } from '../middlewares/async-handler.js'

export const createCrudController = (service) => ({
  list: asyncHandler(async (_req, res) => {
    const records = await service.list()
    res.json({ success: true, data: records })
  }),

  getById: asyncHandler(async (req, res) => {
    const record = await service.getById(req.params.id)
    res.json({ success: true, data: record })
  }),

  create: asyncHandler(async (req, res) => {
    const record = await service.create(req.body)
    res.status(201).json({ success: true, data: record })
  }),

  update: asyncHandler(async (req, res) => {
    const record = await service.update(req.params.id, req.body)
    res.json({ success: true, data: record })
  }),

  remove: asyncHandler(async (req, res) => {
    await service.remove(req.params.id)
    res.status(204).send()
  }),
})
