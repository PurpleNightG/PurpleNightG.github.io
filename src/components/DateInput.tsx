import { Calendar } from 'lucide-react'
import { useState } from 'react'

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  required?: boolean
  disabled?: boolean
  min?: string
  max?: string
  className?: string
}

export default function DateInput({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  min,
  max,
  className = ''
}: DateInputProps) {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className={`
        relative group
        ${isFocused ? 'ring-2 ring-purple-500/50 rounded-lg' : ''}
      `}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          required={required}
          disabled={disabled}
          min={min}
          max={max}
          className="
            w-full bg-gray-700/80 border border-gray-600 rounded-lg px-4 py-2.5 pr-11 text-white
            focus:outline-none focus:border-purple-500 focus:bg-gray-700
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            [&::-webkit-calendar-picker-indicator]:opacity-0
            [&::-webkit-calendar-picker-indicator]:absolute
            [&::-webkit-calendar-picker-indicator]:w-full
            [&::-webkit-calendar-picker-indicator]:h-full
            [&::-webkit-calendar-picker-indicator]:cursor-pointer
            hover:border-gray-500 hover:bg-gray-700
            placeholder:text-gray-500
          "
        />
        <div className={`
          absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none
          transition-all duration-200
          ${isFocused ? 'text-purple-400 scale-110' : 'text-gray-400 group-hover:text-gray-300'}
        `}>
          <Calendar size={18} />
        </div>
      </div>
    </div>
  )
}
