import { logger } from '../utils/logger.js'

let bot = null

export const telegramService = {
  initialize(botToken, chatId) {
    if (!botToken) {
      logger.warn('telegram.skipped', { reason: 'No TELEGRAM_BOT_TOKEN configured' })
      return
    }

    bot = { token: botToken, chatId }
    logger.info('telegram.initialized', { chatId })
  },

  async sendMessage(text) {
    if (!bot) return { sent: false, reason: 'Bot not initialized' }

    const response = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: bot.chatId, text, parse_mode: 'HTML' }),
    })

    if (!response.ok) {
      const body = await response.text()
      logger.error('telegram.send_failed', { body })
      return { sent: false, reason: body }
    }

    logger.info('telegram.message_sent')
    return { sent: true }
  },

  async notifyLowStock(products) {
    if (!products.length) return
    const lines = products.map((p) => `• <b>${p.name}</b>: ${p.currentStock} (reorder: ${p.reorderLevel})`)
    return this.sendMessage(`⚠️ <b>Low Stock Alert</b>\n\n${lines.join('\n')}`)
  },

  async notifyInvoiceCreated(invoice) {
    return this.sendMessage(
      `📄 <b>New Invoice</b>\n${invoice.invoiceNumber}\nAmount: ₹${invoice.totalAmount}`,
    )
  },

  async notifyOrderCreated(order) {
    return this.sendMessage(
      `🛒 <b>New Order</b>\n${order.orderNumber}\nAmount: ₹${order.totalAmount}`,
    )
  },

  isActive() {
    return bot !== null
  },
}
