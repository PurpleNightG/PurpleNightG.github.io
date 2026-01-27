import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  type?: 'danger' | 'warning' | 'info'
}

export default function ConfirmDialog({
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'warning'
}: ConfirmDialogProps) {
  const colors = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-yellow-600 hover:bg-yellow-700',
    info: 'bg-blue-600 hover:bg-blue-700'
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000]">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 animate-scale-in">
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-2 rounded-lg ${
            type === 'danger' ? 'bg-red-900/50' :
            type === 'warning' ? 'bg-yellow-900/50' :
            'bg-blue-900/50'
          }`}>
            <AlertTriangle className={`${
              type === 'danger' ? 'text-red-400' :
              type === 'warning' ? 'text-yellow-400' :
              'text-blue-400'
            }`} size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-gray-300 text-sm">{message}</p>
          </div>
        </div>
        
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition-colors ${colors[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
