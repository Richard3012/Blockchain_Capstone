import { useState, useMemo, useEffect, useRef } from 'react'

export default function LineChart({ data, width = 500, height = 250 }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [isAnimated, setIsAnimated] = useState(false)
  const pathRef = useRef(null)
  
  const padding = { top: 20, right: 20, bottom: 40, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const { path, points, maxValue, yLabels } = useMemo(() => {
    if (!data || data.length === 0) return { path: '', points: [], maxValue: 0, yLabels: [] }
    
    const values = data.map(d => d.revenue)
    const max = Math.max(...values) * 1.1
    const min = 0
    
    // Generate y-axis labels
    const labelCount = 5
    const yLabels = []
    for (let i = 0; i <= labelCount; i++) {
      const value = min + (max - min) * (i / labelCount)
      yLabels.push({
        value,
        y: chartHeight - (i / labelCount) * chartHeight
      })
    }

    const pts = data.map((d, i) => ({
      x: (i / (data.length - 1)) * chartWidth,
      y: chartHeight - ((d.revenue - min) / (max - min)) * chartHeight,
      ...d
    }))

    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

    return { path: pathD, points: pts, maxValue: max, yLabels }
  }, [data, chartWidth, chartHeight])

  useEffect(() => {
    setIsAnimated(false)
    const timer = setTimeout(() => setIsAnimated(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const formatValue = (val) => {
    if (val >= 1000000) return `₹${(val / 1000000).toFixed(1)}M`
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`
    return `₹${val}`
  }

  const pathLength = pathRef.current?.getTotalLength() || 1000

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4361ee" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#4361ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Grid lines */}
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

          {/* X-axis labels */}
          {points.map((point, i) => (
            <text
              key={i}
              x={point.x}
              y={chartHeight + 25}
              textAnchor="middle"
              className="text-xs fill-text-muted"
            >
              {point.month}
            </text>
          ))}

          {/* Area fill */}
          {points.length > 0 && (
            <path
              d={`${path} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`}
              fill="url(#lineGradient)"
              className={`transition-opacity duration-500 ${isAnimated ? 'opacity-100' : 'opacity-0'}`}
            />
          )}

          {/* Line */}
          <path
            ref={pathRef}
            d={path}
            fill="none"
            stroke="#4361ee"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: pathLength,
              strokeDashoffset: isAnimated ? 0 : pathLength,
              transition: 'stroke-dashoffset 1.2s ease-out'
            }}
          />

          {/* Data points */}
          {points.map((point, i) => (
            <g key={i}>
              <circle
                cx={point.x}
                cy={point.y}
                r={hoveredIndex === i ? 6 : 4}
                fill="white"
                stroke="#4361ee"
                strokeWidth={2}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  opacity: isAnimated ? 1 : 0,
                  transition: `opacity 0.3s ease-out ${i * 0.1}s, r 0.2s`
                }}
              />
            </g>
          ))}

          {/* Hover line and tooltip */}
          {hoveredIndex !== null && points[hoveredIndex] && (
            <>
              <line
                x1={points[hoveredIndex].x}
                y1={0}
                x2={points[hoveredIndex].x}
                y2={chartHeight}
                stroke="#4361ee"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.5}
              />
              <g transform={`translate(${points[hoveredIndex].x}, ${points[hoveredIndex].y - 40})`}>
                <rect
                  x={-50}
                  y={0}
                  width={100}
                  height={30}
                  rx={6}
                  fill="#1a1a2e"
                />
                <text
                  x={0}
                  y={19}
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  {formatValue(points[hoveredIndex].revenue)}
                </text>
              </g>
            </>
          )}
        </g>
      </svg>
    </div>
  )
}
