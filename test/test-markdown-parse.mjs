import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

async function test() {
  // Login
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@blockerp.local', password: 'ChangeMe123!' }),
  })
  const loginData = await loginRes.json()
  const token = loginData.data?.token || loginData.token
  console.log('Login:', loginRes.status)

  // Upload invoice
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
  const d = scanData.data || scanData
  console.log('Status:', scanRes.status)
  console.log('Variant:', d.ocrVariant)
  console.log('vendorName:', d.extractedData?.vendorName)
  console.log('gstin:', d.extractedData?.gstin)
  console.log('invoiceNumber:', d.extractedData?.invoiceNumber)
  console.log('invoiceDate:', d.extractedData?.invoiceDate)
  console.log('totalAmount:', d.extractedData?.totalAmount)
  console.log('subtotal:', d.extractedData?.subtotal)
  console.log('taxAmount:', d.extractedData?.taxAmount)
  console.log('lineItemCount:', d.extractedData?.lineItems?.length || 0)
  if (d.extractedData?.lineItems) {
    for (const item of d.extractedData.lineItems) {
      console.log(`  - ${(item.description || '').substring(0, 45)} | qty:${item.quantity} | price:${item.unitPrice} | amt:${item.amount}`)
    }
  }
  console.log('confidence:', d.extractedData?.avgConfidence)
  console.log('fieldConfidence:', JSON.stringify(d.extractedData?.fieldConfidence, null, 2))
}

test().catch((e) => console.error(e))
