import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { getTodayDateString } from '../utils/dateFormat'

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  required?: boolean
  disabled?: boolean
  min?: string
  max?: string
  className?: string
  /** sm 适配成员详情等紧凑表单 */
  size?: 'sm' | 'md'
}

type PanelView = 'day' | 'month' | 'year'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toYmd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}

function parseYmd(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

/** 周一为 0 … 周日为 6 */
function mondayBasedWeekday(y: number, m: number, d: number) {
  const js = new Date(y, m - 1, d).getDay()
  return js === 0 ? 6 : js - 1
}

function isBefore(a: string, b: string) {
  return a < b
}

function isAfter(a: string, b: string) {
  return a > b
}

function computePanelStyle(el: HTMLElement): React.CSSProperties {
  const rect = el.getBoundingClientRect()
  const panelHeight = 340
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceBelow < panelHeight && rect.top > spaceBelow
  // 日历用固定紧凑宽度，避免跟满宽表单项同宽把格子撑成大正方形
  const width = 288
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

export default function DateInput({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  min,
  max,
  className = '',
  size = 'md',
}: DateInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelView, setPanelView] = useState<PanelView>('day')
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null)
  const [yearPageStart, setYearPageStart] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const todayStr = getTodayDateString()
  const today = parseYmd(todayStr)!
  const selected = parseYmd(value)
  const initialView = selected || today
  const [viewYear, setViewYear] = useState(initialView.y)
  const [viewMonth, setViewMonth] = useState(initialView.m)

  const cells = useMemo(() => {
    const total = daysInMonth(viewYear, viewMonth)
    const offset = mondayBasedWeekday(viewYear, viewMonth, 1)
    const list: Array<{ y: number; m: number; d: number } | null> = []
    for (let i = 0; i < offset; i++) list.push(null)
    for (let d = 1; d <= total; d++) {
      list.push({ y: viewYear, m: viewMonth, d })
    }
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [viewYear, viewMonth])

  const yearOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => yearPageStart + i)
  }, [yearPageStart])

  const updatePosition = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setPanelStyle(computePanelStyle(el))
  }, [])

  const open = useCallback(() => {
    const el = containerRef.current
    if (!el || disabled) return
    const base = parseYmd(value) || today
    setViewYear(base.y)
    setViewMonth(base.m)
    setPanelView('day')
    setYearPageStart(base.y - 5)
    setPanelStyle(computePanelStyle(el))
    setIsOpen(true)
  }, [disabled, value, today])

  const close = useCallback(() => {
    setIsOpen(false)
    setPanelView('day')
  }, [])

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
  }, [isOpen, updatePosition, panelView])

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setViewYear(y)
    setViewMonth(m)
  }

  const pick = (y: number, m: number, d: number) => {
    const next = toYmd(y, m, d)
    if (min && isBefore(next, min)) return
    if (max && isAfter(next, max)) return
    onChange(next)
    close()
  }

  const isDisabledDay = (ymd: string) => {
    if (min && isBefore(ymd, min)) return true
    if (max && isAfter(ymd, max)) return true
    return false
  }

  const isSm = size === 'sm'

  const headerLeft = () => {
    if (panelView === 'day') return () => shiftMonth(-1)
    if (panelView === 'month') return () => setViewYear((y) => y - 1)
    return () => setYearPageStart((s) => s - 12)
  }

  const headerRight = () => {
    if (panelView === 'day') return () => shiftMonth(1)
    if (panelView === 'month') return () => setViewYear((y) => y + 1)
    return () => setYearPageStart((s) => s + 12)
  }

  const panel =
    isOpen && panelStyle ? (
      <div
        ref={panelRef}
        style={panelStyle}
        className="student-glass-panel student-glass-panel--static student-glass-popover p-3 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between mb-3 px-0.5">
          <button
            type="button"
            onClick={headerLeft()}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="上一项"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1">
            {panelView === 'day' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setYearPageStart(viewYear - 5)
                    setPanelView('year')
                  }}
                  className="text-sm font-medium text-white hover:text-purple-300 tabular-nums px-1.5 py-0.5 rounded-md hover:bg-gray-700/80 transition-colors inline-flex items-center gap-0.5"
                >
                  {viewYear}年
                  <ChevronDown size={12} className="opacity-70" />
                </button>
                <button
                  type="button"
                  onClick={() => setPanelView('month')}
                  className="text-sm font-medium text-white hover:text-purple-300 tabular-nums px-1.5 py-0.5 rounded-md hover:bg-gray-700/80 transition-colors inline-flex items-center gap-0.5"
                >
                  {pad(viewMonth)}月
                  <ChevronDown size={12} className="opacity-70" />
                </button>
              </>
            )}
            {panelView === 'month' && (
              <button
                type="button"
                onClick={() => {
                  setYearPageStart(viewYear - 5)
                  setPanelView('year')
                }}
                className="text-sm font-medium text-white hover:text-purple-300 tabular-nums px-1.5 py-0.5 rounded-md hover:bg-gray-700/80 transition-colors inline-flex items-center gap-0.5"
              >
                {viewYear}年
                <ChevronDown size={12} className="opacity-70" />
              </button>
            )}
            {panelView === 'year' && (
              <span className="text-sm font-medium text-white tabular-nums px-1.5">
                {yearPageStart} – {yearPageStart + 11}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={headerRight()}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="下一项"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {panelView === 'day' && (
          <>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[11px] text-gray-500 py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`e-${idx}`} className="aspect-square" />
                }
                const ymd = toYmd(cell.y, cell.m, cell.d)
                const selectedDay = value === ymd
                const isToday = todayStr === ymd
                const disabledDay = isDisabledDay(ymd)
                return (
                  <button
                    key={ymd}
                    type="button"
                    disabled={disabledDay}
                    onClick={() => pick(cell.y, cell.m, cell.d)}
                    className={`
                      aspect-square rounded-lg text-sm tabular-nums transition-colors
                      ${disabledDay ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-gray-700 text-gray-200'}
                      ${selectedDay ? 'bg-purple-600 text-white hover:bg-purple-500 font-semibold' : ''}
                      ${isToday && !selectedDay ? 'ring-1 ring-purple-400/60 text-purple-200' : ''}
                    `}
                  >
                    {cell.d}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {panelView === 'month' && (
          <div className="grid grid-cols-3 gap-2 py-1">
            {MONTHS.map((m) => {
              const active = m === viewMonth
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setViewMonth(m)
                    setPanelView('day')
                  }}
                  className={`
                    py-2.5 rounded-lg text-sm transition-colors
                    ${active ? 'bg-purple-600 text-white font-semibold' : 'text-gray-200 hover:bg-gray-700'}
                  `}
                >
                  {m}月
                </button>
              )
            })}
          </div>
        )}

        {panelView === 'year' && (
          <div className="grid grid-cols-3 gap-2 py-1">
            {yearOptions.map((y) => {
              const active = y === viewYear
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setViewYear(y)
                    setPanelView('month')
                  }}
                  className={`
                    py-2.5 rounded-lg text-sm tabular-nums transition-colors
                    ${active ? 'bg-purple-600 text-white font-semibold' : 'text-gray-200 hover:bg-gray-700'}
                  `}
                >
                  {y}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => {
              onChange('')
              close()
            }}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1"
          >
            清除
          </button>
          <div className="flex items-center gap-1">
            {panelView !== 'day' && (
              <button
                type="button"
                onClick={() => setPanelView('day')}
                className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1"
              >
                返回
              </button>
            )}
            <button
              type="button"
              disabled={isDisabledDay(todayStr)}
              onClick={() => pick(today.y, today.m, today.d)}
              className="text-xs text-purple-300 hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1"
            >
              今天
            </button>
          </div>
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
        <span className={`tabular-nums ${value ? 'text-white' : 'text-gray-400'}`}>
          {value || '年 / 月 / 日'}
        </span>
        <span
          className={`
            absolute top-1/2 -translate-y-1/2 pointer-events-none
            ${isSm ? 'right-2' : 'right-3'}
            ${isOpen ? 'text-purple-400' : 'text-gray-400 group-hover:text-gray-300'}
          `}
        >
          <Calendar size={isSm ? 14 : 18} />
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
