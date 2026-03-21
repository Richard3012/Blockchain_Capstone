import { useEffect, useRef, useState } from 'react'

export default function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }) {
  const safeValue = value ?? 0
  const [displayValue, setDisplayValue] = useState(safeValue)
  const prevValueRef = useRef(safeValue)
  const animationRef = useRef(null)

  useEffect(() => {
    const newValue = value ?? 0
    const prevValue = prevValueRef.current ?? 0
    const diff = newValue - prevValue
    
    if (diff === 0) return
    
    const duration = 600
    const startTime = performance.now()

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      
      const currentValue = prevValue + diff * easeProgress
      setDisplayValue(currentValue)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = newValue
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [value])

  const formatNumber = (num) => {
    const safeNum = num ?? 0
    const fixed = safeNum.toFixed(decimals)
    const parts = fixed.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return decimals > 0 ? parts.join('.') : parts[0]
  }

  return (
    <span className="tabular-nums">
      {prefix}{formatNumber(displayValue)}{suffix}
    </span>
  )
}
