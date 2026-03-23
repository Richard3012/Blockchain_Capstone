import { asyncHandler } from '../middlewares/async-handler.js'
import { invoiceScannerService } from '../services/invoice-scanner.service.js'
import { invoiceValidationService } from '../services/invoice-validation.service.js'
import { fileExtractorService } from '../services/file-extractor.service.js'

/**
 * Resolve raw text from either req.body.rawText or an uploaded file.
 */
async function resolveText(req) {
  if (req.file) {
    return fileExtractorService.extractText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    )
  }
  if (req.body.rawText && typeof req.body.rawText === 'string') {
    return req.body.rawText
  }
  const err = new Error('Upload a file (PDF, DOCX, or image) or provide rawText')
  err.statusCode = 400
  throw err
}

export const invoiceScannerController = {
  /**
   * POST /parse — Extract text + parse fields + validate (preview, no DB writes).
   */
  parse: asyncHandler(async (req, res) => {
    const rawText = await resolveText(req)
    const parsed = invoiceScannerService.parseOCRText(rawText)
    const validation = await invoiceValidationService.validate(parsed, req.user.companyId)
    parsed.extractedText = rawText
    res.json({ success: true, data: { ...parsed, validation } })
  }),

  /**
   * POST /process — Full pipeline: parse → validate → create invoice → inventory → ledger → blockchain.
   * Accepts user-corrected fields in parsedOverrides.
   */
  process: asyncHandler(async (req, res) => {
    const rawText = await resolveText(req)
    const customer = req.body.customer
    const store = req.body.store

    if (!customer || !store) {
      const err = new Error('customer and store are required')
      err.statusCode = 400
      throw err
    }

    // parsedOverrides lets the frontend send user-corrected field values
    let parsedOverrides = null
    if (req.body.parsedOverrides) {
      parsedOverrides = typeof req.body.parsedOverrides === 'string'
        ? JSON.parse(req.body.parsedOverrides)
        : req.body.parsedOverrides
    }

    const result = await invoiceScannerService.processScannedInvoice(
      req.user.companyId,
      {
        rawText,
        parsedOverrides,
        customer,
        store,
        createdBy: req.user._id,
        idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'],
      },
    )

    const status = result.validation?.valid === false ? 422 : 201
    res.status(status).json({ success: result.validation?.valid !== false, data: result })
  }),

  /**
   * GET /verify/:invoiceId — Recompute hash + verify against blockchain.
   */
  verify: asyncHandler(async (req, res) => {
    const result = await invoiceScannerService.verifyInvoice(req.user.companyId, req.params.invoiceId)
    res.json({ success: true, data: result })
  }),

  /**
   * GET /list — List scanned invoices.
   */
  list: asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const result = await invoiceScannerService.listScanned(req.user.companyId, { page, limit })
    res.json({ success: true, data: result })
  }),
}
