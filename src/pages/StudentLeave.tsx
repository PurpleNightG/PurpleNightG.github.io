import { useState, useEffect } from 'react'
import { leaveAPI } from '../utils/api'
import { Calendar, Plus, Clock, CheckCircle, Loader2 } from 'lucide-react'
import { formatDate } from '../utils/dateFormat'
import { toast } from '../utils/toast'

interface LeaveRecord {
  id: number
  reason: string
  start_date: string
  end_date: string
  total_days: number
  status: '请假中' | '已结束'
  remaining_days?: number
}

interface LeaveApplication {
  id: number
  reason: string
  start_date: string
  end_date: string
  total_days: number
  status: '待审批' | '已批准' | '已拒绝'
  reviewer_name: string | null
  review_date: string | null
  review_remark: string | null
  created_at: string
}

function getStudentToken() {
  return localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken') || ''
}

const today = () => new Date().toISOString().split('T')[0]

export default function StudentLeave() {
  const [records, setRecords] = useState<LeaveRecord[]>([])
  const [applications, setApplications] = useState<LeaveApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState<'records' | 'applications'>('records')
  const [form, setForm] = useState({ reason: '', start_date: today(), end_date: today() })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const token = getStudentToken()
      const [recRes, appRes] = await Promise.all([
        leaveAPI.getMy(token),
        leaveAPI.getMyApplications(token),
      ])
      setRecords(recRes.data || [])
      setApplications(appRes.data || [])
    } catch (err) {
      console.error('加载请假数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const hasActiveLeave = records.some(r => r.status === '请假中')
  const hasPendingApp = applications.some(a => a.status === '待审批')
  const canApply = !hasActiveLeave && !hasPendingApp

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.end_date < form.start_date) {
      toast.error('结束日期不能早于开始日期')
      return
    }
    setSubmitting(true)
    try {
      const token = getStudentToken()
      await leaveAPI.applyLeave(token, form)
      toast.success('请假申请已提交，请等待管理员审批')
      setShowApplyModal(false)
      setForm({ reason: '', start_date: today(), end_date: today() })
      await loadAll()
      setTab('applications')
    } catch (err: any) {
      toast.error(err.message || '提交申请失败')
    } finally {
      setSubmitting(false)
    }
  }

  const appStatusBadge = (status: LeaveApplication['status']) => {
    if (status === '待审批') return <span className="px-2 py-0.5 rounded-full bg-yellow-600/20 text-yellow-300 text-xs font-medium whitespace-nowrap">待审批</span>
    if (status === '已批准') return <span className="px-2 py-0.5 rounded-full bg-green-600/20 text-green-300 text-xs font-medium whitespace-nowrap">已批准</span>
    return <span className="px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 text-xs font-medium whitespace-nowrap">已拒绝</span>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="text-purple-400" size={28} />
          <h1 className="text-2xl font-bold text-white">请假记录</h1>
        </div>
        <button
          onClick={() => {
            if (!canApply) {
              if (hasActiveLeave) toast.error('您目前有正在进行的请假，无法再次申请')
              else toast.error('您已有待审批的申请，请等待审批')
              return
            }
            setShowApplyModal(true)
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            canApply
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Plus size={18} />
          申请请假
        </button>
      </div>

      {/* 状态提示 */}
      {hasActiveLeave && (
        <div className="mb-4 bg-blue-900/20 border border-blue-700/40 rounded-lg p-3 flex items-center gap-2">
          <Clock className="text-blue-400 flex-shrink-0" size={18} />
          <p className="text-blue-300 text-sm">您目前有正在进行的请假。</p>
        </div>
      )}
      {hasPendingApp && !hasActiveLeave && (
        <div className="mb-4 bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 flex items-center gap-2">
          <Clock className="text-yellow-400 flex-shrink-0" size={18} />
          <p className="text-yellow-300 text-sm">您有一条待审批的请假申请，请等待管理员审批。</p>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 bg-gray-800/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('records')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'records' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          请假历史
        </button>
        <button
          onClick={() => setTab('applications')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors relative ${tab === 'applications' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          我的申请
          {hasPendingApp && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />
          )}
        </button>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : tab === 'records' ? (
          records.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="text-gray-600 mx-auto mb-3" size={48} />
              <p className="text-gray-400">暂无请假记录</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/70">
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">原因</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-36">开始日期</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-36">结束日期</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-24">天数</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-28">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-700/20 transition-colors">
                    <td className="px-4 py-3 text-white text-sm">{r.reason || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatDate(r.start_date)}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatDate(r.end_date)}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{r.total_days} 天</td>
                    <td className="px-4 py-3">
                      {r.status === '请假中' ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 text-xs font-medium whitespace-nowrap">请假中</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-gray-600/20 text-gray-400 text-xs font-medium whitespace-nowrap">已结束</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          applications.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle className="text-gray-600 mx-auto mb-3" size={48} />
              <p className="text-gray-400">暂无申请记录</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/70">
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">原因</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-36">开始日期</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-36">结束日期</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-24">天数</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-28">状态</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">审批备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {applications.map(a => (
                  <tr key={a.id} className="hover:bg-gray-700/20 transition-colors">
                    <td className="px-4 py-3 text-white text-sm">{a.reason || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatDate(a.start_date)}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatDate(a.end_date)}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{a.total_days} 天</td>
                    <td className="px-4 py-3">{appStatusBadge(a.status)}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {a.review_remark || (a.status === '待审批' ? <span className="text-yellow-500/70">待审批</span> : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* 申请请假模态框 */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">申请请假</h2>
            <form onSubmit={handleApply} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">开始日期 *</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  min={today()}
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">结束日期 *</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  min={form.start_date}
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">请假原因</label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  placeholder="请简要说明请假原因（选填）"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
              <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3">
                <p className="text-blue-300 text-xs">📌 申请提交后需等待管理员审批，批准后才会正式生效。请假期间不计入新训统计。</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? '提交中...' : '提交申请'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  disabled={submitting}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
