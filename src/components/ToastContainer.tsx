import { useState, useEffect } from 'react'
import Toast from './Toast'
import { toastManager } from '../utils/toast'

export default function ToastContainer() {
  const [toasts, setToasts] = useState<any[]>([])

  useEffect(() => {
    const unsubscribe = toastManager.subscribe(setToasts)
    return unsubscribe
  }, [])

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => toastManager.remove(toast.id)}
        />
      ))}
    </div>
  )
}
