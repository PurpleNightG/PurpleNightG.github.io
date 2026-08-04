import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'

interface Option {
  id: number
  label: string
  subLabel?: string
  /** 仅用于搜索匹配，不展示 */
  searchText?: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string | number
  onChange: (value: string | number) => void
  placeholder?: string
  required?: boolean
  className?: string
  disabled?: boolean
}

function computeDropdownStyle(el: HTMLElement): React.CSSProperties {
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceBelow < 240 && rect.top > spaceBelow
  return {
    position: 'fixed',
    top: openUp ? undefined : rect.bottom + 4,
    bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
    left: rect.left,
    width: Math.max(rect.width, 160),
    zIndex: 9999,
  }
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '请选择',
  required = false,
  className = '',
  disabled = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.id.toString() === value.toString())

  const filteredOptions = options.filter(opt => {
    const query = searchQuery.toLowerCase()
    const haystack = `${opt.label} ${opt.subLabel || ''} ${opt.searchText || ''}`.toLowerCase()
    return haystack.includes(query)
  })

  const updateDropdownPosition = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setDropdownStyle(computeDropdownStyle(el))
  }, [])

  const open = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setDropdownStyle(computeDropdownStyle(el))
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setSearchQuery('')
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return
      close()
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [close])

  useLayoutEffect(() => {
    if (!isOpen) return
    updateDropdownPosition()
    inputRef.current?.focus()

    const onScrollOrResize = () => updateDropdownPosition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [isOpen, updateDropdownPosition])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      e.preventDefault()
      open()
      return
    }

    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  }

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement
      highlightedElement?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, isOpen])

  const handleSelect = (optionId: number) => {
    onChange(optionId)
    close()
    setHighlightedIndex(0)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setSearchQuery('')
  }

  const dropdown =
    isOpen && dropdownStyle ? (
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        className="student-glass-panel student-glass-panel--static student-glass-popover max-h-60 overflow-y-auto picker-scrollbar shadow-2xl shadow-black/50"
      >
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option, index) => (
            <div
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`
                px-3 py-2 cursor-pointer transition-colors
                ${index === highlightedIndex ? 'bg-purple-600/80' : 'hover:bg-white/8'}
                ${selectedOption?.id === option.id && index !== highlightedIndex ? 'bg-white/6' : ''}
              `}
            >
              <div className="flex items-center gap-2">
                <span className="text-white">{option.label}</span>
                {option.subLabel && (
                  <span className="text-sm text-gray-400">{option.subLabel}</span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="px-3 py-2 text-gray-400 text-center">未找到匹配项</div>
        )}
      </div>
    ) : null

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={() => {
          if (disabled) return
          if (isOpen) close()
          else open()
        }}
        className={`
          w-full student-glass-field
          flex items-center justify-between cursor-pointer
          transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isOpen ? 'border-purple-400/55 ring-2 ring-purple-500/25' : ''}
        `}
      >
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setHighlightedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入搜索..."
            className="flex-1 bg-transparent outline-none text-white placeholder-gray-400"
            disabled={disabled}
          />
        ) : (
          <div className="flex-1 truncate">
            {selectedOption ? (
              <div className="flex items-center gap-2">
                <span>{selectedOption.label}</span>
                {selectedOption.subLabel && (
                  <span className="text-sm text-gray-400">{selectedOption.subLabel}</span>
                )}
              </div>
            ) : (
              <span className="text-gray-400">{placeholder}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 ml-2">
          {selectedOption && !isOpen && !disabled && (
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-white transition-colors"
              type="button"
            >
              <X size={16} />
            </button>
          )}
          <ChevronDown
            size={18}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {dropdown && createPortal(dropdown, document.body)}

      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          className="absolute opacity-0 pointer-events-none"
          tabIndex={-1}
        />
      )}
    </div>
  )
}
