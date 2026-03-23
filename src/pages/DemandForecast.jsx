import { useEffect, useState } from 'react'
import { demandForecastService } from '../services/erpServices'
import { useStore } from '../store/useStore'

export default function DemandForecast() {
  const addToast = useStore((s) => s.addToast)
  const [tab, setTab] = useState('forecast')
  const [forecast, setForecast] = useState(null)
  const [topProducts, setTopProducts] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadTab() }, [tab])

  const loadTab = async () => {
    setLoading(true)
    try {
      if (tab === 'forecast') setForecast(await demandForecastService.forecast(null, 6))
      if (tab === 'top-products') setTopProducts(await demandForecastService.topProducts(10))
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const tabs = [
    { id: 'forecast', label: 'Demand Forecast' },
    { id: 'top-products', label: 'Top Products' },
  ]

  const maxQty = forecast
    ? Math.max(...[...(forecast.history || []).map((h) => h.quantity), ...(forecast.forecast || []).map((f) => f.predictedQuantity)], 1)
    : 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Demand Forecasting</h1>
        <p className="text-text-secondary mt-1">Linear regression predictions based on historical order data.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-text-secondary py-8 text-center">Loading...</div>}

      {!loading && tab === 'forecast' && forecast && (
        <div className="space-y-4">
          {forecast.message && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">{forecast.message}</div>
          )}

          {forecast.trend && (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${forecast.trend === 'increasing' ? 'bg-green-100 text-green-700' : forecast.trend === 'decreasing' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
              {forecast.trend === 'increasing' ? '📈' : forecast.trend === 'decreasing' ? '📉' : '➡️'} Trend: {forecast.trend}
            </div>
          )}

          {/* Visual bar chart */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-semibold text-text-primary mb-4">Historical vs Forecast</h3>
            <div className="space-y-2">
              {(forecast.history || []).map((h) => (
                <div key={h.month} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-20 shrink-0">{h.month}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                    <div className="bg-primary rounded-full h-6 flex items-center justify-end pr-2 text-xs text-white font-medium"
                      style={{ width: `${Math.max((h.quantity / maxQty) * 100, 8)}%` }}>
                      {h.quantity}
                    </div>
                  </div>
                </div>
              ))}
              {(forecast.forecast || []).map((f) => (
                <div key={f.month} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-20 shrink-0">{f.month}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                    <div className="bg-amber-400 rounded-full h-6 flex items-center justify-end pr-2 text-xs text-white font-medium"
                      style={{ width: `${Math.max((f.predictedQuantity / maxQty) * 100, 8)}%` }}>
                      {f.predictedQuantity}
                    </div>
                  </div>
                  <span className="text-xs text-amber-600 font-medium">forecast</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-text-secondary">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-primary rounded-full inline-block" /> Historical</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-400 rounded-full inline-block" /> Predicted</span>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'top-products' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">#</th><th className="text-left p-3">Product</th><th className="text-left p-3">SKU</th><th className="text-right p-3">Total Demand (3mo)</th></tr>
            </thead>
            <tbody>
              {topProducts.map((tp, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-medium">{i + 1}</td>
                  <td className="p-3 font-medium">{tp.product?.name || 'Unknown'}</td>
                  <td className="p-3 font-mono text-text-secondary">{tp.product?.sku || '—'}</td>
                  <td className="p-3 text-right font-bold">{tp.totalDemand}</td>
                </tr>
              ))}
              {topProducts.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-text-secondary">No order data yet. Create sales orders to generate demand data.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
