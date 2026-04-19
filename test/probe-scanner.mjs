// Test the Smart Invoice Scanner end-to-end against running backend.
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE || 'http://localhost:4000'

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@blockerp.local', password: 'ChangeMe123!' }),
}).then((r) => r.json())
if (!login?.data?.token) { console.error('Login failed:', login); process.exit(1) }
const token = login.data.token
console.log('✓ logged in')

const filePath = path.join(__dirname, 'sample-invoice.png')
const buf = await fs.readFile(filePath)
console.log(`✓ loaded ${filePath} (${buf.length} bytes)`)

const fd = new FormData()
fd.append('file', new Blob([buf], { type: 'image/png' }), 'sample-invoice.png')

const t0 = Date.now()
const res = await fetch(`${BASE}/api/invoice-scanner/parse`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: fd,
})
const ms = Date.now() - t0
const body = await res.json()
console.log(`\n--- /invoice-scanner/parse → ${res.status} in ${ms}ms ---\n`)
console.log(JSON.stringify(body, null, 2))
