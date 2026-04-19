import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

async function test() {
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@blockerp.local', password: 'ChangeMe123!' }),
  })
  const loginData = await loginRes.json()
  const token = loginData.data?.token || loginData.token

  const filePath = path.join(ROOT, 'sample-invoice.pdf')
  const fileBuffer = fs.readFileSync(filePath)
  const boundary = '----FormBoundary' + Date.now()
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample-invoice.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const scanRes = await fetch('http://localhost:4000/api/invoice-scanner/parse', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
    },
    body: body,
  })
  const scanData = await scanRes.json()
  const d = scanData.data

  // Check blocker-related fields
  console.log('=== BLOCKER DIAGNOSIS ===')
  console.log('validation:', JSON.stringify(d.validation, null, 2))
  console.log('financiallyConsistent:', d.financiallyConsistent)
  console.log('financialFlags:', JSON.stringify(d.financialFlags, null, 2))
  console.log('autoResolutions:', JSON.stringify(d.autoResolutions, null, 2))
  console.log('duplicates:', JSON.stringify(d.duplicates, null, 2))
  console.log('confidence:', d.confidence)
  console.log('avgConfidence:', d.avgConfidence)
  console.log('fieldConfidence:', JSON.stringify(d.fieldConfidence, null, 2))

  // Simulate frontend blocker checks
  const fields = d
  const fieldConf = d.fieldConfidence || {}
  const autoResolutions = d.autoResolutions || {}
  const validation = d.validation || {}
  const ocrDuplicates = d.duplicates || []
  const lineItems = d.lineItems || []
  const financiallyConsistent = d.financiallyConsistent
  const financialFlags = d.financialFlags || []
  const CONFIDENCE_HARD_BLOCK = 0.5

  const hasValidationErrors = (validation?.errors || []).filter((e) => {
    if (e.field === 'vendorName' && autoResolutions.vendorName?.resolved && fields.vendorName) return false
    if (e.field === 'totalAmount' && autoResolutions.financials?.resolved && fields.totalAmount > 0) return false
    if (e.field === 'gstin' && autoResolutions.gstin?.resolved && fields.gstin) return false
    if (e.field === 'invoiceDate' && autoResolutions.invoiceDate?.resolved && fields.invoiceDate) return false
    if (e.field === 'lineItems' && autoResolutions.lineItems?.resolved) return false
    if (e.field === 'confidence') {
      const confFields = (e.message || '').match(/vendorName|invoiceNumber|totalAmount|gstin/g) || []
      const unresolvedConf = confFields.filter((f) => !fieldConf[f]?.autoResolved)
      return unresolvedConf.length > 0
    }
    return true
  }).length > 0

  const hasLowConfidenceCritical = Object.entries(fieldConf)
    .some(([key, val]) => ['vendorName', 'invoiceNumber', 'totalAmount', 'gstin'].includes(key)
      && val.confidence < CONFIDENCE_HARD_BLOCK && !val.autoResolved)

  const missingFieldNames = []
  if (!fields.vendorName && !autoResolutions.vendorName?.resolved) missingFieldNames.push('vendor name')
  if ((!fields.totalAmount || fields.totalAmount <= 0) && !autoResolutions.financials?.resolved) missingFieldNames.push('total amount')
  const missingRequiredFields = missingFieldNames.length > 0

  const missingGSTIN = !fields.gstin && !autoResolutions.gstin?.resolved
  const missingDate = !fields.invoiceDate && !autoResolutions.invoiceDate?.resolved
  const hasExactDuplicate = ocrDuplicates.some((d) => d.type === 'exact')
  const hasInvalidLineItems = lineItems.some((it) => (it.quantity <= 0 || it.unitPrice <= 0) && it.amount > 0) && !autoResolutions.lineItems?.resolved
  const hasFinancialInconsistency = !financiallyConsistent && financialFlags.some((f) => f.severity === 'error') && !autoResolutions.financials?.resolved

  const postingBlockers = []
  if (hasValidationErrors) postingBlockers.push('Validation errors must be resolved')
  if (hasLowConfidenceCritical) postingBlockers.push('Critical fields have very low AI confidence')
  if (missingRequiredFields) postingBlockers.push(`Required fields missing: ${missingFieldNames.join(', ')}`)
  if (missingGSTIN) postingBlockers.push('GSTIN is required')
  if (missingDate) postingBlockers.push('Invoice date is required')
  if (hasExactDuplicate) postingBlockers.push('Exact duplicate')
  if (hasInvalidLineItems) postingBlockers.push('Invalid line items')
  if (hasFinancialInconsistency) postingBlockers.push('Financial inconsistency')

  console.log('\n=== SIMULATED BLOCKERS ===')
  console.log('Blockers:', postingBlockers.length, postingBlockers)
  console.log('Can post:', postingBlockers.length === 0)
}

test().catch((e) => console.error(e))
