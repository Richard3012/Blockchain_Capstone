// Per-file API smoke: scans every frontend source file (pages, services,
// hooks, components) for apiClient.<verb>('path'…) calls and verifies each
// endpoint resolves on the running backend (i.e. no 404 "Route not found").
//
// Usage: node test/smoke-frontend-pages.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://localhost:4000'
const EMAIL = process.env.EMAIL || 'admin@blockerp.local'
const PASS = process.env.PASS || 'ChangeMe123!'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = [
  path.join(ROOT, 'src', 'pages'),
  path.join(ROOT, 'src', 'services'),
  path.join(ROOT, 'src', 'hooks'),
  path.join(ROOT, 'src', 'components'),
]

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
}).then((r) => r.json())
const token = login?.data?.token
if (!token) { console.error('Login failed:', login); process.exit(1) }

const CALL_RE = /apiClient\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+?)\2/g

// Convert a raw apiClient path (literal or template) into a probe URL.
// `${...}` segments inside the route are replaced with a placeholder
// ObjectId. A `${...}` that begins an optional query string (preceded by
// `?` or `&`, or sitting outside any path segment) is dropped entirely.
const PLACEHOLDER = '000000000000000000000000'
const buildProbePath = (raw) => {
  // Drop any literal query string first.
  let p = raw.replace(/\?.*$/, '')
  // If the remainder starts a template expression that *is* the optional
  // query (the regex captured a partial template), trim everything from the
  // first `${`.
  const idx = p.indexOf('${')
  if (idx !== -1) {
    // Replace inline `${...}` segments embedded between slashes; if the
    // expression is at the tail (no closing brace captured because the
    // outer regex stopped at a quote inside the template), just truncate.
    const closing = p.indexOf('}', idx)
    if (closing === -1) p = p.slice(0, idx).replace(/[?&]$/, '')
    else p = p.replace(/\$\{[^}]+\}/g, PLACEHOLDER)
  }
  return p
}

const collectFromFile = (file) => {
  const src = readFileSync(file, 'utf8')
  const out = []
  let m
  while ((m = CALL_RE.exec(src))) {
    const [, verb, , raw] = m
    if (!raw.startsWith('/')) continue
    out.push({ verb: verb.toUpperCase(), raw, probe: buildProbePath(raw) })
  }
  return out
}

const walk = (dir) => {
  const entries = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) entries.push(...walk(full))
    else if (/\.(jsx?|mjs|ts|tsx)$/.test(name)) entries.push(full)
  }
  return entries
}

const allFiles = SCAN_DIRS.flatMap(walk)
const byFile = {}
for (const f of allFiles) {
  const calls = collectFromFile(f)
  if (calls.length) byFile[path.relative(ROOT, f).replace(/\\/g, '/')] = calls
}

const probe = async ({ verb, probe }) => {
  const url = `${BASE}/api${probe}`
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  const body = verb === 'GET' || verb === 'DELETE' ? undefined : '{}'
  try {
    const res = await fetch(url, { method: verb, headers, body })
    if (res.status === 404) {
      const text = await res.text().catch(() => '')
      const exists = !/route not found/i.test(text)
      return { ok: exists, status: res.status, msg: exists ? '' : 'Route not found' }
    }
    return { ok: true, status: res.status, msg: '' }
  } catch (e) {
    return { ok: false, status: 0, msg: e.message }
  }
}

console.log('\n┌─────────────────────────────────────────────────────────────┐')
console.log('│ BlockERP Frontend → Backend Endpoint Coverage Smoke         │')
console.log('└─────────────────────────────────────────────────────────────┘\n')

let totalFiles = 0, healthyFiles = 0, totalCalls = 0, failedCalls = 0
const allFailures = []

for (const file of Object.keys(byFile).sort()) {
  const calls = byFile[file]
  totalFiles++
  const results = await Promise.all(calls.map(probe))
  const failures = results.map((r, i) => ({ ...r, call: calls[i] })).filter((r) => !r.ok)
  totalCalls += calls.length
  failedCalls += failures.length
  const tag = failures.length === 0 ? '✅' : '❌'
  if (!failures.length) healthyFiles++
  const short = file.replace(/^src\//, '')
  console.log(`${tag} ${short.padEnd(40)} ${calls.length} calls${failures.length ? ` · ${failures.length} broken` : ''}`)
  for (const f of failures) {
    console.log(`     ✗ ${f.call.verb.padEnd(6)} ${f.call.raw} → ${f.status} ${f.msg}`)
    allFailures.push({ file: short, ...f })
  }
}

console.log(`\n  Files OK: ${healthyFiles}/${totalFiles}   Endpoints OK: ${totalCalls - failedCalls}/${totalCalls}\n`)

if (allFailures.length) {
  console.log('Unique broken endpoints:')
  const uniq = new Set(allFailures.map((f) => `${f.call.verb} ${f.call.raw}`))
  for (const u of uniq) console.log(`  · ${u}`)
  console.log()
}
process.exit(failedCalls > 0 ? 1 : 0)
