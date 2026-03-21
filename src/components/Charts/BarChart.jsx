import { useState, useMemo, useEffect } from 'react'

export default function BarChart({ data, width = 400, height = 250, barColor = '#4361ee' }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [isAnimated, setIsAnimated] = useState(false)
  
  const padding = { top: 30, right: 20, bottom: 40, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimated(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const { bars, maxValue, yLabels } = useMemo(() => {
    if (!data || data.length === 0) return { bars: [], maxValue: 0, yLabels: [] }
    
    const values = data.map(d => d.value)
    const max = Math.max(...values) * 1.2
    
    const barWidth = (chartWidth / data.length) * 0.6
    const barGap = (chartWidth / data.length) * 0.4

    const bars = data.map((d, i) => ({
      ...d,
      x: i * (barWidth + barGap) + barGap / 2,
      y: chartHeight - (d.value / max) * chartHeight,
      width: barWidth,
      height: (d.value / max) * chartHeight
    }))

    // Y-axis labels
    const labelCount = 4
    const yLabels = []
    for (let i = 0; i <= labelCount; i++) {
      const value = (max * i) / labelCount
      yLabels.push({
        value,
        y: chartHeight - (i / labelCount) * chartHeight
      })
    }

    return { bars, maxValue: max, yLabels }
  }, [data, chartWidth, chartHeight])

  const formatValue = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`
    return val.toFixed(0)
  }

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Y-axis grid lines and labels */}
          {yLabels.map((label, i) => (
            <g key={i}>
              <line
                x1={0}
                y1={label.y}
                x2={chartWidth}
                y2={label.y}
                stroke="#f0f0f0"
                strokeDasharray="4 4"
              />
              <text
                x={-10}
                y={label.y}
                textAnchor="end"
                alignmentBaseline="middle"
                className="text-xs fill-text-muted"
              >
                {formatValue(label.value)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {bars.map((bar, i) => (
            <g key={i}>
              <rect
                x={bar.x}
                y={isAnimated ? bar.y : chartHeight}
                width={bar.width}
                height={isAnimated ? bar.height : 0}
                rx={4}
                fill={bar.color || barColor}
                className={`cursor-pointer transition-all duration-500`}
                style={{
                  transitionDelay: `${i * 0.05}s`,
                  opacity: hoveredIndex !== null && hoveredIndex !== i ? 0.5 : 1
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              
              {/* Value on top of bar */}
              <text
                x={bar.x + bar.width / 2}
                y={isAnimated ? bar.y - 8 : chartHeight - 8}
                textAnchor="middle"
                className="text-xs font-medium fill-text-primary transition-all duration-500"
                style={{
                  transitionDelay: `${i * 0.05}s`,
                  opacity: isAnimated ? 1 : 0
                }}
              >
                {bar.value.toLocaleString()}
              </text>

              {/* X-axis label */}
              <text
                x={bar.x + bar.width / 2}
                y={chartHeight + 20}
                textAnchor="middle"
                className="text-xs fill-text-muted"
              >
                {bar.label}
              </text>
            </g>
          ))}

          {/* Tooltip on hover */}
          {hoveredIndex !== null && bars[hoveredIndex] && (
            <g transform={`translate(${bars[hoveredIndex].x + bars[hoveredIndex].width / 2}, ${bars[hoveredIndex].y - 40})`}>
              <rect
                x={-45}
                y={0}
                width={90}
                height={28}
                rx={6}
                fill="#1a1a2e"
              />
              <text
                x={0}
                y={18}
                textAnchor="middle"
                className="text-xs fill-white font-medium"
              >
                {bars[hoveredIndex].label}: {bars[hoveredIndex].value.toLocaleString()}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  )
}
