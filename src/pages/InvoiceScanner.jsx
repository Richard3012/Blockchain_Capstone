import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { invalidateLiveData } from '../hooks/useLiveData'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.txt,.csv'
const MAX_FILE_SIZE = 10 * 1024 * 1024

function getToken() {
  return sessionStorage.getItem('blockerp-token') || localStorage.getItem('blockerp_token') || localStorage.getItem('blockerp-token') || ''
}

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
const pct = (n) => `${Math.round((n || 0) * 100)}%`

/* ── SVG Icon helper ─────────────────────────────────── */
const sv = (d, c = 'w-5 h-5') => <svg className={c} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
const svf = (d, c = 'w-5 h-5') => <svg className={c} fill="currentColor" viewBox="0 0 24 24"><path d={d} /></svg>
const IC = {
  doc: (c) => sv('M7 21h10a2 2 0 002-2V9l-5-5H7a2 2 0 00-2 2v14a2 2 0 002 2z', c),
  docText: (c) => sv('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', c),
  table: (c) => sv('M3 10h18M3 14h18m-9-8v12M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z', c),
  image: (c) => sv('M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', c),
  chart: (c) => sv('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', c),
  upload: (c) => sv('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12', c),
  search: (c) => sv('M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', c),
  checkCircle: (c) => sv('M9 12l2 3 4-6m5 3a9 9 0 11-18 0 9 9 0 0118 0z', c),
  link: (c) => sv('M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 015.656 0l4-4a4 4 0 01-5.656-5.656l-1.1 1.1', c),
  cube: (c) => sv('M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', c),
  clipboard: (c) => sv('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', c),
  camera: (c) => sv('M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z', c),
  warning: (c) => sv('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', c),
  inbox: (c) => sv('M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4', c),
  folder: (c) => sv('M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', c),
  bolt: (c) => svf('M13 10V3L4 14h7v7l9-11h-7z', c),
  building: (c) => sv('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', c),
  receipt: (c) => sv('M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z', c),
  package: (c) => sv('M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', c),
  currency: (c) => sv('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', c),
  target: (c) => sv('M12 8V4m0 4a4 4 0 100 8 4 4 0 000-8zm-8 4h4m8 0h4M12 20v-4', c),
  bell: (c) => sv('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', c),
  chip: (c) => sv('M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z', c),
  paperclip: (c) => sv('M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13', c),
  refresh: (c) => sv('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', c),
  xCircle: (c) => sv('M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', c),
  bookOpen: (c) => sv('M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', c),
  clock: (c) => sv('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', c),
}

/* ── File type helpers ────────────────────────────────── */
const FILE_ICON_MAP = {
  pdf: { fn: IC.doc, color: 'text-red-500' },
  doc: { fn: IC.doc, color: 'text-blue-500' },
  docx: { fn: IC.doc, color: 'text-blue-500' },
  xls: { fn: IC.table, color: 'text-green-600' },
  xlsx: { fn: IC.table, color: 'text-green-600' },
  jpg: { fn: IC.image, color: 'text-purple-500' },
  jpeg: { fn: IC.image, color: 'text-purple-500' },
  png: { fn: IC.image, color: 'text-purple-500' },
  webp: { fn: IC.image, color: 'text-purple-500' },
  bmp: { fn: IC.image, color: 'text-purple-500' },
  tiff: { fn: IC.image, color: 'text-purple-500' },
  txt: { fn: IC.docText, color: 'text-gray-500' },
  csv: { fn: IC.chart, color: 'text-teal-500' },
}
function getFileIcon(name, size = 'w-5 h-5') {
  const ext = name?.split('.').pop()?.toLowerCase() || ''
  const entry = FILE_ICON_MAP[ext] || { fn: IC.docText, color: 'text-gray-500' }
  return entry.fn(`${size} ${entry.color}`)
}
function getFileCategory(name) {
  const ext = name?.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) return 'Image'
  if (ext === 'pdf') return 'PDF'
  if (['xls', 'xlsx'].includes(ext)) return 'Excel'
  if (['doc', 'docx'].includes(ext)) return 'Word'
  return 'Text'
}

/* ── Pipeline stage definitions ───────────────────────── */
const PIPELINE_STAGES = [
  { id: 'upload', label: 'Upload', icon: IC.upload('w-3.5 h-3.5') },
  { id: 'extract', label: 'Extract Data', icon: IC.search('w-3.5 h-3.5') },
  { id: 'validate', label: 'Validate', icon: IC.checkCircle('w-3.5 h-3.5') },
  { id: 'map', label: 'Map to ERP', icon: IC.link('w-3.5 h-3.5') },
  { id: 'blockchain', label: 'Blockchain', icon: IC.cube('w-3.5 h-3.5') },
]

/* ════════════════════════════════════════════════════════ */

