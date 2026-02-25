import { RefreshCw, X } from 'lucide-react'

interface UpdateNotificationProps {
  onRefresh: () => void
  onDismiss: () => void
}

export default function UpdateNotification({ onRefresh, onDismiss }: UpdateNotificationProps) {
  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-in-down">
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg shadow-2xl shadow-purple-500/50 p-4 flex items-center gap-4 border border-purple-400/30 backdrop-blur-sm">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-white/20 p-2 rounded-lg">
            <RefreshCw size={20} className="text-white" />
          </div>
          <div>
            <p className="font-semibold">文档已更新</p>
            <p className="text-sm text-purple-100">发现新版本，点击刷新查看最新内容</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:bg-purple-50 transition-all duration-300 hover:scale-105 shadow-lg"
          >
            立即刷新
          </button>
          <button
            onClick={onDismiss}
            className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
