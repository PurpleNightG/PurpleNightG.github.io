/** 学员签到音效（Web Audio 合成，无需音频文件） */

let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AC()
  }
  return sharedCtx
}

function isRunning(ctx: AudioContext) {
  return ctx.state === 'running'
}

/** 用户手势解锁音频 */
export async function unlockCheckinAudio(): Promise<boolean> {
  const ctx = getCtx()
  if (!ctx) return false
  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    return false
  }
  return isRunning(ctx)
}

function tone(
  ctx: AudioContext,
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  opts?: { slideTo?: number }
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)
  if (opts?.slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slideTo), when + dur)
  }
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(when)
  osc.stop(when + dur + 0.02)
}

/** 输入一位数字：清脆轻点，位数越高略抬高 */
export function playCheckinDigit(index = 0) {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return
  const when = ctx.currentTime
  const base = 520 + index * 70
  tone(ctx, when, base, 0.07, 'sine', 0.045)
  tone(ctx, when, base * 2.02, 0.05, 'triangle', 0.018)
}

/** 开始汇聚 / 提交中：上行能量感 */
export function playCheckinMerging() {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return
  const when = ctx.currentTime
  ;[0, 0.12, 0.24, 0.36].forEach((off, i) => {
    tone(ctx, when + off, 280 + i * 110, 0.16, 'sawtooth', 0.028, {
      slideTo: 420 + i * 140,
    })
  })
  // 底层嗡鸣
  tone(ctx, when, 90, 0.85, 'sine', 0.035, { slideTo: 160 })
}

/** 签到成功：明亮三连音 + 余韵 */
export function playCheckinSuccess() {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return
  const when = ctx.currentTime
  const notes = [
    { t: 0, f: 523.25, p: 0.055 }, // C5
    { t: 0.11, f: 659.25, p: 0.06 }, // E5
    { t: 0.22, f: 783.99, p: 0.07 }, // G5
    { t: 0.38, f: 1046.5, p: 0.05 }, // C6
  ]
  notes.forEach((n) => {
    tone(ctx, when + n.t, n.f, 0.28, 'sine', n.p)
    tone(ctx, when + n.t, n.f * 2, 0.18, 'triangle', n.p * 0.35)
  })
  // 闪亮尾音
  tone(ctx, when + 0.42, 1568, 0.35, 'sine', 0.028, { slideTo: 2093 })
}

/** 签到失败：低沉两声警示 */
export function playCheckinFail() {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return
  const when = ctx.currentTime
  tone(ctx, when, 180, 0.14, 'square', 0.04, { slideTo: 110 })
  tone(ctx, when + 0.16, 140, 0.2, 'square', 0.035, { slideTo: 90 })
}
