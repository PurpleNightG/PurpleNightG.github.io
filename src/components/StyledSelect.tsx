import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export interface StyledSelectOption {
  value: string
  label: string
  /** 次要说明，单独一行显示 */
  description?: string
}

interface StyledSelectProps {
  options: Array<string | StyledSelectOption>
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  /** sm 适配成员详情等紧凑表单 */
  size?: 'sm' | 'md'
  searchable?: boolean
  /** 下拉最小宽度，默认取触发器宽度 */
  dropdownMinWidth?: number
}

function computeDropdownStyle(el: HTMLElement, minWidth = 0): React.CSSProperties {
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceBelow < 280 && rect.top > spaceBelow
  const width = Math.max(rect.width, minWidth, 120)
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

export default function StyledSelect({
  options,
  value,
  onChange,
  placeholder = '请选择',
  required = false,
  disabled = false,
  className = '',
  size = 'md',
  searchable = false,
  dropdownMinWidth = 0,
}: StyledSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const normalized = useMemo(
    () =>
      options.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      ),
    [options]
  )

  const selected = normalized.find((opt) => opt.value === value)

  const filtered = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return normalized
    const q = searchQuery.toLowerCase()
    return normalized.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.description || '').toLowerCase().includes(q)
    )
  }, [normalized, searchable, searchQuery])

  const updateDropdownPosition = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setDropdownStyle(computeDropdownStyle(el, dropdownMinWidth))
  }, [dropdownMinWidth])

  const open = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    // 同步算好 fixed 定位，避免首次以文档流插入导致滚动条闪烁
    setDropdownStyle(computeDropdownStyle(el, dropdownMinWidth))
    setIsOpen(true)
  }, [dropdownMinWidth])

  const close = useCallback(() => {
    setIsOpen(false)
    setSearchQuery('')
    setHighlightedIndex(0)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
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
    updateDropdownPosition()
    if (searchable) inputRef.current?.focus()
    const onScrollOrResize = () => updateDropdownPosition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [isOpen, searchable, updateDropdownPosition])

  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return
    const el = dropdownRef.current.querySelector('[data-highlighted="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, isOpen])

  const handleSelect = (next: string) => {
    onChange(next)
    close()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ')) {
      e.preventDefault()
      open()
      return
    }
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightedIndex]) handleSelect(filtered[highlightedIndex].value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const isSm = size === 'sm'
  const triggerClass = isSm
    ? 'px-2 py-1 text-sm rounded'
    : 'px-3 py-2 rounded-lg'

  const dropdown =
    isOpen && dropdownStyle ? (
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        className="student-glass-panel student-glass-panel--static student-glass-popover max-h-72 overflow-y-auto picker-scrollbar shadow-2xl shadow-black/50"
      >
        {searchable && (
          <div className="sticky top-0 z-10 p-2 bg-black/25 backdrop-blur-md border-b border-white/10">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="搜索..."
              className="student-glass-field text-sm py-1.5"
            />
          </div>
        )}
        {filtered.length > 0 ? (
          filtered.map((option, index) => {
            const active = option.value === value
            const highlighted = index === highlightedIndex
            return (
              <button
                key={option.value}
                type="button"
                data-highlighted={highlighted ? 'true' : undefined}
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`
                  w-full text-left px-3 py-2.5 text-sm transition-colors
                  border-b border-white/5 last:border-b-0
                  ${highlighted ? 'bg-purple-600/80 text-white' : 'text-gray-200 hover:bg-white/8'}
                  ${active && !highlighted ? 'bg-white/6 text-purple-200' : ''}
                `}
              >
                <div className="font-medium leading-snug break-words">{option.label}</div>
                {option.description && (
                  <div className={`text-xs mt-1 leading-relaxed ${highlighted ? 'text-purple-100/80' : 'text-gray-400'}`}>
                    {option.description}
                  </div>
                )}
              </button>
            )
          })
        ) : (
          <div className="px-3 py-3 text-sm text-gray-400 text-center">无匹配项</div>
        )}
      </div>
    ) : null

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (isOpen) close()
          else open()
        }}
        onKeyDown={handleKeyDown}
        className={`
          w-full student-glass-field
          flex items-center justify-between gap-2 text-left
          transition-all duration-200
          ${triggerClass}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isOpen ? 'border-purple-400/55 ring-2 ring-purple-500/25' : ''}
        `}
      >
        <span className={`truncate ${selected ? 'text-white' : 'text-gray-400'}`}>
          {selected ? (
            selected.description
              ? `${selected.label} · ${selected.description}`
              : selected.label
          ) : placeholder}
        </span>
        <ChevronDown
          size={isSm ? 14 : 16}
          className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180 text-purple-300' : ''}`}
        />
      </button>

      {dropdown && createPortal(dropdown, document.body)}

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
