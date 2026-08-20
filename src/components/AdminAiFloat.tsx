import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Loader2, Send, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { adminAiAPI } from '../utils/api'
import { toast } from '../utils/toast'

type Msg = { role: 'user' | 'assistant'; content: string }

const POS_KEY = 'adminAiFloatPos'
const SUGGESTIONS = [
  '你现在能做什么？',
  '现在有多少人在请假？',
  '帮我看今日签到情况',
  '催促名单里有谁？',
]

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p
  } catch {
    /* ignore */
  }
  return null
}

function clampPos(x: number, y: number) {
  const size = 56
  const maxX = Math.max(8, window.innerWidth - size - 8)
  const maxY = Math.max(8, window.innerHeight - size - 8)
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  }
}

/** 管理端主内容区滚动位置（点开 AI 时浏览器会误滚 main） */
function captureAdminScroll() {
  const main = document.querySelector('main.overflow-y-auto') as HTMLElement | null
  return {
    main,
    mainTop: main?.scrollTop ?? 0,
    winY: window.scrollY || document.documentElement.scrollTop || 0,
  }
}

function restoreAdminScroll(snap: ReturnType<typeof captureAdminScroll>) {
  if (snap.main) snap.main.scrollTop = snap.mainTop
  window.scrollTo(0, snap.winY)
}

export default function AdminAiFloat() {
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [pos, setPos] = useState(() => {
    const saved = loadPos()
    if (saved) return saved
    return { x: Math.max(8, window.innerWidth - 80), y: Math.max(8, window.innerHeight - 100) }
  })
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [statusHint, setStatusHint] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollSnapRef = useRef<ReturnType<typeof captureAdminScroll> | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => {
    ;(async () => {
      try {
        const res = await adminAiAPI.status()
        setConfigured(!!res.data?.configured)
      } catch {
        setConfigured(false)
      }
    })()
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!open || !el) return
    el.scrollTop = el.scrollHeight
  }, [messages, sending, statusHint, open])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const onResize = () => setPos((p: { x: number; y: number }) => clampPos(p.x, p.y))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    scrollSnapRef.current = captureAdminScroll()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: posRef.current.x,
      originY: posRef.current.y,
      moved: false,
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && dx * dx + dy * dy > 16) d.moved = true
    if (d.moved) {
      setPos(clampPos(d.originX + dx, d.originY + dy))
    }
  }, [])

  const onPointerUp = useCallback(() => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    localStorage.setItem(POS_KEY, JSON.stringify(posRef.current))
    if (!d.moved) {
      const snap = scrollSnapRef.current || captureAdminScroll()
      setOpen((v) => !v)
      restoreAdminScroll(snap)
    }
  }, [])

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || sending) return
    if (!configured) {
      toast.error('请先配置 ZHIPU_API_KEY')
      return
    }
    if (!preset) setInput('')
    const historyForApi = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ])
    setSending(true)
    setStatusHint('思考中…')
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const patchAssistant = (updater: (prev: string) => string) => {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (!last || last.role !== 'assistant') return prev
        next[next.length - 1] = { ...last, content: updater(last.content) }
        return next
      })
    }

    try {
      await adminAiAPI.chatStream(text, historyForApi, {
        signal: ac.signal,
        onStatus: (s) => setStatusHint(s),
        onDelta: (chunk) => {
          setStatusHint('')
          patchAssistant((prev) => prev + chunk)
        },
        onDone: (payload) => {
          setStatusHint('')
          if (payload?.reply != null) {
            patchAssistant(() => String(payload.reply))
          }
        },
        onError: (msg) => {
          patchAssistant((prev) => prev || `出错了：${msg}`)
        },
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      toast.error(err?.message || 'AI 请求失败')
      patchAssistant((prev) => prev || `出错了：${err?.message || '请求失败'}`)
    } finally {
      setSending(false)
      setStatusHint('')
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  const panelW = 360
  const panelH = 460
  const panelLeft = Math.min(
    Math.max(8, pos.x + 56 - panelW),
    window.innerWidth - panelW - 8
  )
  const openUp = pos.y > window.innerHeight / 2
  const panelTop = openUp
    ? Math.max(8, pos.y - panelH - 10)
    : Math.min(pos.y + 64, window.innerHeight - panelH - 8)

  return createPortal(
    <>
      <button
        type="button"
        aria-label="鲶鱼助手"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`admin-ai-fab fixed z-[12000] w-14 h-14 rounded-full flex items-center justify-center select-none touch-none ${
          open ? 'is-open' : ''
        }`}
        style={{ left: pos.x, top: pos.y, cursor: 'pointer' }}
      >
        <span className="admin-ai-fab-ring" aria-hidden />
        <span className="admin-ai-fab-core">
          <Bot className="text-white pointer-events-none relative z-[1]" size={26} />
        </span>
        {!configured && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border border-gray-900 z-[2]" />
        )}
      </button>

      {open && (
        <div
          className="admin-ai-panel ai-aurora-shell"
          style={{ left: panelLeft, top: panelTop, height: panelH, width: 'min(360px, calc(100vw - 16px))' }}
        >
          <div className="ai-aurora-inner !p-0 h-full flex flex-col overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <div className="ai-aurora-title text-sm font-semibold tracking-wide truncate">鲶鱼助手</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {configured ? '可协助查询与日常管理操作' : '未配置 API Key'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  scrollSnapRef.current = captureAdminScroll()
                  setOpen(false)
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 modal-scrollbar min-h-0">
              {messages.length === 0 && (
                <div className="space-y-2 py-2 admin-ai-msg-enter">
                  <p className="text-xs text-gray-500 text-center">试试这样问</p>
                  <div className="flex flex-col gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={!configured || sending}
                        onClick={() => void send(s)}
                        className="text-left text-xs px-2.5 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-fuchsia-400/30 disabled:opacity-40 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`admin-ai-msg-enter max-w-[92%] rounded-xl px-2.5 py-2 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/20 whitespace-pre-wrap'
                      : 'mr-auto bg-white/5 text-gray-200 border border-white/10'
                  }`}
                >
                  {m.role === 'user' ? (
                    m.content
                  ) : m.content ? (
                    sending && i === messages.length - 1 ? (
                      <p className="text-xs whitespace-pre-wrap leading-relaxed m-0">
                        {m.content}
                        <span className="inline-block w-1.5 h-[1.05em] ml-0.5 align-[-0.1em] bg-fuchsia-300/80 animate-pulse" />
                      </p>
                    ) : (
                      <div className="admin-ai-md">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )
                  ) : sending && i === messages.length - 1 ? (
                    <span className="text-gray-500 inline-flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin text-fuchsia-300" />
                      {statusHint || '思考中…'}
                    </span>
                  ) : null}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="p-2.5 border-t border-white/10 flex gap-1.5 bg-black/20 shrink-0">
              <input
                className="student-glass-field flex-1 !py-2 !text-sm"
                placeholder={configured ? '输入问题…' : '请配置 API Key'}
                value={input}
                disabled={!configured || sending}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              <button
                type="button"
                disabled={!configured || sending || !input.trim()}
                onClick={() => void send()}
                className="px-3 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-white transition-opacity"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
