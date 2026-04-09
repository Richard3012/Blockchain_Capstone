import { ethers } from 'ethers'

import { env } from '../config/env.js'
import { BlockchainRecord } from '../models/blockchain-record.model.js'
import { logger } from '../utils/logger.js'

const recordAnchorAbi = [
  'function anchorRecord(string entityType,string entityId,bytes32 recordHash,string ipfsCid,address actor) external returns (bytes32)',
  'function verifyRecord(string entityType,string entityId,bytes32 recordHash) external view returns (bool)',
  'function getRecord(string entityType,string entityId) external view returns (tuple(string entityType,string entityId,bytes32 recordHash,string ipfsCid,uint256 anchoredAt,address actor,bool exists,bool revoked))',
]

const getContract = () => {
  if (!env.recordAnchorAddress || !env.blockchainPrivateKey) {
    return null
  }

  const provider = new ethers.JsonRpcProvider(env.blockchainRpcUrl)
  const wallet = new ethers.Wallet(env.blockchainPrivateKey, provider)
  return {
    wallet,
    contract: new ethers.Contract(env.recordAnchorAddress, recordAnchorAbi, wallet),
  }
}

const isRecoverableChainError = (error) => {
  const message = String(error?.shortMessage || error?.reason || error?.message || '').toLowerCase()
  return [
    'could not coalesce error',
    'failed to fetch',
    'network error',
    'missing response',
    'connect econnrefused',
    'connection refused',
    'unsupported network',
    'timeout',
  ].some((fragment) => message.includes(fragment))
}

export const blockchainService = {
  async anchorRecord({ companyId, entityType, entityId, recordHash, ipfsCid, requestedBy, actorAddress }) {
    const connection = getContract()

    const blockchainRecord = await BlockchainRecord.create({
      companyId,
      entityType,
      entityId: entityId.toString(),
      recordHash,
      ipfsCid: ipfsCid || '',
      status: connection ? 'pending' : 'failed',
      requestedBy,
      errorMessage: connection ? undefined : 'Blockchain contract not configured',
    })

    if (!connection) {
      logger.warn('blockchain.anchor_skipped', { entityType, entityId: entityId.toString(), reason: 'contract_not_configured' })
      return blockchainRecord
    }

    const { contract, wallet } = connection
    const anchoredBy = ethers.isAddress(actorAddress) ? actorAddress : wallet.address

    logger.info('blockchain.tx_sent', { entityType, entityId: entityId.toString(), recordHash })

    try {
      const transaction = await contract.anchorRecord(entityType, entityId.toString(), recordHash, ipfsCid || '', anchoredBy)
      const receipt = await transaction.wait()

      blockchainRecord.status = 'anchored'
      blockchainRecord.txHash = transaction.hash
      blockchainRecord.blockNumber = receipt.blockNumber
      blockchainRecord.contractAddress = contract.target
      blockchainRecord.anchoredAt = new Date()
      await blockchainRecord.save()

      logger.info('blockchain.tx_confirmed', {
        entityType,
        entityId: entityId.toString(),
        txHash: transaction.hash,
        blockNumber: receipt.blockNumber,
      })
    } catch (error) {
      blockchainRecord.errorMessage = error?.shortMessage || error?.reason || error?.message || 'Blockchain anchor failed'
      blockchainRecord.status = isRecoverableChainError(error) ? 'pending' : 'failed'
      await blockchainRecord.save()

      logger.warn(isRecoverableChainError(error) ? 'blockchain.tx_deferred' : 'blockchain.tx_failed', {
        entityType,
        entityId: entityId.toString(),
        recordHash,
        error: blockchainRecord.errorMessage,
        status: blockchainRecord.status,
      })
    }

    return blockchainRecord
  },

  async verifyRecord(entityType, entityId, recordHash) {
    const connection = getContract()
    if (!connection) {
      return { verified: false, configured: false }
    }

    try {
      const { contract } = connection
      logger.info('blockchain.verify_requested', { entityType, entityId: entityId.toString(), recordHash })
      const verified = await contract.verifyRecord(entityType, entityId.toString(), recordHash)
      logger.info('blockchain.verify_completed', { entityType, entityId: entityId.toString(), verified })
      return { verified, configured: true }
    } catch (error) {
      const message = error?.shortMessage || error?.reason || error?.message || 'Blockchain verification failed'
      logger.warn('blockchain.verify_failed', {
        entityType,
        entityId: entityId.toString(),
        recordHash,
        error: message,
      })
      return {
        verified: false,
        configured: true,
        error: message,
      }
    }
  },

  async getLedger(companyId) {
    return BlockchainRecord.find({ companyId }).sort({ createdAt: -1 })
  },
}
