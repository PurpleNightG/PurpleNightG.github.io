import { useEffect, useRef } from 'react'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  color: string
  size: number
  kind: 'spark' | 'ember' | 'flash' | 'glitter'
  drag: number
  gravity: number
}

type Rocket = {
  x: number
  y: number
  vx: number
  vy: number
  targetY: number
  color: string
  palette: string[]
  trail: { x: number; y: number; a: number }[]
}

const PALETTES = [
  ['#fff7ed', '#fde68a', '#fbbf24', '#f59e0b', '#fb923c'],
  ['#faf5ff', '#e9d5ff', '#c084fc', '#a855f7', '#e879f9'],
  ['#ecfeff', '#a5f3fc', '#22d3ee', '#2dd4bf', '#67e8f9'],
  ['#eff6ff', '#bfdbfe', '#60a5fa', '#3b82f6', '#38bdf8'],
  ['#fff1f2', '#fecdd3', '#fb7185', '#f43f5e', '#f472b6'],
  ['#ecfdf5', '#bbf7d0', '#4ade80', '#34d399', '#a3e635'],
  ['#fffbeb', '#fef08a', '#facc15', '#f97316', '#ef4444'],
]

function pick<T>(arr: T[]): T {
  return arr[(Math.random() * arr.length) | 0]
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function explode(
  particles: Particle[],
  x: number,
  y: number,
  palette: string[],
  power = 1
) {
  // 主环
  const ring = Math.floor(48 * power + Math.random() * 24)
  for (let i = 0; i < ring; i++) {
    const angle = (Math.PI * 2 * i) / ring + rand(-0.08, 0.08)
    const speed = rand(2.8, 7.2) * power
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: rand(0.008, 0.016),
      color: pick(palette),
      size: rand(1.6, 3.4) * power,
      kind: 'spark',
      drag: 0.985,
      gravity: 0.042,
    })
  }

  // 内芯白光
  const core = Math.floor(18 * power)
  for (let i = 0; i < core; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = rand(0.6, 2.4) * power
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: rand(0.02, 0.04),
      color: '#ffffff',
      size: rand(2.2, 4.5) * power,
      kind: 'flash',
      drag: 0.92,
      gravity: 0.01,
    })
  }

  // 外层余烬
  const embers = Math.floor(36 * power)
  for (let i = 0; i < embers; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = rand(1.2, 5.5) * power
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0, 1.2),
      life: 1,
      decay: rand(0.006, 0.012),
      color: pick(palette),
      size: rand(1, 2.2),
      kind: 'ember',
      drag: 0.978,
      gravity: 0.055,
    })
  }

  // 金粉闪点
  const glitter = Math.floor(40 * power)
  for (let i = 0; i < glitter; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = rand(0.4, 3.5) * power
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: rand(0.004, 0.01),
      color: Math.random() > 0.5 ? '#ffffff' : pick(palette),
      size: rand(0.6, 1.4),
      kind: 'glitter',
      drag: 0.99,
      gravity: 0.02,
    })
  }
}

