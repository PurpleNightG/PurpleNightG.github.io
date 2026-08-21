import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles, Square, Trash2, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { adminAiAPI, checkinAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import PageSkeleton from '../../components/Skeleton'
import DateInput from '../../components/DateInput'
import ConfirmDialog from '../../components/ConfirmDialog'
import MemberNameCell from '../../components/MemberNameCell'

/** 按查看日期缓存；持久化由服务端按日保存 */
const activityNarrativeByDate = new Map<
  string,
  {
    text: string
    updatedAt: string | null
    inflight: Promise<{ text: string; updatedAt: string | null; fromCache: boolean }> | null
  }
>()

async function fetchActivityNarrative(
  date: string,
  force = false
): Promise<{
  text: string
  updatedAt: string | null
  fromCache: boolean
}> {
  const d = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('请先选择查看日期')
  }
  let entry = activityNarrativeByDate.get(d)
  if (!entry) {
    entry = { text: '', updatedAt: null, inflight: null }
    activityNarrativeByDate.set(d, entry)
  }
  if (force) {
    entry.text = ''
    entry.updatedAt = null
    entry.inflight = null
  }
  if (!force && entry.inflight) return entry.inflight

  const inflight = adminAiAPI
    .activityReport(d, force)
    .then((res) => {
      const text =
        res.data?.narrative || JSON.stringify(res.data?.summary || {}, null, 2)
      const updatedAt = res.data?.updated_at ? String(res.data.updated_at) : null
      const fromCache = !!res.data?.from_cache
      activityNarrativeByDate.set(d, { text, updatedAt, inflight: null })
      return { text, updatedAt, fromCache }
    })
    .catch((err) => {
      const cur = activityNarrativeByDate.get(d)
      if (cur) cur.inflight = null
      throw err
    })
  entry.inflight = inflight
  return inflight
}

type DayInfo = {
  id: number
  checkin_date: string
  code?: string
  status: 'active' | 'stopped'
  checked_count: number
  created_by_name?: string
  stopped_by_name?: string
}

type RecordRow = {
  id: number
  member_id: number
  member_name?: string
  qq?: string
  avatar?: string | null
  stage_role?: string
  source: 'self' | 'proxy_admin' | 'proxy_assistant'
  proxy_name?: string | null
  created_at?: string
}

function sourceLabel(r: RecordRow) {
  if (r.source === 'self') return '本人签到'
  if (r.source === 'proxy_assistant') return `助教代签${r.proxy_name ? ` · ${r.proxy_name}` : ''}`
  return `管理代签${r.proxy_name ? ` · ${r.proxy_name}` : ''}`
}

type Props = { mode: 'admin' | 'assistant' }

