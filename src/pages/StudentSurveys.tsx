import { useState, useEffect } from 'react'
import { surveyAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { formatDateTime } from '../utils/dateFormat'
import { isFieldVisible, NOT_ATTENDED } from '../utils/surveyHelpers'
import {
  Loader2,
  ClipboardList,
  Lock,
  ArrowLeft,
  Send,
  KeyRound,
  AlertTriangle,
} from 'lucide-react'

type FieldType = 'single' | 'multi' | 'text' | 'textarea' | 'rating' | 'matrix' | 'subject_gate'

interface SurveyField {
  id: string
  type: FieldType
  label: string
  required: boolean
  options?: string[]
  maxRating?: number
  columns?: string[]
  rows?: { id: string; label: string }[]
  subject_id?: string
  subject_name?: string
  gate_field_id?: string
  hide_when_gate?: string
  scope?: 'global' | 'subject'
}

interface SurveyListItem {
  id: number
  title: string
  description: string
  is_anonymous: boolean
  start_at: string | null
  end_at: string | null
  my_status: string
  field_count: number
  is_satisfaction?: boolean
  window_message?: string | null
}

interface SurveyDetail {
  id: number
  title: string
  description: string
  fields: SurveyField[]
  is_anonymous: boolean
  is_satisfaction?: boolean
  start_at: string | null
  end_at: string | null
  my_status: string
  claimed: boolean
  submitted: boolean
  can_submit: boolean
  window_ok?: boolean
  window_message?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  open: '可填写',
  claimed: '已领券，待填写',
  submitted: '已提交',
  not_started: '尚未开始',
  ended: '已结束',
}

const DEFAULT_COLS = ['很满意(5)', '满意(4)', '一般(3)', '不满意(2)', '很不满意(1)']

function claimStorageKey(surveyId: number) {
  return `survey_anon_token_${surveyId}`
}

function loadStoredClaim(surveyId: number) {
  try {
    return sessionStorage.getItem(claimStorageKey(surveyId))
  } catch {
    return null
  }
}

function saveStoredClaim(surveyId: number, token: string) {
  try {
    sessionStorage.setItem(claimStorageKey(surveyId), token)
  } catch {
    /* ignore */
  }
}

function clearStoredClaim(surveyId: number) {
  try {
    sessionStorage.removeItem(claimStorageKey(surveyId))
  } catch {
    /* ignore */
  }
}

export default function StudentSurveys() {
  const [list, setList] = useState<SurveyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SurveyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [anonToken, setAnonToken] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [claiming, setClaiming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadList = async () => {
    try {
      setLoading(true)
      const res = await surveyAPI.available()
      setList(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadList()
  }, [])

  const openSurvey = async (id: number) => {
    try {
      setActiveId(id)
      setDetailLoading(true)
      setAnonToken(null)
      setAnswers({})
      const res = await surveyAPI.availableDetail(id)
      const d = res.data as SurveyDetail
      setDetail(d)

      if (d.is_anonymous && d.can_submit && !d.submitted) {
        const cached = loadStoredClaim(id)
        if (cached) {
          setAnonToken(cached)
        } else if (d.claimed || d.my_status === 'claimed') {
          // 服务端已领券但本地 token 丢失：静默重新签发
          try {
            const claimRes = await surveyAPI.claim(id)
            const token = claimRes.data.token as string
            saveStoredClaim(id, token)
            setAnonToken(token)
            setDetail({ ...d, claimed: true, my_status: 'claimed', can_submit: true })
          } catch {
            /* 保留领取按钮，由用户手动点 */
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || '打开失败')
      setActiveId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const backToList = () => {
    setActiveId(null)
    setDetail(null)
    setAnonToken(null)
    setAnswers({})
    loadList()
  }

  const handleClaim = async () => {
    if (!detail) return
    try {
      setClaiming(true)
      const res = await surveyAPI.claim(detail.id)
      const token = res.data.token as string
      saveStoredClaim(detail.id, token)
      setAnonToken(token)
      toast.success('已领取匿名凭证，可开始填写')
      setDetail({ ...detail, claimed: true, my_status: 'claimed', can_submit: true })
    } catch (e: any) {
      toast.error(e.message || '领取失败')
    } finally {
      setClaiming(false)
    }
  }

  const setAnswer = (fieldId: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [fieldId]: value }
      // 若选「未上过课」，清除该门禁下依赖题答案
      const field = detail?.fields.find((f) => f.id === fieldId)
      if (field?.type === 'subject_gate' && value === NOT_ATTENDED && detail) {
        for (const f of detail.fields) {
          if (f.gate_field_id === fieldId) delete next[f.id]
        }
      }
      return next
    })
  }

  const toggleMulti = (fieldId: string, option: string) => {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[fieldId]) ? [...(prev[fieldId] as string[])] : []
      const i = cur.indexOf(option)
      if (i >= 0) cur.splice(i, 1)
      else cur.push(option)
      return { ...prev, [fieldId]: cur }
    })
  }

  const setMatrixAnswer = (fieldId: string, rowId: string, col: string) => {
    setAnswers((prev) => {
      const cur =
        prev[fieldId] && typeof prev[fieldId] === 'object' && !Array.isArray(prev[fieldId])
          ? { ...(prev[fieldId] as Record<string, string>) }
          : {}
      cur[rowId] = col
      return { ...prev, [fieldId]: cur }
    })
  }

  const handleSubmit = async () => {
    if (!detail) return
    for (const f of detail.fields || []) {
      if (!isFieldVisible(f, answers)) continue
      if (!f.required) continue
      const v = answers[f.id]
      if (f.type === 'matrix') {
        const map = (v && typeof v === 'object' ? v : {}) as Record<string, string>
        const missing = (f.rows || []).some((r) => !map[r.id])
        if (missing) {
          toast.error(`请完成：${f.label}`)
          return
        }
        continue
      }
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
        toast.error(`请填写：${f.label}`)
        return
      }
    }

    try {
      setSubmitting(true)
      if (detail.is_anonymous) {
        if (!anonToken) {
          toast.error('请先领取匿名填写资格')
          return
        }
        await surveyAPI.submitAnonymous(detail.id, anonToken, answers)
        clearStoredClaim(detail.id)
        toast.success('提交成功（匿名，未携带登录凭证）')
      } else {
        await surveyAPI.submitNamed(detail.id, answers)
        toast.success('提交成功')
      }
      setAnonToken(null)
      backToList()
    } catch (e: any) {
      toast.error(e.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const renderField = (field: SurveyField, idxLabel: string) => {
    if (!isFieldVisible(field, answers) && field.type !== 'subject_gate') return null

    // 兼容旧数据：题干末尾（人名）去掉，改用标签
    const cleanLabel = field.subject_name
      ? field.label.replace(new RegExp(`[（(]\\s*${field.subject_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[）)]$`), '').trim()
      : field.label

    return (
      <div key={field.id} className="space-y-3">
        <div className="flex items-start gap-2 text-base text-gray-900 font-medium leading-snug flex-wrap">
          {field.required && <span className="text-red-500">*</span>}
          <span>
            {idxLabel} {cleanLabel}
          </span>
          {field.subject_name && field.type !== 'subject_gate' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-normal bg-emerald-50 text-emerald-700 border border-emerald-100">
              {field.subject_name}
            </span>
          )}
          {field.scope === 'global' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-normal bg-slate-100 text-slate-600 border border-slate-200">
              全局
            </span>
          )}
        </div>

        {(field.type === 'subject_gate' || field.type === 'single') && (
          <div className="pl-5 space-y-2.5">
            {(field.options || []).map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-3 text-[15px] cursor-pointer ${
                  opt === NOT_ATTENDED ? 'text-gray-500' : 'text-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name={field.id}
                  checked={answers[field.id] === opt}
                  onChange={() => setAnswer(field.id, opt)}
                  className="accent-blue-600"
                />
                {opt}
              </label>
            ))}
          </div>
        )}

        {field.type === 'multi' && (
          <div className="pl-5 space-y-2.5">
            {(field.options || []).map((opt) => {
              const selected = Array.isArray(answers[field.id])
                ? (answers[field.id] as string[]).includes(opt)
                : false
              return (
                <label key={opt} className="flex items-center gap-3 text-[15px] text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleMulti(field.id, opt)}
                    className="accent-blue-600"
                  />
                  {opt}
                </label>
              )
            })}
          </div>
        )}

        {field.type === 'text' && (
          <div className="pl-5">
            <input
              value={(answers[field.id] as string) || ''}
              onChange={(e) => setAnswer(field.id, e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-[15px] text-gray-900 bg-white"
            />
          </div>
        )}

        {field.type === 'textarea' && (
          <div className="pl-5">
            <textarea
              value={(answers[field.id] as string) || ''}
              onChange={(e) => setAnswer(field.id, e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-[15px] text-gray-900 bg-white"
            />
          </div>
        )}

        {field.type === 'rating' && (
          <div className="pl-5 flex gap-2.5">
            {Array.from({ length: Number(field.maxRating) || 5 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnswer(field.id, n)}
                className={`w-11 h-11 rounded-lg border text-base ${
                  answers[field.id] === n
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {field.type === 'matrix' && (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px] border-collapse min-w-[560px]">
              <thead>
                <tr>
                  <th className="p-3 border border-gray-200 bg-gray-50 w-[40%]" />
                  {(field.columns || DEFAULT_COLS).map((c) => (
                    <th
                      key={c}
                      className="p-3 border border-gray-200 bg-gray-50 text-center font-medium text-gray-700 text-sm whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(field.rows || []).map((row) => {
                  const map =
                    answers[field.id] && typeof answers[field.id] === 'object'
                      ? (answers[field.id] as Record<string, string>)
                      : {}
                  return (
                    <tr key={row.id} className="hover:bg-blue-50/50">
                      <td className="p-3 border border-gray-200 text-gray-800 leading-relaxed">
                        {row.label}
                      </td>
                      {(field.columns || DEFAULT_COLS).map((c) => (
                        <td key={c} className="p-3 border border-gray-200 text-center">
                          <input
                            type="radio"
                            name={`${field.id}_${row.id}`}
                            checked={map[row.id] === c}
                            onChange={() => setMatrixAnswer(field.id, row.id, c)}
                            className="accent-blue-600 cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  /** 按评价对象分段渲染 */
  const renderFields = (fields: SurveyField[]) => {
    const blocks: { key: string; title?: string; fields: SurveyField[] }[] = []
    let current: { key: string; title?: string; fields: SurveyField[] } | null = null

    for (const f of fields) {
      if (f.type === 'subject_gate') {
        current = {
          key: f.subject_id || f.id,
          title: f.subject_name ? `关于【${f.subject_name}】` : undefined,
          fields: [f],
        }
        blocks.push(current)
      } else if (f.subject_id && current && current.key === f.subject_id) {
        current.fields.push(f)
      } else if (f.subject_id) {
        current = {
          key: f.subject_id,
          title: f.subject_name ? `关于【${f.subject_name}】` : undefined,
          fields: [f],
        }
        blocks.push(current)
      } else if (f.scope === 'global' && current && current.key === 'global') {
        current.fields.push(f)
      } else if (f.scope === 'global') {
        current = { key: 'global', title: '整体反馈', fields: [f] }
        blocks.push(current)
      } else {
        current = { key: f.id, fields: [f] }
        blocks.push(current)
        current = null
      }
    }

    let n = 0
    return blocks.map((block) => {
      const gate = block.fields.find((f) => f.type === 'subject_gate')
      const skipped = gate && answers[gate.id] === NOT_ATTENDED
      return (
        <div
          key={block.key}
          className={`rounded-xl border p-4 space-y-4 ${
            skipped ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'
          }`}
        >
          {block.title && (
            <div className="text-lg font-semibold text-gray-900 border-b border-dashed border-gray-200 pb-2">
              {block.title}
              {skipped && (
                <span className="ml-2 text-sm font-normal text-gray-500">（未上课，已隐藏满意度题）</span>
              )}
            </div>
          )}
          {block.fields.map((f) => {
            if (!isFieldVisible(f, answers) && f.type !== 'subject_gate') return null
            n += 1
            return renderField(f, `${n}.`)
          })}
        </div>
      )
    })
  }

  if (activeId != null) {
    return (
      <div
        className="survey-editor-light min-h-full bg-[#e8eef5] py-4 px-4 md:px-6 text-gray-800"
        style={{ colorScheme: 'light' }}
      >
        <div className="w-full mb-3">
          <button
            onClick={backToList}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={16} /> 返回列表
          </button>
        </div>

        {detailLoading || !detail ? (
          <div className="flex justify-center py-16 text-gray-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="w-full bg-white shadow-md border border-gray-200/80 rounded-sm overflow-hidden survey-fill-form">
            <div className="px-8 md:px-12 lg:px-16 pt-8 pb-6 border-b border-dashed border-gray-200 text-center">
              <h1 className="text-3xl font-bold text-gray-900">{detail.title}</h1>
              {detail.description && (
                <p className="mt-4 text-base text-gray-600 leading-relaxed whitespace-pre-wrap text-left max-w-4xl mx-auto">
                  {detail.description}
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-2 mt-4 text-sm">
                {detail.is_anonymous && (
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                    <Lock size={12} /> 匿名填写
                  </span>
                )}
                {detail.is_satisfaction && (
                  <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">按教官评价</span>
                )}
                <span className="px-2 py-1 rounded bg-gray-100 text-gray-600">
                  {STATUS_LABEL[detail.my_status] || detail.my_status}
                </span>
              </div>
            </div>

            {detail.my_status === 'ended' && (
              <div className="mx-6 md:mx-10 mt-4 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 flex gap-3">
                <AlertTriangle className="text-amber-600 shrink-0" size={20} />
                <div>
                  <div className="font-medium text-amber-900">问卷已过期</div>
                  <p className="text-sm text-amber-800 mt-0.5">
                    {detail.window_message || '填表已结束'}，无法再提交。
                  </p>
                </div>
              </div>
            )}

            <div className="px-6 md:px-10 lg:px-12 py-6 space-y-6">
              {detail.submitted ? (
                <div className="py-12 text-center text-gray-500">您已提交过该问卷，感谢参与。</div>
              ) : !detail.can_submit ? (
                <div className="py-12 text-center text-gray-500">
                  {STATUS_LABEL[detail.my_status] || '当前不可填写'}
                </div>
              ) : (
                <>
                  {detail.is_anonymous && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                      <div className="text-[15px] text-emerald-900 leading-relaxed space-y-2">
                        <p>
                          匿名流程：先领取一次性凭证，交卷请求<strong>不会携带</strong>
                          登录令牌。答卷不存昵称/QQ。
                        </p>
                        <p className="font-semibold text-emerald-800">
                          此问卷采用匿名形式，将不收取任何信息，可放心填写。
                        </p>
                      </div>
                      {!anonToken ? (
                        <button
                          onClick={handleClaim}
                          disabled={claiming}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
                        >
                          {claiming ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <KeyRound size={14} />
                          )}
                          {detail.claimed ? '恢复填写资格' : '领取匿名填写资格'}
                        </button>
                      ) : (
                        <p className="text-sm text-emerald-700">
                          已持有匿名凭证，可直接填写下方题目后提交。刷新页面也会自动恢复。
                        </p>
                      )}
                    </div>
                  )}

                  {(!detail.is_anonymous || anonToken) && (
                    <>
                      <div className="space-y-4">{renderFields(detail.fields || [])}</div>
                      <div className="pt-4 pb-8 flex justify-center">
                        <button
                          onClick={handleSubmit}
                          disabled={submitting}
                          className="inline-flex items-center gap-2 px-10 py-3 rounded bg-blue-600 text-white text-base hover:bg-blue-700 disabled:opacity-50"
                        >
                          {submitting ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Send size={16} />
                          )}
                          {detail.is_anonymous ? '匿名提交' : '提交问卷'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ClipboardList size={24} /> 填表
        </h1>
        <p className="text-sm text-gray-400 mt-1">参与满意度调查与其它问卷</p>
      </div>

      {list.some((s) => s.my_status === 'ended') && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex gap-3 text-sm text-amber-100">
          <AlertTriangle className="text-amber-400 shrink-0" size={18} />
          <span>
            以下问卷已过期，无法再填写：
            {list.filter((s) => s.my_status === 'ended').map((s) => s.title).join('、')}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => openSurvey(s.id)}
              className="w-full text-left rounded-xl border border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 p-4 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-white flex items-center gap-2">
                    {s.title}
                    {s.my_status === 'ended' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        已过期
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                    {s.is_anonymous ? (
                      <span className="text-emerald-400">匿名</span>
                    ) : (
                      <span className="text-amber-400">实名</span>
                    )}
                    {s.is_satisfaction && <span className="text-blue-300">按人</span>}
                    <span className="text-gray-500">{s.field_count} 题</span>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 shrink-0">
                  {STATUS_LABEL[s.my_status] || s.my_status}
                </span>
              </div>
            </button>
          ))}
          {!list.length && (
            <div className="text-center text-gray-500 py-16">暂无可填问卷</div>
          )}
        </div>
      )}
    </div>
  )
}
