import { SalesOrder } from '../models/sales-order.model.js'
import { Invoice } from '../models/invoice.model.js'
import { Product } from '../models/product.model.js'
import { logger } from '../utils/logger.js'

const linearRegression = (data) => {
  const n = data.length
  if (n < 2) return { slope: 0, intercept: data[0]?.y || 0 }

  let sumX = 0; let sumY = 0; let sumXY = 0; let sumXX = 0
  for (const point of data) {
    sumX += point.x
    sumY += point.y
    sumXY += point.x * point.y
    sumXX += point.x * point.x
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

export const demandForecastService = {
  async getHistoricalDemand(companyId, productId, months = 12) {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)

    const orders = await SalesOrder.find({
      companyId,
      status: { $in: ['processing', 'delivered'] },
      orderDate: { $gte: startDate, $lte: endDate },
    }).lean()

    const monthlyDemand = {}
    for (const order of orders) {
      for (const item of order.items) {
        if (productId && item.product.toString() !== productId) continue
        const key = `${order.orderDate.getFullYear()}-${String(order.orderDate.getMonth() + 1).padStart(2, '0')}`
        monthlyDemand[key] = (monthlyDemand[key] || 0) + item.quantity
      }
    }

    return Object.entries(monthlyDemand)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, quantity]) => ({ month, quantity }))
  },

  async forecast(companyId, productId, forecastMonths = 3) {
    const history = await this.getHistoricalDemand(companyId, productId, 12)

    if (history.length < 2) {
      return { history, forecast: [], message: 'Insufficient data for forecasting' }
    }

    const data = history.map((point, index) => ({ x: index, y: point.quantity }))
    const { slope, intercept } = linearRegression(data)

    const forecast = []
    const now = new Date()
    for (let i = 1; i <= forecastMonths; i++) {
      const futureDate = new Date(now)
      futureDate.setMonth(futureDate.getMonth() + i)
      const predictedQuantity = Math.max(0, Math.round(slope * (data.length + i - 1) + intercept))
      forecast.push({
        month: `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`,
        predictedQuantity,
      })
    }

    logger.info('demand.forecast_generated', { companyId: companyId.toString(), productId, forecastMonths })
    return { history, forecast, trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable' }
  },

  async getTopProducts(companyId, limit = 10) {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const orders = await SalesOrder.find({
      companyId,
      status: { $in: ['processing', 'delivered'] },
      orderDate: { $gte: threeMonthsAgo },
    }).lean()

    const productDemand = {}
    for (const order of orders) {
      for (const item of order.items) {
        const pid = item.product.toString()
        productDemand[pid] = (productDemand[pid] || 0) + item.quantity
      }
    }

    const sorted = Object.entries(productDemand)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)

    const productIds = sorted.map(([id]) => id)
    const products = await Product.find({ _id: { $in: productIds } }).lean()
    const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]))

    return sorted.map(([id, totalDemand]) => ({
      product: productMap[id] || { _id: id, name: 'Unknown' },
      totalDemand,
    }))
  },
}
