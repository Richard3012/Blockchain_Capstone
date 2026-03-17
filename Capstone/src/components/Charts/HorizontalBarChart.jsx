import { useState, useMemo, useEffect } from 'react'

export default function HorizontalBarChart({ data, width = 400, height = 300 }) {
  const [isAnimated, setIsAnimated] = useState(false)
  
  const padding = { top: 20, right: 40, bottom: 20, left: 140 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimated(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const { bars, maxValue } = useMemo(() => {
    if (!data || data.length === 0) return { bars: [], maxValue: 0 }
    
    const allValues = data.flatMap(d => [d.stock, d.reorder])
    const max = Math.max(...allValues) * 1.1
    
    const barHeight = Math.min(20, (chartHeight / data.length - 20) / 2)
    const rowHeight = chartHeight / data.length

    const bars = data.map((d, i) => ({
      ...d,
      y: i * rowHeight + (rowHeight - barHeight * 2 - 8) / 2,
      stockWidth: (d.stock / max) * chartWidth,
      reorderWidth: (d.reorder / max) * chartWidth,
      barHeight
    }))

    return { bars, maxValue: max }
  }, [data, chartWidth, chartHeight])

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {bars.map((bar, i) => (
            <g key={i} transform={`translate(0, ${bar.y})`}>
              {/* Product name */}
              <text
                x={-10}
                y={bar.barHeight + 4}
                textAnchor="end"
                className="text-xs fill-text-secondary"
              >
                {bar.name.length > 18 ? bar.name.substring(0, 18) + '...' : bar.name}
              </text>

              {/* Stock bar (blue) */}
              <rect
                x={0}
                y={0}
                width={isAnimated ? bar.stockWidth : 0}
                height={bar.barHeight}
                rx={3}
                fill="#4361ee"
                className="transition-all duration-500"
                style={{ transitionDelay: `${i * 0.05}s` }}
              />
              
              {/* Stock value */}
              <text
                x={isAnimated ? bar.stockWidth + 8 : 8}
                y={bar.barHeight - 4}
                className="text-xs fill-text-primary transition-all duration-500"
                style={{ 
                  transitionDelay: `${i * 0.05}s`,
                  opacity: isAnimated ? 1 : 0 
                }}
              >
                {bar.stock}
              </text>

              {/* Reorder bar (orange) */}
              <rect
                x={0}
                y={bar.barHeight + 4}
                width={isAnimated ? bar.reorderWidth : 0}
                height={bar.barHeight}
                rx={3}
                fill="#f39c12"
                className="transition-all duration-500"
                style={{ transitionDelay: `${i * 0.05 + 0.1}s` }}
              />

              {/* Reorder value */}
              <text
                x={isAnimated ? bar.reorderWidth + 8 : 8}
                y={bar.barHeight * 2 + 4 - 4}
                className="text-xs fill-text-muted transition-all duration-500"
                style={{ 
                  transitionDelay: `${i * 0.05 + 0.1}s`,
                  opacity: isAnimated ? 1 : 0 
                }}
              >
                {bar.reorder}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute top-0 right-0 flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue" />
          <span className="text-text-secondary">Stock</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange" />
          <span className="text-text-secondary">Reorder Level</span>
        </div>
      </div>
    </div>
  )
}