export default function InvoiceScanner() {
  const addToast = useStore((s) => s.addToast)
  const fileRef = useRef(null)

  // View: 'upload' | 'processing' | 'review' | 'result'
  const [view, setView] = useState('upload')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Upload
  const [inputMode, setInputMode] = useState('file')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [rawText, setRawText] = useState('')

  // Pipeline status
  const [pipelineStages, setPipelineStages] = useState(
    PIPELINE_STAGES.map((s) => ({ ...s, status: 'pending' })),
  )

  // Extracted data
  const [fields, setFields] = useState({})
  const [lineItems, setLineItems] = useState([])
  const [extractedText, setExtractedText] = useState('')
  const [validation, setValidation] = useState(null)
  const [fieldConf, setFieldConf] = useState({})

  // Result
  const [result, setResult] = useState(null)
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifying, setVerifying] = useState(false)

  // Scan history
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  /* ── API helper ─────────────────────────────── */
  const apiCall = useCallback(async (method, endpoint, body, isFormData = false) => {
    const token = getToken()
    if (isFormData && body instanceof FormData) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open(method, `${API}${endpoint}`)
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        })
        xhr.upload.addEventListener('loadend', () => setUploadProgress(100))
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText)
            if (xhr.status >= 400 && xhr.status !== 422) reject(new Error(json.message || json.error || `Server error ${xhr.status}`))
            else resolve(json.data ?? json)
          } catch { reject(new Error(`Server error ${xhr.status}`)) }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.ontimeout = () => reject(new Error('Upload timed out'))
        xhr.timeout = 120000
        xhr.send(body)
      })
    }
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (!isFormData) headers['Content-Type'] = 'application/json'
    const opts = { method, headers }
    if (body) opts.body = isFormData ? body : JSON.stringify(body)
    const res = await fetch(`${API}${endpoint}`, opts)
    const json = await res.json()
    if (!res.ok && res.status !== 422) throw new Error(json.message || json.error || `Server error ${res.status}`)
    return json.data ?? json
  }, [])

  /* ── Pipeline stage updater ─────────────────── */
  const updateStage = useCallback((stageId, status) => {
    setPipelineStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, status } : s)))
  }, [])

  /* ── File selection ─────────────────────────── */
  const pickFile = (f) => {
    if (f.size > MAX_FILE_SIZE) {
      setError(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`)
      addToast?.('File exceeds 10 MB limit', 'error')
      return
    }
    setFile(f)
    setError(null)
    setUploadProgress(0)
    if (f.type.startsWith('image/')) {
      const r = new FileReader()
      r.onload = (ev) => setPreview(ev.target.result)
      r.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  /* ── Extract (parse only, no DB writes) ─────── */
  const handleExtract = async () => {
    setError(null)
    setLoading(true)
    setUploadProgress(0)
    setView('processing')
    setPipelineStages(PIPELINE_STAGES.map((s) => ({ ...s, status: 'pending' })))

    try {
      // Stage 1: Upload
      updateStage('upload', 'active')
      let data
      if (inputMode === 'file') {
        if (!file) { setError('Select a file first'); setLoading(false); setView('upload'); return }
        const fd = new FormData()
        fd.append('file', file)
        updateStage('upload', 'success')

        // Stage 2: Extract
        updateStage('extract', 'active')
        data = await apiCall('POST', '/invoice-scanner/parse', fd, true)
      } else {
        if (!rawText.trim()) { setError('Paste invoice text first'); setLoading(false); setView('upload'); return }
        updateStage('upload', 'success')
        updateStage('extract', 'active')
        data = await apiCall('POST', '/invoice-scanner/parse', { rawText })
      }
      updateStage('extract', 'success')

      // Stage 3: Validate
      updateStage('validate', 'active')
      await new Promise((r) => setTimeout(r, 300))
      updateStage('validate', data.validation?.valid !== false ? 'success' : 'warning')

      setFields({
        vendorName: data.vendorName || '',
        gstin: data.gstin || '',
        invoiceNumber: data.invoiceNumber || '',
        invoiceDate: data.invoiceDate || '',
        subtotal: data.subtotal || 0,
        taxAmount: data.taxAmount || 0,
        totalAmount: data.totalAmount || 0,
      })
      setLineItems(
        (data.lineItems || []).map((it, i) => ({
          id: i, description: it.description || '', quantity: it.quantity || 0,
          unitPrice: it.unitPrice || 0, tax: it.tax || 0, amount: it.amount || 0,
        })),
      )
      setExtractedText(data.extractedText || '')
      setValidation(data.validation || null)
      setFieldConf(data.fieldConfidence || {})
      setView('review')
      addToast?.('Data extracted — review before posting', 'success')
    } catch (e) {
      updateStage('extract', 'error')
      setError(e.message)
      addToast?.(e.message, 'error')
      setView('upload')
    }
    setLoading(false)
  }

  /* ── Approve & Post to ERP ─────────────────── */
  const handleProcess = async () => {
    setError(null)
    setLoading(true)
    setUploadProgress(0)
    setPipelineStages((prev) => prev.map((s) =>
      ['upload', 'extract', 'validate'].includes(s.id) ? { ...s, status: 'success' } : { ...s, status: 'pending' },
    ))

    try {
      updateStage('map', 'active')
      const overrides = { ...fields, lineItems }
      let data
      if (inputMode === 'file' && file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('customer', '000000000000000000000000')
        fd.append('store', '000000000000000000000000')
        fd.append('parsedOverrides', JSON.stringify(overrides))
        data = await apiCall('POST', '/invoice-scanner/process', fd, true)
      } else {
        data = await apiCall('POST', '/invoice-scanner/process', {
          rawText, customer: '000000000000000000000000',
          store: '000000000000000000000000', parsedOverrides: overrides,
        })
      }

      if (data.validation && !data.validation.valid) {
        updateStage('map', 'error')
        setValidation(data.validation)
        setError('Validation errors — correct the highlighted fields')
        addToast?.('Validation errors', 'error')
        setLoading(false)
        return
      }

      updateStage('map', 'success')
      updateStage('blockchain', data.blockchainRecord?.txHash ? 'success' : 'warning')

      setResult(data)
      setView('result')
      invalidateLiveData('invoices', 'inventory', 'orders', 'customers', 'audit', 'blockchain')
      addToast?.('Invoice created & anchored on blockchain!', 'success')
    } catch (e) {
      updateStage('map', 'error')
      setError(e.message)
      addToast?.(e.message, 'error')
    }
    setLoading(false)
  }

  /* ── Reject ────────────────────────────────── */
  const handleReject = () => {
    addToast?.('Invoice rejected', 'warning')
    reset()
  }

  /* ── Reprocess ─────────────────────────────── */
  const handleReprocess = () => {
    setView('upload')
    setValidation(null)
    setFieldConf({})
    setResult(null)
    setVerifyResult(null)
    setError(null)
    setPipelineStages(PIPELINE_STAGES.map((s) => ({ ...s, status: 'pending' })))
    setTimeout(() => handleExtract(), 100)
  }

  /* ── Verify blockchain ──────────────────────── */
  const handleVerify = async () => {
    if (!result?.invoice?._id) return
    setVerifying(true)
    try {
      const v = await apiCall('GET', `/invoice-scanner/verify/${result.invoice._id}`)
      setVerifyResult(v)
    } catch (e) { addToast?.(e.message, 'error') }
    setVerifying(false)
  }

  /* ── Fetch scan history ─────────────────────── */
  const fetchHistory = async () => {
    try {
      const data = await apiCall('GET', '/invoice-scanner/list?limit=10')
      setHistory(data.invoices || data.items || [])
    } catch { /* ignore */ }
  }
  useEffect(() => { fetchHistory() }, [])

  /* ── Reset ──────────────────────────────────── */
  const reset = () => {
    setView('upload'); setFile(null); setPreview(null); setRawText('')
    setFields({}); setLineItems([]); setExtractedText('')
    setValidation(null); setFieldConf({}); setResult(null)
    setVerifyResult(null); setError(null); setUploadProgress(0)
    setDragging(false); setPipelineStages(PIPELINE_STAGES.map((s) => ({ ...s, status: 'pending' })))
  }

  /* ── Field helpers ──────────────────────────── */
  const updateField = (key, val) => setFields((p) => ({ ...p, [key]: val }))
  const updateLineItem = (idx, key, val) => setLineItems((p) => p.map((it, i) => (i === idx ? { ...it, [key]: val } : it)))
  const removeLineItem = (idx) => setLineItems((p) => p.filter((_, i) => i !== idx))
  const addLineItem = () => setLineItems((p) => [...p, { id: Date.now(), description: '', quantity: 0, unitPrice: 0, tax: 0, amount: 0 }])
  const hasError = (field) => validation?.errors?.find((e) => e.field === field)
  const hasWarn = (field) => validation?.warnings?.find((w) => w.field === field)
  const avgConf = Object.keys(fieldConf).length > 0
    ? Object.values(fieldConf).reduce((s, f) => s + f.confidence, 0) / Object.keys(fieldConf).length
    : 0

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Page Header ──────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Smart Invoice Scanner</h1>
            <p className="text-sm text-text-secondary">AI-powered document ingestion with blockchain verification</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory() }}
            className="px-4 py-2 rounded-xl text-sm font-medium border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition flex items-center gap-2">
            {IC.clipboard('w-4 h-4')} {showHistory ? 'Hide' : 'Scan'} History
          </button>
          {view !== 'upload' && (
            <button onClick={reset}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 transition">
              ↻ New Scan
            </button>
          )}
        </div>
      </div>

      {/* ── Pipeline Status Bar ──────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-border p-4">
        <div className="flex items-center gap-1">
          {pipelineStages.map((stage, idx) => (
            <div key={stage.id} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl w-full transition-all text-sm ${
                stage.status === 'active' ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-200 scale-[1.02]' :
                stage.status === 'success' ? 'bg-green-50 text-green-700 font-medium border border-green-200' :
                stage.status === 'warning' ? 'bg-yellow-50 text-yellow-700 font-medium border border-yellow-200' :
                stage.status === 'error' ? 'bg-red-50 text-red-700 font-medium border border-red-200' :
                'bg-gray-50 text-gray-400 border border-gray-100'
              }`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  stage.status === 'active' ? 'bg-white/20 text-white animate-pulse' :
                  stage.status === 'success' ? 'bg-green-500 text-white' :
                  stage.status === 'warning' ? 'bg-yellow-500 text-white' :
                  stage.status === 'error' ? 'bg-red-500 text-white' :
                  'bg-gray-200 text-gray-400'
                }`}>
                  {stage.status === 'success' ? '✓' : stage.status === 'error' ? '✗' :
                   stage.status === 'warning' ? '!' : stage.status === 'active' ? '⟳' : stage.icon}
                </span>
                <span className="truncate hidden sm:inline">{stage.label}</span>
              </div>
              {idx < pipelineStages.length - 1 && (
                <div className={`w-4 h-0.5 mx-0.5 flex-shrink-0 transition-colors ${
                  stage.status === 'success' ? 'bg-green-400' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────── */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-red-500 mt-0.5">{IC.warning('w-5 h-5')}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xl leading-none font-bold">×</button>
        </div>
      )}

      {/* ── Scan History Panel ───────────────────── */}
      {showHistory && (
        <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
          <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">{IC.clipboard('w-4 h-4')} Recent Scans</h3>
          {history.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-text-secondary text-xs">
                  <tr>
                    <th className="text-left p-2.5 rounded-l-lg">Invoice #</th>
                    <th className="text-left p-2.5">Vendor</th>
                    <th className="text-right p-2.5">Amount</th>
                    <th className="text-center p-2.5">Status</th>
                    <th className="text-left p-2.5 rounded-r-lg">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((inv) => (
                    <tr key={inv._id} className="border-t border-border hover:bg-gray-50">
                      <td className="p-2.5 font-medium text-blue-700">{inv.invoiceNumber}</td>
                      <td className="p-2.5 text-text-secondary">{inv.vendorName || '—'}</td>
                      <td className="p-2.5 text-right font-medium">{fmt(inv.totalAmount)}</td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.verificationStatus === 'verified' ? 'bg-green-100 text-green-700' :
                          inv.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{inv.verificationStatus || inv.status}</span>
                      </td>
                      <td className="p-2.5 text-text-secondary text-xs">{new Date(inv.createdAt || inv.issueDate).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No scanned invoices yet</p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/*  VIEW: UPLOAD                              */}
      {/* ══════════════════════════════════════════ */}
      {view === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main upload area */}
          <div className="lg:col-span-2 space-y-4">
            {/* Mode buttons */}
            <div className="flex gap-2 flex-wrap">
              {[
                { mode: 'file', icon: IC.docText('w-4 h-4'), label: 'Upload File' },
                { mode: 'camera', icon: IC.camera('w-4 h-4'), label: 'Camera Scan' },
                { mode: 'text', icon: IC.clipboard('w-4 h-4'), label: 'Paste Text' },
              ].map(({ mode, icon, label }) => (
                <button key={mode}
                  onClick={() => {
                    if (mode === 'camera') { setInputMode('file'); fileRef.current?.click() }
                    else setInputMode(mode)
                  }}
                  className={`px-5 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                    inputMode === mode ? 'bg-blue-50 text-blue-700 border-blue-400 shadow-sm' :
                    'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}>
                  {icon} {label}
                </button>
              ))}
            </div>

            {inputMode !== 'text' ? (
              <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
                {/* Drop Zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer?.files?.[0]; if (f) pickFile(f) }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                    dragging ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100 scale-[1.01]' :
                    file ? 'border-green-400 bg-green-50/50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
                  }`}
                >
                  {file ? (
                    <div className="space-y-3">
                      {preview ? (
                        <img src={preview} alt="" className="max-h-44 mx-auto rounded-xl shadow-lg" />
                      ) : (
                        <div className="flex justify-center">{getFileIcon(file.name, 'w-16 h-16')}</div>
                      )}
                      <div>
                        <p className="text-green-700 font-bold text-lg flex items-center justify-center gap-1.5">{IC.checkCircle('w-5 h-5')} {file.name}</p>
                        <p className="text-gray-500 text-sm">{(file.size / 1024).toFixed(1)} KB • {getFileCategory(file.name)} • Click to change</p>
                      </div>
                    </div>
                  ) : dragging ? (
                    <div className="space-y-3 py-4">
                      <div className="flex justify-center animate-bounce">{IC.inbox('w-16 h-16 text-blue-500')}</div>
                      <p className="text-blue-600 font-bold text-lg">Drop your file here!</p>
                    </div>
                  ) : (
                    <div className="space-y-3 py-4">
                      <div className="flex justify-center">{IC.folder('w-16 h-16 text-gray-400')}</div>
                      <p className="text-gray-700 font-semibold text-lg">Drop your invoice here, or click to browse</p>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {['PNG', 'JPG', 'PDF', 'Excel', 'Word'].map((t) => (
                          <span key={t} className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-medium text-gray-500">{t}</span>
                        ))}
                      </div>
                      <p className="text-gray-400 text-xs mt-1">Max file size: 10 MB</p>
                    </div>
                  )}
                </div>

                {/* Upload progress */}
                {loading && uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Uploading...</span><span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
                {loading && uploadProgress >= 100 && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Processing {'&'} extracting text...
                  </div>
                )}
                <input ref={fileRef} type="file" accept={FILE_ACCEPT} capture="environment" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f) }} />

                {/* Extract button */}
                <button
                  onClick={file ? handleExtract : () => fileRef.current?.click()}
                  disabled={loading}
                  className={`w-full mt-5 py-4 rounded-xl text-lg font-bold transition-all flex items-center justify-center gap-3 ${
                    loading ? 'bg-blue-400 text-white cursor-wait' :
                    file ? 'bg-green-600 hover:bg-green-700 text-white shadow-xl ring-4 ring-green-100' :
                    'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                  }`}
                >
                  {loading ? (
                    <><svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Scanning Invoice...</>
                  ) : file ? (
                    <>Scan {'&'} Extract Data</>
                  ) : (
                    <>Select a File to Start</>
                  )}
                </button>
              </div>
            ) : (
              /* Paste text mode */
              <div className="bg-white rounded-2xl shadow-sm border border-border p-6 space-y-4">
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={14}
                  placeholder={"Paste your invoice text here...\n\nExample:\nABC Traders\nGSTIN: 27AABCT1234F1ZK\nInvoice No: INV-2026-0042\nDate: 15-03-2026\n\n1  Widget Pro  10  ₹500.00  ₹5,000.00\n2  Gadget X    5   ₹1,200.00 ₹6,000.00\n\nSubtotal: ₹11,000.00\nCGST 9%: ₹990.00  SGST 9%: ₹990.00\nTotal: ₹12,980.00"}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-mono resize-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
                <button
                  onClick={handleExtract}
                  disabled={loading || !rawText.trim()}
                  className={`w-full py-4 rounded-xl text-lg font-bold transition-all flex items-center justify-center gap-3 ${
                    loading ? 'bg-blue-400 text-white cursor-wait' :
                    rawText.trim() ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl shadow-green-200 ring-4 ring-green-100' :
                    'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <><svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Extracting...</>
                  ) : (
                    <>Extract Data {'&'} Preview</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right sidebar: Supported formats + AI info */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
              <h3 className="font-semibold text-text-primary mb-3 text-sm flex items-center gap-1.5">{IC.paperclip('w-4 h-4 text-gray-500')} Supported Formats</h3>
              <div className="space-y-2.5">
                {[
                  { icon: IC.image('w-5 h-5 text-purple-500'), types: 'PNG, JPG, WEBP, BMP, TIFF', desc: 'OCR text extraction' },
                  { icon: IC.doc('w-5 h-5 text-red-500'), types: 'PDF', desc: 'Text layer + OCR fallback' },
                  { icon: IC.table('w-5 h-5 text-green-600'), types: 'XLS, XLSX', desc: 'Structured spreadsheet parsing' },
                  { icon: IC.doc('w-5 h-5 text-blue-500'), types: 'DOC, DOCX', desc: 'Word document parsing' },
                  { icon: IC.docText('w-5 h-5 text-gray-500'), types: 'TXT, CSV', desc: 'Direct text input' },
                ].map(({ icon, types, desc }) => (
                  <div key={types} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition">
                    <span className="flex-shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-text-primary">{types}</p>
                      <p className="text-xs text-text-secondary">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
              <h3 className="font-semibold text-blue-800 mb-2 text-sm flex items-center gap-1.5">{IC.chip('w-4 h-4')} AI Processing Pipeline</h3>
              <ul className="space-y-1.5 text-xs text-blue-700">
                <li>• Tesseract OCR for images</li>
                <li>• Regex + NLP field extraction</li>
                <li>• GSTIN checksum validation</li>
                <li>• Duplicate invoice detection</li>
                <li>• Fuzzy vendor auto-matching</li>
                <li>• Auto inventory stock-in</li>
                <li>• Journal entry creation</li>
                <li>• Blockchain hash anchoring</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-100 p-5">
              <h3 className="font-semibold text-purple-800 mb-2 text-sm flex items-center gap-1.5">{IC.link('w-4 h-4')} ERP Integration</h3>
              <ul className="space-y-1.5 text-xs text-purple-700">
                <li className="flex items-center gap-1.5">{IC.package('w-3.5 h-3.5')} Inventory — auto stock updates</li>
                <li className="flex items-center gap-1.5">{IC.currency('w-3.5 h-3.5')} Finance — AP ledger entries</li>
                <li className="flex items-center gap-1.5">{IC.bookOpen('w-3.5 h-3.5')} Accounting — journal entries</li>
                <li className="flex items-center gap-1.5">{IC.receipt('w-3.5 h-3.5')} GST — tax record sync</li>
                <li className="flex items-center gap-1.5">{IC.building('w-3.5 h-3.5')} SCM — vendor tracking</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/*  VIEW: PROCESSING (animated)               */}
      {/* ══════════════════════════════════════════ */}
      {view === 'processing' && (
        <div className="bg-white rounded-2xl shadow-sm border border-border p-12 text-center">
          <svg className="w-16 h-16 animate-spin mx-auto text-blue-500 mb-6" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <h3 className="text-xl font-bold text-text-primary mb-2">Processing Your Invoice</h3>
          <p className="text-text-secondary">Extracting data, validating fields, and running AI analysis...</p>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/*  VIEW: REVIEW                              */}
      {/* ══════════════════════════════════════════ */}
      {view === 'review' && (
        <div className="space-y-5">

          {/* Confidence & Alert badges */}
          <div className="flex flex-wrap items-center gap-2">
            {fields.vendorName && <span className="text-base font-bold text-text-primary">{fields.vendorName}</span>}
            {Object.keys(fieldConf).length > 0 && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                avgConf >= 0.7 ? 'bg-green-100 text-green-700 border border-green-200' :
                avgConf >= 0.4 ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                'bg-red-100 text-red-700 border border-red-200'
              }`}>
                {IC.chip('w-3.5 h-3.5')} AI Confidence: {pct(avgConf)}
              </span>
            )}
            {validation?.errors?.length > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                {IC.xCircle('w-3.5 h-3.5')} {validation.errors.length} Error{validation.errors.length > 1 ? 's' : ''}
              </span>
            )}
            {validation?.warnings?.length > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
                {IC.warning('w-3.5 h-3.5')} {validation.warnings.length} Warning{validation.warnings.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Smart Alerts */}
          {(validation?.errors?.length > 0 || validation?.warnings?.length > 0) && (
            <div className="bg-white rounded-2xl border-2 border-orange-200 p-5 space-y-2">
              <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2">{IC.bell('w-4 h-4')} Smart Alerts</h3>
              {validation.errors?.map((e, i) => (
                <div key={`e${i}`} className="flex items-start gap-2 p-2.5 bg-red-50 rounded-xl">
                  <span className="text-red-500 mt-0.5">{IC.xCircle('w-4 h-4')}</span>
                  <div><span className="text-xs font-bold text-red-800">{e.field}:</span> <span className="text-xs text-red-700">{e.message}</span></div>
                </div>
              ))}
              {validation.warnings?.map((w, i) => (
                <div key={`w${i}`} className="flex items-start gap-2 p-2.5 bg-yellow-50 rounded-xl">
                  <span className="text-yellow-500 mt-0.5">{IC.warning('w-4 h-4')}</span>
                  <div><span className="text-xs font-bold text-yellow-800">{w.field}:</span> <span className="text-xs text-yellow-700">{w.message}</span></div>
                </div>
              ))}
            </div>
          )}

          {/* Extracted raw text toggle */}
          {extractedText && (
            <details className="bg-white rounded-2xl border border-border">
              <summary className="p-4 cursor-pointer text-sm font-medium text-text-secondary hover:text-text-primary">
                {IC.docText('w-4 h-4 inline')} Raw Extracted Text ({extractedText.length} characters)
              </summary>
              <pre className="px-4 pb-4 text-xs font-mono text-text-secondary max-h-40 overflow-auto whitespace-pre-wrap">{extractedText}</pre>
            </details>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: Vendor + Invoice + Line Items */}
            <div className="lg:col-span-2 space-y-5">
              {/* Vendor Details */}
              <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
                <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                  {IC.building('w-5 h-5 text-indigo-500')} Vendor Details
                  <span className="text-xs font-normal text-text-secondary">(click fields to edit)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'vendorName', label: 'Vendor Name', type: 'text' },
                    { key: 'gstin', label: 'GSTIN', type: 'text' },
                  ].map((f) => (
                    <FieldInput key={f.key} field={f} value={fields[f.key]} conf={fieldConf[f.key]}
                      error={hasError(f.key)} warn={hasWarn(f.key)} onChange={(v) => updateField(f.key, v)} />
                  ))}
                </div>
              </div>

              {/* Invoice Details */}
              <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
                <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">{IC.receipt('w-5 h-5 text-orange-500')} Invoice Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'invoiceNumber', label: 'Invoice Number', type: 'text' },
                    { key: 'invoiceDate', label: 'Invoice Date', type: 'text' },
                  ].map((f) => (
                    <FieldInput key={f.key} field={f} value={fields[f.key]} conf={fieldConf[f.key]}
                      error={hasError(f.key)} warn={hasWarn(f.key)} onChange={(v) => updateField(f.key, v)} />
                  ))}
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-text-primary flex items-center gap-2">{IC.package('w-5 h-5 text-blue-500')} Line Items ({lineItems.length})</h3>
                  <button onClick={addLineItem}
                    className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium transition">
                    + Add Row
                  </button>
                </div>
                {lineItems.length > 0 ? (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-text-secondary text-xs">
                        <tr>
                          <th className="text-left p-2.5 w-8 rounded-l-lg">#</th>
                          <th className="text-left p-2.5">Description</th>
                          <th className="text-right p-2.5 w-20">Qty</th>
                          <th className="text-right p-2.5 w-24">Unit Price</th>
                          <th className="text-right p-2.5 w-20">Tax</th>
                          <th className="text-right p-2.5 w-24">Amount</th>
                          <th className="w-8 rounded-r-lg"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((it, i) => (
                          <tr key={it.id} className="border-t border-border hover:bg-gray-50/50">
                            <td className="p-2 text-gray-400 text-xs">{i + 1}</td>
                            <td className="p-2"><input value={it.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100" /></td>
                            <td className="p-2"><input type="number" value={it.quantity} onChange={(e) => updateLineItem(i, 'quantity', +e.target.value || 0)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-blue-400" /></td>
                            <td className="p-2"><input type="number" value={it.unitPrice} onChange={(e) => updateLineItem(i, 'unitPrice', +e.target.value || 0)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-blue-400" /></td>
                            <td className="p-2"><input type="number" value={it.tax} onChange={(e) => updateLineItem(i, 'tax', +e.target.value || 0)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-blue-400" /></td>
                            <td className="p-2"><input type="number" value={it.amount} onChange={(e) => updateLineItem(i, 'amount', +e.target.value || 0)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-blue-400" /></td>
                            <td className="p-2"><button onClick={() => removeLineItem(i)} className="text-red-400 hover:text-red-600 text-lg font-bold">×</button></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold text-xs">
                        <tr>
                          <td colSpan={5} className="p-2.5 text-right">Line Items Total:</td>
                          <td className="p-2.5 text-right text-base">{fmt(lineItems.reduce((s, it) => s + (it.amount || 0), 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-6">No line items detected — click + Add Row</p>
                )}
              </div>
            </div>

            {/* Right sidebar: Tax + Confidence */}
            <div className="space-y-5">
              {/* Tax Breakdown */}
              <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
                <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">{IC.currency('w-5 h-5 text-green-600')} Tax Breakdown</h3>
                <div className="space-y-3">
                  {[
                    { key: 'subtotal', label: 'Subtotal (₹)', type: 'number' },
                    { key: 'taxAmount', label: 'Tax Amount (₹)', type: 'number' },
                    { key: 'totalAmount', label: 'Grand Total (₹)', type: 'number' },
                  ].map((f) => (
                    <FieldInput key={f.key} field={f} value={fields[f.key]} conf={fieldConf[f.key]}
                      error={hasError(f.key)} warn={hasWarn(f.key)}
                      onChange={(v) => updateField(f.key, parseFloat(v) || 0)} isAmount />
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-text-primary">Total</span>
                    <span className="text-2xl font-bold text-green-700">{fmt(fields.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Confidence Scores */}
              {Object.keys(fieldConf).length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
                  <h3 className="font-bold text-text-primary mb-3 text-sm flex items-center gap-2">{IC.target('w-4 h-4 text-blue-500')} AI Confidence Scores</h3>
                  <div className="space-y-2">
                    {Object.entries(fieldConf).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-text-secondary w-24 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all ${
                            val.confidence >= 0.8 ? 'bg-green-500' : val.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                          }`} style={{ width: `${val.confidence * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold w-10 text-right">{pct(val.confidence)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setView('upload')}
                className="px-5 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                ← Back
              </button>
              <button onClick={handleReprocess}
                className="px-5 py-3 border-2 border-blue-200 rounded-xl text-sm font-medium text-blue-700 hover:bg-blue-50 transition flex items-center gap-2">
                {IC.refresh('w-4 h-4')} Reprocess
              </button>
              <button onClick={handleReject}
                className="px-5 py-3 border-2 border-red-200 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50 transition flex items-center gap-2">
                {IC.xCircle('w-4 h-4')} Reject Invoice
              </button>
              <button onClick={handleProcess} disabled={loading}
                className="flex-1 min-w-[280px] bg-green-600 hover:bg-green-700 text-white rounded-xl text-base font-bold transition-all shadow-lg flex items-center justify-center gap-2 py-3.5">
                {loading ? (
                  <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Processing...</>
                ) : (
                  <>{IC.checkCircle('w-5 h-5')} Accept {'&'} Post to ERP</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/*  VIEW: RESULT                              */}
      {/* ══════════════════════════════════════════ */}
      {view === 'result' && result && (
        <div className="space-y-5">

          {/* Success banner */}
          <div className={`rounded-2xl p-6 ${result.duplicate ? 'bg-yellow-50 border-2 border-yellow-300' : 'bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300'}`}>
            <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
              {result.duplicate ? <>{IC.warning('w-5 h-5 text-yellow-600')} Duplicate — Existing Invoice Returned</> : <>{IC.checkCircle('w-5 h-5 text-green-600')} Invoice Created & Posted to ERP</>}
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              {result.duplicate ? 'This invoice was already processed.' : 'Inventory, Finance, GST, and Blockchain modules updated.'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <ResultStat label="Invoice #" value={result.invoice?.invoiceNumber} />
              <ResultStat label="Vendor" value={result.parsed?.vendorName || '—'} />
              <ResultStat label="Total" value={fmt(result.invoice?.totalAmount)} large />
              <ResultStat label="Due Date" value={result.invoice?.dueDate ? new Date(result.invoice.dueDate).toLocaleDateString('en-IN') : '—'} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Blockchain */}
            <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
              <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">{IC.cube('w-5 h-5 text-purple-600')} Blockchain Verification</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="text-xs text-gray-500 w-20">Status</span>
                  <span className={`font-bold ${result.blockchainRecord?.txHash ? 'text-green-700' : 'text-yellow-600'}`}>
                    {result.blockchainRecord?.txHash ? '✓ Anchored On-Chain' : <>{IC.clock('w-4 h-4 inline')} Pending</>}
                  </span>
                </div>
                {result.blockchainRecord?.txHash && (
                  <div className="p-3 rounded-xl bg-gray-50">
                    <span className="text-xs text-gray-500">TX Hash</span>
                    <p className="font-mono text-xs break-all mt-1">{result.blockchainRecord.txHash}</p>
                  </div>
                )}
                {result.invoice?.hash && (
                  <div className="p-3 rounded-xl bg-gray-50">
                    <span className="text-xs text-gray-500">Record Hash</span>
                    <p className="font-mono text-xs break-all mt-1">{result.invoice.hash}</p>
                  </div>
                )}
                {result.blockchainRecord?.blockNumber != null && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <span className="text-xs text-gray-500 w-20">Block #</span>
                    <span className="font-bold">{result.blockchainRecord.blockNumber}</span>
                  </div>
                )}
              </div>
              {result.invoice?._id && (
                <button onClick={handleVerify} disabled={verifying}
                  className="mt-4 w-full bg-blue-50 text-blue-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-100 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {verifying ? '⟳ Verifying...' : <>{IC.link('w-4 h-4')} View Blockchain Record</>}
                </button>
              )}
              {verifyResult && (
                <div className={`mt-3 p-4 rounded-xl text-sm ${verifyResult.verified ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <p className="font-bold">{verifyResult.verified ? '✓ Verified — hash matches blockchain' : '✗ Verification failed — possible tampering'}</p>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span>Hash: {verifyResult.hashMatch ? '✓ Match' : '✗ Mismatch'}</span>
                    <span>Chain: {verifyResult.blockchainVerified ? '✓ On-chain' : '✗ Not found'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ERP Integration Results */}
            <div className="space-y-5">
              {result.matchedSupplier && (
                <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
                  <h3 className="font-bold text-text-primary mb-2 flex items-center gap-2">{IC.building('w-5 h-5 text-indigo-500')} Vendor Match</h3>
                  <p className="text-sm">{result.matchedSupplier.name} <span className="text-gray-400">({result.matchedSupplier.code})</span></p>
                </div>
              )}
              {result.journalEntry && (
                <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
                  <h3 className="font-bold text-text-primary mb-2 flex items-center gap-2">{IC.bookOpen('w-5 h-5 text-amber-600')} Ledger Entry</h3>
                  <p className="text-sm text-gray-600">{result.journalEntry.entryNumber} — {result.journalEntry.description}</p>
                </div>
              )}
              {result.invoice?.taxAmount > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
                  <h3 className="font-bold text-text-primary mb-2 flex items-center gap-2">{IC.receipt('w-5 h-5 text-orange-500')} GST Record</h3>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tax Amount</span>
                    <span className="font-bold">{fmt(result.invoice.taxAmount)}</span>
                  </div>
                  {result.invoice?.gstin && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-500">GSTIN</span>
                      <span className="font-mono text-xs">{result.invoice.gstin}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Inventory Updates */}
          {result.inventoryUpdates?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
              <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">{IC.package('w-5 h-5 text-blue-500')} Inventory Updated ({result.inventoryUpdates.length} items)</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left p-2.5 rounded-l-lg">Product</th>
                      <th className="text-left p-2.5">SKU</th>
                      <th className="text-right p-2.5">Qty Added</th>
                      <th className="text-right p-2.5 rounded-r-lg">Match Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.inventoryUpdates.map((u, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2.5 font-medium">{u.productName}</td>
                        <td className="p-2.5 text-gray-500 font-mono text-xs">{u.sku}</td>
                        <td className="p-2.5 text-right text-green-700 font-bold">+{u.quantity}</td>
                        <td className="p-2.5 text-right">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.matchScore >= 0.8 ? 'bg-green-100 text-green-700' :
                            u.matchScore >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>{pct(u.matchScore)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.validation?.warnings?.length > 0 && (
            <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-4">
              <h3 className="text-sm font-bold text-yellow-800 mb-2 flex items-center gap-1.5">{IC.warning('w-4 h-4')} Warnings</h3>
              {result.validation.warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700">• {w.field}: {w.message}</p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
            <div className="flex flex-wrap gap-3">
              <button onClick={reset}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition flex items-center gap-2">
                {IC.docText('w-5 h-5')} Scan Another Invoice
              </button>
              {result.invoice?._id && (
                <button onClick={handleVerify} disabled={verifying}
                  className="px-6 py-3 border-2 border-purple-200 rounded-xl text-sm font-medium text-purple-700 hover:bg-purple-50 transition flex items-center gap-2">
                  {IC.link('w-4 h-4')} {verifying ? 'Verifying...' : 'Verify Blockchain'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Reusable sub-components ──────────────────────── */

function FieldInput({ field, value, conf, error, warn, onChange, isAmount }) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1.5 flex items-center gap-1.5 font-medium">
        {field.label}
        {conf && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            conf.confidence >= 0.8 ? 'bg-green-100 text-green-600' :
            conf.confidence >= 0.5 ? 'bg-yellow-100 text-yellow-600' :
            'bg-red-100 text-red-600'
          }`}>{pct(conf.confidence)}</span>
        )}
      </label>
      <input
        type={field.type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl px-3 py-2.5 text-sm border-2 transition ${
          error ? 'border-red-400 bg-red-50 focus:ring-red-100' :
          'border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
        } ${isAmount ? 'text-right font-semibold' : ''}`}
      />
      {error && <p className="text-xs text-red-600 mt-1 flex items-center gap-1">{IC.xCircle('w-3.5 h-3.5')} {error.message}</p>}
      {warn && <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">{IC.warning('w-3.5 h-3.5')} {warn.message}</p>}
    </div>
  )
}

function ResultStat({ label, value, large }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-bold ${large ? 'text-xl text-green-700' : ''}`}>{value}</p>
    </div>
  )
}
