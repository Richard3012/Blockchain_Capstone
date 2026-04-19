import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

// ── Helpers ───────────────────────────────────────────────
const userOrIp = (prefix) => (req, res) => {
  const uid = req.user?._id || req.user?.id
  if (uid) return `${prefix}:${uid}`
  return `${prefix}:ip:${ipKeyGenerator(req, res)}`
}

const limiterDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
}

// ── AI Assistant (LLM calls) — 10 req/min/user ───────────
export const aiAssistantLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 10,
  keyGenerator: userOrIp('ai'),
  message: {
    success: false,
    message: 'Too many AI requests. Please wait a moment before asking again.',
  },
})

// ── Invoice Scanner (OCR + Document AI) — 10 req/min/user ─
export const invoiceScannerLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 10,
  keyGenerator: userOrIp('scan'),
  message: {
    success: false,
    message: 'Too many scan requests. Please wait before uploading another document.',
  },
})

// ── OCR Intelligence endpoints — 15 req/min/user ─────────
export const ocrIntelligenceLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 15,
  keyGenerator: userOrIp('ocr'),
  message: {
    success: false,
    message: 'Too many OCR requests. Please wait before trying again.',
  },
})

// ── Blockchain anchor (on-chain write) — 5 req/min/user ──
export const blockchainWriteLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 5,
  keyGenerator: userOrIp('chain'),
  message: {
    success: false,
    message: 'Too many blockchain transactions. Please wait before anchoring again.',
  },
})

// ── Heavy compute (demand forecast, GST generation) — 15 req/min/user ─
export const heavyComputeLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 15,
  keyGenerator: userOrIp('heavy'),
  message: {
    success: false,
    message: 'Too many requests. Please wait before trying again.',
  },
})

// ── Public webhook (WhatsApp) — 60 req/min/IP ─────────────
export const webhookLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req, res) => `wh:ip:${ipKeyGenerator(req, res)}`,
  message: {
    success: false,
    message: 'Too many webhook requests.',
  },
})
