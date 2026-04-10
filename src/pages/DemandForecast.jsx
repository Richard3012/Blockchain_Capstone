import { useEffect, useState, useMemo } from 'react'
import { demandForecastService } from '../services/erpServices'
import { useStore } from '../store/useStore'

export default function DemandForecast() {
  const addToast = useStore((s) => s.addToast)
  const searchQuery = useStore((s) => s.searchQuery)
  const [tab, setTab] = useState('forecast')
  const [forecast, setForecast] = useState(null)
  const [topProducts, setTopProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [months, setMonths] = useState(6)
  const [topCount, setTopCount] = useState(10)
  const [localSearch, setLocalSearch] = useState('')

  useEffect(() => { loadTab() }, [tab, months, topCount])

  const loadTab = async () => {
    setLoading(true)
    try {
      if (tab === 'forecast') setForecast(await demandForecastService.forecast(null, months))
      if (tab === 'top-products') setTopProducts(await demandForecastService.topProducts(topCount))
    } catch (e) { addToast(e.message, 'error') }
    setLoading(false)
  }

  const filteredProducts = useMemo(() => {
    const q = (localSearch || searchQuery || '').toLowerCase()
    if (!q) return topProducts
    return topProducts.filter(tp => tp.product?.name?.toLowerCase().includes(q) || tp.product?.sku?.toLowerCase().includes(q))
  }, [topProducts, localSearch, searchQuery])

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
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary">Forecast horizon:</label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
              className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm">
              {[3, 6, 9, 12].map(m => <option key={m} value={m}>{m} months</option>)}
            </select>
          </div>
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
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by product name or SKU..."
              className="w-64 px-4 py-2 bg-white border border-border rounded-lg text-sm" />
            <select value={topCount} onChange={(e) => setTopCount(Number(e.target.value))}
              className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm">
              {[5, 10, 20, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr><th className="text-left p-3">#</th><th className="text-left p-3">Product</th><th className="text-left p-3">SKU</th><th className="text-right p-3">Total Demand (3mo)</th></tr>
            </thead>
            <tbody>
              {filteredProducts.map((tp, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-medium">{i + 1}</td>
                  <td className="p-3 font-medium">{tp.product?.name || 'Unknown'}</td>
                  <td className="p-3 font-mono text-text-secondary">{tp.product?.sku || '—'}</td>
                  <td className="p-3 text-right font-bold">{tp.totalDemand}</td>
                </tr>
              ))}
              {filteredProducts.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-text-secondary">No products match your search.</td></tr>}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  )
}
