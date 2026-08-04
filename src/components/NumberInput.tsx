import { useEffect, useRef } from 'react'

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number | string
  onChange: (value: number) => void
  /** 滚轮步进，默认 1 */
  wheelStep?: number
}

/**
 * 数字输入：聚焦时滚轮只改数值，不滚动页面。
 */
export default function NumberInput({
  value,
  onChange,
  wheelStep = 1,
  min,
  max,
  step,
  className = '',
  ...rest
}: NumberInputProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return
      e.preventDefault()
      e.stopPropagation()

      const stepSize = wheelStep || Number(step) || 1
      const minVal = min !== undefined && min !== '' ? Number(min) : Number.NEGATIVE_INFINITY
      const maxVal = max !== undefined && max !== '' ? Number(max) : Number.POSITIVE_INFINITY
      const current = Number(el.value) || 0
      const next = Math.min(
        maxVal,
        Math.max(minVal, Math.round((current + (e.deltaY > 0 ? -stepSize : stepSize)) * 1000) / 1000)
      )
      onChange(next)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [onChange, wheelStep, min, max, step])

  return (
    <input
      ref={ref}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={className}
      {...rest}
    />
  )
}
