import { Invoice } from '../models/invoice.model.js'
import { GSTReturn } from '../models/gst-return.model.js'
import { HSNCode } from '../models/hsn-code.model.js'
import { auditService } from './audit.service.js'
import { blockchainService } from './blockchain.service.js'
import { hashRecord } from '../utils/hash-record.js'
import { logger } from '../utils/logger.js'

/* ─── GST State Codes ──────────────────────────────────────────────── */

const GST_STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

/* ─── Default HSN rate table (used when DB is empty) ───────────────── */

const DEFAULT_HSN_DATA = [
  { code: '0401', description: 'Milk and cream, not concentrated', gstRate: 5, category: 'Dairy' },
  { code: '1006', description: 'Rice', gstRate: 5, category: 'Food grains' },
  { code: '1905', description: 'Bread, pastry, cakes, biscuits', gstRate: 18, category: 'Food preparations' },
  { code: '2201', description: 'Mineral water', gstRate: 18, category: 'Beverages' },
  { code: '2202', description: 'Aerated water and sweetened beverages', gstRate: 28, category: 'Beverages' },
  { code: '3004', description: 'Medicaments (excluding items of heading 3002, 3005 or 3006)', gstRate: 12, category: 'Pharma' },
  { code: '3926', description: 'Articles of plastics', gstRate: 18, category: 'Plastics' },
  { code: '4202', description: 'Suitcases, handbags, wallets', gstRate: 18, category: 'Leather goods' },
  { code: '6109', description: 'T-shirts, singlets, tank tops (knitted)', gstRate: 5, category: 'Textiles' },
  { code: '6205', description: 'Men\'s shirts (woven)', gstRate: 12, category: 'Textiles' },
  { code: '7113', description: 'Articles of jewellery (precious metals)', gstRate: 3, category: 'Precious metals' },
  { code: '8471', description: 'Computers and peripherals', gstRate: 18, category: 'Electronics' },
  { code: '8517', description: 'Telephones, smartphones', gstRate: 18, category: 'Electronics' },
  { code: '8528', description: 'Monitors, projectors, TVs', gstRate: 28, category: 'Electronics' },
  { code: '9403', description: 'Furniture and parts thereof', gstRate: 18, category: 'Furniture' },
  { code: '8504', description: 'Electrical transformers, converters', gstRate: 18, category: 'Electrical' },
  { code: '8541', description: 'Semiconductor devices, LEDs', gstRate: 18, category: 'Electronics' },
  { code: '3304', description: 'Beauty/make-up preparations', gstRate: 28, category: 'Cosmetics' },
  { code: '8703', description: 'Motor cars and vehicles', gstRate: 28, category: 'Automobiles' },
  { code: '2106', description: 'Food preparations not elsewhere specified', gstRate: 18, category: 'Food preparations' },
  { code: '4901', description: 'Printed books, newspapers', gstRate: 0, category: 'Publishing' },
  { code: '0713', description: 'Dried leguminous vegetables (pulses)', gstRate: 0, category: 'Food grains' },
  { code: '1001', description: 'Wheat and meslin', gstRate: 0, category: 'Food grains' },
  { code: '0805', description: 'Citrus fruits, fresh or dried', gstRate: 0, category: 'Fruits' },
  { code: '9018', description: 'Medical/surgical instruments', gstRate: 12, category: 'Medical' },
]

/* ─── GSTIN validation ─────────────────────────────────────────────── */

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function validateGSTIN(gstin) {
  if (!gstin || gstin.length !== 15) return { valid: false, message: 'GSTIN must be 15 characters' }
  const upper = gstin.toUpperCase()
  if (!GSTIN_RE.test(upper)) return { valid: false, message: 'Invalid GSTIN format' }
  let p = 36
  for (let i = 0; i < 14; i++) {
    const idx = GSTIN_CHARS.indexOf(upper[i])
    if (idx < 0) return { valid: false, message: 'Invalid characters in GSTIN' }
    let a = (idx + p) % 36
    if (a === 0) a = 36
    p = (a * 2) % 37
  }
  const expected = GSTIN_CHARS[(36 + 1 - p) % 36]
  if (upper[14] !== expected) return { valid: false, message: 'GSTIN checksum mismatch' }
  return { valid: true, stateCode: upper.substring(0, 2), stateName: GST_STATE_CODES[upper.substring(0, 2)] || 'Unknown' }
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function parsePeriod(period) {
  const year = parseInt(period.substring(0, 4), 10)
  const month = parseInt(period.substring(4, 6), 10)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)
  return { year, month, startDate, endDate }
}

