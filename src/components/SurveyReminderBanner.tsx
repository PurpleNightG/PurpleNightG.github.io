import { Link, useLocation } from 'react-router-dom'
import { ClipboardList, X, ChevronRight } from 'lucide-react'
import { useSurveyPending } from '../contexts/SurveyPendingContext'

interface SurveyReminderBannerProps {
  /** 紧凑模式：用于官网顶栏下方 */
  compact?: boolean
  className?: string
}

export default function SurveyReminderBanner({
  compact = false,
  className = '',
}: SurveyReminderBannerProps) {
  const { pending, count, dismissed, dismiss } = useSurveyPending()
  const location = useLocation()

  if (!count || dismissed) return null
  // 已在填表页填写时不重复霸屏（侧栏徽章仍保留）
  if (location.pathname.startsWith('/student/surveys')) return null

  const titles = pending
    .slice(0, 2)
    .map((s) => s.title)
    .join('、')
  const more = count > 2 ? ` 等 ${count} 份` : count > 1 ? `（共 ${count} 份）` : ''

  return (
    <div
      className={`sticky top-0 z-20 shrink-0 relative overflow-hidden border-b border-amber-400/40 bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500 text-white shadow-lg shadow-amber-900/20 ${className}`}
      role="status"
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_50%,white,transparent_45%)]" />
      <div
        className={`relative mx-auto flex items-center gap-3 ${
          compact ? 'max-w-7xl px-4 py-2' : 'px-4 py-3'
        }`}
      >
        <div className="shrink-0 rounded-lg bg-white/20 p-1.5 backdrop-blur-sm">
          <ClipboardList size={compact ? 18 : 22} className="animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-tight ${compact ? 'text-sm' : 'text-base'}`}>
            有问卷待填写：{titles}
            {more}
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-white/85">请尽快完成，以免错过截止时间</p>
          )}
        </div>
        <Link
          to="/student/surveys"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-orange-700 shadow-sm hover:bg-amber-50 transition-colors"
        >
          去填写
          <ChevronRight size={16} />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-white/80 hover:bg-white/15 hover:text-white"
          aria-label="暂时关闭提示"
          title="暂时关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
