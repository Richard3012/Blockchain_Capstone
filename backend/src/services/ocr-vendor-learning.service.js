/**
 * Vendor Learning & Template Layer
 * ─────────────────────────────────
 * Stores user corrections and vendor-specific invoice templates.
 * Same vendor → same invoice format → faster, more accurate parsing.
 *
 * Learning WITHOUT model change:
 *   - Store field positions/patterns per vendor
 *   - Store user corrections for re-use
 *   - Apply vendor template as hints during parsing
 */

import mongoose from 'mongoose'
import { baseSchemaOptions } from '../models/base-options.js'
import { logger } from '../utils/logger.js'

/* ─── Vendor Template Schema ──────────────────────────────────── */

const vendorTemplateSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    vendorName: { type: String, required: true },
    gstin: { type: String },
    // Pattern hints learned from previous invoices
    patterns: {
      invoiceNumberPrefix: { type: String },   // e.g. "INV-", "GST/"
      dateFormat: { type: String },             // e.g. "DD/MM/YYYY", "DD-Mon-YYYY"
      typicalTaxRate: { type: Number },         // e.g. 18 for 18%
      typicalLineItemCount: { type: Number },
      hasGSTIN: { type: Boolean, default: true },
    },
    // Field corrections history (last N corrections per field)
    fieldCorrections: {
      vendorName: [{ original: String, corrected: String, count: { type: Number, default: 1 } }],
      gstin: [{ original: String, corrected: String, count: { type: Number, default: 1 } }],
      invoiceNumber: [{ original: String, corrected: String, count: { type: Number, default: 1 } }],
    },
    // Stats
    scanCount: { type: Number, default: 0 },
    lastScanAt: { type: Date },
    avgConfidence: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 }, // % of scans that posted successfully
  },
  baseSchemaOptions,
)

vendorTemplateSchema.index({ companyId: 1, vendorName: 1 })
vendorTemplateSchema.index({ companyId: 1, gstin: 1 })

export const VendorTemplate = mongoose.model('VendorTemplate', vendorTemplateSchema)

/* ─── User Correction Schema ─────────────────────────────────── */

const userCorrectionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    scanId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScannedInvoice' },
    vendorName: { type: String },
    field: { type: String, required: true },
    originalValue: { type: mongoose.Schema.Types.Mixed },
    correctedValue: { type: mongoose.Schema.Types.Mixed },
    correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions,
)

userCorrectionSchema.index({ companyId: 1, vendorName: 1, field: 1 })

export const UserCorrection = mongoose.model('UserCorrection', userCorrectionSchema)

/* ─── Service ─────────────────────────────────────────────────── */

