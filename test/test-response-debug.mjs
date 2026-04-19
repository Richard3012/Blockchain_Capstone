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
  console.log('Login:', loginRes.status)

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
  // Print top-level keys
  console.log('Top keys:', Object.keys(scanData))
  if (scanData.data) console.log('Data keys:', Object.keys(scanData.data))
  // Print full response (limited)
  console.log(JSON.stringify(scanData, null, 2).substring(0, 3000))
}

test().catch((e) => console.error(e))
