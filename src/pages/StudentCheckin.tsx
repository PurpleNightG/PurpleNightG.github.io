import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, KeyRound, Lock } from 'lucide-react'
import { checkinAPI } from '../utils/api'
import { toast } from '../utils/toast'
import PageSkeleton from '../components/Skeleton'

type AttemptInfo = {
  fail_count: number
  max_fails: number
  remaining_attempts: number
  locked: boolean
}

type Phase = 'idle' | 'shake' | 'merging' | 'success'

export default function StudentCheckin() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [digits, setDigits] = useState(['', '', '', ''])
  const [today, setToday] = useState('')
  const [dayStatus, setDayStatus] = useState<string | null>(null)
  const [hasTask, setHasTask] = useState(false)
  const [checked, setChecked] = useState(false)
  const [lastTraining, setLastTraining] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [playSuccessAnim, setPlaySuccessAnim] = useState(false)
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])
  const submitLock = useRef(false)

  const locked = !!attempt?.locked
  const canInput =
    hasTask && dayStatus === 'active' && !checked && !locked && phase !== 'merging' && phase !== 'success'

  const applyAttempt = (a: any) => {
    if (!a) return
    setAttempt({
      fail_count: Number(a.fail_count) || 0,
      max_fails: Number(a.max_fails) || 5,
      remaining_attempts: Number(a.remaining_attempts) ?? 0,
      locked: !!a.locked,
    })
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await checkinAPI.studentToday()
      setToday(res.data?.today || '')
      setHasTask(!!res.data?.day)
      setDayStatus(res.data?.day?.status || null)
      setChecked(!!res.data?.checked)
      setLastTraining(res.data?.last_training_date || null)
      applyAttempt(res.data?.attempt)
      if (res.data?.checked) setPhase('success')
    } catch (e: any) {
      toast.error(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (canInput && !loading) {
      const t = window.setTimeout(() => inputsRef.current[0]?.focus(), 80)
      return () => window.clearTimeout(t)
    }
  }, [canInput, loading])

  const clearDigits = () => setDigits(['', '', '', ''])

  const submitCode = async (value: string) => {
    if (submitLock.current || submitting || locked) return
    if (!/^\d{4}$/.test(value)) return
    submitLock.current = true
    setSubmitting(true)
    try {
      await checkinAPI.studentSubmit(value)
      setPhase('merging')
      setPlaySuccessAnim(true)
      window.setTimeout(() => {
        setPhase('success')
        setChecked(true)
        setLastTraining(today || new Date().toISOString().slice(0, 10))
        toast.success('签到成功，最后新训日期已更新为今日')
      }, 1100)
    } catch (e: any) {
      applyAttempt(e?.data)
      setPhase('shake')
      toast.error(e?.message || '签到失败')
      clearDigits()
      window.setTimeout(() => {
        setPhase('idle')
        inputsRef.current[0]?.focus()
      }, 420)
    } finally {
      setSubmitting(false)
      submitLock.current = false
    }
  }

  const setDigitAt = (index: number, raw: string) => {
    if (!canInput || submitting) return
    const cleaned = raw.replace(/\D/g, '')
    if (!cleaned) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }

    // 支持粘贴多位
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 4).split('')
      const next = ['', '', '', '']
      chars.forEach((c, i) => {
        next[i] = c
      })
      setDigits(next)
      const focusIdx = Math.min(chars.length, 3)
      inputsRef.current[focusIdx]?.focus()
      if (chars.length >= 4) void submitCode(next.join(''))
      return
    }

    const next = [...digits]
    next[index] = cleaned.slice(-1)
    setDigits(next)
    if (index < 3) {
      inputsRef.current[index + 1]?.focus()
    }
    if (next.every((d) => d !== '')) {
      void submitCode(next.join(''))
    }
  }

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        inputsRef.current[index - 1]?.focus()
        const next = [...digits]
        next[index - 1] = ''
        setDigits(next)
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageSkeleton variant="form" />
      </div>
    )
  }

  return (
    <div className="p-6 min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center py-8">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-400/30 mb-4">
              <KeyRound className="text-purple-300" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-white">新训签到</h1>
            <p className="text-sm text-gray-400 mt-2">输入教官公布的 4 位签到码完成今日签到</p>
            <p className="text-xs text-gray-500 mt-2">今日 · {today || '—'}</p>
          </div>

          <div
            className="mb-4 rounded-xl border-2 border-red-500/70 bg-gradient-to-r from-red-950/90 via-red-900/70 to-orange-950/80 px-4 py-3.5 shadow-[0_0_28px_rgba(239,68,68,0.25)]"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 rounded-lg bg-red-500/25 p-1.5">
                <AlertTriangle className="text-red-300" size={20} />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-red-100 font-bold text-sm tracking-wide">严禁泄露签到码 / 代签</div>
                <p className="text-red-50/95 text-sm leading-relaxed mt-1.5 font-medium">
                  请不要将签到码发给其他学员或代签，否则将面临
                  <span className="text-amber-200 font-extrabold mx-1">停训 14 天</span>
                  的惩罚。
                </p>
              </div>
            </div>
          </div>

          <div className="student-glass-panel student-glass-panel--static p-6 sm:p-8">
            {checked || phase === 'success' || phase === 'merging' ? (
              <div className="flex flex-col items-center py-4">
                <div className="relative h-28 w-full flex items-center justify-center mb-6">
                  <AnimatePresence mode="wait">
                    {phase === 'merging' && (
                      <motion.div
                        key="merge"
                        className="relative w-64 h-16 flex items-center justify-center"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* 四格向中心合并成一块 */}
                        {[0, 1, 2, 3].map((i) => {
                          const startX = (i - 1.5) * 58
                          return (
                            <motion.div
                              key={i}
                              className="absolute w-14 h-14 rounded-xl bg-purple-500/45 border border-purple-300/60 shadow-lg shadow-purple-900/40"
                              initial={{ x: startX, scale: 1, opacity: 1, borderRadius: 12 }}
                              animate={{
                                x: 0,
                                scale: i === 0 ? 1 : 0.92,
                                opacity: i === 0 ? 1 : 0,
                                borderRadius: 16,
                              }}
                              transition={{
                                duration: 0.55,
                                ease: [0.22, 1, 0.36, 1],
                                delay: i * 0.03,
                              }}
                            />
                          )
                        })}
                        {/* 合并后的单一方框再略微放大定格 */}
                        <motion.div
                          className="absolute w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/70 to-fuchsia-500/50 border-2 border-purple-200/70"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: [0.6, 1.08, 1], opacity: 1 }}
                          transition={{ duration: 0.45, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </motion.div>
                    )}

                    {(phase === 'success' || (checked && phase !== 'merging')) && (
                      <motion.div
                        key="check"
                        className="relative w-24 h-24 flex items-center justify-center"
                        style={{
                          filter: 'drop-shadow(0 0 12px rgba(52, 211, 153, 0.45))',
                        }}
                        initial={playSuccessAnim ? { scale: 0.85, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <svg
                          className="absolute inset-0 w-full h-full overflow-visible"
                          viewBox="0 0 96 96"
                          style={{ shapeRendering: 'geometricPrecision' }}
                        >
                          <defs>
                            <filter id="checkin-ring-glow" x="-40%" y="-40%" width="180%" height="180%">
                              <feGaussianBlur stdDeviation="2.2" result="blur" />
                              <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                            <radialGradient id="checkin-disc" cx="50%" cy="45%" r="55%">
                              <stop offset="0%" stopColor="rgba(52, 211, 153, 0.28)" />
                              <stop offset="70%" stopColor="rgba(16, 185, 129, 0.14)" />
                              <stop offset="100%" stopColor="rgba(16, 185, 129, 0.04)" />
                            </radialGradient>
                          </defs>
                          {/* 圆内淡底 */}
                          <circle cx="48" cy="48" r="38" fill="url(#checkin-disc)" />
                          {/* 单圈描边 + 辉光 */}
                          {playSuccessAnim ? (
                            <motion.g
                              filter="url(#checkin-ring-glow)"
                              initial={{ rotate: -90 }}
                              animate={{ rotate: 270 }}
                              transition={{ duration: 0.85, ease: 'easeInOut' }}
                              style={{ transformOrigin: '48px 48px' }}
                            >
                              <motion.circle
                                cx="48"
                                cy="48"
                                r="40"
                                fill="none"
                                stroke="rgba(110, 231, 183, 0.95)"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeDasharray="251.327"
                                initial={{ strokeDashoffset: 251.327 }}
                                animate={{ strokeDashoffset: 0 }}
                                transition={{ duration: 0.85, ease: 'easeInOut' }}
                              />
                            </motion.g>
                          ) : (
                            <circle
                              cx="48"
                              cy="48"
                              r="40"
                              fill="none"
                              stroke="rgba(110, 231, 183, 0.75)"
                              strokeWidth="2.5"
                              filter="url(#checkin-ring-glow)"
                            />
                          )}
                        </svg>

                        {/* 方框形态 → 勾弹出 */}
                        <motion.div
                          className="relative z-10 w-16 h-16 flex items-center justify-center"
                          initial={
                            playSuccessAnim
                              ? {
                                  scale: 1,
                                  borderRadius: 16,
                                  backgroundColor: 'rgba(168, 85, 247, 0.45)',
                                }
                              : false
                          }
                          animate={
                            playSuccessAnim
                              ? {
                                  scale: [1, 0.72, 1.12, 1],
                                  borderRadius: [16, 16, 999, 999],
                                  backgroundColor: [
                                    'rgba(168, 85, 247, 0.45)',
                                    'rgba(168, 85, 247, 0.25)',
                                    'rgba(16, 185, 129, 0)',
                                    'rgba(16, 185, 129, 0)',
                                  ],
                                }
                              : undefined
                          }
                          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <motion.div
                            initial={playSuccessAnim ? { scale: 0, opacity: 0, rotate: -24 } : false}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            transition={
                              playSuccessAnim
                                ? { type: 'spring', stiffness: 420, damping: 14, delay: 0.22 }
                                : { duration: 0 }
                            }
                            className="drop-shadow-[0_0_10px_rgba(110,231,183,0.55)]"
                          >
                            <Check className="text-emerald-300" size={36} strokeWidth={2.75} />
                          </motion.div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <motion.div
                  className="text-emerald-200 font-semibold text-lg"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: phase === 'merging' ? 0.8 : 0.15 }}
                >
                  今日已签到
                </motion.div>
                <div className="text-sm text-gray-400 mt-2">
                  最后新训日期：{lastTraining ? String(lastTraining).slice(0, 10) : today || '今日'}
                </div>
              </div>
            ) : !hasTask ? (
              <div className="text-center text-gray-400 text-sm py-8">
                今日尚未开启签到任务，请等待管理端生成签到码。
              </div>
            ) : dayStatus === 'stopped' ? (
              <div className="text-center text-amber-200/90 text-sm py-8">
                今日签到已停止（未开训），无法签到。
              </div>
            ) : locked ? (
              <div className="text-center py-8 space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/15 border border-red-400/30">
                  <Lock className="text-red-300" size={22} />
                </div>
                <div className="text-red-200 font-medium">今日输入已锁定</div>
                <p className="text-sm text-gray-400 px-4">
                  连续输错已达 {attempt?.max_fails || 5} 次，今日无法再次输入签到码。请联系管理代签或明日再试。
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="text-center text-sm text-gray-300">签到码</div>
                <motion.div
                  className="flex justify-center gap-3 sm:gap-4"
                  animate={phase === 'shake' ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        inputsRef.current[i] = el
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={d}
                      disabled={!canInput || submitting}
                      onChange={(e) => setDigitAt(i, e.target.value)}
                      onKeyDown={(e) => onKeyDown(i, e)}
                      onFocus={(e) => e.target.select()}
                      className={`
                        w-14 h-14 sm:w-16 sm:h-16 rounded-xl text-center text-2xl font-mono font-semibold
                        bg-black/30 border text-white outline-none transition-all
                        focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/30
                        disabled:opacity-50
                        ${d ? 'border-purple-400/50' : 'border-white/15'}
                      `}
                      aria-label={`签到码第 ${i + 1} 位`}
                    />
                  ))}
                </motion.div>
                <p className="text-center text-xs text-gray-500">
                  {submitting
                    ? '正在签到…'
                    : attempt && attempt.fail_count > 0
                      ? `还可尝试 ${attempt.remaining_attempts} 次（连续错误满 ${attempt.max_fails} 次将锁定今日）`
                      : '输满 4 位后自动签到'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
