import { useState, useEffect } from 'react'
import { publicVideoAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { Video, Calendar, User, Clock, Play, Search, X } from 'lucide-react'

interface PublicVideo {
  id: number
  title: string
  participant_a: string
  participant_b: string
  assessment_date: string
  video_url: string
  description: string | null
  creator_name: string | null
  created_at: string
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
      setVideos(response.data)
    } catch (error: any) {
      toast.error('加载视频失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePlayVideo = (video: PublicVideo) => {
    setSelectedVideo(video)
  }

  const handleCloseVideo = () => {
    setSelectedVideo(null)
  }

  // 过滤视频
  const filteredVideos = videos.filter(video => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      video.title.toLowerCase().includes(query) ||
      video.participant_a.toLowerCase().includes(query) ||
      video.participant_b.toLowerCase().includes(query) ||
      (video.creator_name && video.creator_name.toLowerCase().includes(query))
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
          <h1 className="text-2xl font-bold text-white mb-2">公开视频</h1>
          <p className="text-gray-400">查看学员公开的考核视频</p>
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索标题、参与者..."
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
            <Video size={48} className="mx-auto mb-4 opacity-50" />
            <p>{videos.length === 0 ? '暂无公开视频' : '未找到匹配的视频'}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredVideos.map(video => (
            <div key={video.id} className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden hover:border-purple-500/50 transition-colors">
              <div className="relative aspect-video bg-gray-900/50 flex items-center justify-center group cursor-pointer" onClick={() => handlePlayVideo(video)}>
                <Video size={32} className="text-gray-600 group-hover:text-purple-400 transition-colors" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play size={48} className="text-white" />
                </div>
              </div>
              
              <div className="p-3">
                <h3 className="text-white font-semibold mb-2 line-clamp-1 text-sm">{video.title}</h3>
                
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <User size={14} />
                    <span className="line-clamp-1">{video.participant_a} vs {video.participant_b}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Calendar size={14} />
                    <span>{new Date(video.assessment_date).toLocaleDateString('zh-CN')}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Clock size={14} />
                    <span>{new Date(video.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-700">
                  <span className="text-xs text-gray-500 line-clamp-1">{video.creator_name || '未知'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 视频播放器模态框 */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={handleCloseVideo}>
          <div className="bg-gray-800 rounded-xl max-w-5xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-semibold">{selectedVideo.title}</h2>
              <button onClick={handleCloseVideo} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="aspect-video bg-black">
              <iframe
                src={selectedVideo.video_url}
                className="w-full h-full"
                allowFullScreen
                title={selectedVideo.title}
              />
            </div>
            
            <div className="p-4 bg-gray-900/50">
              <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                <span className="flex items-center gap-1">
                  <User size={16} />
                  {selectedVideo.participant_a} vs {selectedVideo.participant_b}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={16} />
                  {new Date(selectedVideo.assessment_date).toLocaleDateString('zh-CN')}
                </span>
              </div>
              
              {selectedVideo.description && (
                <p className="text-gray-300 text-sm">{selectedVideo.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
