import { createPortal } from 'react-dom'
import { useStudentGlassPointer } from '../hooks/useStudentGlassPointer'
import type { CongratsConfig } from '../utils/stageCongrats'
import CongratsFireworks from './CongratsFireworks'

const ACCENT: Record<
  NonNullable<CongratsConfig['accent']>,
  {
    banner: string
    glow: string
    iconBg: string
    iconText: string
    badge: string
    btn: string
    ring: string
  }
> = {
  gold: {
    banner: 'from-amber-500/40 via-orange-500/15 to-transparent',
    glow: 'bg-amber-400/30',
    iconBg: 'from-amber-500/35 to-orange-700/30 border-amber-400/40',
    iconText: 'text-amber-100',
    badge: 'bg-amber-500/20 text-amber-100 border-amber-400/35',
    btn: 'from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-amber-900/40',
    ring: 'ring-amber-400/30',
  },
  purple: {
    banner: 'from-violet-500/40 via-fuchsia-500/15 to-transparent',
    glow: 'bg-violet-400/30',
    iconBg: 'from-violet-500/35 to-purple-800/30 border-violet-400/40',
    iconText: 'text-violet-100',
    badge: 'bg-violet-500/20 text-violet-100 border-violet-400/35',
    btn: 'from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-violet-950/40',
    ring: 'ring-violet-400/30',
  },
  teal: {
    banner: 'from-teal-500/40 via-cyan-500/15 to-transparent',
    glow: 'bg-teal-400/30',
    iconBg: 'from-teal-500/35 to-cyan-800/30 border-teal-400/40',
    iconText: 'text-teal-100',
    badge: 'bg-teal-500/20 text-teal-100 border-teal-400/35',
    btn: 'from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 shadow-teal-950/40',
    ring: 'ring-teal-400/30',
  },
  sky: {
    banner: 'from-sky-500/40 via-blue-500/15 to-transparent',
    glow: 'bg-sky-400/30',
    iconBg: 'from-sky-500/35 to-blue-800/30 border-sky-400/40',
    iconText: 'text-sky-100',
    badge: 'bg-sky-500/20 text-sky-100 border-sky-400/35',
    btn: 'from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-sky-950/40',
    ring: 'ring-sky-400/30',
  },
  rose: {
    banner: 'from-rose-500/40 via-pink-500/15 to-transparent',
    glow: 'bg-rose-400/30',
    iconBg: 'from-rose-500/35 to-red-800/30 border-rose-400/40',
    iconText: 'text-rose-100',
    badge: 'bg-rose-500/20 text-rose-100 border-rose-400/35',
    btn: 'from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 shadow-rose-950/40',
    ring: 'ring-rose-400/30',
  },
  blue: {
    banner: 'from-blue-500/35 via-indigo-500/15 to-transparent',
    glow: 'bg-blue-400/30',
    iconBg: 'from-blue-500/35 to-indigo-800/30 border-blue-400/40',
    iconText: 'text-blue-100',
    badge: 'bg-blue-500/20 text-blue-100 border-blue-400/35',
    btn: 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-950/40',
    ring: 'ring-blue-400/30',
  },
}

interface Props {
  config: CongratsConfig
  onClose: () => void
  onAction?: () => void
}

export default function CongratsModal({ config, onClose, onAction }: Props) {
  const { onGlassPointerMove, resetGlassTilt } = useStudentGlassPointer({ maxTilt: 4 })
  const accent = ACCENT[config.accent || 'purple']
  const demotion = !!config.isDemotion

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fadeIn"
      onMouseMove={onGlassPointerMove}
      onMouseLeave={resetGlassTilt}
    >
      <div className="absolute inset-0 z-0" aria-hidden>
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          onClick={onClose}
        />
        {!demotion && <CongratsFireworks />}
      </div>

      <div className="relative z-10 glass-modal-frame w-full max-w-[24rem]">
        <div className="glass-modal-tilt">
          {/*
            注意：.student-glass-panel > * { position: relative } 会覆盖子元素的 absolute，
            装饰层必须放在唯一子包裹内，否则会变成占位空白。
          */}
          <div className="student-glass-panel student-glass-panel--static student-glass-modal overflow-hidden animate-scaleIn">
            <div className="relative">
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accent.banner}`}
                aria-hidden
              />
              <div
                className={`pointer-events-none absolute left-1/2 top-2 h-16 w-36 -translate-x-1/2 rounded-full blur-2xl ${accent.glow}`}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent"
                aria-hidden
              />

              <div className="relative z-[1] px-6 pt-6 pb-6 text-center">
                <div
                  className={`relative mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-full border bg-gradient-to-br ${accent.iconBg} ${accent.iconText} shadow-lg ring-4 ${accent.ring}`}
                >
                  {config.icon}
                </div>

                {config.badge && (
                  <div className="mb-2 flex justify-center">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-[11px] font-semibold tracking-wide ${accent.badge}`}
                    >
                      {config.badge}
                    </span>
                  </div>
                )}

                <h2 className="text-[1.35rem] sm:text-2xl font-bold text-white tracking-wide mb-1">
                  {config.title}
                </h2>
                {config.subtitle && (
                  <p className="text-xs text-white/50 mb-3 font-medium tracking-wide">
                    {config.subtitle}
                  </p>
                )}

                <p className="text-sm leading-relaxed text-gray-300/95 mb-5 px-1 break-keep text-pretty">
                  {config.message}
                </p>

                <div className="flex gap-2.5">
                  {config.actionText && config.actionPath ? (
                    <>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-200 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        稍后再说
                      </button>
                      <button
                        type="button"
                        onClick={onAction}
                        className={`flex-1 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${accent.btn} shadow-lg transition-all`}
                      >
                        {config.actionText}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${accent.btn} shadow-lg transition-all`}
                    >
                      {demotion ? '我知道了' : '太棒了'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
