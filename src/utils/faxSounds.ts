/** 传真机仿真音效（Web Audio 合成，无需音频文件） */

let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AC()
  }
  return sharedCtx
}

function isRunning(ctx: AudioContext) {
  return ctx.state === 'running'
}

/** 用户手势解锁；返回是否已可播放 */
export async function unlockFaxAudio(): Promise<boolean> {
  const ctx = getCtx()
  if (!ctx) return false
  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    return false
  }
  return isRunning(ctx)
}

function noiseBuffer(ctx: AudioContext, duration: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    data[i] = i === 0 ? white : data[i - 1] * 0.72 + white * 0.28
  }
  return buf
}

/**
 * 进纸 / 吐纸：滚轴步进 + 中低频滑动（与撕纸刻意区分）
 * 撕纸 = 尖锐高频撕裂；这里 = 机械转一下 + 柔和「嘶」滑动
 */
export function playFaxPaper(kind: 'feed' | 'retract', durationMs = 1400): boolean {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return false

  const now = ctx.currentTime
  const dur = Math.max(0.45, durationMs / 1000)
  const steps = 7
  const slideHi = kind === 'feed' ? 2400 : 2000
  const slideLo = kind === 'feed' ? 1400 : 1150
  const slidePeak = kind === 'feed' ? 0.048 : 0.042
  const rollerF0 = kind === 'feed' ? 260 : 220

  // 滑动底噪：偏亮中高频，但仍用带通避免像撕纸扫频
  const bed = ctx.createBufferSource()
  bed.buffer = noiseBuffer(ctx, dur + 0.05)
  const bedBp = ctx.createBiquadFilter()
  bedBp.type = 'bandpass'
  bedBp.Q.value = 0.55
  bedBp.frequency.setValueAtTime(slideHi, now)
  bedBp.frequency.linearRampToValueAtTime(slideLo, now + dur)
  const bedGain = ctx.createGain()
  bedGain.gain.setValueAtTime(0.0001, now)
  bedGain.gain.linearRampToValueAtTime(0.028, now + 0.04)
  bedGain.gain.setValueAtTime(0.022, now + dur * 0.85)
  bedGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  bed.connect(bedBp)
  bedBp.connect(bedGain)
  bedGain.connect(ctx.destination)
  bed.start(now)
  bed.stop(now + dur + 0.05)

  for (let i = 0; i < steps; i++) {
    const t0 = now + (i / steps) * dur + 0.015
    const stepLen = dur / steps

    // 滚轴机械「转一下」（略提亮）
    const roller = ctx.createOscillator()
    const roller2 = ctx.createOscillator()
    const rGain = ctx.createGain()
    const rFilter = ctx.createBiquadFilter()
    roller.type = 'triangle'
    roller2.type = 'sawtooth'
    const f = rollerF0 + (kind === 'feed' ? i * 10 : (steps - i) * 9)
    roller.frequency.setValueAtTime(f, t0)
    roller.frequency.exponentialRampToValueAtTime(f * 0.85, t0 + 0.07)
    roller2.frequency.setValueAtTime(f * 1.5, t0)
    roller2.frequency.exponentialRampToValueAtTime(f * 1.2, t0 + 0.06)
    rFilter.type = 'bandpass'
    rFilter.frequency.value = 1400
    rFilter.Q.value = 0.7
    rGain.gain.setValueAtTime(0.0001, t0)
    rGain.gain.linearRampToValueAtTime(0.03, t0 + 0.01)
    rGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085)
    roller.connect(rFilter)
    roller2.connect(rFilter)
    rFilter.connect(rGain)
    rGain.connect(ctx.destination)
    roller.start(t0)
    roller2.start(t0)
    roller.stop(t0 + 0.09)
    roller2.stop(t0 + 0.09)

    // 偏亮短促滑动（带通中高，仍短于撕纸）
    const slide = ctx.createBufferSource()
    slide.buffer = noiseBuffer(ctx, 0.1)
    const sBp = ctx.createBiquadFilter()
    sBp.type = 'bandpass'
    sBp.Q.value = 0.65
    sBp.frequency.setValueAtTime(slideHi - i * 50, t0)
    sBp.frequency.linearRampToValueAtTime(slideLo, t0 + 0.09)
    const sGain = ctx.createGain()
    sGain.gain.setValueAtTime(0.0001, t0)
    sGain.gain.linearRampToValueAtTime(slidePeak, t0 + 0.014)
    sGain.gain.linearRampToValueAtTime(slidePeak * 0.28, t0 + stepLen * 0.45)
    sGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
    slide.connect(sBp)
    sBp.connect(sGain)
    sGain.connect(ctx.destination)
    slide.start(t0)
    slide.stop(t0 + 0.11)
  }

  return true
}

/** 盖章：短促钝响 */
export function playFaxStamp() {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return
  const when = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(90, when)
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.12)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(0.07, when + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(when)
  osc.stop(when + 0.15)

  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, 0.1)
  const nGain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1100
  nGain.gain.setValueAtTime(0.0001, when)
  nGain.gain.exponentialRampToValueAtTime(0.038, when + 0.008)
  nGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.1)
  src.connect(filter)
  filter.connect(nGain)
  nGain.connect(ctx.destination)
  src.start(when)
  src.stop(when + 0.1)
}

/** 撕回执：尖锐、连贯的撕裂扫频（与进纸滑动区分开） */
export function playFaxTear() {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return
  const when = ctx.currentTime

  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, 0.38)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.45
  bp.frequency.setValueAtTime(3200, when)
  bp.frequency.exponentialRampToValueAtTime(900, when + 0.32)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(0.078, when + 0.018)
  gain.gain.setValueAtTime(0.055, when + 0.14)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.36)
  src.connect(bp)
  bp.connect(gain)
  gain.connect(ctx.destination)
  src.start(when)
  src.stop(when + 0.38)

  const rip = ctx.createBufferSource()
  rip.buffer = noiseBuffer(ctx, 0.12)
  const ripHp = ctx.createBiquadFilter()
  ripHp.type = 'highpass'
  ripHp.frequency.value = 2500
  const ripGain = ctx.createGain()
  ripGain.gain.setValueAtTime(0.0001, when)
  ripGain.gain.exponentialRampToValueAtTime(0.05, when + 0.01)
  ripGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.11)
  rip.connect(ripHp)
  ripHp.connect(ripGain)
  ripGain.connect(ctx.destination)
  rip.start(when)
  rip.stop(when + 0.12)
}

/** 拨号：短促线路音 */
export function playFaxDial() {
  const ctx = getCtx()
  if (!ctx || !isRunning(ctx)) return
  const when = ctx.currentTime
  ;[0, 0.12, 0.24].forEach((offset, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 440 + i * 80
    gain.gain.setValueAtTime(0.0001, when + offset)
    gain.gain.exponentialRampToValueAtTime(0.035, when + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + offset + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(when + offset)
    osc.stop(when + offset + 0.09)
  })
}
