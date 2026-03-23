import { asyncHandler } from '../middlewares/async-handler.js'
import { deliveryService } from '../services/delivery.service.js'
import { barcodeService } from '../services/barcode.service.js'

export const deliveryController = {
  create: asyncHandler(async (req, res) => {
    const delivery = await deliveryService.createFromOrder(
      req.user.companyId,
      req.body.orderId,
      req.body.customer,
      req.user._id,
    )
    res.status(201).json({ success: true, data: delivery })
  }),

  list: asyncHandler(async (req, res) => {
    const deliveries = await deliveryService.list(req.user.companyId, {
      status: req.query.status,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    })
    res.json({ success: true, data: deliveries })
  }),

  getById: asyncHandler(async (req, res) => {
    const delivery = await deliveryService.getById(req.user.companyId, req.params.id)
    res.json({ success: true, data: delivery })
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const delivery = await deliveryService.updateStatus(req.user.companyId, req.params.id, {
      status: req.body.status,
      location: req.body.location,
      note: req.body.note,
      scannedBarcode: req.body.scannedBarcode,
      actor: req.user._id?.toString(),
    })
    res.json({ success: true, data: delivery })
  }),

  track: asyncHandler(async (req, res) => {
    const delivery = await deliveryService.getByTracking(req.params.trackingNumber)
    res.json({ success: true, data: delivery })
  }),

  verifyProof: asyncHandler(async (req, res) => {
    const result = await deliveryService.verifyBlockchainProof(req.params.trackingNumber)
    res.json({ success: true, data: result })
  }),

  barcodeImage: asyncHandler(async (req, res) => {
    const { text } = req.params
    const format = req.query.format || 'code128'
    const png = await barcodeService.generateImage(text, format)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(png)
  }),

  ensureProductBarcode: asyncHandler(async (req, res) => {
    const product = await barcodeService.ensureProductBarcode(req.params.productId)
    res.json({ success: true, data: product })
  }),
}