export default function CheckinTaskPage({ mode }: Props) {
  const isAdmin = mode === 'admin'
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [day, setDay] = useState<DayInfo | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [today, setToday] = useState('')
  const [viewDate, setViewDate] = useState('')
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  const [resumeConfirmOpen, setResumeConfirmOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<RecordRow | null>(null)
  const [summary, setSummary] = useState('')
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState<string | null>(null)
  const summaryReqId = useRef(0)

  const loadSummary = useCallback(async (date: string, force = false) => {
    if (!isAdmin) return
    const d = String(date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    const reqId = ++summaryReqId.current
    setSummaryBusy(true)
    if (force) setSummary('')
    try {
      const { text, updatedAt, fromCache } = await fetchActivityNarrative(d, force)
      if (reqId !== summaryReqId.current) return
      setSummaryUpdatedAt(updatedAt)
      const full = String(text || '')
      if (fromCache && !force) {
        setSummary(full)
        return
      }
      setSummary('')
      for (let i = 0; i < full.length; i += 1) {
        if (reqId !== summaryReqId.current) return
        setSummary(full.slice(0, i + 1))
        const ch = full[i]
        const delay = /[。！？；：\n]/.test(ch) ? 70 : /[，、]/.test(ch) ? 40 : 18
        await new Promise((r) => setTimeout(r, delay))
      }
    } catch (e: any) {
      if (reqId !== summaryReqId.current) return
      toast.error(e?.message || '生成活跃度总结失败')
    } finally {
      if (reqId === summaryReqId.current) setSummaryBusy(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin || !viewDate) return
    setSummary('')
    setSummaryUpdatedAt(null)
    void loadSummary(viewDate, false)
  }, [isAdmin, viewDate, loadSummary])

  const loadToday = useCallback(async () => {
    setLoading(true)
    try {
      const res = isAdmin ? await checkinAPI.adminToday() : await checkinAPI.assistantToday()
      setDay(res.data?.day || null)
      setRecords(res.data?.records || [])
      setToday(res.data?.today || '')
      setViewDate(String(res.data?.day?.checkin_date || res.data?.today || '').slice(0, 10))
      if (isAdmin) {
        const h = await checkinAPI.adminHistory(20)
        setHistory(h.data || [])
      } else {
        const h = await checkinAPI.assistantHistory(20)
        setHistory(h.data || [])
      }
    } catch (e: any) {
      toast.error(e?.message || '加载签到任务失败')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    void loadToday()
  }, [loadToday])

  const reloadCurrentView = async (date?: string) => {
    const d = date || viewDate
    if (!d) {
      await loadToday()
      return
    }
    const res = isAdmin ? await checkinAPI.adminDay(d) : await checkinAPI.assistantDay(d)
    setDay(res.data?.day || null)
    setRecords(res.data?.records || [])
    setViewDate(d)
    if (isAdmin) {
      const h = await checkinAPI.adminHistory(20)
      setHistory(h.data || [])
    }
  }

  const loadDate = async (date: string) => {
    if (!date) return
    setBusy(true)
    try {
      await reloadCurrentView(date)
    } catch (e: any) {
      toast.error(e?.message || '加载失败')
    } finally {
      setBusy(false)
    }
  }

  const onRegenerate = async () => {
    if (!isAdmin) return
    if (!today || viewDate !== today) {
      toast.error('只能更换今日签到码')
      return
    }
    setBusy(true)
    try {
      const res = await checkinAPI.adminRegenerate()
      setDay(res.data?.day || null)
      toast.success(`新签到码：${res.data?.day?.code}`)
      await loadToday()
    } catch (e: any) {
      toast.error(e?.message || '更换失败')
    } finally {
      setBusy(false)
    }
  }

  const onResume = async () => {
    if (!isAdmin) return
    if (!today || viewDate !== today) {
      toast.error('只能重新开训今日任务')
      return
    }
    setBusy(true)
    setResumeConfirmOpen(false)
    try {
      const res = await checkinAPI.adminRegenerate()
      setDay(res.data?.day || null)
      toast.success(`已重新开训，签到码：${res.data?.day?.code}`)
      await loadToday()
    } catch (e: any) {
      toast.error(e?.message || '重新开训失败')
    } finally {
      setBusy(false)
    }
  }

  const onStop = async () => {
    if (!isAdmin) return
    if (!today || viewDate !== today) {
      toast.error('只能停止今日签到')
      return
    }
    setBusy(true)
    setStopConfirmOpen(false)
    try {
      const res = await checkinAPI.adminStop()
      setDay(res.data?.day || null)
      toast.success('已停止今日签到')
      await loadToday()
    } catch (e: any) {
      toast.error(e?.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const onCancelRecord = async () => {
    if (!isAdmin || !cancelTarget) return
    const r = cancelTarget
    setBusy(true)
    setCancelTarget(null)
    try {
      const res = await checkinAPI.adminCancelRecord(r.id)
      toast.success(res.message || '已取消签到')
      await reloadCurrentView(viewDate)
    } catch (e: any) {
      toast.error(e?.message || '取消失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageSkeleton variant="table" />
      </div>
    )
  }

  const isViewingToday = !!today && viewDate === today
  const dayIsPast = !!today && !!viewDate && viewDate < today
  const checkedCount = Number(day?.checked_count ?? records.length) || 0
  const statusBadge = !day
    ? null
    : isViewingToday
      ? day.status === 'active'
        ? { label: '进行中', className: 'bg-emerald-600/20 text-emerald-300' }
        : { label: '已停止（未开训）', className: 'bg-gray-600/30 text-gray-300' }
      : dayIsPast
        ? checkedCount > 0 || day.status === 'active'
          ? { label: '已结束', className: 'bg-slate-600/30 text-slate-200' }
          : { label: '未开训', className: 'bg-gray-600/30 text-gray-300' }
        : day.status === 'active'
          ? { label: '进行中', className: 'bg-emerald-600/20 text-emerald-300' }
          : { label: '已停止（未开训）', className: 'bg-gray-600/30 text-gray-300' }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="text-purple-400" size={26} />
            签到任务
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {isAdmin
              ? '每日自动生成 4 位签到码；可更换、停止或取消单人签到。学员签到后会更新最后新训日期。'
              : '可查看今日签到码与完成情况；不能更换或停止签到码。'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadToday()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {isAdmin && (
        <div className={`ai-aurora-shell relative mb-6 ${summaryBusy ? 'is-thinking' : ''}`}>
          <div className="ai-aurora-inner !py-3 !px-4">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={16} className="text-sky-300 shrink-0" />
                <div className="min-w-0">
                  <div className="ai-aurora-title text-sm font-semibold tracking-wide">AI 签到总结</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {summaryUpdatedAt
                      ? `${viewDate || '当日'} · 已保存 ${new Date(summaryUpdatedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : `${viewDate || '当日'} 签到 · 按日自动点评`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={summaryBusy || !viewDate}
                onClick={() => void loadSummary(viewDate, true)}
                title="重新生成本日总结"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 shrink-0"
              >
                <RefreshCw size={12} className={summaryBusy ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>
            <div>
              {summaryBusy && !summary ? (
                <div className="text-sm text-gray-500 py-0.5 inline-flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                  正在生成…
                </div>
              ) : summary ? (
                summaryBusy ? (
                  <p className="text-sm text-gray-200/95 leading-relaxed whitespace-pre-wrap">
                    {summary}
                    <span className="inline-block w-1.5 h-[1.05em] ml-0.5 align-[-0.1em] bg-fuchsia-300/90 animate-pulse" />
                  </p>
                ) : (
                  <div className="admin-ai-md admin-ai-md--card">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                )
              ) : (
                <div className="text-sm text-gray-500 py-0.5">暂无总结</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="student-glass-panel student-glass-panel--static p-5 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-4">
            <DateInput
              label="查看日期"
              value={viewDate}
              onChange={(v) => void loadDate(v)}
              size="sm"
            />

            {!day ? (
              <div className="text-gray-400 text-sm py-4">
                {isAdmin
                  ? viewDate === today
                    ? '正在准备今日任务…'
                    : viewDate
                      ? `${viewDate} 暂无签到任务`
                      : '暂无签到任务'
                  : '管理端尚未开启该日签到任务'}
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xs text-gray-500 mb-1">签到码</div>
                  <div className="text-4xl font-mono tracking-[0.35em] text-white pl-0.5">
                    {day.code || '····'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {statusBadge && (
                    <span className={`px-2 py-0.5 rounded ${statusBadge.className}`}>
                      {statusBadge.label}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-purple-600/20 text-purple-200 inline-flex items-center gap-1">
                    <Users size={14} />
                    已签 {checkedCount} 人
                  </span>
                </div>
                {isAdmin && isViewingToday && (
                  <div className="flex flex-col gap-2 pt-1">
                    {day.status === 'active' ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onRegenerate()}
                          className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm transition-colors disabled:opacity-50"
                        >
                          更换签到码
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setStopConfirmOpen(true)}
                          className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                          <Square size={14} />
                          停止今日签到
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setResumeConfirmOpen(true)}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm transition-colors disabled:opacity-50"
                      >
                        重新开训（生成新签到码）
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {history.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <div className="text-xs text-gray-500 mb-2">最近任务</div>
                <div className="space-y-1 max-h-40 overflow-y-auto modal-scrollbar">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => void loadDate(String(h.checkin_date).slice(0, 10))}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-white/5 text-gray-300 flex justify-between gap-2 transition-colors ${
                        viewDate === String(h.checkin_date).slice(0, 10) ? 'bg-white/5 text-white' : ''
                      }`}
                    >
                      <span>{String(h.checkin_date).slice(0, 10)}</span>
                      <span className="text-gray-500">
                        {(() => {
                          const d = String(h.checkin_date).slice(0, 10)
                          if (today && d < today) return `结 · ${h.checked_count || 0}人`
                          return `${h.status === 'active' ? '开' : '停'} · ${h.checked_count || 0}人`
                        })()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-black/20 overflow-hidden min-h-[220px]">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-medium text-sm">已完成签到</div>
              <div className="text-xs text-gray-500">{records.length} 条</div>
            </div>
            {records.length === 0 ? (
              <div className="py-14 text-center text-gray-500 text-sm">暂无签到记录</div>
            ) : (
              <div className="overflow-x-auto max-h-[28rem] overflow-y-auto modal-scrollbar">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#1a1528]/95 backdrop-blur-sm">
                    <tr className="text-left text-gray-500 border-b border-white/5">
                      <th className="px-4 py-2 font-medium">成员</th>
                      <th className="px-4 py-2 font-medium">阶段</th>
                      <th className="px-4 py-2 font-medium">方式</th>
                      <th className="px-4 py-2 font-medium">时间</th>
                      {isAdmin && <th className="px-4 py-2 font-medium">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b border-white/5 text-gray-200">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <MemberNameCell
                              name={r.member_name || `ID ${r.member_id}`}
                              avatar={r.avatar}
                              qq={r.qq}
                            />
                            {r.qq && (
                              <span className="text-gray-500 text-xs shrink-0">QQ {r.qq}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{r.stage_role || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              r.source === 'self'
                                ? 'bg-emerald-600/20 text-emerald-300'
                                : 'bg-amber-600/20 text-amber-200'
                            }`}
                          >
                            {sourceLabel(r)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs tabular-nums">
                          {r.created_at ? String(r.created_at).replace('T', ' ').slice(0, 19) : '—'}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setCancelTarget(r)}
                              className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
                              title="取消签到并回退最后新训日期"
                            >
                              <Trash2 size={14} />
                              取消
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {stopConfirmOpen && (
        <ConfirmDialog
          title="停止今日签到"
          message="停止后将记为「今日未开训」，学员无法再用签到码。确定停止吗？之后仍可「重新开训」。"
          confirmText="停止签到"
          type="warning"
          onConfirm={() => void onStop()}
          onCancel={() => setStopConfirmOpen(false)}
        />
      )}

      {resumeConfirmOpen && (
        <ConfirmDialog
          title="重新开训"
          message="将重新开启今日签到，并生成新的 4 位签到码。学员可再次使用新码签到。"
          confirmText="重新开训"
          type="info"
          onConfirm={() => void onResume()}
          onCancel={() => setResumeConfirmOpen(false)}
        />
      )}

      {cancelTarget && (
        <ConfirmDialog
          title="取消签到"
          message={`确定取消「${cancelTarget.member_name || `成员#${cancelTarget.member_id}`}」的签到？\n\n若其最后新训日期正是该日，将回退为：其它签到日中最晚的一天；若无其它签到，则回退到签到前保存的日期（可能为空）。`}
          confirmText="确认取消"
          type="danger"
          onConfirm={() => void onCancelRecord()}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  )
}
