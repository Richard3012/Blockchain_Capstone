import { blockchainService } from './blockchain.service.js'
import { ipfsService } from './ipfs.service.js'
import { hashRecord } from '../utils/hash-record.js'
import { logger } from '../utils/logger.js'

export const verificationService = {
  async anchorEntity({ companyId, entityType, entity, payload, requestedBy, actorAddress }) {
    const recordHash = hashRecord(payload)
    logger.info('verification.hash_generated', { entityType, entityId: entity._id.toString(), hash: recordHash })

    const upload = await ipfsService.uploadJson(`${entityType}-${entity._id.toString()}`, payload)

    entity.hash = recordHash
    entity.documentCid = upload.cid || entity.documentCid || ''
    entity.verificationStatus = 'pending'
    await entity.save()

    const blockchainRecord = await blockchainService.anchorRecord({
      companyId,
      entityType,
      entityId: entity._id,
      recordHash,
      ipfsCid: upload.cid || '',
      requestedBy,
      actorAddress,
    })

    entity.verificationStatus = blockchainRecord.status === 'anchored' ? 'verified' : 'failed'
    await entity.save()

    return blockchainRecord
  },
}
