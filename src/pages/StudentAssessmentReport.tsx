import { useState, useEffect } from 'react'
import { assessmentAPI, publicVideoAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { MapPin, CheckCircle, XCircle, Clock, AlertCircle, FileText, Target, Upload, X } from 'lucide-react'

// 扣分项配置
const DEDUCTION_CATEGORIES = {
  'OODA和基本地形处理': [
    { code: 'A01', name: '指挥/信号' },
    { code: 'A02', name: '非法动作' },
    { code: 'A03', name: '非法的模型处理' },
  ],
  '危险点处理方式与枪线管理': [
    { code: 'B01', name: '忽略危险' },
    { code: 'B02', name: '非法经过/越过死亡漏洞' },
    { code: 'B03', name: '暴露在死亡漏斗' },
    { code: 'B04', name: '非法ROE/丧失突然性' },
  ],
  '协同': [
    { code: 'C01', name: '非法的责任区间' },
    { code: 'C02', name: '滞留/脱节' },
    { code: 'C03', name: '呆滞/无效指令/无效信号' },
  ],
}

// 根据代码获取名称
function getDeductionName(code: string): string {
  for (const category in DEDUCTION_CATEGORIES) {
    const item = (DEDUCTION_CATEGORIES as any)[category].find((d: any) => d.code === code)
    if (item) {
      return item.name
    }
  }
  return code // 如果没找到，返回代码本身
}

interface Assessment {
  id: number
  member_id: number
  member_name: string
  assessment_date: string
  status: '待处理' | '已通过' | '未通过' | '未完成'
  map: string
  custom_map: string | null
  evaluation: string | null
  deduction_records: DeductionRecord[]
  total_score: number
  rating: string
  has_evaluation: boolean
  has_deduction_records: boolean
  video_url: string | null
  video_iframe: string | null
  has_video: boolean
  created_at: string
}

interface DeductionRecord {
  time: string
  code: string
  description: string
  score: number
}

export default function StudentAssessmentReport() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishForm, setPublishForm] = useState({ description: '' })
  const [publishedAssessmentIds, setPublishedAssessmentIds] = useState<Set<number>>(new Set())
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    loadAssessments()
  }, [])

  const loadAssessments = async () => {
    try {
      // 从localStorage获取学员信息
      const studentUserStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!studentUserStr) {
        toast.error('未找到学员信息')
        return
      }

      const studentUser = JSON.parse(studentUserStr)
      const response = await assessmentAPI.getByMemberId(studentUser.id)
      
      // 确保total_score是数字类型，deduction_records是数组
      const assessments = response.data.map((a: Assessment) => ({
        ...a,
        total_score: parseFloat(a.total_score as any) || 0,
        deduction_records: Array.isArray(a.deduction_records) ? a.deduction_records : []
      }))
      setAssessments(assessments)

      // 加载已公开的报告
      try {
        const publicRes = await publicVideoAPI.getAll()
        const publishedIds = new Set<number>(
          publicRes.data
            .filter((v: any) => v.assessment_id)
            .map((v: any) => v.assessment_id)
        )
        setPublishedAssessmentIds(publishedIds)
      } catch {
        // 忽略，不影响报告加载
      }

      // 默认选中最新的一条记录
      if (assessments.length > 0) {
        setSelectedAssessment(assessments[0])
      }
    } catch (error: any) {
      toast.error('加载考核报告失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: Assessment['status']) => {
    switch (status) {
      case '已通过':
        return <CheckCircle className="text-green-400" size={24} />
      case '未通过':
        return <XCircle className="text-red-400" size={24} />
      case '待处理':
        return <Clock className="text-yellow-400" size={24} />
      case '未完成':
        return <AlertCircle className="text-gray-400" size={24} />
    }
  }

  const getStatusColor = (status: Assessment['status']) => {
    switch (status) {
      case '已通过': return 'text-green-400 bg-green-900/20 border-green-700'
      case '未通过': return 'text-red-400 bg-red-900/20 border-red-700'
      case '待处理': return 'text-yellow-400 bg-yellow-900/20 border-yellow-700'
      case '未完成': return 'text-gray-400 bg-gray-900/20 border-gray-700'
    }
  }

  const handleOpenPublishModal = () => {
    if (!selectedAssessment) return
    if (publishedAssessmentIds.has(selectedAssessment.id)) {
      toast.error('该考核报告已公开')
      return
    }
    setPublishForm({ description: '' })
    setShowPublishModal(true)
  }

  const handlePublishReport = async () => {
    if (!selectedAssessment) return

    try {
      const studentUserStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!studentUserStr) {
        toast.error('无法获取用户信息')
        return
      }
      const studentUser = JSON.parse(studentUserStr)

      setPublishing(true)
      await publicVideoAPI.create({
        assessment_id: selectedAssessment.id,
        description: publishForm.description.trim() || undefined,
        created_by: studentUser.id
      })

      toast.success('考核报告已公开！')
      setPublishedAssessmentIds(prev => new Set(prev).add(selectedAssessment.id))
      setShowPublishModal(false)
      setPublishForm({ description: '' })
    } catch (error: any) {
      toast.error('公开报告失败: ' + error.message)
    } finally {
      setPublishing(false)
    }
  }

  const getRatingColor = (score: number) => {
    if (score >= 100) return 'text-purple-400'
    if (score >= 90) return 'text-green-400'
    if (score >= 70) return 'text-blue-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  if (assessments.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-white mb-6">新训考核报告</h1>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-12 border border-gray-700 text-center">
          <FileText className="mx-auto mb-4 text-gray-500" size={64} />
          <p className="text-gray-400 text-lg">暂无考核记录</p>
          <p className="text-gray-500 text-sm mt-2">完成考核后，报告将显示在这里</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-6">新训考核报告</h1>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* 左侧：考核记录列表 */}
        <div className="lg:col-span-1 space-y-2">
          <div className="text-xs text-gray-500 mb-2 px-1">
            共 {assessments.length} 次考核
          </div>
          {assessments.map(assessment => (
            <button
              key={assessment.id}
              onClick={() => setSelectedAssessment(assessment)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedAssessment?.id === assessment.id
                  ? 'bg-purple-900/30 border-purple-700 shadow-lg'
                  : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800/70'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {getStatusIcon(assessment.status)}
                  <span className={`text-sm font-medium ${
                    selectedAssessment?.id === assessment.id ? 'text-white' : 'text-gray-300'
                  }`}>
                    {assessment.status}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(assessment.assessment_date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <MapPin size={12} />
                  <span className="truncate">{assessment.custom_map || assessment.map}</span>
                </div>
                <div className="flex items-baseline gap-1.5 ml-2">
                  <span className="text-xl font-bold text-white">{assessment.total_score.toFixed(0)}</span>
                  <span className={`text-xs font-medium ${getRatingColor(assessment.total_score)}`}>
                    {assessment.rating}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* 右侧：详细报告 */}
        {selectedAssessment && (
          <div className="lg:col-span-3 space-y-6">
            {/* 基本信息卡片 */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {getStatusIcon(selectedAssessment.status)}
                  <div>
                    <h2 className="text-2xl font-bold text-white">考核详情</h2>
                    <p className="text-gray-400 text-sm mt-1">
                      {new Date(selectedAssessment.assessment_date).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-lg border ${getStatusColor(selectedAssessment.status)}`}>
                    {selectedAssessment.status}
                  </div>
                  <button
                    onClick={handleOpenPublishModal}
                    disabled={publishedAssessmentIds.has(selectedAssessment.id)}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                  >
                    <Upload size={16} />
                    {publishedAssessmentIds.has(selectedAssessment.id) ? '已公开' : '公开此报告'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">地图</div>
                  <div className="text-white font-medium">
                    {selectedAssessment.custom_map || selectedAssessment.map}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">总分</div>
                  <div className="text-white font-bold text-2xl">
                    {selectedAssessment.total_score.toFixed(2)}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">评级</div>
                  <div className={`font-bold text-xl ${getRatingColor(selectedAssessment.total_score)}`}>
                    {selectedAssessment.rating}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">扣分项</div>
                  <div className="text-white font-medium">
                    {selectedAssessment.deduction_records?.length || 0} 项
                  </div>
                </div>
              </div>

              {/* 得分进度条 */}
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold inline-block text-purple-400">
                      得分进度
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold inline-block text-purple-400">
                      {selectedAssessment.total_score.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-3 mb-4 text-xs flex rounded-full bg-gray-700">
                  <div
                    style={{ width: `${selectedAssessment.total_score}%` }}
                    className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                      selectedAssessment.total_score >= 90
                        ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                        : selectedAssessment.total_score >= 70
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                        : selectedAssessment.total_score >= 60
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-400'
                        : 'bg-gradient-to-r from-red-500 to-pink-400'
                    }`}
                  ></div>
                </div>
              </div>
            </div>

            {/* 评价 */}
            {!!selectedAssessment.has_evaluation && selectedAssessment.evaluation && (
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <FileText size={20} className="text-purple-400" />
                  教官评价
                </h3>
                <div className="bg-gray-900/50 rounded-lg p-4 text-gray-300 whitespace-pre-wrap">
                  {selectedAssessment.evaluation}
                </div>
              </div>
            )}

            {/* 视频和扣分记录 - 并排显示 */}
            {((!!selectedAssessment.has_video && !!selectedAssessment.video_url) || 
             (selectedAssessment.deduction_records && selectedAssessment.deduction_records.length > 0)) && (
              <div className="grid lg:grid-cols-3 gap-6 items-stretch">
                {/* 左侧：考核视频 */}
                {!!selectedAssessment.has_video && !!selectedAssessment.video_url && (
                  <div className="lg:col-span-2 bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <FileText size={20} className="text-purple-400" />
                      考核视频
                    </h3>
                    {/* 视频播放警告 */}
                    <div className="mb-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={18} />
                        <div className="text-sm text-yellow-200">
                          <p className="font-semibold mb-1">🎬 视频播放提示</p>
                          <p className="text-yellow-300/90 text-xs leading-relaxed">
                            首次点击播放会<span className="font-bold text-yellow-400">弹出两次新标签页</span>，
                            请<span className="font-bold text-yellow-400">直接关闭这两个新标签页</span>并返回本页面，
                            第三次点击播放即可正常观看。<br/>
                            <span className="text-red-400 font-semibold">⚠️ 新页面与紫夜无关，谨防上当受骗！</span>
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-gray-900/50 rounded-lg overflow-hidden border border-gray-700">
                      <iframe 
                        src={selectedAssessment.video_url}
                        className="w-full aspect-video"
                        frameBorder="0"
                        scrolling="no"
                        allowFullScreen
                        title="考核视频"
                      />
                    </div>
                    <div className="mt-3 text-center">
                      <a 
                        href={selectedAssessment.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        在新窗口中打开视频 →
                      </a>
                    </div>
                  </div>
                )}

                {/* 右侧：扣分记录 */}
                {selectedAssessment.deduction_records && selectedAssessment.deduction_records.length > 0 && (
                  <div className={`bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 flex flex-col h-full min-h-0 ${
                    !(!!selectedAssessment.has_video && !!selectedAssessment.video_url) ? 'lg:col-span-3 max-h-[70vh]' : 'lg:col-span-1'
                  }`}>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 flex-shrink-0">
                      <Target size={20} className="text-red-400" />
                      扣分明细
                    </h3>
                    <div className="flex flex-col flex-1 min-h-0">
                      <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                        {selectedAssessment.deduction_records.map((record, index) => (
                          <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex flex-col gap-2">
                                <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-400 inline-block w-fit">
                                  {record.time}
                                </span>
                                <span className="text-sm font-mono bg-red-900/30 text-red-400 px-2 py-1 rounded inline-block">
                                  {record.code} - {getDeductionName(record.code)}
                                </span>
                              </div>
                              <span className="text-red-400 font-bold whitespace-nowrap">-{record.score} 分</span>
                            </div>
                            {record.description && (
                              <p className="text-gray-300 text-sm">{record.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="bg-red-900/20 rounded-lg p-4 border border-red-700/50 mt-3 flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">总扣分</span>
                          <span className="text-red-400 font-bold text-lg">
                            -{selectedAssessment.deduction_records.reduce((sum, r) => sum + r.score, 0)} 分
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 创建时间 */}
            <div className="text-center text-sm text-gray-500">
              报告生成时间: {new Date(selectedAssessment.created_at).toLocaleString('zh-CN')}
            </div>
          </div>
        )}
      </div>

      {/* 公开报告模态框 */}
      {showPublishModal && selectedAssessment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-xl w-full">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">公开考核报告</h2>
              <button 
                onClick={() => setShowPublishModal(false)} 
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                <p className="text-blue-300 text-xs">
                  将公开完整考核报告，包括地图、分数、评级、教官评价、扣分明细及考核视频等所有内容。
                </p>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 text-sm text-gray-300 space-y-1">
                <p>学员：{selectedAssessment.member_name}</p>
                <p>地图：{selectedAssessment.custom_map || selectedAssessment.map}</p>
                <p>总分：{selectedAssessment.total_score.toFixed(2)} · {selectedAssessment.rating}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">补充说明（可选）</label>
                <textarea
                  value={publishForm.description}
                  onChange={(e) => setPublishForm({ description: e.target.value })}
                  placeholder="可添加公开说明（可选）"
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handlePublishReport}
                disabled={publishing}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {publishing ? '公开中...' : '确认公开'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
