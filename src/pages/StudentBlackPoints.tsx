import { useState, useEffect } from 'react'
import { blackPointAPI } from '../utils/api'
import { AlertTriangle, ShieldOff, ShieldCheck } from 'lucide-react'
import { formatDate } from '../utils/dateFormat'
import PageSkeleton from '../components/Skeleton'

interface BlackPoint {
  id: number
  reason: string
  register_date: string
  recorder_name: string
  status: '生效中' | '已失效'
  invalid_date: string | null
}

function getStudentToken() {
  return localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken') || ''
}

export default function StudentBlackPoints() {
  const [records, setRecords] = useState<BlackPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    setLoading(true)
    try {
      const token = getStudentToken()
      const res = await blackPointAPI.getMy(token)
      setRecords(res.data || [])
    } catch (err) {
      console.error('加载黑点记录失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const active = records.filter(r => r.status === '生效中')
  const inactive = records.filter(r => r.status === '已失效')

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="text-yellow-400" size={28} />
        <h1 className="text-2xl font-bold text-white">我的黑点记录</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="student-glass-panel p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-500/15 border border-red-400/20 flex items-center justify-center">
            <ShieldOff className="text-red-400" size={24} />
          </div>
          <div>
            <p className="text-gray-400 text-sm">生效中</p>
            <p className="text-2xl font-bold text-red-400">{active.length}</p>
          </div>
        </div>
        <div className="student-glass-panel p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
            <ShieldCheck className="text-gray-400" size={24} />
          </div>
          <div>
            <p className="text-gray-400 text-sm">已失效</p>
            <p className="text-2xl font-bold text-gray-300">{inactive.length}</p>
          </div>
        </div>
      </div>

      <div className="student-glass-panel overflow-hidden">
        {loading ? (
          <PageSkeleton variant="table" padded={false} />
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="text-green-400 mx-auto mb-3" size={48} />
            <p className="text-gray-300 font-semibold">暂无黑点记录</p>
            <p className="text-gray-500 text-sm mt-1">继续保持良好表现！</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">原因</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">登记日期</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">记录人</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">状态</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">失效日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3 text-white text-sm">{r.reason}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{formatDate(r.register_date)}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{r.recorder_name}</td>
                  <td className="px-4 py-3">
                    {r.status === '生效中' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 text-xs font-medium whitespace-nowrap">
                        <ShieldOff size={12} /> 生效中
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-600/20 text-gray-400 text-xs font-medium whitespace-nowrap">
                        <ShieldCheck size={12} /> 已失效
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {r.invalid_date ? formatDate(r.invalid_date) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {active.length > 0 && (
        <div className="mt-4 student-glass-chip student-glass-chip--yellow p-4">
          <p className="text-yellow-200 text-sm">
            您当前有 <span className="font-bold">{active.length}</span> 条生效中的黑点记录，请注意行为规范。如有异议请联系管理员。
          </p>
        </div>
      )}
    </div>
  )
}