function computeTaxBreakdown(invoices) {
  let totalTaxableValue = 0
  let totalCGST = 0
  let totalSGST = 0
  let totalIGST = 0
  let totalCess = 0
  let totalTax = 0

  for (const inv of invoices) {
    const taxable = inv.subtotal || (inv.totalAmount - (inv.taxAmount || 0)) || 0
    const tax = inv.taxAmount || 0
    totalTaxableValue += taxable
    totalTax += tax

    // If invoice has IGST metadata, use it; otherwise split 50/50 CGST/SGST
    if (inv.metadata?.igst > 0) {
      totalIGST += inv.metadata.igst
      totalCess += inv.metadata.cess || 0
    } else if (inv.metadata?.cgst > 0 || inv.metadata?.sgst > 0) {
      totalCGST += inv.metadata.cgst || 0
      totalSGST += inv.metadata.sgst || 0
      totalCess += inv.metadata.cess || 0
    } else {
      // Default: split tax evenly as CGST+SGST (intra-state)
      totalCGST += tax / 2
      totalSGST += tax / 2
    }
  }

  return {
    totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
    totalCGST: Math.round(totalCGST * 100) / 100,
    totalSGST: Math.round(totalSGST * 100) / 100,
    totalIGST: Math.round(totalIGST * 100) / 100,
    totalCess: Math.round(totalCess * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
  }
}

function validateReturnData(summary) {
  const errors = []
  const warnings = []

  if (summary.invoiceCount === 0) {
    warnings.push({ field: 'invoices', message: 'No invoices found for this period' })
  }
  if (summary.totalTax < 0) {
    errors.push({ field: 'totalTax', message: 'Total tax cannot be negative' })
  }
  if (summary.totalTaxableValue > 0 && summary.totalTax === 0) {
    warnings.push({ field: 'totalTax', message: 'Taxable value exists but no tax computed — verify invoices have tax amounts' })
  }
  const effectiveRate = summary.totalTaxableValue > 0
    ? (summary.totalTax / summary.totalTaxableValue) * 100
    : 0
  if (effectiveRate > 30) {
    warnings.push({ field: 'taxRate', message: `Effective tax rate is unusually high at ${effectiveRate.toFixed(1)}%` })
  }

  return { errors, warnings, valid: errors.length === 0 }
}

/* ─── Service ──────────────────────────────────────────────────────── */

export const gstService = {
  getStateCodes() {
    return GST_STATE_CODES
  },

  validateGSTIN(gstin) {
    return validateGSTIN(gstin)
  },

  /* ── HSN Code management ─────────────────────── */

  async seedHSNCodes() {
    const count = await HSNCode.countDocuments()
    if (count === 0) {
      const docs = DEFAULT_HSN_DATA.map((h) => ({
        ...h,
        cgstRate: h.gstRate / 2,
        sgstRate: h.gstRate / 2,
        igstRate: h.gstRate,
      }))
      await HSNCode.insertMany(docs)
      logger.info('gst.hsn_seeded', { count: docs.length })
    }
  },

  async searchHSN(query) {
    if (!query || query.length < 2) return []

    // Seed if empty
    await this.seedHSNCodes()

    const isNumeric = /^\d+$/.test(query)
    let results

    if (isNumeric) {
      results = await HSNCode.find({
        code: { $regex: `^${query}`, $options: 'i' },
        isActive: true,
      }).limit(20).lean()
    } else {
      results = await HSNCode.find({
        $text: { $search: query },
        isActive: true,
      }).limit(20).lean()

      // Fallback to regex if text search returns nothing
      if (results.length === 0) {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        results = await HSNCode.find({
          description: { $regex: escaped, $options: 'i' },
          isActive: true,
        }).limit(20).lean()
      }
    }

    return results.map((h) => ({
      code: h.code,
      description: h.description,
      rate: h.gstRate,
      cgstRate: h.cgstRate,
      sgstRate: h.sgstRate,
      igstRate: h.igstRate,
      cessRate: h.cessRate || 0,
      category: h.category || '',
    }))
  },

  getHSNRate(hsnCode) {
    const prefix = hsnCode?.substring(0, 4)
    const entry = DEFAULT_HSN_DATA.find((h) => h.code === prefix)
    return entry?.gstRate ?? 18
  },

  /* ── Summary (aggregated from invoices) ──────── */

  async getSummary(companyId, period) {
    const { startDate, endDate } = parsePeriod(period)

    const invoices = await Invoice.find({
      companyId,
      issueDate: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' },
    }).lean()

    const breakdown = computeTaxBreakdown(invoices)
    const validation = validateReturnData({ ...breakdown, invoiceCount: invoices.length })

    // Check if return already filed for this period
    const filedReturn = await GSTReturn.findOne({
      companyId,
      returnType: 'GSTR1',
      period,
      status: { $in: ['filed', 'accepted'] },
    }).lean()

    return {
      period,
      invoiceCount: invoices.length,
      ...breakdown,
      validation,
      periodLocked: !!filedReturn,
      filedReturnId: filedReturn?._id || null,
    }
  },

  /* ── GSTR-1 generation ───────────────────────── */

  async generateGSTR1(companyId, period) {
    const { startDate, endDate } = parsePeriod(period)

    const invoices = await Invoice.find({
      companyId,
      status: { $in: ['issued', 'paid'] },
      issueDate: { $gte: startDate, $lte: endDate },
    }).populate('customer').lean()

    const breakdown = computeTaxBreakdown(invoices)
    const validation = validateReturnData({ ...breakdown, invoiceCount: invoices.length })

    // Check if already filed
    const existing = await GSTReturn.findOne({
      companyId,
      returnType: 'GSTR1',
      period,
      status: { $in: ['filed', 'accepted'] },
    }).lean()

    return {
      period,
      invoiceCount: invoices.length,
      ...breakdown,
      validation,
      periodLocked: !!existing,
      filedReturnId: existing?._id || null,
      invoices: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer?.name || inv.vendorName || 'Unknown',
        gstin: inv.gstin || inv.customer?.gstin || '',
        taxableValue: inv.subtotal || (inv.totalAmount - (inv.taxAmount || 0)) || 0,
        taxAmount: inv.taxAmount || 0,
        totalAmount: inv.totalAmount || 0,
        date: inv.issueDate,
        status: inv.status,
      })),
    }
  },

  /* ── GSTR-3B generation ──────────────────────── */

  async generateGSTR3B(companyId, period) {
    const { startDate, endDate } = parsePeriod(period)

    // Outward supplies (sales invoices)
    const salesInvoices = await Invoice.find({
      companyId,
      status: { $in: ['issued', 'paid'] },
      issueDate: { $gte: startDate, $lte: endDate },
      source: { $ne: 'scanner' },
    }).lean()

    // Inward supplies (purchase invoices from scanner)
    const purchaseInvoices = await Invoice.find({
      companyId,
      issueDate: { $gte: startDate, $lte: endDate },
      source: 'scanner',
    }).lean()

    const outward = computeTaxBreakdown(salesInvoices)
    const inward = computeTaxBreakdown(purchaseInvoices)

    const netCGST = Math.max(0, outward.totalCGST - inward.totalCGST)
    const netSGST = Math.max(0, outward.totalSGST - inward.totalSGST)
    const netIGST = Math.max(0, outward.totalIGST - inward.totalIGST)
    const netCess = Math.max(0, outward.totalCess - inward.totalCess)

    return {
      period,
      outwardSupplies: {
        invoiceCount: salesInvoices.length,
        ...outward,
      },
      inwardSupplies: {
        invoiceCount: purchaseInvoices.length,
        ...inward,
      },
      itcAvailable: {
        totalCGST: inward.totalCGST,
        totalSGST: inward.totalSGST,
        totalIGST: inward.totalIGST,
        totalCess: inward.totalCess,
      },
      netTaxPayable: {
        cgst: Math.round(netCGST * 100) / 100,
        sgst: Math.round(netSGST * 100) / 100,
        igst: Math.round(netIGST * 100) / 100,
        cess: Math.round(netCess * 100) / 100,
        total: Math.round((netCGST + netSGST + netIGST + netCess) * 100) / 100,
      },
    }
  },

  /* ── File return ─────────────────────────────── */

  async fileReturn(companyId, returnType, period, userId, io) {
    // Check if already filed
    const existing = await GSTReturn.findOne({
      companyId,
      returnType,
      period,
      status: { $in: ['filed', 'accepted'] },
    }).lean()

    if (existing) {
      const err = new Error(`${returnType} for period ${period} is already filed`)
      err.statusCode = 409
      throw err
    }

    // Generate data based on return type
    let data
    if (returnType === 'GSTR3B') {
      data = await this.generateGSTR3B(companyId, period)
    } else {
      data = await this.generateGSTR1(companyId, period)
    }

    const validation = validateReturnData({
      ...data,
      invoiceCount: data.invoiceCount || data.outwardSupplies?.invoiceCount || 0,
    })

    if (!validation.valid) {
      const err = new Error('Return has validation errors that must be resolved before filing')
      err.statusCode = 422
      err.details = validation.errors
      throw err
    }

    const taxValues = returnType === 'GSTR3B'
      ? {
        totalTaxableValue: data.outwardSupplies.totalTaxableValue,
        totalCGST: data.netTaxPayable.cgst,
        totalSGST: data.netTaxPayable.sgst,
        totalIGST: data.netTaxPayable.igst,
        totalCess: data.netTaxPayable.cess,
        invoiceCount: data.outwardSupplies.invoiceCount + data.inwardSupplies.invoiceCount,
      }
      : {
        totalTaxableValue: data.totalTaxableValue,
        totalCGST: data.totalCGST,
        totalSGST: data.totalSGST,
        totalIGST: data.totalIGST,
        totalCess: data.totalCess,
        invoiceCount: data.invoiceCount,
      }

    // Anchor on blockchain
    let blockchainTxHash = null
    let blockchainRecordId = null
    try {
      const recordHash = hashRecord({
        companyId: companyId.toString(),
        returnType,
        period,
        ...taxValues,
        filingDate: new Date().toISOString(),
      })

      const bcRecord = await blockchainService.anchorRecord({
        companyId,
        entityType: 'gst_return',
        entityId: `${returnType}-${period}`,
        recordHash,
        ipfsCid: '',
        requestedBy: userId,
      })

      blockchainTxHash = bcRecord?.txHash || null
      blockchainRecordId = bcRecord?._id || null
    } catch (e) {
      logger.warn('gst.blockchain_anchor_failed', { returnType, period, error: e.message })
    }

    const gstReturn = await GSTReturn.findOneAndUpdate(
      { companyId, returnType, period },
      {
        companyId,
        returnType,
        period,
        filingDate: new Date(),
        status: 'filed',
        ...taxValues,
        data,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        periodLocked: true,
        blockchainTxHash,
        blockchainRecordId,
        filedBy: userId,
        createdBy: userId,
        $inc: { version: 1 },
      },
      { new: true, upsert: true },
    )

    // Audit log
    await auditService.record({
      companyId,
      action: 'gst_return_filed',
      entityType: 'gst_return',
      entityId: gstReturn._id.toString(),
      summary: `${returnType} filed for period ${period} — Tax: ₹${(taxValues.totalCGST + taxValues.totalSGST + taxValues.totalIGST).toFixed(2)}`,
      actor: userId,
      metadata: { returnType, period, ...taxValues, blockchainTxHash },
    })

    // Socket.IO event
    if (io) {
      io.emit('gst:return-filed', {
        returnType,
        period,
        status: 'filed',
        totalTax: taxValues.totalCGST + taxValues.totalSGST + taxValues.totalIGST,
        blockchainTxHash,
      })
    }

    logger.info('gst.return_filed', {
      companyId: companyId.toString(),
      returnType,
      period,
      invoiceCount: taxValues.invoiceCount,
      blockchainTxHash,
    })

    return gstReturn
  },

  /* ── Get filed returns ───────────────────────── */

  async getReturns(companyId, financialYear) {
    const filter = { companyId }
    if (financialYear) {
      filter.period = { $regex: `^${financialYear}` }
    }
    return GSTReturn.find(filter).sort({ period: -1 }).populate('filedBy', 'name email').lean()
  },

  /* ── Get single return by id ─────────────────── */

  async getReturnById(companyId, returnId) {
    const ret = await GSTReturn.findOne({ _id: returnId, companyId })
      .populate('filedBy', 'name email')
      .lean()
    if (!ret) {
      const err = new Error('GST return not found')
      err.statusCode = 404
      throw err
    }
    return ret
  },

  /* ── Dashboard stats ─────────────────────────── */

  async getStats(companyId) {
    const now = new Date()
    const currentPeriod = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

    // Find the latest period that has invoices
    const latestInvoice = await Invoice.findOne(
      { companyId, status: { $ne: 'cancelled' } },
      { issueDate: 1 },
    ).sort({ issueDate: -1 }).lean()

    let latestInvoicePeriod = currentPeriod
    if (latestInvoice?.issueDate) {
      const d = new Date(latestInvoice.issueDate)
      latestInvoicePeriod = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    }

    const activePeriod = latestInvoicePeriod
    const [activeSummary, totalFiled, recentReturns] = await Promise.all([
      this.getSummary(companyId, activePeriod),
      GSTReturn.countDocuments({ companyId, status: { $in: ['filed', 'accepted'] } }),
      GSTReturn.find({ companyId }).sort({ filingDate: -1 }).limit(3).lean(),
    ])

    return {
      currentPeriod,
      latestInvoicePeriod,
      currentMonthTax: activeSummary.totalTax,
      currentMonthInvoices: activeSummary.invoiceCount,
      totalReturnsFiled: totalFiled,
      periodLocked: activeSummary.periodLocked,
      recentReturns: recentReturns.map((r) => ({
        returnType: r.returnType,
        period: r.period,
        status: r.status,
        totalTax: r.totalCGST + r.totalSGST + r.totalIGST,
        filingDate: r.filingDate,
      })),
    }
  },
}
