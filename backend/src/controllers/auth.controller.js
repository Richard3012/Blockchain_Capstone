import { z } from 'zod'

import { asyncHandler } from '../middlewares/async-handler.js'
import { authService } from '../services/auth.service.js'

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.string().optional(),
  companyId: z.string().optional(),
  storeId: z.string().optional(),
  companyName: z.string().optional(),
  storeName: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const authController = {
  register: asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body)
    const result = await authService.register(payload)
    res.status(201).json({ success: true, data: result })
  }),

  login: asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body)
    const result = await authService.login(payload.email, payload.password)
    res.json({ success: true, data: result })
  }),

  me: asyncHandler(async (req, res) => {
    res.json({ success: true, data: authService.sanitizeUser(req.user) })
  }),
}
