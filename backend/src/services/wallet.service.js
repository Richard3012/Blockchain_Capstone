import crypto from 'crypto'

import { ethers } from 'ethers'

import { User } from '../models/user.model.js'
import { logger } from '../utils/logger.js'

export const walletService = {
  async requestLinkNonce(userId) {
    const nonce = `Link wallet to BlockERP:${crypto.randomBytes(16).toString('hex')}`
    const user = await User.findByIdAndUpdate(
      userId,
      {
        walletLinkNonce: nonce,
        walletLinkNonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      { new: true },
    )

    logger.info('wallet.nonce_requested', { userId: user._id.toString() })

    return {
      nonce,
      expiresAt: user.walletLinkNonceExpiresAt,
    }
  },

  async verifyLink(userId, signature) {
    const user = await User.findById(userId)
    if (!user?.walletLinkNonce || !user.walletLinkNonceExpiresAt || user.walletLinkNonceExpiresAt.getTime() < Date.now()) {
      const error = new Error('Wallet link nonce is missing or expired')
      error.statusCode = 400
      throw error
    }

    const recoveredAddress = ethers.verifyMessage(user.walletLinkNonce, signature).toLowerCase()

    const duplicate = await User.findOne({ linkedWalletAddress: recoveredAddress, _id: { $ne: userId } })
    if (duplicate) {
      const error = new Error('Wallet is already linked to another user')
      error.statusCode = 409
      throw error
    }

    user.linkedWalletAddress = recoveredAddress
    user.walletLinkedAt = new Date()
    user.walletLinkNonce = undefined
    user.walletLinkNonceExpiresAt = undefined
    await user.save()

    logger.info('wallet.linked', { userId: user._id.toString(), wallet: recoveredAddress })

    return {
      linkedWalletAddress: user.linkedWalletAddress,
      walletLinkedAt: user.walletLinkedAt,
    }
  },
}
