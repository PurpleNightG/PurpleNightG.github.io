// Toast通知系统
type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastMessage {
  id: string
  message: string
  type: ToastType
}

let listeners: ((toasts: ToastMessage[]) => void)[] = []
let toasts: ToastMessage[] = []

function emit() {
  listeners.forEach(listener => listener(toasts))
}

export const toastManager = {
  subscribe(listener: (toasts: ToastMessage[]) => void) {
    listeners.push(listener)
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  },

  show(message: string, type: ToastType = 'info') {
    const id = Math.random().toString(36).substr(2, 9)
    toasts = [...toasts, { id, message, type }]
    emit()
    return id
  },

  success(message: string) {
    return this.show(message, 'success')
  },

  error(message: string) {
    return this.show(message, 'error')
  },

  warning(message: string) {
    return this.show(message, 'warning')
  },

  info(message: string) {
    return this.show(message, 'info')
  },

  remove(id: string) {
    toasts = toasts.filter(t => t.id !== id)
    emit()
  }
}

// 简化的全局函数
export const toast = {
  success: (msg: string) => toastManager.success(msg),
  error: (msg: string) => toastManager.error(msg),
  warning: (msg: string) => toastManager.warning(msg),
  info: (msg: string) => toastManager.info(msg)
}
