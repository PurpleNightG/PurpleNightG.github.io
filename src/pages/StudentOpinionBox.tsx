import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { opinionBoxAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { formatDateTime, getTodayDateString } from '../utils/dateFormat'
import {
  playFaxDial,
  playFaxPaper,
  playFaxStamp,
  playFaxTear,
  unlockFaxAudio,
} from '../utils/faxSounds'

const CATEGORIES = [
  { id: '问题反馈', en: 'BUG REPORT', stamp: '错误报告', tone: 'bug' },
  { id: '建议', en: 'SUGGESTION', stamp: '功能建议', tone: 'suggest' },
  { id: '表扬', en: 'PRAISE', stamp: '表扬感谢', tone: 'praise' },
  { id: '其他', en: 'OTHER', stamp: '其他事项', tone: 'other' },
] as const

type CategoryId = (typeof CATEGORIES)[number]['id']
type FaxPhase = 'form' | 'retracting' | 'receipt' | 'falling'
type PaperMotion = 'idle' | 'feed' | 'retract'
/** off=灭 | sending=闪红 | ok=常绿 */
type LineMode = 'off' | 'sending' | 'ok'

const STATUS_LABEL: Record<string, string> = {
  pending: '待查阅',
  read: '已读',
  archived: '已归档',
}

const MAX_CHARS = 2000
const FEED_MS = 1400
const RETRACT_MS = 1400
const FALL_MS = 780
const DELIVERED_HOLD_MS = 420

interface MyOpinion {
  id: number
  is_anonymous: boolean
  category: string
  content: string
  status: string
  admin_note: string | null
  created_at: string
}

interface ReceiptData {
  serial: number
  category: CategoryId
  contentLen: number
  isAnonymous: boolean
  senderName: string
  at: Date
  durationSec: number
}

function padSerial(n: number) {
  return String(n).padStart(4, '0')
}

function padChars(n: number) {
  return String(n).padStart(4, '0')
}

function formatReceiptDate(d: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/\//g, '-')
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}'${ss}`
}

function categoryMeta(id: CategoryId) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0]
}

function readStudentNickname() {
  try {
    const raw = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (!raw) return ''
    const user = JSON.parse(raw)
    return String(user?.nickname || user?.name || '').trim()
  } catch {
    return ''
  }
}