export const vendorLearningService = {
  /**
   * Find a vendor template by name or GSTIN (fuzzy name match).
   */
  async findTemplate(companyId, { vendorName, gstin }) {
    if (gstin) {
      const byGstin = await VendorTemplate.findOne({ companyId, gstin }).lean()
      if (byGstin) return byGstin
    }
    if (vendorName) {
      // Exact match first
      const exact = await VendorTemplate.findOne({
        companyId,
        vendorName: { $regex: new RegExp(`^${escapeRegex(vendorName)}$`, 'i') },
      }).lean()
      if (exact) return exact
    }
    return null
  },

  /**
   * Apply a vendor template to parsed data as hints.
   * Fills in missing fields and adjusts confidence.
   */
  applyTemplate(parsed, template) {
    const hints = []
    if (!template) return { parsed, hints }

    // Hint: typical tax rate → validate current tax
    if (template.patterns?.typicalTaxRate && parsed.subtotal > 0 && parsed.taxAmount > 0) {
      const currentRate = (parsed.taxAmount / parsed.subtotal) * 100
      const expected = template.patterns.typicalTaxRate
      if (Math.abs(currentRate - expected) > 3) {
        hints.push({
          field: 'taxAmount',
          message: `This vendor typically charges ${expected}% tax, but current rate is ~${currentRate.toFixed(1)}%`,
          expectedRate: expected,
        })
      }
    }

    // Hint: invoice number prefix
    if (template.patterns?.invoiceNumberPrefix && parsed.invoiceNumber) {
      if (!parsed.invoiceNumber.startsWith(template.patterns.invoiceNumberPrefix)) {
        hints.push({
          field: 'invoiceNumber',
          message: `This vendor typically uses prefix "${template.patterns.invoiceNumberPrefix}"`,
        })
      }
    }

    // Apply most common corrections for vendor name
    if (template.fieldCorrections?.vendorName?.length > 0) {
      const corr = template.fieldCorrections.vendorName
        .sort((a, b) => b.count - a.count)[0]
      if (corr && parsed.vendorName === corr.original && corr.count >= 2) {
        hints.push({
          field: 'vendorName',
          message: `Auto-corrected from "${corr.original}" (previously corrected ${corr.count} times)`,
          autoApplied: true,
        })
        parsed.vendorName = corr.corrected
      }
    }

    // GSTIN from template if missing
    if (!parsed.gstin && template.gstin) {
      parsed.gstin = template.gstin
      hints.push({
        field: 'gstin',
        message: `Applied known GSTIN from vendor template`,
        autoApplied: true,
      })
    }

    return { parsed, hints }
  },

  /**
   * Record a user correction and update the vendor template.
   */
  async recordCorrection(companyId, { scanId, vendorName, field, originalValue, correctedValue, correctedBy }) {
    // Save individual correction
    await UserCorrection.create({
      companyId, scanId, vendorName, field, originalValue, correctedValue, correctedBy,
    })

    // Update or create vendor template
    if (vendorName) {
      let template = await VendorTemplate.findOne({
        companyId,
        vendorName: { $regex: new RegExp(`^${escapeRegex(vendorName)}$`, 'i') },
      })

      if (!template) {
        template = await VendorTemplate.create({
          companyId,
          vendorName,
          scanCount: 0,
        })
      }

      // Update field corrections
      const corrKey = `fieldCorrections.${field}`
      const existing = template.fieldCorrections?.[field] || []
      const match = existing.find((c) => c.original === String(originalValue))
      if (match) {
        match.corrected = String(correctedValue)
        match.count = (match.count || 0) + 1
      } else {
        existing.push({ original: String(originalValue), corrected: String(correctedValue), count: 1 })
        // Keep only last 10 corrections per field
        if (existing.length > 10) existing.shift()
      }
      template.fieldCorrections = template.fieldCorrections || {}
      template.fieldCorrections[field] = existing
      template.markModified('fieldCorrections')
      await template.save()
    }
  },

  /**
   * Update vendor template stats after a successful scan.
   */
  async recordScan(companyId, { vendorName, gstin, confidence, success, taxRate, lineItemCount, invoiceNumberPrefix }) {
    if (!vendorName) return

    let template = await VendorTemplate.findOne({
      companyId,
      vendorName: { $regex: new RegExp(`^${escapeRegex(vendorName)}$`, 'i') },
    })

    if (!template) {
      template = await VendorTemplate.create({
        companyId,
        vendorName,
        gstin: gstin || undefined,
        scanCount: 0,
      })
    }

    template.scanCount = (template.scanCount || 0) + 1
    template.lastScanAt = new Date()
    if (gstin && !template.gstin) template.gstin = gstin

    // Rolling average confidence
    const prevTotal = (template.avgConfidence || 0) * Math.max(template.scanCount - 1, 1)
    template.avgConfidence = (prevTotal + (confidence || 0)) / template.scanCount

    // Success rate
    if (success !== undefined) {
      const prevSuccessCount = Math.round((template.successRate || 0) * Math.max(template.scanCount - 1, 1) / 100)
      template.successRate = ((prevSuccessCount + (success ? 1 : 0)) / template.scanCount) * 100
    }

    // Update patterns
    template.patterns = template.patterns || {}
    if (taxRate > 0) template.patterns.typicalTaxRate = taxRate
    if (lineItemCount > 0) template.patterns.typicalLineItemCount = lineItemCount
    if (invoiceNumberPrefix) template.patterns.invoiceNumberPrefix = invoiceNumberPrefix

    await template.save()

    return template
  },

  /**
   * Get all vendor templates for a company.
   */
  async listTemplates(companyId) {
    return VendorTemplate.find({ companyId }).sort({ scanCount: -1 }).lean()
  },

  /**
   * Get recent corrections for a company.
   */
  async listCorrections(companyId, { limit = 50 } = {}) {
    return UserCorrection.find({ companyId }).sort({ createdAt: -1 }).limit(limit).lean()
  },
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
