import { useState, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { invalidateLiveData } from '../hooks/useLiveData'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const FILE_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.txt'

function getToken() {
  return localStorage.getItem('blockerp_token') || localStorage.getItem('blockerp-token') || ''
}

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
const pct = (n) => `${Math.round((n || 0) * 100)}%`

/* ════════════════════════════════════════════════════════ */

export default function InvoiceScanner() {
  const addToast = useStore((s) => s.addToast)
  const fileRef = useRef(null)

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Step 1
  const [inputMode, setInputMode] = useState('file') // 'file' | 'text'
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [rawText, setRawText] = useState('')

  // Step 2
  const [fields, setFields] = useState({})
  const [lineItems, setLineItems] = useState([])
  const [extractedText, setExtractedText] = useState('')
  const [validation, setValidation] = useState(null)
  const [fieldConf, setFieldConf] = useState({})

  // Step 3
  const [result, setResult] = useState(null)
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifying, setVerifying] = useState(false)

  /* ── API call helper ─────────────────────────── */
  const apiCall = useCallback(async (method, endpoint, body, isFormData = false) => {
    const headers = {}
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (!isFormData) headers['Content-Type'] = 'application/json'

    const opts = { method, headers }
    if (body) {
      opts.body = isFormData ? body : JSON.stringify(body)
    }

    const res = await fetch(`${API}${endpoint}`, opts)
    const json = await res.json()
    if (!res.ok && res.status !== 422) {
      throw new Error(json.message || json.error || `Server error ${res.status}`)
    }
    return json.data ?? json
  }, [])

  /* ── File selection ─────────────────────────── */
  const pickFile = (f) => {
    setFile(f)
    setError(null)
    if (f.type.startsWith('image/')) {
      const r = new FileReader()
      r.onload = (ev) => setPreview(ev.target.result)
      r.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  /* ── Step 1 → Step 2: Parse / Extract ──────── */
  const handleExtract = async () => {
    setError(null)
    setLoading(true)
    try {
      let data
      if (inputMode === 'file') {
        if (!file) { setError('Please select a file first'); setLoading(false); return }
        const fd = new FormData()
        fd.append('file', file)
        data = await apiCall('POST', '/invoice-scanner/parse', fd, true)
      } else {
        if (!rawText.trim()) { setError('Please paste invoice text first'); setLoading(false); return }
        data = await apiCall('POST', '/invoice-scanner/parse', { rawText })
      }

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
          id: i,
          description: it.description || '',
          quantity: it.quantity || 0,
          unitPrice: it.unitPrice || 0,
          tax: it.tax || 0,
          amount: it.amount || 0,
        })),
      )
      setExtractedText(data.extractedText || '')
      setValidation(data.validation || null)
      setFieldConf(data.fieldConfidence || {})
      setStep(2)
      addToast?.('Data extracted successfully!', 'success')
    } catch (e) {
      setError(e.message)
      addToast?.(e.message, 'error')
    }
    setLoading(false)
  }

  /* ── Step 2 → Step 3: Process / Commit ─────── */
  const handleProcess = async () => {
    setError(null)
    setLoading(true)
    try {
      let data
      const overrides = { ...fields, lineItems }

      if (inputMode === 'file' && file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('customer', '000000000000000000000000')
        fd.append('store', '000000000000000000000000')
        fd.append('parsedOverrides', JSON.stringify(overrides))
        data = await apiCall('POST', '/invoice-scanner/process', fd, true)
      } else {
        data = await apiCall('POST', '/invoice-scanner/process', {
          rawText,
          customer: '000000000000000000000000',
          store: '000000000000000000000000',
          parsedOverrides: overrides,
        })
      }

      if (data.validation && !data.validation.valid) {
        setValidation(data.validation)
        setError('Validation errors — please correct the highlighted fields')
        addToast?.('Validation errors', 'error')
        setLoading(false)
        return
      }

      setResult(data)
      setStep(3)
      invalidateLiveData('invoices', 'inventory', 'orders', 'customers', 'audit', 'blockchain')
      addToast?.('Invoice created & anchored on blockchain!', 'success')
    } catch (e) {
      setError(e.message)
      addToast?.(e.message, 'error')
    }
    setLoading(false)
  }

  /* ── Verify blockchain ──────────────────────── */
  const handleVerify = async () => {
    if (!result?.invoice?._id) return
    setVerifying(true)
    try {
      const v = await apiCall('GET', `/invoice-scanner/verify/${result.invoice._id}`)
      setVerifyResult(v)
    } catch (e) {
      addToast?.(e.message, 'error')
    }
    setVerifying(false)
  }

  /* ── Reset ──────────────────────────────────── */
  const reset = () => {
    setStep(1); setFile(null); setPreview(null); setRawText('')
    setFields({}); setLineItems([]); setExtractedText('')
    setValidation(null); setFieldConf({}); setResult(null)
    setVerifyResult(null); setError(null)
  }

  /* ── Helpers ────────────────────────────────── */
  const updateField = (key, val) => setFields((p) => ({ ...p, [key]: val }))
  const updateLineItem = (idx, key, val) => setLineItems((p) => p.map((it, i) => (i === idx ? { ...it, [key]: val } : it)))
  const removeLineItem = (idx) => setLineItems((p) => p.filter((_, i) => i !== idx))
  const addLineItem = () => setLineItems((p) => [...p, { id: Date.now(), description: '', quantity: 0, unitPrice: 0, tax: 0, amount: 0 }])
  const hasError = (field) => validation?.errors?.find((e) => e.field === field)
  const hasWarn = (field) => validation?.warnings?.find((w) => w.field === field)

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ── Page header ──────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Invoice Scanner</h1>
          <p className="text-sm text-text-secondary">Upload → Extract & Validate → Inventory + Ledger + Blockchain</p>
        </div>
      </div>

      {/* ── Step Progress Bar ────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-border p-4">
        <div className="flex items-center gap-2">
          {[
            { n: 1, label: 'Upload' },
            { n: 2, label: 'Extract & Validate' },
            { n: 3, label: 'Inventory + Ledger + Blockchain' },
          ].map((s, idx) => (
            <div key={s.n} className="flex items-center flex-1">
              <div
                onClick={() => s.n < step && setStep(s.n)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg w-full transition-all ${
                  step === s.n ? 'bg-blue-600 text-white font-semibold' :
                  step > s.n ? 'bg-green-100 text-green-700 font-medium cursor-pointer hover:bg-green-200' :
                  'bg-gray-100 text-gray-400'
                }`}
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                  step === s.n ? 'bg-white/20 text-white' :
                  step > s.n ? 'bg-green-500 text-white' :
                  'bg-gray-300 text-white'
                }`}>
                  {step > s.n ? '✓' : s.n}
                </span>
                <span className="text-sm">{s.label}</span>
              </div>
              {idx < 2 && <div className={`w-6 h-0.5 mx-1 flex-shrink-0 ${step > s.n ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-500 text-lg mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* STEP 1: UPLOAD                             */}
      {/* ══════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4">

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button onClick={() => setInputMode('file')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition ${inputMode === 'file' ? 'bg-blue-50 text-blue-700 border-blue-400' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              📄 Upload File
            </button>
            <button onClick={() => { setInputMode('file'); fileRef.current?.click() }}
              className="px-4 py-2 rounded-lg text-sm font-medium border-2 bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition">
              📷 Camera
            </button>
            <button onClick={() => setInputMode('text')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition ${inputMode === 'text' ? 'bg-blue-50 text-blue-700 border-blue-400' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              📋 Paste Text
            </button>
          </div>

          {inputMode === 'file' ? (
            <div className="bg-white rounded-xl shadow-sm border border-border p-6">
              {/* Drop Zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) pickFile(f) }}
                onDragOver={(e) => e.preventDefault()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-5 ${
                  file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
                }`}
              >
                {file ? (
                  <div className="space-y-2">
                    {preview && <img src={preview} alt="" className="max-h-48 mx-auto rounded-lg shadow" />}
                    <p className="text-green-700 font-semibold text-base">✅ {file.name}</p>
                    <p className="text-gray-500 text-sm">{(file.size / 1024).toFixed(1)} KB — Click to change file</p>
                  </div>
                ) : (
                  <div className="space-y-2 py-4">
                    <div className="text-5xl">📁</div>
                    <p className="text-gray-600 font-medium text-base">Drop your invoice here, or click to browse</p>
                    <p className="text-gray-400 text-sm">Supports PDF, Word, Images (JPG/PNG/TIFF), and Text files — max 10 MB</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept={FILE_ACCEPT} capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
              />

              {/* ★★★ THE EXTRACT BUTTON — ALWAYS VISIBLE ★★★ */}
              <button
                onClick={file ? handleExtract : () => fileRef.current?.click()}
                disabled={loading}
                style={{ minHeight: '64px' }}
                className={`w-full rounded-xl text-lg font-bold transition-all flex items-center justify-center gap-3 ${
                  loading
                    ? 'bg-blue-400 text-white cursor-wait'
                    : file
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-300 ring-4 ring-green-100'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Extracting Data...
                  </>
                ) : file ? (
                  <>⚡ Extract Data & Preview</>
                ) : (
                  <>📄 Select a File to Start</>
                )}
              </button>
            </div>
          ) : (
            /* Text mode */
            <div className="bg-white rounded-xl shadow-sm border border-border p-6 space-y-4">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                placeholder={"Paste your invoice text here...\n\nExample:\nABC Traders\nGSTIN: 27AABCT1234F1ZK\nInvoice No: INV-2026-0042\nDate: 15-03-2026\n\n1  Widget Pro  10  ₹500.00  ₹5,000.00\n2  Gadget X    5   ₹1,200.00  ₹6,000.00\n\nSubtotal: ₹11,000.00\nCGST 9%: ₹990.00\nSGST 9%: ₹990.00\nTotal: ₹12,980.00"}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-mono resize-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={handleExtract}
                disabled={loading || !rawText.trim()}
                style={{ minHeight: '64px' }}
                className={`w-full rounded-xl text-lg font-bold transition-all flex items-center justify-center gap-3 ${
                  loading
                    ? 'bg-blue-400 text-white cursor-wait'
                    : rawText.trim()
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-300 ring-4 ring-green-100'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Extracting...
                  </>
                ) : (
                  <>⚡ Extract Data & Preview</>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* STEP 2: EXTRACT & VALIDATE                 */}
      {/* ══════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-5">

          {/* Confidence badge row */}
          <div className="flex flex-wrap items-center gap-2">
            {fields.vendorName && <span className="text-sm font-semibold text-text-primary">{fields.vendorName}</span>}
            {Object.keys(fieldConf).length > 0 && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                (() => { const avg = Object.values(fieldConf).reduce((s, f) => s + f.confidence, 0) / Object.keys(fieldConf).length;
                  return avg >= 0.7 ? 'bg-green-100 text-green-700' : avg >= 0.4 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                })()
              }`}>
                OCR Confidence: {pct(Object.values(fieldConf).reduce((s, f) => s + f.confidence, 0) / Object.keys(fieldConf).length)}
              </span>
            )}
            {validation?.errors?.length > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{validation.errors.length} error(s)</span>}
            {validation?.warnings?.length > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">{validation.warnings.length} warning(s)</span>}
          </div>

          {/* Validation messages */}
          {(validation?.errors?.length > 0 || validation?.warnings?.length > 0) && (
            <div className="bg-white rounded-xl border border-border p-4 space-y-1.5">
              {validation.errors?.map((e, i) => <p key={`e${i}`} className="text-sm text-red-700">❌ <b>{e.field}:</b> {e.message}</p>)}
              {validation.warnings?.map((w, i) => <p key={`w${i}`} className="text-sm text-yellow-700">⚠️ <b>{w.field}:</b> {w.message}</p>)}
            </div>
          )}

          {/* Extracted raw text */}
          {extractedText && (
            <details className="bg-white rounded-xl border border-border">
              <summary className="p-4 cursor-pointer text-sm font-medium text-text-secondary hover:text-text-primary">📄 View Extracted Text ({extractedText.length} chars)</summary>
              <pre className="px-4 pb-4 text-xs font-mono text-text-secondary max-h-40 overflow-auto whitespace-pre-wrap">{extractedText}</pre>
            </details>
          )}

          {/* Editable fields */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-semibold text-text-primary mb-4">Invoice Fields <span className="text-xs text-text-secondary font-normal">(edit to correct OCR errors)</span></h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: 'vendorName', label: 'Vendor Name', type: 'text' },
                { key: 'gstin', label: 'GSTIN', type: 'text' },
                { key: 'invoiceNumber', label: 'Invoice #', type: 'text' },
                { key: 'invoiceDate', label: 'Date', type: 'text' },
                { key: 'subtotal', label: 'Subtotal (₹)', type: 'number' },
                { key: 'taxAmount', label: 'Tax Amount (₹)', type: 'number' },
                { key: 'totalAmount', label: 'Grand Total (₹)', type: 'number' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                    {f.label}
                    {fieldConf[f.key] && <span className={`px-1 rounded text-[10px] font-bold ${fieldConf[f.key].confidence >= 0.8 ? 'bg-green-100 text-green-600' : fieldConf[f.key].confidence >= 0.5 ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'}`}>{pct(fieldConf[f.key].confidence)}</span>}
                  </label>
                  <input
                    type={f.type}
                    value={fields[f.key] ?? ''}
                    onChange={(e) => updateField(f.key, f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                    className={`w-full rounded-lg px-3 py-2 text-sm border-2 ${hasError(f.key) ? 'border-red-400 bg-red-50' : 'border-gray-200'} focus:border-blue-400 focus:ring-1 focus:ring-blue-100`}
                  />
                  {hasError(f.key) && <p className="text-xs text-red-600 mt-0.5">{hasError(f.key).message}</p>}
                  {hasWarn(f.key) && <p className="text-xs text-yellow-600 mt-0.5">{hasWarn(f.key).message}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary">Line Items ({lineItems.length})</h3>
              <button onClick={addLineItem} className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Add Row</button>
            </div>
            {lineItems.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-text-secondary text-xs">
                    <tr>
                      <th className="text-left p-2 w-8">#</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2 w-20">Qty</th>
                      <th className="text-right p-2 w-24">Unit Price</th>
                      <th className="text-right p-2 w-20">Tax</th>
                      <th className="text-right p-2 w-24">Amount</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((it, i) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="p-2 text-gray-400">{i + 1}</td>
                        <td className="p-2"><input value={it.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                        <td className="p-2"><input type="number" value={it.quantity} onChange={(e) => updateLineItem(i, 'quantity', +e.target.value || 0)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" /></td>
                        <td className="p-2"><input type="number" value={it.unitPrice} onChange={(e) => updateLineItem(i, 'unitPrice', +e.target.value || 0)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" /></td>
                        <td className="p-2"><input type="number" value={it.tax} onChange={(e) => updateLineItem(i, 'tax', +e.target.value || 0)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" /></td>
                        <td className="p-2"><input type="number" value={it.amount} onChange={(e) => updateLineItem(i, 'amount', +e.target.value || 0)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" /></td>
                        <td className="p-2"><button onClick={() => removeLineItem(i)} className="text-red-400 hover:text-red-600 text-lg">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium text-xs">
                    <tr>
                      <td colSpan={5} className="p-2 text-right">Total:</td>
                      <td className="p-2 text-right">{fmt(lineItems.reduce((s, it) => s + (it.amount || 0), 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No line items detected. Click + Add Row to add manually.</p>
            )}
          </div>

          {/* Step 2 actions */}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="px-5 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              ← Back
            </button>
            <button onClick={handleProcess} disabled={loading}
              style={{ minHeight: '56px' }}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl text-base font-bold transition-all shadow-lg shadow-green-200 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Processing...
                </>
              ) : (
                <>🚀 Create Invoice + Update Inventory + Blockchain</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* STEP 3: RESULTS                            */}
      {/* ══════════════════════════════════════════ */}
      {step === 3 && result && (
        <div className="space-y-5">

          {/* Success banner */}
          <div className={`rounded-xl p-6 ${result.duplicate ? 'bg-yellow-50 border-2 border-yellow-300' : 'bg-green-50 border-2 border-green-300'}`}>
            <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
              {result.duplicate ? '⚠️ Duplicate — Existing Invoice' : '✅ Invoice Created Successfully!'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div><p className="text-xs text-gray-500">Invoice #</p><p className="font-bold">{result.invoice?.invoiceNumber}</p></div>
              <div><p className="text-xs text-gray-500">Vendor</p><p className="font-medium">{result.parsed?.vendorName || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Total</p><p className="font-bold text-xl">{fmt(result.invoice?.totalAmount)}</p></div>
              <div><p className="text-xs text-gray-500">Due Date</p><p className="font-medium">{result.invoice?.dueDate ? new Date(result.invoice.dueDate).toLocaleDateString('en-IN') : '—'}</p></div>
            </div>
          </div>

          {/* Blockchain */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-semibold text-text-primary mb-3">⛓️ Blockchain Anchor</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className={`font-semibold ${result.blockchainRecord?.txHash ? 'text-green-700' : 'text-yellow-600'}`}>
                  {result.blockchainRecord?.txHash ? '✓ Anchored on-chain' : '⏳ Pending'}
                </p>
              </div>
              {result.blockchainRecord?.txHash && (
                <div><p className="text-xs text-gray-500">TX Hash</p><p className="font-mono text-xs break-all">{result.blockchainRecord.txHash}</p></div>
              )}
              {result.invoice?.hash && (
                <div><p className="text-xs text-gray-500">Record Hash</p><p className="font-mono text-xs break-all">{result.invoice.hash}</p></div>
              )}
              {result.blockchainRecord?.blockNumber != null && (
                <div><p className="text-xs text-gray-500">Block #</p><p className="font-medium">{result.blockchainRecord.blockNumber}</p></div>
              )}
            </div>
            {result.invoice?._id && (
              <button onClick={handleVerify} disabled={verifying}
                className="mt-4 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm hover:bg-blue-100 transition disabled:opacity-50">
                {verifying ? 'Verifying...' : '🔍 Verify Against Blockchain'}
              </button>
            )}
            {verifyResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${verifyResult.verified ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                <p className="font-semibold">{verifyResult.verified ? '✓ Verified — hash matches blockchain' : '✗ Verification failed'}</p>
                <p className="text-xs mt-1">Hash: {verifyResult.hashMatch ? '✓' : '✗'} | Chain: {verifyResult.blockchainVerified ? '✓' : '✗'}</p>
              </div>
            )}
          </div>

          {/* Vendor match */}
          {result.matchedSupplier && (
            <div className="bg-white rounded-xl shadow-sm border border-border p-5">
              <h3 className="font-semibold text-text-primary mb-1">🏢 Matched Vendor</h3>
              <p className="text-sm">{result.matchedSupplier.name} ({result.matchedSupplier.code})</p>
            </div>
          )}

          {/* Inventory */}
          {result.inventoryUpdates?.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-border p-6">
              <h3 className="font-semibold text-text-primary mb-3">📦 Inventory Updated ({result.inventoryUpdates.length} items)</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr><th className="text-left p-2">Product</th><th className="text-left p-2">SKU</th><th className="text-right p-2">Qty Added</th><th className="text-right p-2">Match</th></tr>
                </thead>
                <tbody>
                  {result.inventoryUpdates.map((u, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2 font-medium">{u.productName}</td>
                      <td className="p-2 text-gray-500">{u.sku}</td>
                      <td className="p-2 text-right text-green-700 font-medium">+{u.quantity}</td>
                      <td className="p-2 text-right">{pct(u.matchScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ledger */}
          {result.journalEntry && (
            <div className="bg-white rounded-xl shadow-sm border border-border p-5">
              <h3 className="font-semibold text-text-primary mb-1">📒 Ledger Entry</h3>
              <p className="text-sm text-gray-600">{result.journalEntry.entryNumber} — {result.journalEntry.description}</p>
            </div>
          )}

          {/* Warnings */}
          {result.validation?.warnings?.length > 0 && (
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
              {result.validation.warnings.map((w, i) => <p key={i} className="text-xs text-yellow-700">⚠️ {w.field}: {w.message}</p>)}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={reset} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition">
              📄 Scan Another Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
