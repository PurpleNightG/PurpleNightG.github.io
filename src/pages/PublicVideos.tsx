import { useState, useEffect } from 'react'
import { publicVideoAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { FileText, Calendar, User, Search, X } from 'lucide-react'
import PublicAssessmentReportDetail, { normalizePublicAssessment, PublicAssessment } from '../components/PublicAssessmentReportDetail'
import FullscreenReportModal from '../components/FullscreenReportModal'

interface PublicVideo {
  id: number
  title: string
  video_url: string
  description: string | null
  creator_name: string | null
  created_at: string
  assessment_id: number | null
  assessment: PublicAssessment | null
}

export default function PublicVideos() {
  const [videos, setVideos] = useState<PublicVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVideo, setSelectedVideo] = useState<PublicVideo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadVideos()
  }, [])

  const loadVideos = async () => {
    try {
      const response = await publicVideoAPI.getAll()
      setVideos(response.data.map((v: any) => ({
        ...v,
        assessment: v.assessment ? normalizePublicAssessment(v.assessment) : null
      })))
    } catch (error: any) {
      toast.error('加载公开报告失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredVideos = videos.filter(video => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const assessment = video.assessment
    return (
      video.title.toLowerCase().includes(query) ||
      (video.description && video.description.toLowerCase().includes(query)) ||
      (video.creator_name && video.creator_name.toLowerCase().includes(query)) ||
      (assessment?.member_name && assessment.member_name.toLowerCase().includes(query)) ||
      (assessment?.map && assessment.map.toLowerCase().includes(query))
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">公开考核报告</h1>
          <p className="text-gray-400">查看学员公开的考核报告</p>
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索学员、地图、标题..."
            className="bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-gray-400 w-64 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {filteredVideos.length === 0 ? (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-12">
          <div className="text-center text-gray-400">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>{videos.length === 0 ? '暂无公开报告' : '未找到匹配的报告'}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map(video => {
            const assessment = video.assessment
            return (
              <button
                key={video.id}
                onClick={() => setSelectedVideo(video)}
                className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden hover:border-purple-500/50 transition-colors text-left"
              >
                <div className="p-4 border-b border-gray-700">
                  <h3 className="text-white font-semibold mb-2 line-clamp-2">{video.title}</h3>
                  {assessment ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        assessment.status === '已通过' ? 'bg-green-900/30 text-green-400' :
                        assessment.status === '未通过' ? 'bg-red-900/30 text-red-400' :
                        'bg-yellow-900/30 text-yellow-400'
                      }`}>
                        {assessment.status}
                      </span>
                      <span className="text-white font-bold">{assessment.total_score.toFixed(0)}分</span>
                      <span className="text-purple-400">{assessment.rating}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">仅视频内容</p>
                  )}
                </div>

                <div className="p-4 space-y-2 text-xs text-gray-400">
                  {assessment && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <User size={14} />
                        <span>{assessment.member_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText size={14} />
                        <span>{assessment.custom_map || assessment.map}</span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    <span>{new Date(video.created_at).toLocaleDateString('zh-CN')}</span>
                    {video.creator_name && <span>· {video.creator_name}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedVideo && (
        <FullscreenReportModal
          title={selectedVideo.title}
          onClose={() => setSelectedVideo(null)}
        >
          {selectedVideo.assessment ? (
            <PublicAssessmentReportDetail
              assessment={selectedVideo.assessment}
              description={selectedVideo.description}
            />
          ) : (
            <div className="space-y-4">
              {selectedVideo.description && (
                <p className="text-gray-300 text-sm">{selectedVideo.description}</p>
              )}
              {selectedVideo.video_url && (
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <iframe
                    src={selectedVideo.video_url}
                    className="w-full h-full"
                    allowFullScreen
                    title={selectedVideo.title}
                  />
                </div>
              )}
            </div>
          )}
        </FullscreenReportModal>
      )}
    </div>
  )
}
