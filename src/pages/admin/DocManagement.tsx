import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { FileText, Plus, Trash2, Save, Eye, Edit3, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { toast } from '../../utils/toast'

interface DocFile {
  name: string
  sha: string
  size: number
}

const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as any),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || '请求失败')
  return data
}

export default function DocManagement() {
  const [files, setFiles] = useState<DocFile[]>([])
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null)
  const [content, setContent] = useState('')
  const [fileSha, setFileSha] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 新建文件
  const [showNewModal, setShowNewModal] = useState(false)
  const [newFilename, setNewFilename] = useState('')
  const [creating, setCreating] = useState(false)

  // 删除确认
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/docs/list')
      setFiles(res.data || [])
    } catch (err: any) {
      toast.error(err.message || '加载文件列表失败')
    } finally {
      setLoading(false)
    }
  }

  const loadFile = async (file: DocFile) => {
    if (saving) return
    setSelectedFile(file)
    setContent('')
    setFileSha(null)
    setPreview(false)
    setLoading(true)
    try {
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(file.name)}`)
      setContent(res.data.content)
      setFileSha(res.data.sha)
    } catch (err: any) {
      toast.error(err.message || '加载文件内容失败')
    } finally {
      setLoading(false)
    }
  }

  const saveFile = async () => {
    if (!selectedFile) return
    setSaving(true)
    try {
      await apiFetch('/docs/file', {
        method: 'PUT',
        body: JSON.stringify({
          filename: selectedFile.name,
          content,
          sha: fileSha,
        }),
      })
      toast.success('保存成功，GitHub Pages 约1分钟后生效')
      // 刷新 sha（文件提交后 sha 会变）
      await loadFiles()
      // 重新获取新 sha
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(selectedFile.name)}`)
      setFileSha(res.data.sha)
    } catch (err: any) {
      toast.error(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const createFile = async () => {
    let name = newFilename.trim()
    if (!name) return
    if (!name.endsWith('.md')) name += '.md'
    setCreating(true)
    try {
      await apiFetch('/docs/file', {
        method: 'PUT',
        body: JSON.stringify({
          filename: name,
          content: `# ${name.replace('.md', '')}\n\n`,
          sha: null,
        }),
      })
      toast.success('文件创建成功')
      setShowNewModal(false)
      setNewFilename('')
      await loadFiles()
      // 自动选中新文件
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(name)}`)
      const newFile: DocFile = { name, sha: res.data.sha, size: 0 }
      setSelectedFile(newFile)
      setContent(res.data.content)
      setFileSha(res.data.sha)
    } catch (err: any) {
      toast.error(err.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const deleteFile = async () => {
    if (!selectedFile || !fileSha) return
    setDeleting(true)
    try {
      await apiFetch('/docs/file', {
        method: 'DELETE',
        body: JSON.stringify({ filename: selectedFile.name, sha: fileSha }),
      })
      toast.success('文件已删除')
      setShowDeleteConfirm(false)
      setSelectedFile(null)
      setContent('')
      setFileSha(null)
      await loadFiles()
    } catch (err: any) {
      toast.error(err.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return (
    <div className="flex h-full">
      {/* 左侧文件列表 */}
      <aside className="w-64 flex-shrink-0 bg-gray-800/60 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-purple-400" />
            <span className="text-white font-semibold text-sm">官方文档</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={loadFiles}
              className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
              title="刷新列表"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="p-1.5 text-gray-400 hover:text-purple-400 rounded hover:bg-gray-700 transition-colors"
              title="新建文档"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading && files.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-500" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">暂无文档</div>
          ) : (
            files.map(file => (
              <button
                key={file.name}
                onClick={() => loadFile(file)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors ${
                  selectedFile?.name === file.name
                    ? 'bg-purple-600/20 border-l-2 border-purple-500 text-white'
                    : 'text-gray-400 hover:bg-gray-700/40 hover:text-gray-200 border-l-2 border-transparent'
                }`}
              >
                <FileText size={14} className="flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm truncate font-medium">{file.name}</div>
                  <div className="text-xs text-gray-500">{formatSize(file.size)}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 右侧编辑区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700 bg-gray-800/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            {selectedFile ? (
              <>
                <span className="text-white font-semibold">{selectedFile.name}</span>
                {fileSha && (
                  <span className="text-gray-500 text-xs font-mono">sha: {fileSha.slice(0, 7)}</span>
                )}
              </>
            ) : (
              <span className="text-gray-500 text-sm">← 从左侧选择文档</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedFile && (
              <>
                <button
                  onClick={() => setPreview(!preview)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                    preview
                      ? 'bg-purple-600/20 text-purple-300 border border-purple-600/40'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {preview ? <Edit3 size={14} /> : <Eye size={14} />}
                  {preview ? '编辑' : '预览'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={14} />
                  删除
                </button>
                <button
                  onClick={saveFile}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? '保存中...' : '保存'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 编辑/预览区域 */}
        <div className="flex-1 overflow-hidden">
          {!selectedFile ? (
            <div className="flex items-center justify-center h-full text-gray-600">
              <div className="text-center">
                <FileText size={48} className="mx-auto mb-3 opacity-30" />
                <p>从左侧选择一个文档开始编辑</p>
                <p className="text-sm mt-1">或点击 + 新建文档</p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={32} className="animate-spin text-purple-400" />
            </div>
          ) : preview ? (
            <div className="h-full overflow-y-auto px-12 py-8">
              <article className="markdown-content max-w-4xl">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {content}
                </ReactMarkdown>
              </article>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              spellCheck={false}
              className="w-full h-full resize-none bg-gray-900 text-gray-200 font-mono text-sm p-6 outline-none leading-relaxed"
              placeholder="在此输入 Markdown 内容..."
            />
          )}
        </div>
      </div>

      {/* 新建文件弹窗 */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <h3 className="text-white font-bold text-lg mb-4">新建文档</h3>
            <input
              type="text"
              value={newFilename}
              onChange={e => setNewFilename(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFile()}
              placeholder="文件名（如：教程.md）"
              autoFocus
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
            />
            <p className="text-gray-500 text-xs mb-4">不需要手动加 .md 后缀</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowNewModal(false); setNewFilename('') }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={createFile}
                disabled={creating || !newFilename.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <AlertCircle className="text-red-400 flex-shrink-0" size={22} />
              <h3 className="text-white font-bold text-lg">确认删除</h3>
            </div>
            <p className="text-gray-400 text-sm mb-5">
              确定要删除 <span className="text-white font-medium">{selectedFile?.name}</span> 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={deleteFile}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