/** 恭喜遮罩烟花（更强开场 + 持续连发） */
export default function CongratsFireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let raf = 0
    let running = true
    const rockets: Rocket[] = []
    const particles: Particle[] = []
    let lastSpawn = 0
    let flash = 0
    const timers: number[] = []

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawnRocket = (opts?: { x?: number; powerHint?: number }) => {
      const w = window.innerWidth
      const h = window.innerHeight
      const palette = pick(PALETTES)
      rockets.push({
        x: opts?.x ?? w * rand(0.08, 0.92),
        y: h + 10,
        vx: rand(-1.4, 1.4),
        vy: -rand(7.2, 11.5),
        targetY: h * rand(0.12, 0.42),
        color: palette[1] || palette[0],
        palette,
        trail: [],
      })
    }

    const boomAt = (x: number, y: number, palette: string[], power = 1) => {
      explode(particles, x, y, palette, power)
      flash = Math.min(0.55, flash + 0.18 * power)
      // 二次小爆
      if (power >= 1 && Math.random() > 0.35) {
        timers.push(
          window.setTimeout(() => {
            if (!running) return
            explode(
              particles,
              x + rand(-40, 40),
              y + rand(-30, 30),
              pick(PALETTES),
              0.55
            )
            flash = Math.min(0.45, flash + 0.08)
          }, 120 + Math.random() * 160)
        )
      }
    }

    // 震撼开场：左右齐射 + 中心大爆
    const opening = [
      { delay: 0, x: 0.2 },
      { delay: 80, x: 0.8 },
      { delay: 160, x: 0.35 },
      { delay: 220, x: 0.65 },
      { delay: 300, x: 0.5 },
      { delay: 420, x: 0.15 },
      { delay: 480, x: 0.85 },
      { delay: 560, x: 0.45 },
      { delay: 620, x: 0.55 },
    ]
    for (const o of opening) {
      timers.push(
        window.setTimeout(() => {
          if (running) spawnRocket({ x: window.innerWidth * o.x })
        }, o.delay)
      )
    }
    // 中心预爆（不等火箭）
    timers.push(
      window.setTimeout(() => {
        if (!running) return
        boomAt(window.innerWidth * 0.5, window.innerHeight * 0.28, pick(PALETTES), 1.35)
      }, 380)
    )

    const frame = (t: number) => {
      if (!running) return
      const w = window.innerWidth
      const h = window.innerHeight
      if (!lastSpawn) lastSpawn = t

      // 每帧清空，靠粒子拖尾线表现动感（避免半透明黑叠层把遮罩涂死）
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, w, h)

      // 全程保持较高火力，不再明显衰减
      const interval = 400
      if (t - lastSpawn > interval && rockets.length < 8) {
        const volley = 1 + (Math.random() > 0.4 ? 1 : 0) + (Math.random() > 0.75 ? 1 : 0)
        for (let i = 0; i < volley; i++) spawnRocket()
        lastSpawn = t
      }

      ctx.globalCompositeOperation = 'lighter'

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        r.x += r.vx
        r.y += r.vy
        r.vy += 0.055
        r.trail.push({ x: r.x, y: r.y, a: 1 })
        if (r.trail.length > 14) r.trail.shift()

        for (let ti = 0; ti < r.trail.length; ti++) {
          const tr = r.trail[ti]
          const a = (ti / r.trail.length) * 0.7
          ctx.beginPath()
          ctx.fillStyle = r.color
          ctx.globalAlpha = a
          ctx.arc(tr.x, tr.y, 1.2 + (ti / r.trail.length) * 1.8, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.beginPath()
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = 1
        ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.fillStyle = r.color
        ctx.globalAlpha = 0.85
        ctx.arc(r.x, r.y, 4.5, 0, Math.PI * 2)
        ctx.fill()

        if (r.y <= r.targetY || r.vy >= -0.4) {
          const power = 0.9 + Math.random() * 0.7
          boomAt(r.x, r.y, r.palette, power)
          rockets.splice(i, 1)
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life -= p.decay
        p.vx *= p.drag
        p.vy *= p.drag
        p.vy += p.gravity
        p.x += p.vx
        p.y += p.vy

        if (p.life <= 0 || p.y > h + 40) {
          particles.splice(i, 1)
          continue
        }

        const alpha = Math.max(0, p.life)
        ctx.globalAlpha = alpha

        if (p.kind === 'flash') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
          g.addColorStop(0, 'rgba(255,255,255,0.95)')
          g.addColorStop(0.35, p.color)
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.kind === 'spark' || p.kind === 'ember') {
          ctx.beginPath()
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.size
          ctx.lineCap = 'round'
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 2.8, p.y - p.vy * 2.8)
          ctx.stroke()
          ctx.beginPath()
          ctx.fillStyle = '#fff'
          ctx.globalAlpha = alpha * 0.85
          ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // glitter 闪烁
          const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.02 + p.x))
          ctx.globalAlpha = alpha * twinkle
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 全屏爆闪光（短暂提亮，不长期压暗）
      if (flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = flash * 0.35
        const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, Math.max(w, h) * 0.7)
        g.addColorStop(0, 'rgba(255, 248, 220, 0.9)')
        g.addColorStop(0.4, 'rgba(255, 200, 120, 0.25)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
        flash *= 0.88
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(frame)
    }

    // 首帧不留黑底拖影：先清一次
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      timers.forEach((id) => clearTimeout(id))
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[1]"
      aria-hidden
    />
  )
}
