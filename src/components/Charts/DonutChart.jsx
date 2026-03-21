import { useState, useMemo, useEffect } from 'react'

export default function DonutChart({ data, segments: propSegments, width = 280, height = 200, size, colors }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [isAnimated, setIsAnimated] = useState(false)
  
  // Support both 'data' and 'segments' props, also support 'size' prop
  const segments = data || propSegments || []
  const actualWidth = size || width
  const actualHeight = size || height
  
  const centerX = actualWidth / 2 - 60
  const centerY = actualHeight / 2
  const outerRadius = Math.min(centerX, centerY) - 10
  const innerRadius = outerRadius * 0.55

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimated(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const { arcs, total } = useMemo(() => {
    if (!segments || segments.length === 0) return { arcs: [], total: 0 }
    
    const total = segments.reduce((sum, s) => sum + s.value, 0)
    if (total === 0) return { arcs: [], total: 0 }
    
    let currentAngle = -90 // Start from top
    
    // Default colors if not provided
    const defaultColors = ['#4361ee', '#2ecc71', '#f39c12', '#7c3aed', '#e74c3c', '#00bcd4']

    const arcs = segments.map((segment, i) => {
      const percentage = segment.value / total
      const angle = percentage * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle = endAngle

      const startRad = (startAngle * Math.PI) / 180
      const endRad = (endAngle * Math.PI) / 180

      const x1 = centerX + outerRadius * Math.cos(startRad)
      const y1 = centerY + outerRadius * Math.sin(startRad)
      const x2 = centerX + outerRadius * Math.cos(endRad)
      const y2 = centerY + outerRadius * Math.sin(endRad)

      const x3 = centerX + innerRadius * Math.cos(endRad)
      const y3 = centerY + innerRadius * Math.sin(endRad)
      const x4 = centerX + innerRadius * Math.cos(startRad)
      const y4 = centerY + innerRadius * Math.sin(startRad)

      const largeArc = angle > 180 ? 1 : 0

      const path = `
        M ${x1} ${y1}
        A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}
        L ${x3} ${y3}
        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
        Z
      `
      
      // Use segment.color, colors prop, or default colors
      const segmentColor = segment.color || (colors && colors[i]) || defaultColors[i % defaultColors.length]

      return {
        ...segment,
        color: segmentColor,
        path,
        percentage,
        midAngle: (startAngle + endAngle) / 2
      }
    })

    return { arcs, total }
  }, [segments, centerX, centerY, outerRadius, innerRadius, colors])

  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center">
        <svg width={actualWidth - 120} height={actualHeight} className="overflow-visible">
          {arcs.map((arc, i) => {
            const isHovered = hoveredIndex === i
            const scale = isHovered ? 1.05 : 1
            const midRad = (arc.midAngle * Math.PI) / 180
            const tx = isHovered ? Math.cos(midRad) * 5 : 0
            const ty = isHovered ? Math.sin(midRad) * 5 : 0

            return (
              <path
                key={i}
                d={arc.path}
                fill={arc.color}
                className="cursor-pointer transition-all duration-200"
                style={{
                  transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                  transformOrigin: `${centerX}px ${centerY}px`,
                  opacity: isAnimated ? 1 : 0,
                  transition: `opacity 0.5s ease-out ${i * 0.1}s, transform 0.2s`
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            )
          })}
        </svg>
        
        {/* Number and subtitle below chart */}
        <div className="text-center mt-2">
          <p className="text-2xl font-bold text-text-primary">{total}</p>
          <p className="text-xs text-text-muted">Total</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2">
        {arcs.map((arc, i) => (
          <div 
            key={i} 
            className={`flex items-center gap-2 transition-opacity ${hoveredIndex !== null && hoveredIndex !== i ? 'opacity-50' : 'opacity-100'}`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: arc.color }}
            />
            <span className="text-sm text-text-secondary">{arc.label}</span>
            <span className="text-sm font-medium text-text-primary ml-auto">
              {(arc.percentage * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
