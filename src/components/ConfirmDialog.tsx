import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useStudentGlassPointer } from '../hooks/useStudentGlassPointer'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  type?: 'danger' | 'warning' | 'info'
  /** 为 false 时隐藏取消按钮（纯提示） */
  showCancel?: boolean
  /** 叠在更高层模态之上时传入，例如 z-[10020] */
  zClassName?: string
}

export default function ConfirmDialog({
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'warning',
  showCancel = true,
  zClassName = 'z-[10000]',
}: ConfirmDialogProps) {
  const { onGlassPointerMove, resetGlassTilt } = useStudentGlassPointer({ maxTilt: 4 })
  const colors = {
    danger: 'bg-red-600/90 hover:bg-red-600',
    warning: 'bg-yellow-600/90 hover:bg-yellow-600',
    info: 'bg-purple-600/90 hover:bg-purple-600'
  }

  return createPortal(
    <div
      className={`fixed inset-0 ${zClassName} flex items-center justify-center`}
      onMouseMove={onGlassPointerMove}
      onMouseLeave={resetGlassTilt}
    >
      <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
      <div className="relative z-10 glass-modal-frame mx-4 w-full max-w-md">
        <div className="glass-modal-tilt">
        <div className="student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full animate-scale-in">
          <div className="flex items-start gap-4 mb-4">
            <div className={`p-2 rounded-lg ${
              type === 'danger' ? 'bg-red-900/50' :
              type === 'warning' ? 'bg-yellow-900/50' :
              'bg-purple-900/50'
            }`}>
              <AlertTriangle className={`${
                type === 'danger' ? 'text-red-400' :
                type === 'warning' ? 'text-yellow-400' :
                'text-purple-400'
              }`} size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{message}</p>
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            {showCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg transition-colors"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-white rounded-lg transition-colors ${colors[type]}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
