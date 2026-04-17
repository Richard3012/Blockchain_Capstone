import mongoose from 'mongoose'

import { baseSchemaOptions } from './base-options.js'

const scanStageSchema = new mongoose.Schema(
  {
    stage: { type: String, enum: ['upload', 'preprocess', 'extract', 'correct', 'validate', 'map', 'post', 'blockchain'], required: true },
    status: { type: String, enum: ['pending', 'active', 'success', 'warning', 'error'], default: 'pending' },
    message: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { _id: false },
)

const ocrCorrectionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed },
    rule: { type: String },
  },
  { _id: false },
)

const scannedInvoiceSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    // Processing status
    status: {
      type: String,
      enum: ['pending', 'preprocessing', 'extracting', 'extracted', 'correcting', 'validating', 'validated', 'posting', 'processed', 'failed', 'rejected'],
      default: 'pending',
    },
    // Source info
    fileName: { type: String, trim: true },
    fileType: { type: String, trim: true },
    fileSize: { type: Number },
    inputMode: { type: String, enum: ['file', 'text'], default: 'file' },

    // ─── OCR Layer Data ────────────────────────────────
    // Raw OCR text (original from Tesseract)
    ocrRawText: { type: String },
    // Legacy alias
    rawText: { type: String },
    // OCR variant used (e.g. 'grayscale_normalized', 'threshold')
    ocrVariant: { type: String },
    // OCR engine confidence
    ocrConfidence: { type: Number },
    // All variant results summary
    ocrVariantResults: [{ variant: String, confidence: Number, textLength: Number }],
    // Pre-processing duration
    preprocessDurationMs: { type: Number },

    // ─── Parsed/Extracted Data ─────────────────────────
    // Data as first extracted by regex parser
    ocrParsedData: {
      vendorName: String,
      gstin: String,
      invoiceNumber: String,
      invoiceDate: String,
      subtotal: Number,
      taxAmount: Number,
      totalAmount: Number,
      lineItems: [
        {
          sno: Number,
          description: String,
          quantity: Number,
          unitPrice: Number,
          tax: Number,
          amount: Number,
        },
      ],
      rawLineCount: Number,
    },

    // Data after intelligence corrections (self-heal + financial consistency)
    extractedData: {
      vendorName: String,
      gstin: String,
      invoiceNumber: String,
      invoiceDate: String,
      subtotal: Number,
      taxAmount: Number,
      totalAmount: Number,
      lineItems: [
        {
          sno: Number,
          description: String,
          quantity: Number,
          unitPrice: Number,
          tax: Number,
          amount: Number,
        },
      ],
      rawLineCount: Number,
    },

    // ─── Correction/Intelligence Layer ─────────────────
    // All auto-corrections applied by the intelligence layer
    ocrCorrections: [ocrCorrectionSchema],
    // Financial consistency flags (errors/warnings that couldn't auto-fix)
    financialFlags: [{ field: String, severity: String, message: String }],
    // Whether financial consistency passed
    financiallyConsistent: { type: Boolean },

    // User-corrected fields
    correctedData: { type: mongoose.Schema.Types.Mixed },

    // ─── Confidence Scoring 2.0 ────────────────────────
    confidence: { type: String, enum: ['high', 'medium', 'low'] },
    avgConfidence: { type: Number, default: 0 },
    fieldConfidence: { type: mongoose.Schema.Types.Mixed },
    // Detailed breakdown per field
    confidenceBreakdown: { type: mongoose.Schema.Types.Mixed },

    // ─── Vendor Learning ───────────────────────────────
    vendorTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorTemplate' },
    vendorHints: [{ field: String, message: String, autoApplied: Boolean }],

    // ─── Duplicate Detection ───────────────────────────
    duplicates: [{
      type: { type: String },
      field: String,
      message: String,
      existingId: String,
      existingTotal: Number,
    }],

    // ─── Line Item Reconstruction Metadata ─────────────
    lineItemReconstructionMeta: {
      originalCount: { type: Number },
      finalCount: { type: Number },
      unrealisticValuesFixed: { type: Number },
      reconstructedFromText: { type: Boolean },
      allItemsValid: { type: Boolean },
    },

    // ─── Date Metadata ─────────────────────────────────
    dateSystemInferred: { type: Boolean, default: false },

    // ─── Validation Results ────────────────────────────
    validationErrors: [{ field: String, message: String, existingId: String }],
    validationWarnings: [{ field: String, message: String }],

    // Pipeline stages tracking
    pipelineStages: [scanStageSchema],

    // Result references
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    blockchainTxHash: { type: String },
    blockchainRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockchainRecord' },

    // Retry tracking
    retryCount: { type: Number, default: 0 },
    lastError: { type: String },
    parentScanId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScannedInvoice' },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    processedAt: { type: Date },
    processingDurationMs: { type: Number },
  },
  baseSchemaOptions,
)

scannedInvoiceSchema.index({ companyId: 1, status: 1 })
scannedInvoiceSchema.index({ companyId: 1, createdAt: -1 })
scannedInvoiceSchema.index({ companyId: 1, 'extractedData.invoiceNumber': 1 })

export const ScannedInvoice = mongoose.model('ScannedInvoice', scannedInvoiceSchema)
