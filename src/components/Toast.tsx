import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const styles = {
    success: {
      bg: 'bg-green-900/90 border-green-600',
      icon: <CheckCircle size={20} className="text-green-400" />,
      text: 'text-green-100'
    },
    error: {
      bg: 'bg-red-900/90 border-red-600',
      icon: <XCircle size={20} className="text-red-400" />,
      text: 'text-red-100'
    },
    warning: {
      bg: 'bg-yellow-900/90 border-yellow-600',
      icon: <AlertCircle size={20} className="text-yellow-400" />,
      text: 'text-yellow-100'
    },
    info: {
      bg: 'bg-blue-900/90 border-blue-600',
      icon: <Info size={20} className="text-blue-400" />,
      text: 'text-blue-100'
    }
  }

  const style = styles[type]

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-slide-in">
      <div className={`${style.bg} ${style.text} border rounded-lg shadow-lg backdrop-blur-sm px-4 py-3 pr-10 min-w-[300px] max-w-md`}>
        <div className="flex items-center gap-3">
          {style.icon}
          <span className="font-medium">{message}</span>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
