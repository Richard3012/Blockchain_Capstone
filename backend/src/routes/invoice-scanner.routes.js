import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middlewares/auth.js'
import { invoiceScannerController } from '../controllers/invoice-scanner.controller.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'text/plain',
      'text/csv',
    ]
    if (allowed.includes(file.mimetype)) return cb(null, true)
    cb(new Error(`Unsupported file type: ${file.mimetype}`))
  },
})

const router = Router()

// Parse/preview — extract + correct + validate without persisting to ERP
router.post('/parse', requireAuth, upload.single('file'), invoiceScannerController.parse)

// Full pipeline — parse + correct + validate + create invoice + inventory + ledger + blockchain
router.post('/process', requireAuth, upload.single('file'), invoiceScannerController.process)

// Standalone validation — validate fields without processing
router.post('/validate', requireAuth, invoiceScannerController.validate)

// ── OCR Intelligence API (non-breaking additions) ─────────
// Preprocess image file with multi-pass OCR
router.post('/ocr/preprocess', requireAuth, upload.single('file'), invoiceScannerController.preprocess)

// Parse raw OCR text into structured fields (no DB, no validation)
router.post('/ocr/parse', requireAuth, invoiceScannerController.ocrParse)

// Validate + financial consistency check (no DB writes)
router.post('/ocr/validate', requireAuth, invoiceScannerController.ocrValidate)

// Run intelligence correction layers
router.post('/ocr/correct', requireAuth, invoiceScannerController.ocrCorrect)

// Record user correction (learning layer)
router.post('/corrections', requireAuth, invoiceScannerController.recordCorrection)

// List vendor templates (learned patterns)
router.get('/templates', requireAuth, invoiceScannerController.listTemplates)

// List scan history with stats
router.get('/list', requireAuth, invoiceScannerController.list)

// Get single scan record
router.get('/scan/:scanId', requireAuth, invoiceScannerController.getScan)

// Retry a failed scan
router.post('/retry/:scanId', requireAuth, invoiceScannerController.retry)

// Reject a scan
router.post('/reject/:scanId', requireAuth, invoiceScannerController.reject)

// Blockchain verification for a specific invoice
router.get('/verify/:invoiceId', requireAuth, invoiceScannerController.verify)

export default router
