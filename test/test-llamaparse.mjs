// Quick test: verify LlamaParse is tried first during invoice scan
import http from 'http'

async function test() {
  // 1. Login
  const loginRes = await new Promise((resolve, reject) => {
    const data = JSON.stringify({ email: 'admin@blockerp.local', password: 'ChangeMe123!' })
    const req = http.request({
      hostname: 'localhost', port: 4000, path: '/api/auth/login',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => resolve(JSON.parse(body)))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })

  const token = loginRes.data?.token
  if (!token) { console.error('Login failed'); process.exit(1) }
  console.log('Logged in OK')

  // 2. Upload sample-invoice.pdf if it exists, otherwise a blank image
  const fs = await import('fs')
  const path = await import('path')
  
  let fileBuffer, filename, mimetype
  const samplePdf = path.join(process.cwd(), 'sample-invoice.pdf')
  if (fs.existsSync(samplePdf)) {
    fileBuffer = fs.readFileSync(samplePdf)
    filename = 'sample-invoice.pdf'
    mimetype = 'application/pdf'
    console.log('Using sample-invoice.pdf (' + fileBuffer.length + ' bytes)')
  } else {
    // Create a simple test image
    const sharp = (await import('sharp')).default
    fileBuffer = await sharp({
      create: { width: 800, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } }
    }).png().toBuffer()
    filename = 'test.png'
    mimetype = 'image/png'
    console.log('Using blank test image')
  }

  // 3. Multipart upload
  const boundary = '----FormBoundary' + Date.now()
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`
  const body = Buffer.concat([Buffer.from(header), fileBuffer, Buffer.from(footer)])

  const scanRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 4000, path: '/api/invoice-scanner/parse',
      method: 'POST', headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Authorization': `Bearer ${token}`
      }
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })

  console.log('Status:', scanRes.status)
  console.log('OCR variant:', scanRes.body.data?.ocrMeta?.variant || 'unknown')
  console.log('OCR confidence:', scanRes.body.data?.ocrMeta?.ocrConfidence || 0)
  console.log('Text length:', (scanRes.body.data?.rawText || '').length)
  console.log('Vendor:', scanRes.body.data?.parsed?.vendorName || 'none')
  console.log('GSTIN:', scanRes.body.data?.parsed?.gstin || 'none')
  console.log('Total:', scanRes.body.data?.parsed?.totalAmount || 0)
  console.log('Confidence level:', scanRes.body.data?.parsed?.confidence || 'none')
  console.log('Avg confidence:', scanRes.body.data?.parsed?.avgConfidence || 0)
  
  // Check blocking issues
  const v = scanRes.body.data?.validation
  if (v) {
    console.log('\nValidation errors:', v.errors?.length || 0)
    console.log('Validation warnings:', v.warnings?.length || 0)
    if (v.errors?.length) {
      for (const e of v.errors) console.log('  ERROR:', e.field, '-', e.message)
    }
  }
}

test().catch(e => { console.error(e); process.exit(1) })
