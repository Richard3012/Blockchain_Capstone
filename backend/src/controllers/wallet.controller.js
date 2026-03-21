import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { walletService } from '../services/wallet.service.js'

const verifySchema = z.object({
  signature: z.string().min(10),
})

export const walletController = {
  requestLinkNonce: asyncHandler(async (req, res) => {
    const result = await walletService.requestLinkNonce(req.user._id)
    res.json({ success: true, data: result })
  }),

  verifyLink: asyncHandler(async (req, res) => {
    const payload = verifySchema.parse(req.body)
    const result = await walletService.verifyLink(req.user._id, payload.signature)
    res.json({ success: true, data: result })
  }),

  status: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        linkedWalletAddress: req.user.linkedWalletAddress || null,
        walletLinkedAt: req.user.walletLinkedAt || null,
      },
    })
  }),
}
