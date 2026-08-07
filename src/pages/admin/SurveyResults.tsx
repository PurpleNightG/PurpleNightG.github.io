import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { surveyAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDateTime } from '../../utils/dateFormat'
import PageSkeleton from '../../components/Skeleton'
import {
  Loader2,
  ArrowLeft,
  Lock,
  AlertTriangle,
  Trophy,
  TrendingDown,
  Users,
  BarChart3,
  FileText,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import ConfirmDialog from '../../components/ConfirmDialog'
import MemberNameCell from '../../components/MemberNameCell'
import { isFieldVisible, NOT_ATTENDED } from '../../utils/surveyHelpers'

interface RankItem {
  subject_id: string
  name: string
  attended: number
  not_attended: number
  sample_size: number
  score_points: number
  avg_score: number | null
  reliability: string
  reliability_note: string | null
}

const TYPE_LABEL: Record<string, string> = {
  single: '单选',
  multi: '多选',
  rating: '评分',
  matrix: '矩阵',
  subject_gate: '门禁',
  text: '文本',
  textarea: '多行',
}

function countTotal(counts: Record<string, number>) {
  return Object.values(counts).reduce((a, b) => a + Number(b || 0), 0)
}

function displayStatLabel(st: { label: string; subject_name?: string | null }) {
  if (!st.subject_name) return st.label
  return st.label
    .replace(new RegExp(`[（(]\\s*${String(st.subject_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[）)]$`), '')
    .replace(/^关于【.+?】：/, '')
    .trim() || st.label
}

function TextSamples({ samples }: { samples: string[] }) {
  if (!samples?.length) {
    return <p className="text-xs text-gray-500">暂无文本回答</p>
  }
  return (
    <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {samples.map((text, i) => (
        <li
          key={`${i}-${text.slice(0, 24)}`}
          className="student-glass-chip px-3 py-2 text-sm text-gray-100 whitespace-pre-wrap break-words"
        >
          <span className="text-[10px] text-gray-500 mr-2">#{i + 1}</span>
          {text}
        </li>
      ))}
    </ul>
  )
}

function StatCard({ st }: { st: any }) {
  const isText = st.type === 'text' || st.type === 'textarea'
  const sampleCount = Array.isArray(st.samples) ? st.samples.length : 0
  const total = isText ? sampleCount : countTotal(st.counts)
  return (
    <div
      className={`student-glass-panel student-glass-panel--static p-4 ${
        st.type === 'matrix' || isText ? 'md:col-span-2' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white leading-snug">{displayStatLabel(st)}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
              {TYPE_LABEL[st.type] || st.type}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-gray-400">
              合计 {total} 次
            </span>
          </div>
        </div>
      </div>
      {isText ? (
        <TextSamples samples={st.samples || []} />
      ) : st.type === 'matrix' ? (
        <MatrixStatTable counts={st.counts || {}} />
      ) : (
        <StatBars counts={st.counts || {}} />
      )}
    </div>
  )
}

/** 答卷明细：门禁未过时是否显示该题 */
function shouldShowResponseField(
  field: any,
  answers: Record<string, unknown>,
  hideGateSkipped: boolean
) {
  if (!hideGateSkipped) return true
  // 门禁答「没上过」：整块（含门禁题本身）隐藏
  if (field.type === 'subject_gate' && answers?.[field.id] === NOT_ATTENDED) return false
  if (!isFieldVisible(field, answers)) return false
  return true
}

/** 分题统计：横向占比条 */
function StatBars({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts || {}).sort((a, b) => Number(b[1]) - Number(a[1]))
  const total = countTotal(counts)
  if (!entries.length) {
    return <p className="text-xs text-gray-500">暂无数据</p>
  }
  return (
    <div className="space-y-2">
      {entries.map(([label, raw]) => {
        const n = Number(raw)
        const pct = total > 0 ? Math.round((n / total) * 1000) / 10 : 0
        return (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_72px] gap-3 items-center">
            <div className="min-w-0">
              <div className="flex justify-between gap-2 text-xs mb-1">
                <span className="text-gray-200 truncate" title={label}>
                  {label}
                </span>
                <span className="text-gray-400 shrink-0">
                  {n} · {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-900/80 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="text-right text-sm font-semibold text-white tabular-nums">{n}</div>
          </div>
        )
      })}
    </div>
  )
}

/** 矩阵统计：尝试把「行 · 列」拆成表 */
function MatrixStatTable({ counts }: { counts: Record<string, number> }) {
  const parsed = Object.entries(counts || {}).map(([k, v]) => {
    const parts = k.split(' · ')
    if (parts.length >= 2) {
      return { row: parts.slice(0, -1).join(' · '), col: parts[parts.length - 1], n: Number(v) }
    }
    return { row: k, col: '—', n: Number(v) }
  })
  const rows = [...new Set(parsed.map((p) => p.row))]
  const cols = [...new Set(parsed.map((p) => p.col))]
  const lookup = new Map(parsed.map((p) => [`${p.row}||${p.col}`, p.n]))

  if (rows.length <= 1 && cols.length <= 1) {
    return <StatBars counts={counts} />
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700/50">
      <table className="w-full text-xs min-w-[360px]">
        <thead>
          <tr className="bg-gray-900/60">
            <th className="px-2 py-2 text-left text-gray-400 font-medium sticky left-0 bg-gray-900/90">
              评价项
            </th>
            {cols.map((c) => (
              <th key={c} className="px-2 py-2 text-center text-gray-400 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r} className="border-t border-gray-700/40">
              <td className="px-2 py-2 text-gray-200 sticky left-0 bg-gray-800/90 max-w-[200px]">
                {r}
              </td>
              {cols.map((c) => {
                const n = lookup.get(`${r}||${c}`) || 0
                return (
                  <td
                    key={c}
                    className={`px-2 py-2 text-center tabular-nums ${
                      n > 0 ? 'text-cyan-300 font-medium' : 'text-gray-600'
                    }`}
                  >
                    {n || '·'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AnswerValue({ field, value }: { field: any; value: unknown }) {
  if (value == null || value === '') {
    return <span className="text-gray-600">—</span>
  }

  if (field.type === 'matrix' && typeof value === 'object' && !Array.isArray(value)) {
    const map = value as Record<string, string>
    const rows = field.rows || []
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-700/40 mt-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-900/50">
              <th className="px-2 py-1.5 text-left text-gray-500 font-normal">评价项</th>
              <th className="px-2 py-1.5 text-left text-gray-500 font-normal">选择</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.id} className="border-t border-gray-700/30">
                <td className="px-2 py-1.5 text-gray-300">{row.label}</td>
                <td className="px-2 py-1.5 text-cyan-300 font-medium">{map[row.id] || '—'}</td>
              </tr>
            ))}
            {!rows.length &&
              Object.entries(map).map(([k, v]) => (
                <tr key={k} className="border-t border-gray-700/30">
                  <td className="px-2 py-1.5 text-gray-300">{k}</td>
                  <td className="px-2 py-1.5 text-cyan-300">{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {value.map((v) => (
          <span
            key={String(v)}
            className="px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-200 text-xs border border-violet-500/20"
          >
            {String(v)}
          </span>
        ))}
      </div>
    )
  }

  if (field.type === 'rating') {
    return (
      <span className="inline-flex items-center gap-1 mt-0.5 text-amber-300 font-semibold">
        {String(value)}
        <span className="text-gray-500 font-normal text-xs">/ {field.maxRating || 5}</span>
      </span>
    )
  }

  if (field.type === 'subject_gate') {
    const skipped = String(value).includes('没有上过')
    return (
      <span
        className={`inline-flex mt-0.5 px-2 py-0.5 rounded text-xs ${
          skipped
            ? 'bg-gray-700 text-gray-300'
            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
        }`}
      >
        {String(value)}
      </span>
    )
  }

  return <p className="text-gray-100 mt-0.5 whitespace-pre-wrap break-words">{String(value)}</p>
}

export default function SurveyResults() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [deleteResponseId, setDeleteResponseId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  /** 分题统计折叠：key = subject_name 或 '__global__'；未收录的 key 视为展开 */
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  /** 答卷明细折叠：默认全部折叠 */
  const [collapsedResponses, setCollapsedResponses] = useState<Record<number, boolean>>({})
  /** 答卷明细：默认隐藏门禁未过的题目 */
  const [hideGateSkipped, setHideGateSkipped] = useState(true)

  const reload = async () => {
    const res = await surveyAPI.results(Number(id))
    setData(res.data)
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        await reload()
      } catch (e: any) {
        toast.error(e.message || '加载失败')
        navigate('/admin/surveys')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, navigate])

  const confirmDeleteResponse = async () => {
    if (deleteResponseId == null || !id) return
    try {
      setDeleting(true)
      await surveyAPI.deleteResponse(Number(id), deleteResponseId)
      setDeleteResponseId(null)
      toast.success('答卷已删除')
      await reload()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const statsList = useMemo(() => {
    if (!data?.stats) return []
    return Object.entries(data.stats).map(([fid, st]: [string, any]) => ({
      id: fid,
      ...st,
    }))
  }, [data])

  const statGroups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, { key: string; title: string; items: any[] }>()
    for (const st of statsList) {
      const key = st.subject_name ? String(st.subject_name) : '__global__'
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: st.subject_name ? String(st.subject_name) : '全局题目',
          items: [],
        })
        order.push(key)
      }
      map.get(key)!.items.push(st)
    }
    // 满意度：按排行顺序优先；全局放最后
    const rankingNames = (data?.satisfaction_ranking || []).map((r: RankItem) => r.name)
    order.sort((a, b) => {
      if (a === '__global__') return 1
      if (b === '__global__') return -1
      const ia = rankingNames.indexOf(a)
      const ib = rankingNames.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b, 'zh')
    })
    return order.map((k) => map.get(k)!)
  }, [statsList, data?.satisfaction_ranking])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const expandAllGroups = () => setCollapsedGroups({})
  const collapseAllGroups = () => {
    const next: Record<string, boolean> = {}
    for (const g of statGroups) next[g.key] = true
    setCollapsedGroups(next)
  }

  if (loading || !data) {
    return <PageSkeleton variant="table" />
  }

  const survey = data.survey
  const ranking: RankItem[] = data.satisfaction_ranking || []
  const maxAvg = Math.max(5, ...ranking.filter((r) => r.avg_score != null).map((r) => r.avg_score as number))
  const withScore = ranking.filter((r) => r.avg_score != null)
  const best = withScore[0]
  const worst = withScore.length ? withScore[withScore.length - 1] : null
  const fields: any[] = survey.fields || []

  return (
    <div className="p-4 md:p-6 space-y-5 w-full max-w-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/admin/surveys')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-2"
          >
            <ArrowLeft size={16} /> 返回填表管理
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="text-purple-400" size={26} />
            结果 · {survey.title}
          </h1>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            {survey.is_anonymous && (
              <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 inline-flex items-center gap-1">
                <Lock size={12} /> 匿名 · 不含填写人身份
              </span>
            )}
            {survey.is_satisfaction && (
              <span className="px-2 py-1 rounded bg-blue-500/15 text-blue-300">按人满意度</span>
            )}
            <span className="px-2 py-1 rounded bg-gray-700 text-gray-300">
              答卷 {data.response_count}
              {data.claim_count != null ? ` · 领券 ${data.claim_count}` : ''}
            </span>
            {(survey.start_at || survey.end_at) && (
              <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">
                {formatDateTime(survey.start_at)} ~ {formatDateTime(survey.end_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {survey.expired && (
        <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/15 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
          <div>
            <div className="font-medium text-amber-200">问卷已过期</div>
            <p className="text-sm text-amber-200/80 mt-0.5">
              {survey.window_message || '填表已结束'}，学员端不可再提交。以下为截止前已收集的结果。
            </p>
          </div>
        </div>
      )}

      {/* 满意度：左侧总览 + 右侧分题（宽屏并排）；普通问卷仅分题 */}
      <div
        className={
          survey.is_satisfaction
            ? 'grid xl:grid-cols-12 gap-5 items-start'
            : 'space-y-5'
        }
      >
        {survey.is_satisfaction && (
          <aside className="xl:col-span-4 xl:sticky xl:top-4 space-y-4">
            <section className="student-glass-panel student-glass-panel--static p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users size={18} /> 满意度总览
                </h2>
                <p className="text-[11px] text-gray-400 shrink-0">看均分也看样本</p>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
                样本过少时均分易失真，会标黄提示。
              </div>

              {best && worst && best.subject_id !== worst.subject_id && (
                <div className="grid sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3">
                    <div className="text-xs text-emerald-400 flex items-center gap-1">
                      <Trophy size={14} /> 均分最高
                    </div>
                    <div className="text-lg font-bold text-white mt-1">{best.name}</div>
                    <div className="text-sm text-emerald-300 mt-1">
                      {best.avg_score} 分 · n={best.sample_size}
                    </div>
                  </div>
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3">
                    <div className="text-xs text-rose-400 flex items-center gap-1">
                      <TrendingDown size={14} /> 均分最低
                    </div>
                    <div className="text-lg font-bold text-white mt-1">{worst.name}</div>
                    <div className="text-sm text-rose-300 mt-1">
                      {worst.avg_score} 分 · n={worst.sample_size}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {ranking.map((r, idx) => {
                  const pct = r.avg_score != null ? (r.avg_score / maxAvg) * 100 : 0
                  const low = r.reliability === 'low' || r.sample_size <= 1
                  return (
                    <div key={r.subject_id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-gray-500 w-5 shrink-0">{idx + 1}</span>
                          <span className="text-white font-medium truncate">{r.name}</span>
                          {low && r.sample_size > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                              样本少
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-xs text-gray-400">
                          {r.avg_score != null ? (
                            <span className="text-white font-semibold text-sm">{r.avg_score}</span>
                          ) : (
                            <span>—</span>
                          )}
                          <span className="ml-2">n={r.sample_size}</span>
                        </div>
                      </div>
                      <div className="h-2.5 rounded-full bg-gray-900/80 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            low ? 'bg-amber-500/70' : 'bg-gradient-to-r from-blue-600 to-cyan-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-gray-500">
                        上过{r.attended} / 未上{r.not_attended}
                        {r.reliability_note ? ` · ${r.reliability_note}` : ''}
                      </div>
                    </div>
                  )
                })}
                {!ranking.length && (
                  <p className="text-center text-gray-500 py-6">尚未配置评价对象</p>
                )}
              </div>
            </section>
          </aside>
        )}

        {/* 分题统计：按人折叠 */}
        {statsList.length > 0 && (
          <section
            className={`space-y-3 ${survey.is_satisfaction ? 'xl:col-span-8' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <BarChart3 size={18} /> 分题统计
                {statGroups.length > 1 && (
                  <span className="text-xs font-normal text-gray-400">
                    （按人分组 · {statGroups.length} 组）
                  </span>
                )}
              </h2>
              {statGroups.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={expandAllGroups}
                    className="px-2.5 py-1 rounded-lg student-glass-chip text-gray-300 hover:text-white"
                  >
                    全部展开
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllGroups}
                    className="px-2.5 py-1 rounded-lg student-glass-chip text-gray-300 hover:text-white"
                  >
                    全部折叠
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {statGroups.map((group) => {
                const collapsed = !!collapsedGroups[group.key]
                const answeredCount = group.items.reduce((sum, st) => {
                  if (st.type === 'text' || st.type === 'textarea') {
                    return sum + (Array.isArray(st.samples) ? st.samples.length : 0)
                  }
                  return sum + countTotal(st.counts || {})
                }, 0)
                return (
                  <div
                    key={group.key}
                    className="student-glass-panel student-glass-panel--static overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-left transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {collapsed ? (
                          <ChevronRight size={18} className="text-gray-400 shrink-0" />
                        ) : (
                          <ChevronDown size={18} className="text-cyan-400 shrink-0" />
                        )}
                        <span
                          className={`font-semibold truncate ${
                            group.key === '__global__' ? 'text-gray-200' : 'text-white'
                          }`}
                        >
                          {group.title}
                        </span>
                        {group.key !== '__global__' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 shrink-0">
                            评价对象
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                        <span>{group.items.length} 题</span>
                        <span className="text-gray-600">·</span>
                        <span>合计 {answeredCount} 次作答</span>
                      </div>
                    </button>
                    {!collapsed && (
                      <div className="p-4 grid md:grid-cols-2 gap-3 border-t border-gray-700/40">
                        {group.items.map((st) => (
                          <StatCard key={st.id} st={st} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* 答卷明细 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText size={18} /> 答卷明细
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setHideGateSkipped(true)}
                className={`px-2.5 py-1.5 transition-colors ${
                  hideGateSkipped
                    ? 'bg-cyan-600/30 text-cyan-200'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                隐藏门禁未过
              </button>
              <button
                type="button"
                onClick={() => setHideGateSkipped(false)}
                className={`px-2.5 py-1.5 transition-colors border-l border-gray-700 ${
                  !hideGateSkipped
                    ? 'bg-cyan-600/30 text-cyan-200'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                显示全部
              </button>
            </div>
            {(data.responses || []).length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, boolean> = {}
                    for (const resp of data.responses || []) next[resp.id] = false
                    setCollapsedResponses(next)
                  }}
                  className="px-2.5 py-1.5 rounded-lg student-glass-chip text-gray-300 hover:text-white"
                >
                  全部展开
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, boolean> = {}
                    for (const r of data.responses || []) next[r.id] = true
                    setCollapsedResponses(next)
                  }}
                  className="px-2.5 py-1.5 rounded-lg student-glass-chip text-gray-300 hover:text-white"
                >
                  全部折叠
                </button>
              </>
            )}
          </div>
        </div>
        {(data.responses || []).map((r: any, idx: number) => {
          const answers = r.answers || {}
          const visibleFields = fields.filter((f) =>
            shouldShowResponseField(f, answers, hideGateSkipped)
          )
          const answered = visibleFields.filter((f) => {
            const val = answers?.[f.id]
            return val != null && val !== '' && !(Array.isArray(val) && val.length === 0)
          })
          // 默认折叠（未写入 state 时视为折叠）
          const collapsed = collapsedResponses[r.id] !== false
          return (
            <article
              key={r.id}
              className="student-glass-panel student-glass-panel--static overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-2 px-2 py-2 bg-white/5 border-b border-white/10">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedResponses((prev) => ({
                      ...prev,
                      [r.id]: !(prev[r.id] !== false),
                    }))
                  }
                  className="flex-1 min-w-0 flex items-center gap-3 px-2 py-1.5 text-left hover:bg-gray-800/60 rounded-lg transition-colors"
                >
                  {collapsed ? (
                    <ChevronRight size={18} className="text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown size={18} className="text-cyan-400 shrink-0" />
                  )}
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600/30 text-violet-200 text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-white font-medium text-sm">答卷 #{r.id}</div>
                    <div className="text-xs text-gray-500">{formatDateTime(r.submitted_at)}</div>
                  </div>
                </button>
                <div className="flex items-center gap-2 text-xs px-2 shrink-0">
                  {!survey.is_anonymous && (
                    <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-300 inline-flex items-center gap-1 text-xs">
                      <MemberNameCell name={r.nickname} avatar={r.avatar} qq={r.qq} />
                      {r.qq ? ` · ${r.qq}` : ''}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded bg-gray-700 text-gray-300">
                    {answered.length} / {visibleFields.length} 题有答
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteResponseId(r.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/15 text-red-300 hover:bg-red-500/25"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>

              {!collapsed && (
                <div className="p-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visibleFields.map((f) => {
                    const val = answers?.[f.id]
                    const empty =
                      val == null || val === '' || (Array.isArray(val) && val.length === 0)
                    const wide = f.type === 'matrix' || f.type === 'textarea'
                    return (
                      <div
                        key={f.id}
                        className={`student-glass-chip p-3 ${
                          wide ? 'md:col-span-2 xl:col-span-3' : ''
                        } ${empty ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-start gap-2 mb-1">
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 mt-0.5">
                            {TYPE_LABEL[f.type] || f.type}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs text-gray-400 leading-snug">{f.label}</div>
                            {f.subject_name && (
                              <div className="text-[10px] text-emerald-400/90 mt-0.5">
                                @{f.subject_name}
                              </div>
                            )}
                          </div>
                        </div>
                        {empty ? (
                          <p className="text-xs text-gray-600 mt-1">未作答</p>
                        ) : (
                          <AnswerValue field={f} value={val} />
                        )}
                      </div>
                    )
                  })}
                  {!visibleFields.length && (
                    <p className="text-sm text-gray-500 md:col-span-2 xl:col-span-3 py-4 text-center">
                      该答卷在当前筛选下无可显示题目
                    </p>
                  )}
                </div>
              )}
            </article>
          )
        })}
        {!data.responses?.length && (
          <p className="text-center text-gray-500 py-8">暂无答卷</p>
        )}
      </section>

      {deleteResponseId != null && (
        <ConfirmDialog
          title="删除答卷"
          message={`确认删除答卷 #${deleteResponseId}？删除后该学员可重新填写（匿名问卷会解除已提交标记）。`}
          confirmText={deleting ? '删除中…' : '确认删除'}
          type="danger"
          onConfirm={() => {
            if (!deleting) confirmDeleteResponse()
          }}
          onCancel={() => {
            if (!deleting) setDeleteResponseId(null)
          }}
        />
      )}
    </div>
  )
}
