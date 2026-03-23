import { asyncHandler } from '../middlewares/async-handler.js'
import { aiAssistantService } from '../services/ai-assistant.service.js'

export const aiAssistantController = {
  query: asyncHandler(async (req, res) => {
    const { query } = req.body
    if (!query || typeof query !== 'string') {
      const err = new Error('query string is required')
      err.statusCode = 400
      throw err
    }

    const result = await aiAssistantService.processQuery(req.user.companyId, query)
    res.json({ success: true, data: result })
  }),
}
