import { ReactNode } from 'react'
import { X } from 'lucide-react'

interface FullscreenReportModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export default function FullscreenReportModal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: FullscreenReportModalProps) {
  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      <div className="flex-shrink-0 border-b border-gray-700 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="min-w-0 pr-4">
          <h2 className="text-xl font-bold text-white truncate">{title}</h2>
          {subtitle && <p className="text-sm text-gray-400 mt-1 truncate">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
          aria-label="关闭"
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto modal-scrollbar p-6 lg:p-8">
        {children}
      </div>

      {footer && (
        <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900 px-6 py-4 flex justify-end gap-3">
          {footer}
        </div>
      )}
    </div>
  )
}
