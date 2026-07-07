import { CheckCircle, XCircle, Clock, AlertCircle, FileText, Target } from 'lucide-react'

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

function getDeductionName(code: string): string {
  for (const category in DEDUCTION_CATEGORIES) {
    const item = (DEDUCTION_CATEGORIES as any)[category].find((d: any) => d.code === code)
    if (item) return item.name
  }
  return code
}

export interface PublicAssessment {
  id: number
  member_id: number
  member_name: string
  assessment_date: string
  status: '待处理' | '已通过' | '未通过' | '未完成' | '模拟考'
  map: string
  custom_map: string | null
  evaluation: string | null
  deduction_records: DeductionRecord[]
  total_score: number
  rating: string
  has_evaluation: boolean
  has_deduction_records: boolean
  video_url: string | null
  has_video: boolean
  created_at: string
}

interface DeductionRecord {
  time: string
  code: string
  description: string
  score: number
}

function getStatusIcon(status: PublicAssessment['status']) {
  switch (status) {
    case '已通过':
      return <CheckCircle className="text-green-400" size={24} />
    case '未通过':
      return <XCircle className="text-red-400" size={24} />
    case '待处理':
      return <Clock className="text-yellow-400" size={24} />
    case '未完成':
      return <AlertCircle className="text-gray-400" size={24} />
    case '模拟考':
      return <Clock className="text-blue-400" size={24} />
  }
}

function getStatusColor(status: PublicAssessment['status']) {
  switch (status) {
    case '已通过': return 'text-green-400 bg-green-900/20 border-green-700'
    case '未通过': return 'text-red-400 bg-red-900/20 border-red-700'
    case '待处理': return 'text-yellow-400 bg-yellow-900/20 border-yellow-700'
    case '未完成': return 'text-gray-400 bg-gray-900/20 border-gray-700'
    case '模拟考': return 'text-blue-400 bg-blue-900/20 border-blue-700'
  }
}

function getRatingColor(score: number) {
  if (score >= 100) return 'text-purple-400'
  if (score >= 90) return 'text-green-400'
  if (score >= 70) return 'text-blue-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

interface Props {
  assessment: PublicAssessment
  description?: string | null
}

export default function PublicAssessmentReportDetail({ assessment, description }: Props) {
  const totalScore = parseFloat(String(assessment.total_score)) || 0
  const deductionRecords = Array.isArray(assessment.deduction_records) ? assessment.deduction_records : []

  return (
    <div className="space-y-6">
      {description && (
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 text-gray-300 text-sm">
          {description}
        </div>
      )}

      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {getStatusIcon(assessment.status)}
            <div>
              <h2 className="text-2xl font-bold text-white">{assessment.member_name} · 考核报告</h2>
              <p className="text-gray-400 text-sm mt-1">
                {new Date(assessment.assessment_date).toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-lg border ${getStatusColor(assessment.status)}`}>
            {assessment.status}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">地图</div>
            <div className="text-white font-medium">{assessment.custom_map || assessment.map}</div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">总分</div>
            <div className="text-white font-bold text-2xl">{totalScore.toFixed(2)}</div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">评级</div>
            <div className={`font-bold text-xl ${getRatingColor(totalScore)}`}>{assessment.rating}</div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">扣分项</div>
            <div className="text-white font-medium">{deductionRecords.length} 项</div>
          </div>
        </div>

        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between">
            <span className="text-xs font-semibold inline-block text-purple-400">得分进度</span>
            <span className="text-xs font-semibold inline-block text-purple-400">{totalScore.toFixed(1)}%</span>
          </div>
          <div className="overflow-hidden h-3 mb-4 text-xs flex rounded-full bg-gray-700">
            <div
              style={{ width: `${totalScore}%` }}
              className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                totalScore >= 90
                  ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                  : totalScore >= 70
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                  : totalScore >= 60
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-400'
                  : 'bg-gradient-to-r from-red-500 to-pink-400'
              }`}
            />
          </div>
        </div>
      </div>

      {!!assessment.has_evaluation && assessment.evaluation && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <FileText size={20} className="text-purple-400" />
            教官评价
          </h3>
          <div className="bg-gray-900/50 rounded-lg p-4 text-gray-300 whitespace-pre-wrap">
            {assessment.evaluation}
          </div>
        </div>
      )}

      {((!!assessment.has_video && !!assessment.video_url) || deductionRecords.length > 0) && (
        <div className="grid lg:grid-cols-3 gap-6 items-stretch">
          {!!assessment.has_video && !!assessment.video_url && (
            <div className="lg:col-span-2 bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <FileText size={20} className="text-purple-400" />
                考核视频
              </h3>
              <div className="mb-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={18} />
                  <div className="text-sm text-yellow-200">
                    <p className="font-semibold mb-1">视频播放提示</p>
                    <p className="text-yellow-300/90 text-xs leading-relaxed">
                      首次播放可能弹出两次新标签页，请关闭后返回本页再次点击播放。
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg overflow-hidden border border-gray-700">
                <iframe
                  src={assessment.video_url}
                  className="w-full aspect-video"
                  frameBorder="0"
                  scrolling="no"
                  allowFullScreen
                  title="考核视频"
                />
              </div>
            </div>
          )}

          {deductionRecords.length > 0 && (
            <div className={`bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 flex flex-col h-full min-h-0 ${
              !(!!assessment.has_video && !!assessment.video_url) ? 'lg:col-span-3 max-h-[70vh]' : 'lg:col-span-1'
            }`}>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 flex-shrink-0">
                <Target size={20} className="text-red-400" />
                扣分明细
              </h3>
              <div className="flex flex-col flex-1 min-h-0">
                <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                  {deductionRecords.map((record, index) => (
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
                      -{deductionRecords.reduce((sum, r) => sum + r.score, 0)} 分
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-center text-sm text-gray-500">
        报告生成时间: {new Date(assessment.created_at).toLocaleString('zh-CN')}
      </div>
    </div>
  )
}

export function normalizePublicAssessment(data: any): PublicAssessment {
  return {
    ...data,
    total_score: parseFloat(data.total_score) || 0,
    deduction_records: Array.isArray(data.deduction_records) ? data.deduction_records : []
  }
}
