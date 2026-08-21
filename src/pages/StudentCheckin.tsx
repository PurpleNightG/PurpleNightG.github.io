import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Check, KeyRound, Lock, Sparkles, Zap } from 'lucide-react'
import { checkinAPI } from '../utils/api'
import { toast } from '../utils/toast'
import PageSkeleton from '../components/Skeleton'
import {
  playCheckinDigit,
  playCheckinFail,
  playCheckinMerging,
  playCheckinSuccess,
  unlockCheckinAudio,
} from '../utils/checkinSounds'

type AttemptInfo = {
  fail_count: number
  max_fails: number
  remaining_attempts: number
  locked: boolean
}

type Phase = 'idle' | 'shake' | 'merging' | 'success'

const MERGE_MS = 1600
const SUCCESS_HOLD_MS = 400

function seededRand(seed: number) {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

/** 成功爆发粒子 */
function BurstParticles({ active }: { active: boolean }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2 + seededRand(i + 1) * 0.4
        const dist = 48 + seededRand(i + 7) * 90
        return {
          id: i,
          x: Math.cos(a) * dist,
          y: Math.sin(a) * dist,
          size: 3 + seededRand(i + 3) * 5,
          delay: seededRand(i + 11) * 0.18,
          color:
            i % 3 === 0
              ? 'bg-emerald-300'
              : i % 3 === 1
                ? 'bg-fuchsia-300'
                : 'bg-amber-200',
          rotate: seededRand(i + 19) * 360,
        }
      }),
    []
  )
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className={`absolute rounded-full ${b.color} shadow-[0_0_8px_rgba(255,255,255,0.55)]`}
          style={{ width: b.size, height: b.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            x: b.x,
            y: b.y,
            opacity: [1, 1, 0],
            scale: [1, 1.35, 0.2],
            rotate: b.rotate,
          }}
          transition={{ duration: 0.95, delay: b.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  )
}

