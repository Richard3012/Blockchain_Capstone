import { asyncHandler } from '../middlewares/async-handler.js'
import { invoiceScannerService } from '../services/invoice-scanner.service.js'
import { invoiceValidationService } from '../services/invoice-validation.service.js'
import { ocrIntelligenceService } from '../services/ocr-intelligence.service.js'
import { confidenceScoringService } from '../services/ocr-confidence.service.js'
import { vendorLearningService } from '../services/ocr-vendor-learning.service.js'
import { fileExtractorService } from '../services/file-extractor.service.js'
import { logger } from '../utils/logger.js'

// Lazy-load preprocess service (depends on sharp, may not be available in test)
let ocrPreprocessService = null
async function getPreprocessService() {
  if (ocrPreprocessService) return ocrPreprocessService
  try {
    const mod = await import('../services/ocr-preprocess.service.js')
    ocrPreprocessService = mod.ocrPreprocessService
  } catch { /* sharp not available */ }
  return ocrPreprocessService
}

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
   * POST /parse — Extract text + parse fields + correct + validate (preview).
   * For images: runs multi-pass OCR with preprocessing.
   * Creates a scan history record for tracking.
   */
  parse: asyncHandler(async (req, res) => {
    const io = req.app.get('io')

    // Create scan record for history
    const scan = await invoiceScannerService.createScanRecord(req.user.companyId, {
      fileName: req.file?.originalname,
      fileType: req.file?.mimetype,
      fileSize: req.file?.size,
      inputMode: req.file ? 'file' : 'text',
      rawText: '',
      createdBy: req.user._id,
    })

    await invoiceScannerService.updateScanStage(scan, 'upload', 'success', 'Document received', io)

    // ── Pre-processing + OCR extraction ─────────────────
    let rawText = ''
    let ocrMeta = {}

    if (req.file && req.file.mimetype?.startsWith('image/')) {
      // Image files: use multi-pass OCR with preprocessing
      await invoiceScannerService.updateScanStage(scan, 'preprocess', 'active', 'Enhancing image quality...', io)
      scan.status = 'preprocessing'
      await scan.save()

      const preprocessSvc = await getPreprocessService()
      if (preprocessSvc) {
        const startPP = Date.now()
        const ocrResult = await preprocessSvc.multiPassOCR(req.file.buffer, {
          emitProgress: (msg) => {
            if (io) io.emit('scanner:stage', { scanId: scan._id, stage: 'preprocess', status: 'active', message: msg })
          },
        })
        rawText = ocrResult.text
        ocrMeta = {
          variant: ocrResult.variant,
          ocrConfidence: ocrResult.confidence,
          allResults: ocrResult.allResults,
          words: ocrResult.words || [],
          preprocessDurationMs: Date.now() - startPP,
        }
        scan.ocrVariant = ocrResult.variant
        scan.ocrConfidence = ocrResult.confidence
        scan.ocrVariantResults = ocrResult.allResults
        scan.preprocessDurationMs = ocrMeta.preprocessDurationMs
        await invoiceScannerService.updateScanStage(scan, 'preprocess', 'success',
          `Best: ${ocrResult.variant} (${ocrResult.confidence.toFixed(1)}%)`, io)
      } else {
        // Fallback: standard single-pass OCR
        rawText = await fileExtractorService.extractText(req.file.buffer, req.file.mimetype, req.file.originalname)
        await invoiceScannerService.updateScanStage(scan, 'preprocess', 'success', 'Standard OCR', io)
      }
    } else if (req.file) {
      // Non-image files (PDF, DOCX, Excel, etc.)
      await invoiceScannerService.updateScanStage(scan, 'preprocess', 'success', 'Text extraction (non-image)', io)
      rawText = await fileExtractorService.extractText(req.file.buffer, req.file.mimetype, req.file.originalname)
    } else if (req.body.rawText && typeof req.body.rawText === 'string') {
      await invoiceScannerService.updateScanStage(scan, 'preprocess', 'success', 'Direct text input', io)
      rawText = req.body.rawText
    } else {
      const err = new Error('Upload a file (PDF, DOCX, or image) or provide rawText')
      err.statusCode = 400
      throw err
    }

    scan.rawText = rawText
    scan.ocrRawText = rawText
    await scan.save()

    // ── Debug: log OCR result summary ────────────────────
    logger.info('scanner.ocr_complete', {
      variant: ocrMeta.variant || 'text',
      confidence: ocrMeta.ocrConfidence || 0,
      textLength: rawText?.length || 0,
      wordCount: ocrMeta.words?.length || 0,
      wordsWithBBox: (ocrMeta.words || []).filter((w) => w.bbox && (w.bbox.x1 - w.bbox.x0) > 0).length,
      textPreview: (rawText || '').substring(0, 300),
    })

    // ── Extract ─────────────────────────────────────────
    await invoiceScannerService.updateScanStage(scan, 'extract', 'active', 'Parsing fields...', io)
    scan.status = 'extracting'
    await scan.save()

    let parsed = invoiceScannerService.parseOCRText(rawText)

    // ── Debug: log initial parse result ──────────────────
    logger.info('scanner.initial_parse', {
      vendorName: parsed.vendorName,
      gstin: parsed.gstin,
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate,
      totalAmount: parsed.totalAmount,
      subtotal: parsed.subtotal,
      taxAmount: parsed.taxAmount,
      lineItemCount: parsed.lineItems?.length || 0,
      lineItems: (parsed.lineItems || []).map((it) => ({
        desc: (it.description || '').substring(0, 40),
        qty: it.quantity,
        price: it.unitPrice,
        amount: it.amount,
      })),
    })

    // Save raw parsed data
    scan.ocrParsedData = {
      vendorName: parsed.vendorName,
      gstin: parsed.gstin,
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate,
      subtotal: parsed.subtotal,
      taxAmount: parsed.taxAmount,
      totalAmount: parsed.totalAmount,
      lineItems: parsed.lineItems,
      rawLineCount: parsed.rawLineCount,
    }

    await invoiceScannerService.updateScanStage(scan, 'extract', 'success', 'Data extracted', io)

    // ── Correct (Intelligence Layer) ────────────────────
    await invoiceScannerService.updateScanStage(scan, 'correct', 'active', 'Running AI correction...', io)
    scan.status = 'correcting'
    await scan.save()

    let dateSystemInferred = false
    let autoResolutions = {}
    let dateSource = 'extracted'
    let tableReconstructionMeta = null

    try {
      // Vendor template hints
      const template = await vendorLearningService.findTemplate(req.user.companyId, {
        vendorName: parsed.vendorName,
        gstin: parsed.gstin,
      })
      if (template) {
        const { parsed: hinted, hints } = vendorLearningService.applyTemplate(parsed, template)
        parsed = hinted
        scan.vendorTemplateId = template._id
        scan.vendorHints = hints
      }

      // Intelligence layer
      const intelligence = await ocrIntelligenceService.correctAndValidate(parsed, rawText, req.user.companyId, {
        ocrVariantResults: ocrMeta.allResults || [],
        ocrWords: ocrMeta.words || [],
      })
      parsed = intelligence.corrected
      scan.ocrCorrections = intelligence.corrections
      scan.financialFlags = intelligence.flags
      scan.financiallyConsistent = intelligence.consistent

      // ── Debug: log post-intelligence result ────────────
      logger.info('scanner.post_intelligence', {
        vendorName: parsed.vendorName,
        gstin: parsed.gstin,
        totalAmount: parsed.totalAmount,
        lineItemCount: parsed.lineItems?.length || 0,
        lineItems: (parsed.lineItems || []).map((it) => ({
          desc: (it.description || '').substring(0, 50),
          hsn: it.hsn || '',
          qty: it.quantity,
          price: it.unitPrice,
          taxable: it.taxableValue || 0,
          gstRate: it.gstRate || 0,
          igst: it.igst || 0,
          amount: it.amount,
        })),
        correctionCount: intelligence.corrections.length,
        tableRecon: intelligence.tableReconstructionMeta,
      })
      scan.duplicates = intelligence.duplicates
      scan.lineItemReconstructionMeta = intelligence.lineItemReconstructionMeta
      tableReconstructionMeta = intelligence.tableReconstructionMeta || null
      dateSystemInferred = intelligence.dateSystemInferred || false
      dateSource = intelligence.dateSource || 'extracted'
      autoResolutions = intelligence.autoResolutions || {}

      // Confidence Scoring 2.0 — with auto-resolution boost
      const scoring = confidenceScoringService.score(parsed, {
        financialConsistent: intelligence.consistent,
        autoResolutions,
        tableReconstructionMeta: intelligence.tableReconstructionMeta || null,
      })
      parsed.fieldConfidence = scoring.fieldScores
      parsed.avgConfidence = scoring.compositeScore
      parsed.confidence = scoring.overallLevel

      scan.confidenceBreakdown = scoring.breakdown

      const corrCount = intelligence.corrections.length
      const resolvedCount = Object.values(autoResolutions).filter((r) => r.resolved).length
      await invoiceScannerService.updateScanStage(scan, 'correct',
        intelligence.flags.length > 0 ? 'warning' : 'success',
        `${corrCount} correction(s), ${resolvedCount} auto-resolved${intelligence.flags.length > 0 ? `, ${intelligence.flags.length} flag(s)` : ''}`, io)
    } catch (e) {
      await invoiceScannerService.updateScanStage(scan, 'correct', 'warning', 'Partial intelligence', io)
    }

    // Save corrected data
    scan.extractedData = {
      vendorName: parsed.vendorName,
      gstin: parsed.gstin,
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate,
      subtotal: parsed.subtotal,
      taxAmount: parsed.taxAmount,
      totalAmount: parsed.totalAmount,
      lineItems: parsed.lineItems,
      rawLineCount: parsed.rawLineCount,
    }
    scan.confidence = parsed.confidence
    scan.avgConfidence = parsed.avgConfidence || 0
    scan.fieldConfidence = parsed.fieldConfidence

    // ── Validate ────────────────────────────────────────
    await invoiceScannerService.updateScanStage(scan, 'validate', 'active', 'Validating...', io)
    const validation = await invoiceValidationService.validate(parsed, req.user.companyId, { autoResolutions })

    scan.validationErrors = validation.errors
    scan.validationWarnings = validation.warnings
    await invoiceScannerService.updateScanStage(scan, 'validate',
      validation.errors.length > 0 ? 'error' : validation.warnings.length > 0 ? 'warning' : 'success',
      validation.errors.length > 0 ? `${validation.errors.length} error(s)` : 'Validated', io)

    scan.status = 'validated'
    await scan.save()

    parsed.extractedText = rawText
    res.json({
      success: true,
      data: {
        ...parsed,
        validation,
        scanId: scan._id,
        // OCR intelligence data
        ocrCorrections: scan.ocrCorrections,
        financialFlags: scan.financialFlags,
        financiallyConsistent: scan.financiallyConsistent,
        duplicates: scan.duplicates,
        vendorHints: scan.vendorHints,
        confidenceBreakdown: scan.confidenceBreakdown,
        dateSystemInferred,
        dateSource,
        lineItemReconstructionMeta: scan.lineItemReconstructionMeta,
        tableReconstructionMeta,
        autoResolutions,
        ocrMeta,
      },
    })
  }),

  /**
   * POST /process — Full pipeline: parse → validate → create invoice → inventory → ledger → blockchain.
   * Accepts user-corrected fields in parsedOverrides.
   */
  process: asyncHandler(async (req, res) => {
    const io = req.app.get('io')
    const rawText = await resolveText(req)
    const customer = req.body.customer
    const store = req.body.store

    if (!customer || !store) {
      const err = new Error('customer and store are required')
      err.statusCode = 400
      throw err
    }

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
        scanId: req.body.scanId,
        io,
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
   * GET /list — List scan history with stats.
   */
  list: asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const status = req.query.status || undefined
    const result = await invoiceScannerService.listScanned(req.user.companyId, { page, limit, status })
    res.json({ success: true, data: result })
  }),

  /**
   * GET /scan/:scanId — Get single scan record.
   */
  getScan: asyncHandler(async (req, res) => {
    const scan = await invoiceScannerService.getScan(req.user.companyId, req.params.scanId)
    res.json({ success: true, data: scan })
  }),

  /**
   * POST /retry/:scanId — Retry a failed scan.
   */
  retry: asyncHandler(async (req, res) => {
    const io = req.app.get('io')
    let parsedOverrides = null
    if (req.body.parsedOverrides) {
      parsedOverrides = typeof req.body.parsedOverrides === 'string'
        ? JSON.parse(req.body.parsedOverrides)
        : req.body.parsedOverrides
    }

    const result = await invoiceScannerService.retryScan(
      req.user.companyId,
      req.params.scanId,
      {
        parsedOverrides,
        customer: req.body.customer,
        store: req.body.store,
        createdBy: req.user._id,
        io,
      },
    )

    const status = result.validation?.valid === false ? 422 : 201
    res.status(status).json({ success: result.validation?.valid !== false, data: result })
  }),

  /**
   * POST /reject/:scanId — Reject a scan.
   */
  reject: asyncHandler(async (req, res) => {
    const scan = await invoiceScannerService.rejectScan(
      req.user.companyId,
      req.params.scanId,
      { reason: req.body.reason, rejectedBy: req.user._id },
    )
    res.json({ success: true, data: scan })
  }),

  /**
   * POST /validate — Validate fields without processing (standalone validation).
   */
  validate: asyncHandler(async (req, res) => {
    const parsed = req.body
    const validation = await invoiceValidationService.validate(parsed, req.user.companyId)
    res.json({ success: true, data: validation })
  }),

  /**
   * POST /ocr/preprocess — Preprocess an image file and return enhanced OCR text.
   * Multi-pass OCR with deskew, denoise, contrast normalization.
   */
  preprocess: asyncHandler(async (req, res) => {
    if (!req.file) {
      const err = new Error('Upload an image file for preprocessing')
      err.statusCode = 400
      throw err
    }
    const preprocessSvc = await getPreprocessService()
    if (!preprocessSvc) {
      const err = new Error('Image preprocessing not available (sharp not installed)')
      err.statusCode = 500
      throw err
    }
    const result = await preprocessSvc.multiPassOCR(req.file.buffer)
    res.json({ success: true, data: result })
  }),

  /**
   * POST /ocr/parse — Parse raw OCR text into structured fields (no DB, no validation).
   */
  ocrParse: asyncHandler(async (req, res) => {
    const rawText = req.body.rawText || ''
    if (!rawText.trim()) {
      const err = new Error('rawText is required')
      err.statusCode = 400
      throw err
    }
    const parsed = invoiceScannerService.parseOCRText(rawText)
    res.json({ success: true, data: parsed })
  }),

  /**
   * POST /ocr/validate — Validate + check financial consistency (no DB writes).
   */
  ocrValidate: asyncHandler(async (req, res) => {
    const parsed = req.body
    const [validation, intelligence] = await Promise.all([
      invoiceValidationService.validate(parsed, req.user.companyId),
      ocrIntelligenceService.correctAndValidate(parsed, '', req.user.companyId),
    ])
    res.json({
      success: true,
      data: {
        validation,
        corrections: intelligence.corrections,
        flags: intelligence.flags,
        duplicates: intelligence.duplicates,
        consistent: intelligence.consistent,
      },
    })
  }),

  /**
   * POST /ocr/correct — Run intelligence correction layers on parsed data.
   * Returns corrected data + all corrections applied.
   */
  ocrCorrect: asyncHandler(async (req, res) => {
    const { parsed, rawText } = req.body
    if (!parsed) {
      const err = new Error('parsed data is required')
      err.statusCode = 400
      throw err
    }
    const intelligence = await ocrIntelligenceService.correctAndValidate(parsed, rawText || '', req.user.companyId)
    const scoring = confidenceScoringService.score(intelligence.corrected, {
      financialConsistent: intelligence.consistent,
    })
    res.json({
      success: true,
      data: {
        corrected: intelligence.corrected,
        corrections: intelligence.corrections,
        flags: intelligence.flags,
        duplicates: intelligence.duplicates,
        consistent: intelligence.consistent,
        confidence: scoring,
      },
    })
  }),

  /**
   * POST /corrections — Record a user correction (for learning).
   */
  recordCorrection: asyncHandler(async (req, res) => {
    const { scanId, vendorName, field, originalValue, correctedValue } = req.body
    if (!field) {
      const err = new Error('field is required')
      err.statusCode = 400
      throw err
    }
    await vendorLearningService.recordCorrection(req.user.companyId, {
      scanId, vendorName, field, originalValue, correctedValue, correctedBy: req.user._id,
    })
    res.json({ success: true })
  }),

  /**
   * GET /templates — List vendor templates (learned patterns).
   */
  listTemplates: asyncHandler(async (req, res) => {
    const templates = await vendorLearningService.listTemplates(req.user.companyId)
    res.json({ success: true, data: templates })
  }),
}
