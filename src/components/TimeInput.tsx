import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'

interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  required?: boolean
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md'
  /** 是否包含秒，对应原生 step=1 */
  withSeconds?: boolean
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parseTime(value: string, withSeconds: boolean) {
  const parts = (value || '').split(':').map((p) => parseInt(p, 10))
  const h = Number.isFinite(parts[0]) ? Math.min(23, Math.max(0, parts[0])) : 0
  const m = Number.isFinite(parts[1]) ? Math.min(59, Math.max(0, parts[1])) : 0
  const s = Number.isFinite(parts[2]) ? Math.min(59, Math.max(0, parts[2])) : 0
  return withSeconds ? { h, m, s } : { h, m, s: 0 }
}

function formatTime(h: number, m: number, s: number, withSeconds: boolean) {
  return withSeconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`
}

function computePanelStyle(el: HTMLElement): React.CSSProperties {
  const rect = el.getBoundingClientRect()
  const panelHeight = 280
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceBelow < panelHeight && rect.top > spaceBelow
  // 固定紧凑宽度，避免跟满宽表单项同宽把时/分列撑开
  const width = 220
  let left = rect.left
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8)
  }
  return {
    position: 'fixed',
    top: openUp ? undefined : rect.bottom + 4,
    bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
    left,
    width,
    zIndex: 9999,
  }
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const SECONDS = Array.from({ length: 60 }, (_, i) => i)

function TimeColumn({
  values,
  selected,
  onSelect,
  label,
}: {
  values: number[]
  selected: number
  onSelect: (n: number) => void
  label: string
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector('[data-active="true"]') as HTMLElement | null
    if (active) {
      list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.clientHeight / 2
    }
  }, [selected])

  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 text-center mb-1.5">{label}</div>
      <div
        ref={listRef}
        className="h-48 overflow-y-auto rounded-lg bg-black/25 border border-white/5 scroll-smooth picker-scrollbar"
      >
        {values.map((n) => {
          const active = n === selected
          return (
            <button
              key={n}
              type="button"
              data-active={active ? 'true' : undefined}
              onClick={() => onSelect(n)}
              className={`
                w-full py-1.5 text-sm tabular-nums transition-colors
                ${active ? 'bg-purple-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700/80'}
              `}
            >
              {pad(n)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function TimeInput({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  className = '',
  size = 'md',
  withSeconds = false,
}: TimeInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const parsed = useMemo(() => parseTime(value, withSeconds), [value, withSeconds])
  const display = value
    ? formatTime(parsed.h, parsed.m, parsed.s, withSeconds)
    : ''

  const emit = useCallback(
    (h: number, m: number, s: number) => {
      onChange(formatTime(h, m, s, withSeconds))
    },
    [onChange, withSeconds]
  )

  const updatePosition = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setPanelStyle(computePanelStyle(el))
  }, [])

  const open = useCallback(() => {
    const el = containerRef.current
    if (!el || disabled) return
    setPanelStyle(computePanelStyle(el))
    setIsOpen(true)
  }, [disabled])

  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [close])

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePosition()
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [isOpen, updatePosition])

  const isSm = size === 'sm'

  const panel =
    isOpen && panelStyle ? (
      <div
        ref={panelRef}
        style={panelStyle}
        className="student-glass-panel student-glass-panel--static student-glass-popover p-3 shadow-2xl shadow-black/50"
      >
        <div className={`flex gap-2 ${withSeconds ? '' : ''}`}>
          <TimeColumn
            label="时"
            values={HOURS}
            selected={parsed.h}
            onSelect={(h) => emit(h, parsed.m, parsed.s)}
          />
          <TimeColumn
            label="分"
            values={MINUTES}
            selected={parsed.m}
            onSelect={(m) => emit(parsed.h, m, parsed.s)}
          />
          {withSeconds && (
            <TimeColumn
              label="秒"
              values={SECONDS}
              selected={parsed.s}
              onSelect={(s) => emit(parsed.h, parsed.m, s)}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => {
              const now = new Date()
              emit(now.getHours(), now.getMinutes(), now.getSeconds())
            }}
            className="text-xs text-purple-300 hover:text-purple-200 px-2 py-1"
          >
            现在
          </button>
          <button
            type="button"
            onClick={close}
            className="text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-md px-3 py-1"
          >
            确定
          </button>
        </div>
      </div>
    ) : null

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className={`block font-medium text-gray-300 ${isSm ? 'text-sm mb-1' : 'text-sm mb-2'}`}>
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (isOpen) close()
          else open()
        }}
        className={`
          relative group w-full student-glass-field text-left
          focus:outline-none transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isSm ? 'rounded-md px-2 py-1 pr-8 text-sm' : 'rounded-lg px-4 py-2.5 pr-11'}
          ${isOpen ? 'border-purple-400/55 ring-2 ring-purple-500/25' : ''}
        `}
      >
        <span className={`tabular-nums ${display ? 'text-white' : 'text-gray-400'}`}>
          {display || (withSeconds ? '时:分:秒' : '时:分')}
        </span>
        <span
          className={`
            absolute top-1/2 -translate-y-1/2 pointer-events-none
            ${isSm ? 'right-2' : 'right-3'}
            ${isOpen ? 'text-purple-400' : 'text-gray-400 group-hover:text-gray-300'}
          `}
        >
          <Clock size={isSm ? 14 : 18} />
        </span>
      </button>

      {panel && createPortal(panel, document.body)}

      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          className="absolute opacity-0 pointer-events-none h-0 w-0"
          tabIndex={-1}
          aria-hidden
        />
      )}
    </div>
  )
}
