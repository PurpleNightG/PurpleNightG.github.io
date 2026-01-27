import { useState, useEffect } from 'react'
import { assessmentApplicationAPI, assessmentGuidelinesAPI, memberAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { FileCheck, Clock, CheckCircle, XCircle, Calendar, Users, Send, AlertCircle, Lock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'

interface Application {
  id: number
  member_id: number
  member_name: string
  companion: string
  preferred_date: string
  preferred_time: string
  status: '待审批' | '已通过' | '已驳回'
  admission_ticket: string | null
  reject_reason: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

interface Guidelines {
  id: number
  content: string
  updated_by: string | null
  updated_at: string | null
}

export default function StudentApplyAssessment() {
  const navigate = useNavigate()
  const [applications, setApplications] = useState<Application[]>([])
  const [guidelines, setGuidelines] = useState<Guidelines | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [memberStage, setMemberStage] = useState<string>('')
  const [canApply, setCanApply] = useState(false)
  const [formData, setFormData] = useState({
    companion: '',
    preferred_date: '',
    preferred_time: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const studentUserStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!studentUserStr) {
        toast.error('未找到学员信息')
        setLoading(false)
        return
      }

      const studentUser = JSON.parse(studentUserStr)
      
      const [applicationsRes, guidelinesRes, memberRes] = await Promise.all([
        assessmentApplicationAPI.getByMemberId(studentUser.id),
        assessmentGuidelinesAPI.get(),
        memberAPI.getById(studentUser.id)
      ])

      setApplications(applicationsRes.data)
      setGuidelines(guidelinesRes.data)
      
      // 检查成员阶段
      const memberData = memberRes.data
      setMemberStage(memberData.stage_role)
      setCanApply(memberData.stage_role === '新训准考')
    } catch (error: any) {
      toast.error('加载数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.companion || !formData.preferred_date || !formData.preferred_time) {
      toast.error('请填写所有必填字段')
      return
    }

    try {
      setSubmitting(true)
      const studentUserStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!studentUserStr) {
        toast.error('未找到学员信息')
        return
      }

      const studentUser = JSON.parse(studentUserStr)

      await assessmentApplicationAPI.create({
        member_id: studentUser.id,
        member_name: studentUser.nickname,
        ...formData
      })

      toast.success('申请提交成功！请等待管理员审批')
      setFormData({
        companion: '',
        preferred_date: '',
        preferred_time: ''
      })
      loadData()
    } catch (error: any) {
      toast.error('提交失败: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusIcon = (status: Application['status']) => {
    switch (status) {
      case '待审批':
        return <Clock className="text-yellow-400" size={20} />
      case '已通过':
        return <CheckCircle className="text-green-400" size={20} />
      case '已驳回':
        return <XCircle className="text-red-400" size={20} />
    }
  }

  const getStatusBadge = (status: Application['status']) => {
    const badges = {
      '待审批': 'bg-yellow-600/20 text-yellow-300',
      '已通过': 'bg-green-600/20 text-green-300',
      '已驳回': 'bg-red-600/20 text-red-300'
    }
    return badges[status]
  }

  const hasPendingApplication = applications.some(app => app.status === '待审批')
  const approvedApplication = applications.find(app => app.status === '已通过')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <FileCheck className="text-purple-400" size={32} />
          申请考核
        </h1>
        <p className="text-gray-400">提交考核申请并查看审批状态</p>
      </div>

      {/* 阶段限制提示 */}
      {!canApply && (
        <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="bg-gray-700 rounded-full p-3">
              <Lock className="text-gray-400" size={32} />
            </div>
            <div className="flex-1">
              <div className="text-white text-xl font-bold mb-2">考核申请未开放</div>
              <div className="text-gray-400 mb-4">
                您当前阶段为 <span className="text-purple-400 font-semibold">{memberStage}</span>，需要达到 <span className="text-yellow-400 font-semibold">新训准考</span> 阶段后才能申请新训考核。
              </div>
              <button
                onClick={() => navigate('/student')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 准考证号显示 */}
      {approvedApplication && approvedApplication.admission_ticket && (
        <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-xl p-6 mb-6 border-2 border-purple-500/50">
          <div className="flex items-center gap-4">
            <div className="bg-purple-600 rounded-full p-3">
              <FileCheck className="text-white" size={32} />
            </div>
            <div className="flex-1">
              <div className="text-purple-300 text-sm mb-1">您的准考证号</div>
              <div className="text-white text-3xl font-bold tracking-wider font-mono">
                {approvedApplication.admission_ticket}
              </div>
              <div className="text-gray-400 text-sm mt-1">
                考核日期：{new Date(approvedApplication.preferred_date).toLocaleDateString('zh-CN')} {approvedApplication.preferred_time}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：申请表单 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Send size={20} className="text-purple-400" />
            提交申请
          </h2>

          {hasPendingApplication && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mb-4 flex items-start gap-3">
              <AlertCircle className="text-yellow-400 flex-shrink-0" size={20} />
              <div className="text-yellow-300 text-sm">
                您已有待审批的申请，请等待审批完成后再提交新申请
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Users size={16} className="inline mr-1" />
                陪考人员 *
              </label>
              <input
                type="text"
                value={formData.companion}
                onChange={(e) => setFormData({ ...formData, companion: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="请输入陪考人员姓名"
                disabled={!canApply || hasPendingApplication}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Calendar size={16} className="inline mr-1" />
                期望考核日期 *
              </label>
              <input
                type="date"
                value={formData.preferred_date}
                onChange={(e) => setFormData({ ...formData, preferred_date: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                style={{ colorScheme: 'dark' }}
                disabled={!canApply || hasPendingApplication}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Clock size={16} className="inline mr-1" />
                期望考核时间 *
              </label>
              <input
                type="time"
                value={formData.preferred_time}
                onChange={(e) => setFormData({ ...formData, preferred_time: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                style={{ colorScheme: 'dark' }}
                disabled={!canApply || hasPendingApplication}
                required
              />
            </div>

            <button
              type="submit"
              disabled={!canApply || submitting || hasPendingApplication}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  提交中...
                </>
              ) : (
                <>
                  <Send size={20} />
                  提交申请
                </>
              )}
            </button>
          </form>

          {/* 申请历史 */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-white mb-3">申请历史</h3>
            {applications.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                暂无申请记录
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="bg-gray-900/50 rounded-lg p-4 border border-gray-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(app.status)}
                        <span className={`status-badge ${getStatusBadge(app.status)}`}>
                          {app.status}
                        </span>
                      </div>
                      <div className="text-gray-400 text-sm">
                        {new Date(app.created_at).toLocaleDateString('zh-CN')}
                      </div>
                    </div>
                    <div className="text-sm text-gray-300 space-y-1">
                      <div>陪考：{app.companion}</div>
                      <div>日期：{new Date(app.preferred_date).toLocaleDateString('zh-CN')} {app.preferred_time}</div>
                      {app.status === '已通过' && app.admission_ticket && (
                        <div className="text-purple-400 font-mono">
                          准考证号：{app.admission_ticket}
                        </div>
                      )}
                      {app.status === '已驳回' && app.reject_reason && (
                        <div className="text-red-400 mt-2">
                          驳回理由：{app.reject_reason}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：考核须知 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <FileCheck size={20} className="text-purple-400" />
            考核须知
          </h2>
          <div className="markdown-content prose prose-invert max-w-none">
            {guidelines ? (
              <ReactMarkdown>{guidelines.content}</ReactMarkdown>
            ) : (
              <div className="text-gray-500">暂无考核须知</div>
            )}
          </div>
          {guidelines?.updated_at && (
            <div className="mt-4 pt-4 border-t border-gray-700 text-sm text-gray-500">
              最后更新：{new Date(guidelines.updated_at).toLocaleString('zh-CN')}
              {guidelines.updated_by && ` by ${guidelines.updated_by}`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
