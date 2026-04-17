import 'dotenv/config'

const parseNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const isProduction = process.env.NODE_ENV === 'production'

// Fail-closed: refuse to start in production without critical secrets
if (isProduction) {
  const required = ['JWT_SECRET', 'MONGODB_URI']
  const missing = required.filter((key) => !process.env[key])
  if (missing.length) {
    console.error(`FATAL: Missing required env vars for production: ${missing.join(', ')}`)
    process.exit(1)
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: parseNumber(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/blockerp',
  mongoFallback: process.env.MONGO_FALLBACK !== 'false',
  jwtSecret: process.env.JWT_SECRET || (isProduction ? undefined : 'dev-only-secret-do-not-use-in-prod'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  clientOrigins: (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  blockchainRpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545',
  blockchainPrivateKey: process.env.BLOCKCHAIN_PRIVATE_KEY || '',
  recordAnchorAddress: process.env.RECORD_ANCHOR_ADDRESS || '',
  pinataJwt: process.env.PINATA_JWT || '',
  pinataApiKey: process.env.PINATA_API_KEY || '',
  pinataGateway: process.env.PINATA_GATEWAY || '',
  googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY || '',
}
