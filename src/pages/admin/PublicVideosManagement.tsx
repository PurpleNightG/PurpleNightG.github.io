import { useState, useEffect } from 'react'
import { publicVideoAPI } from '../../utils/api'
import { toast } from 'react-hot-toast'
import { Plus, Trash2, Edit, Search, X, CheckSquare, Square, ChevronUp, ChevronDown, Video, Play } from 'lucide-react'
import ConfirmDialog from '../../components/ConfirmDialog'
import { toInputDate } from '../../utils/dateFormat'

interface PublicVideo {
  id: number
  title: string
  participant_a: string
  participant_b: string
  assessment_date: string
  video_url: string
  description: string | null
  creator_name: string
  created_at: string
  created_by: number
}

export default function PublicVideosManagement() {
  const [videos, setVideos] = useState<PublicVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingVideo, setEditingVideo] = useState<PublicVideo | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingVideo, setViewingVideo] = useState<PublicVideo | null>(null)

  const [formData, setFormData] = useState({
    title: '',
    participant_a: '',
    participant_b: '',
    assessment_date: new Date().toISOString().split('T')[0],
    video_url: '',
    description: ''
  })

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

  const resetForm = () => {
    setFormData({
      title: '',
      participant_a: '',
      participant_b: '',
      assessment_date: new Date().toISOString().split('T')[0],
      video_url: '',
      description: ''
    })
    setEditingVideo(null)
  }

  const openEditModal = (video: PublicVideo) => {
    setEditingVideo(video)
    setFormData({
      title: video.title,
      participant_a: video.participant_a,
      participant_b: video.participant_b,
      assessment_date: toInputDate(video.assessment_date),
      video_url: video.video_url,
      description: video.description || ''
    })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    try {
      if (!formData.title || !formData.participant_a || !formData.participant_b || !formData.video_url) {
        toast.error('请填写所有必填字段')
        return
      }

      const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
      if (!userStr) {
        toast.error('无法获取用户信息，请重新登录')
        return
      }
      
      const user = JSON.parse(userStr)
      const userId = user.id
      
      if (!userId) {
        toast.error('用户ID无效，请重新登录')
        return
      }

      if (editingVideo) {
        await publicVideoAPI.update(editingVideo.id, formData)
        toast.success('视频更新成功')
      } else {
        await publicVideoAPI.create({ ...formData, created_by: userId })
        toast.success('视频添加成功')
      }

      setShowModal(false)
      resetForm()
      await loadVideos()
    } catch (error: any) {
      toast.error('操作失败: ' + error.message)
    }
  }

  const handleDelete = async (id: number) => {
    setConfirmDialog({
      show: true,
      type: 'delete',
      data: id
    })
  }

  const handleBatchDelete = () => {
    setConfirmDialog({
      show: true,
      type: 'batchDelete'
    })
  }

  const confirmDelete = async () => {
    try {
      if (confirmDialog.type === 'delete') {
        await publicVideoAPI.delete(confirmDialog.data)
        toast.success('删除成功')
      } else if (confirmDialog.type === 'batchDelete') {
        await publicVideoAPI.batchDelete(Array.from(selectedIds))
        toast.success('批量删除成功')
        setSelectedIds(new Set())
      }
      setConfirmDialog({show: false, type: ''})
      await loadVideos()
    } catch (error: any) {
      toast.error('删除失败: ' + error.message)
    }
  }

  const toggleSelection = (id: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === filteredVideos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredVideos.map(v => v.id)))
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleSort = (key: string) => {
    if (sortConfig?.key === key) {
      if (sortConfig.direction === 'asc') {
        setSortConfig({key, direction: 'desc'})
      } else {
        setSortConfig(null)
      }
    } else {
      setSortConfig({key, direction: 'asc'})
    }
  }

  let filteredVideos = videos.filter(video => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      video.title.toLowerCase().includes(query) ||
      video.participant_a.toLowerCase().includes(query) ||
      video.participant_b.toLowerCase().includes(query)
    )
  })

  if (sortConfig) {
    filteredVideos.sort((a, b) => {
      const aValue = a[sortConfig.key as keyof PublicVideo]
      const bValue = b[sortConfig.key as keyof PublicVideo]
      
      if (aValue === null && bValue === null) return 0
      if (aValue === null) return 1
      if (bValue === null) return -1
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }

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
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">公开视频管理</h1>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                已选中 <span className="text-purple-400 font-semibold">{selectedIds.size}</span> 项
              </span>
              <button onClick={clearSelection} className="text-sm text-gray-400 hover:text-white transition-colors">
                清空选择
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3">
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
          <button
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            添加公开视频
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button onClick={handleBatchDelete} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors">
                批量删除
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
        {filteredVideos.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>暂无视频</p>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <button onClick={selectAll} className="flex items-center justify-center w-full hover:text-purple-400 transition-colors">
                      {selectedIds.size === filteredVideos.length && filteredVideos.length > 0 ? 
                        <CheckSquare size={18} className="text-purple-400" /> : 
                        <Square size={18} className="text-gray-400" />
                      }
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('title')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>视频信息</span>
                      {sortConfig?.key === 'title' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('participant_a')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>参与者</span>
                      {sortConfig?.key === 'participant_a' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('assessment_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>考核日期</span>
                      {sortConfig?.key === 'assessment_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('created_at')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>创建时间</span>
                      {sortConfig?.key === 'created_at' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredVideos.map(video => (
                  <tr key={video.id}>
                    <td className="checkbox-col">
                      <button onClick={() => toggleSelection(video.id)} className="flex items-center justify-center w-full hover:text-purple-400 transition-colors">
                        {selectedIds.has(video.id) ? 
                          <CheckSquare size={18} className="text-purple-400" /> : 
                          <Square size={18} className="text-gray-400" />
                        }
                      </button>
                    </td>
                    <td>
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-10 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                          <Video size={20} className="text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white mb-1">{video.title}</div>
                          {video.description && (
                            <div className="text-xs text-gray-400 line-clamp-1">{video.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm">
                        <div className="text-white">{video.participant_a}</div>
                        <div className="text-gray-400">vs</div>
                        <div className="text-white">{video.participant_b}</div>
                      </div>
                    </td>
                    <td>{new Date(video.assessment_date).toLocaleDateString('zh-CN')}</td>
                    <td>
                      <div className="text-sm">
                        <div className="text-white">{new Date(video.created_at).toLocaleDateString('zh-CN')}</div>
                        <div className="text-gray-400 text-xs">{video.creator_name}</div>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setViewingVideo(video)}
                          className="text-purple-400 hover:text-purple-300 transition-colors"
                          title="查看视频"
                        >
                          <Play size={18} />
                        </button>
                        <button
                          onClick={() => openEditModal(video)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="编辑"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(video.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 添加/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800 px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {editingVideo ? '编辑视频' : '添加公开视频'}
              </h2>
              <button onClick={() => {
                setShowModal(false)
                resetForm()
              }} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  视频标题 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="输入视频标题"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    参与者A <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.participant_a}
                    onChange={(e) => setFormData({...formData, participant_a: e.target.value})}
                    placeholder="参与者A姓名"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    参与者B <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.participant_b}
                    onChange={(e) => setFormData({...formData, participant_b: e.target.value})}
                    placeholder="参与者B姓名"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">考核日期</label>
                <input
                  type="date"
                  value={formData.assessment_date}
                  onChange={(e) => setFormData({...formData, assessment_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  视频链接 <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({...formData, video_url: e.target.value})}
                  placeholder="https://..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">视频描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="输入视频描述（可选）"
                  rows={4}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.show && (
        <ConfirmDialog
          title={confirmDialog.type === 'batchDelete' ? '批量删除视频' : '删除视频'}
          message={confirmDialog.type === 'batchDelete' 
            ? `确定要删除选中的 ${selectedIds.size} 个视频吗？此操作不可恢复。`
            : '确定要删除这个视频吗？此操作不可恢复。'
          }
          type="danger"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {/* 视频播放模态框 */}
      {viewingVideo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setViewingVideo(null)}>
          <div className="bg-gray-800 rounded-xl max-w-5xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-semibold">{viewingVideo.title}</h2>
              <button onClick={() => setViewingVideo(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="aspect-video bg-black">
              <iframe
                src={viewingVideo.video_url}
                className="w-full h-full"
                allowFullScreen
                title={viewingVideo.title}
              />
            </div>
            
            <div className="p-4 bg-gray-900/50">
              <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                <span className="flex items-center gap-1">
                  {viewingVideo.participant_a} vs {viewingVideo.participant_b}
                </span>
                <span>考核日期: {new Date(viewingVideo.assessment_date).toLocaleDateString('zh-CN')}</span>
              </div>
              
              {viewingVideo.description && (
                <p className="text-gray-300 text-sm">{viewingVideo.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
