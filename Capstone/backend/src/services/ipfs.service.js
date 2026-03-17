import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

export const ipfsService = {
  async uploadJson(name, payload) {
    if (!env.pinataJwt) {
      return {
        status: 'skipped',
        cid: null,
        note: 'Pinata credentials not configured',
      }
    }

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.pinataJwt}`,
      },
      body: JSON.stringify({
        pinataMetadata: { name },
        pinataContent: payload,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Pinata upload failed: ${body}`)
    }

    const result = await response.json()
    logger.info('ipfs.uploaded', { name, cid: result.IpfsHash })

    return {
      status: 'uploaded',
      cid: result.IpfsHash,
      gatewayUrl: env.pinataGateway ? `${env.pinataGateway.replace(/\/$/, '')}/ipfs/${result.IpfsHash}` : null,
    }
  },
}
