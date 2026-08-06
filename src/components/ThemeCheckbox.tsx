import { CheckSquare, Square } from 'lucide-react'
import type { ReactNode } from 'react'

/** 暗色主题复选框：紫色勾选框样式（与助教权限等一致） */
export default function ThemeCheckbox({
  checked,
  onCheckedChange,
  label,
  className = '',
  boxClassName = '',
  size = 16,
  disabled = false,
  title,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label?: ReactNode
  className?: string
  boxClassName?: string
  size?: number
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked)
      }}
      className={`inline-flex items-center gap-1.5 text-left group select-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}
    >
      {checked ? (
        <CheckSquare size={size} className={`text-purple-400 shrink-0 ${boxClassName}`} />
      ) : (
        <Square
          size={size}
          className={`text-gray-500 group-hover:text-gray-400 shrink-0 ${boxClassName}`}
        />
      )}
      {label != null ? <span className="min-w-0">{label}</span> : null}
    </button>
  )
}
