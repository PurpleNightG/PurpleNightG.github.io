import { useState, useEffect, useRef } from 'react'
import { videoUploadAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { Upload, Video, RefreshCw, ExternalLink, Film, UploadCloud, Folder, ChevronRight, Home } from 'lucide-react'

interface ResourceItem {
  isDir: boolean
  id?: string
  name: string
  size?: number
  resolution?: string
  status?: string
  slug?: string
  embed_url?: string
  createdAt?: string
  updatedAt?: string
}

interface Breadcrumb {
  id: string
  name: string
}

export default function VideoUpload() {
  const [resources, setResources] = useState<ResourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [driveId, setDriveId] = useState('')
  const [importing, setImporting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [currentFolderId, setCurrentFolderId] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadVideos(currentFolderId)
  }, [currentPage, currentFolderId])

  const loadVideos = async (folderId = currentFolderId) => {
    try {
      setLoading(true)
      const response = await videoUploadAPI.list(currentPage, folderId)
      if (response.success) {
        setResources(response.data.items || [])
        setTotalPages(response.data.pagination?.next || 1)
        setBreadcrumbs(response.data.breadcrumbs || [])
      } else {
        setResources([])
        toast.error(response.message || '加载资源列表失败')
      }
    } catch (error: any) {
      setResources([])
      toast.error('无法连接到 Abyss.to API，请检查网络或稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleFolderClick = (folderId: string) => {
    setCurrentFolderId(folderId)
    setCurrentPage(1)
    loadVideos(folderId)
  }

  const handleBreadcrumbClick = (folderId: string) => {
    setCurrentFolderId(folderId)
    setCurrentPage(1)
    loadVideos(folderId)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
  }

  const handleUpload = async (file: File) => {
    try {
      setUploading(true)
      setUploadProgress(0)

      const response: any = await videoUploadAPI.upload(file, (progress) => {
        setUploadProgress(progress)
      })
      
      if (response.success) {
        toast.success(`视频上传成功！Slug: ${response.data.slug}`)
        loadVideos(currentFolderId)
      } else {
        toast.error(response.message || '上传失败')
      }
    } catch (error: any) {
      toast.error('上传失败: ' + (error.message || '未知错误'))
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleImportDrive = async () => {
    if (!driveId.trim()) {
      toast.error('请输入 Google Drive ID')
      return
    }

    try {
      setImporting(true)
      const response = await videoUploadAPI.importDrive(driveId)
      
      if (response.success) {
        toast.success(`视频导入成功！Slug: ${response.data.slug}`)
        setDriveId('')
        loadVideos(currentFolderId)
      }
    } catch (error: any) {
      toast.error('导入失败: ' + error.message)
    } finally {
      setImporting(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="p-6">
      {/* 标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">视频上传管理</h1>
        <p className="text-gray-400">上传和管理视频到 Abyss.to</p>
      </div>

      {/* 上传区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 本地上传 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="text-purple-400" size={20} />
            <h2 className="text-white font-semibold">本地上传</h2>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <UploadCloud size={20} />
            {uploading ? '上传中...' : '选择视频文件'}
          </button>

          {uploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                <span>上传进度</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-purple-500 h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Google Drive 导入 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Film className="text-blue-400" size={20} />
            <h2 className="text-white font-semibold">Google Drive 导入</h2>
          </div>

          <input
            type="text"
            value={driveId}
            onChange={(e) => setDriveId(e.target.value)}
            placeholder="输入 Google Drive 文件 ID"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 mb-3 focus:outline-none focus:border-blue-500"
            disabled={importing}
          />

          <button
            onClick={handleImportDrive}
            disabled={importing || !driveId.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <RefreshCw className="animate-spin" size={20} />
                导入中...
              </>
            ) : (
              <>
                <UploadCloud size={20} />
                从 Drive 导入
              </>
            )}
          </button>

          <p className="mt-3 text-xs text-gray-500">
            示例: 从 https://drive.google.com/open?id=<span className="text-purple-400">1AoUG...</span> 中提取 ID
          </p>
        </div>
      </div>

      {/* 资源列表 */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="text-purple-400" size={20} />
            <h2 className="text-white font-semibold">资源浏览</h2>
          </div>
          <button
            onClick={() => loadVideos()}
            className="text-gray-400 hover:text-white transition-colors"
            title="刷新列表"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* 面包屑导航 */}
        {(breadcrumbs.length > 0) && (
          <div className="px-4 py-2 bg-gray-900/30 border-b border-gray-700 flex items-center gap-2 text-sm">
            <button
              onClick={() => handleBreadcrumbClick('')}
              className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <Home size={16} />
              <span>Root</span>
            </button>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center gap-2">
                <ChevronRight size={16} className="text-gray-600" />
                {index === breadcrumbs.length - 1 ? (
                  <span className="text-white">{crumb.name}</span>
                ) : (
                  <button
                    onClick={() => handleBreadcrumbClick(crumb.id)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {crumb.name}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-gray-400">
            加载中...
          </div>
        ) : resources.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Video size={48} className="mx-auto mb-4 opacity-50" />
            <p>暂无文件</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr className="text-left text-gray-400 text-sm">
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">Slug/ID</th>
                  <th className="px-4 py-3">大小</th>
                  <th className="px-4 py-3">分辨率</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">复制链接</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {resources.map((item, index) => (
                  <tr key={index} className="text-white hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.isDir ? (
                          <>
                            <Folder size={16} className="text-yellow-400" />
                            <button
                              onClick={() => handleFolderClick(item.id!)}
                              className="font-medium hover:text-purple-400 transition-colors"
                            >
                              {item.name}
                            </button>
                          </>
                        ) : (
                          <>
                            <Film size={16} className="text-gray-400" />
                            <span className="font-medium">{item.name}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.isDir ? (
                        <span className="text-gray-500 text-xs">-</span>
                      ) : (
                        item.slug && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(item.slug!)
                              toast.success('已复制 Slug')
                            }}
                            className="text-xs text-purple-400 hover:text-purple-300 font-mono bg-gray-700/50 px-2 py-1 rounded transition-colors"
                            title="点击复制"
                          >
                            {item.slug}
                          </button>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {item.isDir ? '-' : (item.size ? formatFileSize(item.size) : '-')}
                    </td>
                    <td className="px-4 py-3">
                      {item.isDir ? (
                        <span className="text-gray-500 text-xs">文件夹</span>
                      ) : (
                        item.resolution && (
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                            {item.resolution}
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.isDir ? (
                        <span className="text-gray-500 text-xs">-</span>
                      ) : (
                        item.status && (
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.status === 'ready' 
                              ? 'bg-green-500/20 text-green-300' 
                              : 'bg-yellow-500/20 text-yellow-300'
                          }`}>
                            {item.status}
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.isDir ? (
                        <span className="text-gray-500 text-sm">-</span>
                      ) : (
                        item.slug && (
                          <button
                            onClick={() => {
                              const link = `https://short.icu/${item.slug}`
                              navigator.clipboard.writeText(link)
                              toast.success('已复制链接')
                            }}
                            className="text-blue-400 hover:text-blue-300 transition-colors text-sm flex items-center gap-1"
                            title="点击复制链接"
                          >
                            <ExternalLink size={14} />
                            复制
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {!loading && totalPages > 1 && (
          <div className="p-4 border-t border-gray-700 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              上一页
            </button>
            <span className="text-gray-400">
              第 {currentPage} / {totalPages} 页
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
