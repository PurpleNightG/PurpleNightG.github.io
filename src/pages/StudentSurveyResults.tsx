import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { surveyAPI } from '../utils/api'
import { toast } from '../utils/toast'
import PageSkeleton from '../components/Skeleton'
import {
  ArrowLeft,
  BarChart3,
  Trophy,
  Users,
  Lock,
  FileText,
} from 'lucide-react'
import MemberNameCell from '../components/MemberNameCell'
import { formatDateTime } from '../utils/dateFormat'

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
  return Object.values(counts || {}).reduce((a, b) => a + Number(b || 0), 0)
}

function StatBars({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts || {}).sort((a, b) => Number(b[1]) - Number(a[1]))
  const total = countTotal(counts)
  if (!entries.length) return <p className="text-xs text-gray-500">暂无数据</p>
  return (
    <div className="space-y-2">
      {entries.map(([label, raw]) => {
        const n = Number(raw)
        const pct = total > 0 ? Math.round((n / total) * 1000) / 10 : 0
        return (
          <div key={label}>
            <div className="flex justify-between gap-2 text-xs mb-1">
              <span className="text-gray-200 truncate" title={label}>{label}</span>
              <span className="text-gray-400 shrink-0">{n} · {pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-900/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-400"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function StudentSurveyResults() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    const surveyId = Number(id)
    if (!surveyId) return
    setLoading(true)
    surveyAPI
      .publicResults(surveyId)
      .then((res) => setData(res.data))
      .catch((e: any) => {
        toast.error(e.message || '无法查看结果')
        navigate('/student/surveys')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const statsList = useMemo(() => {
    if (!data?.stats) return []
    return Object.values(data.stats) as any[]
  }, [data])

  if (loading) {
    return <PageSkeleton variant="table" />
  }

  if (!data) return null

  const survey = data.survey || {}

  return (
    <div className="p-6 space-y-4 w-full">
      <button
        onClick={() => navigate('/student/surveys')}
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft size={16} /> 返回填表列表
      </button>

      <div className="student-glass-panel student-glass-panel--static p-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="text-violet-400" /> {survey.title}
        </h1>
        {survey.description && (
          <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">{survey.description}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          {survey.is_anonymous ? (
            <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 inline-flex items-center gap-1">
              <Lock size={12} /> 匿名问卷
            </span>
          ) : (
            <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-300">实名问卷</span>
          )}
          <span className="px-2 py-1 rounded bg-white/10 text-gray-300 inline-flex items-center gap-1">
            <Users size={12} /> {data.response_count || 0} 份答卷
          </span>
          <span className="px-2 py-1 rounded bg-violet-500/15 text-violet-300">公开统计结果</span>
        </div>
      </div>

      {Array.isArray(data.satisfaction_ranking) && data.satisfaction_ranking.length > 0 && (
        <div className="student-glass-panel student-glass-panel--static p-5 space-y-3">
          <h2 className="text-white font-medium flex items-center gap-2">
            <Trophy size={18} className="text-yellow-400" /> 满意度排名
          </h2>
          <div className="space-y-2">
            {data.satisfaction_ranking.map((item: any, idx: number) => (
              <div
                key={item.subject_id || idx}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5 text-sm"
              >
                <span className="text-gray-200">
                  <span className="text-gray-500 mr-2">#{idx + 1}</span>
                  {item.name}
                </span>
                <span className="text-cyan-300 tabular-nums">
                  {item.avg_score != null ? Number(item.avg_score).toFixed(2) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {statsList.map((st) => {
          const isText = st.type === 'text' || st.type === 'textarea'
          const total = isText ? (st.samples?.length || 0) : countTotal(st.counts)
          return (
            <div
              key={st.label + st.type}
              className={`student-glass-panel student-glass-panel--static p-4 ${
                st.type === 'matrix' || isText ? 'md:col-span-2' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white leading-snug">{st.label}</div>
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
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {(st.samples || []).map((text: string, i: number) => (
                    <li key={i} className="text-sm text-gray-200 bg-white/5 rounded px-3 py-2 whitespace-pre-wrap">
                      {text}
                    </li>
                  ))}
                  {!st.samples?.length && <p className="text-xs text-gray-500">暂无文本回答</p>}
                </ul>
              ) : (
                <StatBars counts={st.counts || {}} />
              )}
            </div>
          )
        })}
      </div>

      {!survey.is_anonymous && Array.isArray(data.responses) && data.responses.length > 0 && (
        <div className="student-glass-panel student-glass-panel--static p-5 space-y-3">
          <h2 className="text-white font-medium flex items-center gap-2">
            <FileText size={18} className="text-violet-300" /> 填写者
          </h2>
          <p className="text-xs text-gray-500">实名公开结果，可查看谁已提交（共 {data.responses.length} 人）</p>
          <ul className="divide-y divide-white/5 max-h-80 overflow-y-auto">
            {data.responses.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 px-1">
                <MemberNameCell name={r.nickname || '未知'} avatar={r.avatar} qq={r.qq} />
                <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
                  {formatDateTime(r.submitted_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!statsList.length && (
        <div className="text-center text-gray-500 py-12">暂无统计数据</div>
      )}
    </div>
  )
}