/** 纸屑雨 */
function ConfettiRain({ active }: { active: boolean }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: `${seededRand(i + 2) * 100}%`,
        delay: seededRand(i + 5) * 0.55,
        duration: 1.4 + seededRand(i + 9) * 1.1,
        w: 4 + seededRand(i + 13) * 6,
        h: 8 + seededRand(i + 17) * 10,
        color:
          ['#34d399', '#a78bfa', '#f472b6', '#fbbf24', '#67e8f9', '#c084fc'][
            i % 6
          ],
        rot: seededRand(i + 23) * 720 - 360,
      })),
    []
  )
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {flakes.map((f) => (
        <motion.span
          key={f.id}
          className="absolute top-0 rounded-sm opacity-90"
          style={{
            left: f.left,
            width: f.w,
            height: f.h,
            background: f.color,
            boxShadow: `0 0 10px ${f.color}`,
          }}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: 320, opacity: [0, 1, 1, 0], rotate: f.rot }}
          transition={{ duration: f.duration, delay: f.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

/** 环绕光点轨道 */
function OrbitSparks({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {[0, 1, 2].map((ring) => (
        <motion.div
          key={ring}
          className="absolute rounded-full border border-emerald-300/20"
          style={{
            width: 88 + ring * 36,
            height: 88 + ring * 36,
          }}
          initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{
            opacity: [0, 0.85, 0.35],
            scale: [0.6, 1.05, 1],
            rotate: ring % 2 === 0 ? 360 : -360,
          }}
          transition={{
            opacity: { duration: 0.6, delay: 0.15 + ring * 0.08 },
            scale: { duration: 0.7, delay: 0.1 + ring * 0.08 },
            rotate: { duration: 8 + ring * 2, repeat: Infinity, ease: 'linear', delay: 0.4 },
          }}
        >
          {[0, 1, 2, 3].map((p) => (
            <span
              key={p}
              className="absolute h-1.5 w-1.5 rounded-full bg-fuchsia-200 shadow-[0_0_8px_#f0abfc]"
              style={{
                top: '50%',
                left: '50%',
                transform: `rotate(${p * 90 + ring * 20}deg) translate(${44 + ring * 18}px) translate(-50%, -50%)`,
              }}
            />
          ))}
        </motion.div>
      ))}
    </div>
  )
}

export default function StudentCheckin() {
  const reduceMotion = useReducedMotion()
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
  const [flash, setFlash] = useState(false)
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
    const unlock = () => {
      void unlockCheckinAudio()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
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
    await unlockCheckinAudio()
    try {
      await checkinAPI.studentSubmit(value)
      setPhase('merging')
      setPlaySuccessAnim(true)
      playCheckinMerging()
      const mergeWait = reduceMotion ? 200 : MERGE_MS
      window.setTimeout(() => {
        if (!reduceMotion) {
          setFlash(true)
          window.setTimeout(() => setFlash(false), 280)
        }
        setPhase('success')
        setChecked(true)
        setLastTraining(today || new Date().toISOString().slice(0, 10))
        playCheckinSuccess()
        toast.success('签到成功，最后新训日期已更新为今日')
      }, mergeWait)
    } catch (e: any) {
      applyAttempt(e?.data)
      setPhase('shake')
      playCheckinFail()
      toast.error(e?.message || '签到失败')
      clearDigits()
      window.setTimeout(() => {
        setPhase('idle')
        inputsRef.current[0]?.focus()
      }, 520)
    } finally {
      setSubmitting(false)
      submitLock.current = false
    }
  }

  const setDigitAt = (index: number, raw: string) => {
    if (!canInput || submitting) return
    void unlockCheckinAudio()
    const cleaned = raw.replace(/\D/g, '')
    if (!cleaned) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }

    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 4).split('')
      const next = ['', '', '', '']
      chars.forEach((c, i) => {
        next[i] = c
        playCheckinDigit(i)
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
    playCheckinDigit(index)
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

  const filledCount = digits.filter(Boolean).length

  if (loading) {
    return (
      <div className="p-6">
        <PageSkeleton variant="form" />
      </div>
    )
  }

  const showSuccess = checked || phase === 'success' || phase === 'merging'

  return (
    <div className="relative p-6 min-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* 页级氛围光 */}
      {!reduceMotion && (
        <>
          <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[90px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-emerald-500/10 blur-[80px]" />
          <div className="pointer-events-none absolute top-1/3 left-0 h-48 w-48 rounded-full bg-violet-600/15 blur-[70px]" />
        </>
      )}

      <AnimatePresence>
        {flash && !reduceMotion && (
          <motion.div
            key="flash"
            className="pointer-events-none fixed inset-0 z-[80] bg-gradient-to-b from-emerald-300/25 via-fuchsia-400/15 to-transparent mix-blend-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <div className="relative flex-1 flex flex-col items-center justify-center py-8">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <motion.div
              className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-emerald-500/20 border border-purple-300/40 mb-4 shadow-[0_0_40px_rgba(168,85,247,0.35)]"
              animate={
                reduceMotion
                  ? undefined
                  : {
                      boxShadow: [
                        '0 0 24px rgba(168,85,247,0.25)',
                        '0 0 48px rgba(236,72,153,0.45)',
                        '0 0 24px rgba(52,211,153,0.3)',
                        '0 0 24px rgba(168,85,247,0.25)',
                      ],
                    }
              }
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              {!reduceMotion && (
                <motion.span
                  className="absolute inset-0 rounded-2xl border border-fuchsia-300/40"
                  animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0, 0.55] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                />
              )}
              <KeyRound className="relative z-10 text-purple-200" size={30} />
              {!reduceMotion && (
                <motion.span
                  className="absolute -right-1 -top-1 text-amber-200"
                  animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                >
                  <Sparkles size={14} />
                </motion.span>
              )}
            </motion.div>
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-white to-emerald-200">
              新训签到
            </h1>
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

          <div className="student-glass-panel student-glass-panel--static relative overflow-hidden p-6 sm:p-8">
            {showSuccess && !reduceMotion && (
              <ConfettiRain active={phase === 'success' && playSuccessAnim} />
            )}

            {/* 成功态底层极光 */}
            {showSuccess && !reduceMotion && (
              <motion.div
                className="pointer-events-none absolute -inset-8 opacity-60"
                animate={{
                  background: [
                    'radial-gradient(circle at 30% 40%, rgba(52,211,153,0.25), transparent 55%)',
                    'radial-gradient(circle at 70% 50%, rgba(232,121,249,0.28), transparent 55%)',
                    'radial-gradient(circle at 50% 60%, rgba(167,139,250,0.22), transparent 55%)',
                    'radial-gradient(circle at 30% 40%, rgba(52,211,153,0.25), transparent 55%)',
                  ],
                }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}

            {showSuccess ? (
              <div className="relative flex flex-col items-center py-4">
                <div className="relative h-40 w-full flex items-center justify-center mb-4">
                  <AnimatePresence mode="wait">
                    {phase === 'merging' && (
                      <motion.div
                        key="merge"
                        className="relative w-72 h-28 flex items-center justify-center"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.4, filter: 'blur(8px)' }}
                        transition={{ duration: 0.35 }}
                      >
                        {/* 能量漩涡 */}
                        {!reduceMotion && (
                          <>
                            <motion.div
                              className="absolute h-24 w-24 rounded-full border-2 border-dashed border-fuchsia-400/50"
                              animate={{ rotate: 360, scale: [0.7, 1.3, 0.9] }}
                              transition={{
                                rotate: { duration: 1.2, ease: 'linear', repeat: Infinity },
                                scale: { duration: 1.1, ease: 'easeInOut' },
                              }}
                            />
                            <motion.div
                              className="absolute h-32 w-32 rounded-full border border-emerald-300/30"
                              animate={{ rotate: -360, opacity: [0.2, 0.8, 0.2] }}
                              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                            />
                            <motion.div
                              className="absolute h-16 w-16 rounded-full bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 blur-md"
                              animate={{ scale: [0.8, 1.6, 1.1], opacity: [0.4, 0.9, 0.5] }}
                              transition={{ duration: 1.1, ease: 'easeInOut' }}
                            />
                          </>
                        )}

                        {[0, 1, 2, 3].map((i) => {
                          const startX = (i - 1.5) * 62
                          const digit = digits[i] || '·'
                          return (
                            <motion.div
                              key={i}
                              className="absolute flex h-14 w-14 items-center justify-center rounded-xl border border-purple-200/70 bg-gradient-to-br from-violet-500/80 to-fuchsia-600/60 text-xl font-mono font-bold text-white shadow-[0_0_24px_rgba(192,132,252,0.65)]"
                              initial={{
                                x: startX,
                                y: 0,
                                scale: 1,
                                opacity: 1,
                                rotate: 0,
                              }}
                              animate={{
                                x: 0,
                                y: [0, -18, 0],
                                scale: i === 1 || i === 2 ? [1, 1.15, 0.4] : [1, 1.05, 0.2],
                                opacity: [1, 1, 0],
                                rotate: [(i - 1.5) * -12, 0, (i % 2 ? 40 : -40)],
                              }}
                              transition={{
                                duration: 0.85,
                                ease: [0.22, 1, 0.36, 1],
                                delay: i * 0.05,
                              }}
                            >
                              {digit}
                              {!reduceMotion && (
                                <motion.span
                                  className="pointer-events-none absolute inset-0 rounded-xl bg-white/30"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: [0, 0.7, 0] }}
                                  transition={{ duration: 0.45, delay: 0.15 + i * 0.05 }}
                                />
                              )}
                            </motion.div>
                          )
                        })}

                        {/* 汇聚核心 */}
                        <motion.div
                          className="absolute z-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 via-fuchsia-500 to-emerald-400 shadow-[0_0_50px_rgba(232,121,249,0.8)]"
                          initial={{ scale: 0, opacity: 0, rotate: -90 }}
                          animate={{
                            scale: [0, 1.35, 1],
                            opacity: 1,
                            rotate: 0,
                          }}
                          transition={{ duration: 0.7, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <Zap className="text-white drop-shadow-lg" size={32} />
                          {!reduceMotion && (
                            <motion.span
                              className="absolute inset-0 rounded-full border-2 border-white/60"
                              animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                              transition={{ duration: 0.7, delay: 0.7, repeat: 2 }}
                            />
                          )}
                        </motion.div>

                        {/* 冲击波 */}
                        {!reduceMotion &&
                          [0, 1, 2].map((k) => (
                            <motion.div
                              key={`shock-${k}`}
                              className="absolute h-16 w-16 rounded-full border border-emerald-200/50"
                              initial={{ scale: 0.4, opacity: 0 }}
                              animate={{ scale: [0.4, 2.8 + k * 0.4], opacity: [0, 0.7, 0] }}
                              transition={{ duration: 0.9, delay: 0.75 + k * 0.12, ease: 'easeOut' }}
                            />
                          ))}
                      </motion.div>
                    )}

                    {(phase === 'success' || (checked && phase !== 'merging')) && (
                      <motion.div
                        key="check"
                        className="relative w-36 h-36 flex items-center justify-center"
                        initial={playSuccessAnim && !reduceMotion ? { scale: 0.4, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                      >
                        <BurstParticles active={!!playSuccessAnim && !reduceMotion} />
                        <OrbitSparks active={!reduceMotion} />

                        {/* 外圈扫描光环 */}
                        <svg
                          className="absolute inset-0 w-full h-full overflow-visible"
                          viewBox="0 0 144 144"
                        >
                          <defs>
                            <filter id="checkin-glow-xl" x="-50%" y="-50%" width="200%" height="200%">
                              <feGaussianBlur stdDeviation="3.5" result="b" />
                              <feMerge>
                                <feMergeNode in="b" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                            <linearGradient id="checkin-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#6ee7b7" />
                              <stop offset="45%" stopColor="#c084fc" />
                              <stop offset="100%" stopColor="#f0abfc" />
                            </linearGradient>
                            <radialGradient id="checkin-core" cx="50%" cy="40%" r="60%">
                              <stop offset="0%" stopColor="rgba(110,231,183,0.45)" />
                              <stop offset="55%" stopColor="rgba(167,139,250,0.18)" />
                              <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                            </radialGradient>
                          </defs>
                          <circle cx="72" cy="72" r="54" fill="url(#checkin-core)" />
                          {playSuccessAnim && !reduceMotion ? (
                            <>
                              <motion.circle
                                cx="72"
                                cy="72"
                                r="58"
                                fill="none"
                                stroke="url(#checkin-ring-grad)"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeDasharray="364"
                                filter="url(#checkin-glow-xl)"
                                initial={{ strokeDashoffset: 364, rotate: -90 }}
                                animate={{ strokeDashoffset: 0, rotate: 270 }}
                                transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
                                style={{ transformOrigin: '72px 72px' }}
                              />
                              <motion.circle
                                cx="72"
                                cy="72"
                                r="46"
                                fill="none"
                                stroke="rgba(244,114,182,0.55)"
                                strokeWidth="1.5"
                                strokeDasharray="8 10"
                                initial={{ rotate: 0, opacity: 0 }}
                                animate={{ rotate: -360, opacity: 1 }}
                                transition={{
                                  rotate: { duration: 10, repeat: Infinity, ease: 'linear' },
                                  opacity: { duration: 0.4, delay: 0.3 },
                                }}
                                style={{ transformOrigin: '72px 72px' }}
                              />
                            </>
                          ) : (
                            <circle
                              cx="72"
                              cy="72"
                              r="58"
                              fill="none"
                              stroke="url(#checkin-ring-grad)"
                              strokeWidth="3"
                              filter="url(#checkin-glow-xl)"
                            />
                          )}
                        </svg>

                        {/* 印章猛砸 */}
                        <motion.div
                          className="relative z-10 flex h-20 w-20 items-center justify-center"
                          initial={
                            playSuccessAnim && !reduceMotion
                              ? { scale: 1.8, y: -40, rotate: -18, opacity: 0 }
                              : false
                          }
                          animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                          transition={
                            playSuccessAnim && !reduceMotion
                              ? { type: 'spring', stiffness: 380, damping: 12, delay: 0.15 }
                              : { duration: 0 }
                          }
                        >
                          <motion.div
                            className="absolute inset-0 rounded-full bg-emerald-400/30 blur-md"
                            animate={
                              reduceMotion
                                ? undefined
                                : { scale: [1, 1.35, 1], opacity: [0.5, 0.9, 0.5] }
                            }
                            transition={{ duration: 1.8, repeat: Infinity }}
                          />
                          <motion.div
                            initial={
                              playSuccessAnim && !reduceMotion
                                ? { scale: 0, rotate: -30 }
                                : false
                            }
                            animate={{ scale: 1, rotate: 0 }}
                            transition={
                              playSuccessAnim && !reduceMotion
                                ? { type: 'spring', stiffness: 500, damping: 14, delay: 0.28 }
                                : { duration: 0 }
                            }
                            className="relative drop-shadow-[0_0_18px_rgba(110,231,183,0.85)]"
                          >
                            <Check className="text-emerald-300" size={48} strokeWidth={3} />
                          </motion.div>
                        </motion.div>

                        {/* 印章冲击圈 */}
                        {playSuccessAnim && !reduceMotion && (
                          <motion.div
                            className="absolute h-24 w-24 rounded-full border-2 border-emerald-200/70"
                            initial={{ scale: 0.5, opacity: 1 }}
                            animate={{ scale: 2.4, opacity: 0 }}
                            transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <motion.div
                  className="relative text-center"
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: phase === 'merging' ? 1.1 : 0.2,
                    type: 'spring',
                    stiffness: 260,
                    damping: 18,
                  }}
                >
                  <div className="relative inline-block">
                    {!reduceMotion && (
                      <motion.span
                        className="pointer-events-none absolute -inset-x-6 -inset-y-2 rounded-full bg-gradient-to-r from-emerald-400/0 via-emerald-300/25 to-fuchsia-400/0 blur-sm"
                        animate={{ opacity: [0.3, 0.9, 0.3], x: ['-20%', '20%', '-20%'] }}
                        transition={{ duration: 2.4, repeat: Infinity }}
                      />
                    )}
                    <div className="relative text-2xl font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-white to-fuchsia-200">
                      今日已签到
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-gray-400">
                    最后新训日期：{lastTraining ? String(lastTraining).slice(0, 10) : today || '今日'}
                  </div>
                  {!reduceMotion && phase === 'success' && playSuccessAnim && (
                    <motion.div
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: SUCCESS_HOLD_MS / 1000 + 0.35 }}
                    >
                      <Sparkles size={12} />
                      签到完成 · 新训记录已更新
                    </motion.div>
                  )}
                </motion.div>
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
                <motion.div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/15 border border-red-400/30"
                  animate={reduceMotion ? undefined : { rotate: [0, -8, 8, -6, 6, 0] }}
                  transition={{ duration: 0.6 }}
                >
                  <Lock className="text-red-300" size={22} />
                </motion.div>
                <div className="text-red-200 font-medium">今日输入已锁定</div>
                <p className="text-sm text-gray-400 px-4">
                  连续输错已达 {attempt?.max_fails || 5} 次，今日无法再次输入签到码。请联系管理代签或明日再试。
                </p>
              </div>
            ) : (
              <div className="relative space-y-5">
                {!reduceMotion && filledCount > 0 && (
                  <motion.div
                    className="pointer-events-none absolute left-1/2 top-8 h-24 w-48 -translate-x-1/2 rounded-full bg-violet-500/20 blur-2xl"
                    animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.9, 1.1, 0.9] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
                <div className="text-center text-sm text-gray-300">签到码</div>
                <motion.div
                  className="relative flex justify-center gap-3 sm:gap-4"
                  animate={
                    phase === 'shake'
                      ? {
                          x: [0, -14, 14, -12, 12, -6, 6, 0],
                          rotate: [0, -2, 2, -1.5, 1.5, 0],
                        }
                      : { x: 0, rotate: 0 }
                  }
                  transition={{ duration: 0.48 }}
                >
                  {phase === 'shake' && !reduceMotion && (
                    <motion.div
                      className="pointer-events-none absolute inset-0 -m-3 rounded-2xl bg-red-500/20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.8, 0] }}
                      transition={{ duration: 0.45 }}
                    />
                  )}
                  {digits.map((d, i) => (
                    <motion.input
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
                      initial={false}
                      animate={
                        d && !reduceMotion
                          ? {
                              scale: [1, 1.08, 1],
                              boxShadow: [
                                '0 0 0 rgba(168,85,247,0)',
                                '0 0 24px rgba(192,132,252,0.55)',
                                '0 0 12px rgba(168,85,247,0.35)',
                              ],
                            }
                          : { scale: 1 }
                      }
                      transition={{ duration: 0.28 }}
                      className={`
                        relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-xl text-center text-2xl font-mono font-semibold
                        bg-black/30 border text-white outline-none transition-[border-color,background-color]
                        focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/30
                        disabled:opacity-50
                        ${
                          phase === 'shake'
                            ? 'border-red-400/70'
                            : d
                              ? 'border-purple-400/60 bg-purple-500/10'
                              : 'border-white/15'
                        }
                      `}
                      aria-label={`签到码第 ${i + 1} 位`}
                    />
                  ))}
                </motion.div>

                {/* 进度星轨 */}
                {!reduceMotion && (
                  <div className="flex justify-center gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.span
                        key={i}
                        className={`h-1.5 rounded-full ${
                          i < filledCount ? 'bg-gradient-to-r from-violet-400 to-fuchsia-400 w-6' : 'bg-white/15 w-3'
                        }`}
                        layout
                        transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                      />
                    ))}
                  </div>
                )}

                <p className="text-center text-xs text-gray-500">
                  {submitting
                    ? '能量汇聚中…'
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
