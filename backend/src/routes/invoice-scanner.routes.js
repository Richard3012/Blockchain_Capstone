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

// Parse/preview — extract + parse + validate without persisting
router.post('/parse', requireAuth, upload.single('file'), invoiceScannerController.parse)

// Full pipeline — parse + validate + create invoice + inventory + ledger + blockchain
router.post('/process', requireAuth, upload.single('file'), invoiceScannerController.process)

// List scanned invoices
router.get('/list', requireAuth, invoiceScannerController.list)

// Blockchain verification for a specific invoice
router.get('/verify/:invoiceId', requireAuth, invoiceScannerController.verify)

export default router