export default function StudentOpinionBox() {
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<CategoryId>('问题反馈')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [studentName, setStudentName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [list, setList] = useState<MyOpinion[]>([])
  const [phase, setPhase] = useState<FaxPhase>('form')
  const [paperMotion, setPaperMotion] = useState<PaperMotion>('idle')
  const [paperKey, setPaperKey] = useState(0)
  const [serial, setSerial] = useState(1)
  const [serialReady, setSerialReady] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [statusText, setStatusText] = useState('待命中 · STANDBY')
  const [progress, setProgress] = useState(0)
  const [lineMode, setLineMode] = useState<LineMode>('off')
  const [stampKey, setStampKey] = useState(0)
  const [outboxOpen, setOutboxOpen] = useState(false)
  const timers = useRef<number[]>([])
  const progressTimer = useRef<number | null>(null)
  const transmitStartedAt = useRef(0)
  /** 浏览器未解锁时错过的进/吐纸声，手势解锁后补播 */
  const missedPaperSound = useRef<{ kind: 'feed' | 'retract'; ms: number } | null>(null)

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    if (progressTimer.current != null) {
      window.clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }

  useEffect(() => {
    setStudentName(readStudentNickname())
    return () => clearTimers()
  }, [])

  const load = async () => {
    try {
      const res = await opinionBoxAPI.my()
      const rows = (res.data || []) as MyOpinion[]
      setList(rows)
      const next = Number(res.next_serial) || (rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1)
      setSerial(Math.max(1, next))
      setSerialReady(true)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
      setSerialReady(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 编号就绪后再第一次吐纸，避免先显示 NO.0001 再跳号
  useEffect(() => {
    if (!serialReady || paperKey !== 0) return
    if (phase !== 'form' || paperMotion !== 'idle') return
    setPaperMotion('feed')
  }, [serialReady])

  useEffect(() => {
    if (paperMotion !== 'feed' || phase !== 'form') return
    if (!playFaxPaper('feed', FEED_MS)) {
      missedPaperSound.current = { kind: 'feed', ms: FEED_MS }
    } else {
      missedPaperSound.current = null
    }
    later(() => setPaperMotion('idle'), FEED_MS)
  }, [paperMotion, phase, paperKey])

  const armAudio = async () => {
    const ok = await unlockFaxAudio()
    if (!ok || !missedPaperSound.current) return
    const missed = missedPaperSound.current
    missedPaperSound.current = null
    playFaxPaper(missed.kind, missed.ms)
  }

  const busy = phase !== 'form' || submitting
  const senderLabel = isAnonymous ? '匿名学员' : studentName || '实名学员'
  const meta = categoryMeta(category)
  const today = getTodayDateString()

  const selectCategory = (id: CategoryId) => {
    if (busy || id === category) return
    void armAudio()
    setCategory(id)
    setStampKey((k) => k + 1)
    playFaxStamp()
  }

  const startProgress = () => {
    if (progressTimer.current != null) window.clearInterval(progressTimer.current)
    setProgress(0)
    const started = performance.now()
    progressTimer.current = window.setInterval(() => {
      const ratio = Math.min(1, (performance.now() - started) / RETRACT_MS)
      const pct = Math.round(ratio * 100)
      setProgress(pct)
      setStatusText(`传送中 ${pct}% · TRANSMITTING`)
      if (ratio >= 1 && progressTimer.current != null) {
        window.clearInterval(progressTimer.current)
        progressTimer.current = null
      }
    }, 40)
  }

  const handleClear = () => {
    if (busy) return
    void armAudio()
    setContent('')
  }

  const handleTransmit = async () => {
    if (busy) return
    const text = content.trim()
    if (!text) {
      toast.error('请先在传真单上写点什么')
      return
    }

    try {
      await armAudio()
      setSubmitting(true)
      setLineMode('sending')
      setStatusText('拨号中 ····· DIALING')
      playFaxDial()
      transmitStartedAt.current = performance.now()
      const submitRes = await opinionBoxAPI.submit({
        content: text,
        category,
        is_anonymous: isAnonymous,
      })

      const sentAt = new Date()
      const insertedId = Number(submitRes?.data?.id) || serial
      const durationSec = (performance.now() - transmitStartedAt.current) / 1000
      setReceipt({
        serial: insertedId,
        category,
        contentLen: text.length,
        isAnonymous,
        senderName: senderLabel,
        at: sentAt,
        durationSec,
      })
      setSerial(insertedId + 1)
      setPhase('retracting')
      setPaperMotion('retract')
      if (!playFaxPaper('retract', RETRACT_MS)) {
        missedPaperSound.current = { kind: 'retract', ms: RETRACT_MS }
      } else {
        missedPaperSound.current = null
      }
      startProgress()

      later(() => {
        setProgress(100)
        setStatusText('已送达 · DELIVERED')
        later(() => {
          setPhase('receipt')
          setPaperMotion('idle')
          setLineMode('ok')
          setStatusText(`回执已打印 · NO.${padSerial(insertedId)}`)
          if (!playFaxPaper('feed', 1350)) {
            missedPaperSound.current = { kind: 'feed', ms: 1350 }
          } else {
            missedPaperSound.current = null
          }
          setContent('')
          setSubmitting(false)
          setProgress(0)
          load()
        }, DELIVERED_HOLD_MS)
      }, RETRACT_MS)
    } catch (err: any) {
      toast.error(err.message || '发送失败')
      setStatusText('线路忙 · LINE BUSY')
      setLineMode('off')
      setSubmitting(false)
      setProgress(0)
      later(() => setStatusText('待命中 · STANDBY'), 1600)
    }
  }

  const handleTearReceipt = () => {
    if (phase !== 'receipt') return
    void armAudio()
    setPhase('falling')
    setLineMode('off')
    setStatusText('换纸中 · LOADING')
    playFaxTear()
    later(() => {
      setReceipt(null)
      setPaperKey((k) => k + 1)
      setPhase('form')
      setPaperMotion('feed')
      setStatusText('换纸中 · LOADING')
      later(() => setStatusText('待命中 · STANDBY'), FEED_MS)
    }, FALL_MS)
  }

  const formMotionClass =
    phase === 'retracting' || paperMotion === 'retract'
      ? ' is-retracting'
      : paperMotion === 'feed'
        ? ' is-feeding'
        : ' is-idle'

  const lineClass =
    lineMode === 'sending' ? ' is-sending' : lineMode === 'ok' ? ' is-ok' : ' is-off'

  return (
    <div
      className="opinion-fax-page student-main-center w-full"
      onPointerDown={() => {
        void armAudio()
      }}
    >
      <div className="opinion-fax" aria-label="意见传真机">
        <header className="opinion-fax__titlebar">
          <span className="opinion-fax__brand">意见箱 · 反馈专线 FEEDBACK LINE</span>
          <span className="opinion-fax__model">FX-01</span>
        </header>

        <div className="opinion-fax__panel">
          <div className="opinion-fax__led">
            <span className="opinion-fax__led-msg">{statusText}</span>
            <span className="opinion-fax__led-chars">
              {phase === 'retracting'
                ? `${String(progress).padStart(3, '0')}% · TX`
                : `${padChars(content.length)} / ${MAX_CHARS.toLocaleString()} 字数 · CHARS`}
            </span>
          </div>

          <div className="opinion-fax__modes" role="group" aria-label="分类">
            {CATEGORIES.map((c) => {
              const on = category === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => selectCategory(c.id)}
                  className={`opinion-fax__mode${on ? ' is-on' : ''}`}
                >
                  {on && <span className="opinion-fax__mode-dot" aria-hidden />}
                  <span className="opinion-fax__mode-en">{c.en}</span>
                  <span className="opinion-fax__mode-zh">{c.id}</span>
                </button>
              )
            })}
          </div>

          <div className="opinion-fax__feed-label">进纸口 · DOCUMENT FEED</div>
          <div className="opinion-fax__slot" aria-hidden />

          <div className="opinion-fax__bay">
            <div className="opinion-fax__bay-stage">
            {serialReady && (phase === 'form' || phase === 'retracting') && (
              <div
                key={`form-${paperKey}`}
                className={`opinion-fax__sheet opinion-fax__sheet--form${formMotionClass}`}
              >
                <div className="opinion-fax__holes" aria-hidden />
                <div className="opinion-fax__sheet-inner">
                  <div className="opinion-fax__doc-head">
                    <div>
                      <div className="opinion-fax__doc-title">紫夜 · 反馈传真单</div>
                      <div className="opinion-fax__doc-meta">
                        <span>收件：紫夜管理组</span>
                        <span>日期：{today}</span>
                        <span>发件：{senderLabel}</span>
                        <span>页数：01 / 01</span>
                      </div>
                    </div>
                    <div className="opinion-fax__serial">NO.{padSerial(serial)}</div>
                  </div>

                  <div
                    key={stampKey}
                    className={`opinion-fax__stamp opinion-fax__stamp--${meta.tone} is-stamping`}
                  >
                    {meta.stamp}
                  </div>

                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
                    disabled={busy}
                    rows={10}
                    maxLength={MAX_CHARS}
                    placeholder="说明发生了什么，以及你原本预期的样子。"
                    className="opinion-fax__lines"
                  />

                  <p className="opinion-fax__disclaimer">
                    投递内容仅供管理组查阅。匿名投递不会附带可识别身份；请勿填写他人隐私。
                  </p>
                </div>
                <div className="opinion-fax__holes" aria-hidden />
              </div>
            )}

            {(phase === 'receipt' || phase === 'falling') && receipt && (
              <button
                type="button"
                className={`opinion-fax__sheet opinion-fax__sheet--receipt${
                  phase === 'falling' ? ' is-falling' : ' is-feeding'
                }`}
                onClick={handleTearReceipt}
                aria-label="点击撕下回执"
              >
                <div className="opinion-fax__receipt-body">
                  <div className="opinion-fax__receipt-head">
                    <div className="opinion-fax__receipt-title">传送回执</div>
                    <div className="opinion-fax__receipt-sub">TRANSMISSION REPORT</div>
                  </div>
                  <div className="opinion-fax__receipt-rule" aria-hidden />
                  <dl className="opinion-fax__receipt-dl">
                    <div>
                      <dt>日期</dt>
                      <dd>{formatReceiptDate(receipt.at)}</dd>
                    </div>
                    <div>
                      <dt>收件</dt>
                      <dd>紫夜管理组</dd>
                    </div>
                    <div>
                      <dt>发件</dt>
                      <dd>{receipt.isAnonymous ? '匿名' : receipt.senderName}</dd>
                    </div>
                    <div>
                      <dt>类别</dt>
                      <dd>{categoryMeta(receipt.category).stamp}</dd>
                    </div>
                    <div>
                      <dt>字数</dt>
                      <dd>{padChars(receipt.contentLen)}</dd>
                    </div>
                    <div>
                      <dt>用时</dt>
                      <dd>{formatDuration(receipt.durationSec)}</dd>
                    </div>
                    <div>
                      <dt>结果</dt>
                      <dd className="is-ok">OK · 已送达</dd>
                    </div>
                    <div>
                      <dt>单号</dt>
                      <dd>NO.{padSerial(receipt.serial)}</dd>
                    </div>
                  </dl>
                  <div className="opinion-fax__receipt-rule" aria-hidden />
                  <div className="opinion-fax__receipt-foot">
                    <p className="opinion-fax__receipt-thanks">谢谢。每一张我们都会读。</p>
                    <p className="opinion-fax__receipt-hint">点回执撕下，机器回到待命</p>
                  </div>
                </div>
              </button>
            )}
            </div>
          </div>

          <div className="opinion-fax__controls">
            <div className="opinion-fax__toggles">
              <label className={`opinion-fax__switch${isAnonymous ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  disabled={busy}
                  onChange={(e) => {
                    void armAudio()
                    setIsAnonymous(e.target.checked)
                  }}
                />
                <span className="opinion-fax__switch-track" aria-hidden>
                  <span className="opinion-fax__switch-knob" />
                </span>
                <span>匿名投递</span>
              </label>
              <span className={`opinion-fax__line${lineClass}`} title="线路指示灯">
                <i /> LINE
              </span>
            </div>

            <div className="opinion-fax__actions">
              <button type="button" className="opinion-fax__btn-clear" disabled={busy} onClick={handleClear}>
                清除 CLEAR
              </button>
              <button
                type="button"
                className="opinion-fax__btn-tx"
                disabled={busy}
                onClick={handleTransmit}
              >
                {submitting || phase === 'retracting' ? '发送中…' : '发送 TRANSMIT'}
              </button>
            </div>
          </div>

          <div className="opinion-fax__outbox">
            <button
              type="button"
              className={`opinion-fax__outbox-toggle${outboxOpen ? ' is-open' : ''}`}
              onClick={() => setOutboxOpen((v) => !v)}
              aria-expanded={outboxOpen}
            >
              <span>发件托盘 · SENT</span>
              <span className="opinion-fax__outbox-count">{list.length}</span>
              <ChevronDown size={14} className="opinion-fax__outbox-chevron" aria-hidden />
            </button>
            {outboxOpen && (
              <div className="opinion-fax__outbox-list">
                {list.length === 0 ? (
                  <p className="opinion-fax__outbox-empty">托盘空着，发送后会出现在这里。</p>
                ) : (
                  list.map((item) => (
                    <article key={item.id} className="opinion-fax__slip">
                      <div className="opinion-fax__slip-meta">
                        <span>{item.category}</span>
                        <span>{item.is_anonymous ? '匿名' : '实名'}</span>
                        <span>{STATUS_LABEL[item.status] || item.status}</span>
                        <time>{formatDateTime(item.created_at)}</time>
                      </div>
                      <p className="opinion-fax__slip-body">{item.content}</p>
                      {item.admin_note && (
                        <p className="opinion-fax__slip-note">管理回复：{item.admin_note}</p>
                      )}
                    </article>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
