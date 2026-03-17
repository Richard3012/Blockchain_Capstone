import 'dotenv/config'

const parseNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/blockerp',
  jwtSecret: process.env.JWT_SECRET || 'replace-this-in-env',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  blockchainRpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545',
  blockchainPrivateKey: process.env.BLOCKCHAIN_PRIVATE_KEY || '',
  recordAnchorAddress: process.env.RECORD_ANCHOR_ADDRESS || '',
  pinataJwt: process.env.PINATA_JWT || '',
  pinataApiKey: process.env.PINATA_API_KEY || '',
  pinataGateway: process.env.PINATA_GATEWAY || '',
}
