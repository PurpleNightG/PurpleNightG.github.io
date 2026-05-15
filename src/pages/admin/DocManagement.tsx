import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import {
  FileText, FolderOpen, Folder, Plus, Trash2, Save,
  Eye, Edit3, Loader2, RefreshCw, AlertCircle, ChevronRight, ChevronDown, FolderPlus, Pencil
} from 'lucide-react'
import { toast } from '../../utils/toast'

interface TreeItem {
  name: string
  path: string
  sha?: string
  size?: number
  type: 'file' | 'dir'
  children?: TreeItem[]
}

interface SelectedFile {
  name: string   // display name (basename)
  path: string   // relative path e.g. folder/file.md or file.md
  sha: string
}

const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers as any) },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || '请求失败')
  return data
}

// 递归树节点组件
function TreeNode({
  item,
  depth,
  selectedPath,
  onSelectFile,
  onDeleteFile,
  onDeleteFolder,
  expandedFolders,
  toggleFolder,
}: {
  item: TreeItem
  depth: number
  selectedPath: string
  onSelectFile: (item: TreeItem) => void
  onDeleteFile: (item: TreeItem) => void
  onDeleteFolder: (item: TreeItem) => void
  expandedFolders: Set<string>
  toggleFolder: (path: string) => void
}) {
  const indent = depth * 12

  if (item.type === 'dir') {
    const isOpen = expandedFolders.has(item.path)
    return (
      <div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700/30 cursor-pointer group"
          style={{ paddingLeft: `${12 + indent}px` }}
          onClick={() => toggleFolder(item.path)}
        >
          {isOpen ? <ChevronDown size={13} className="flex-shrink-0" /> : <ChevronRight size={13} className="flex-shrink-0" />}
          {isOpen ? <FolderOpen size={14} className="text-yellow-400 flex-shrink-0" /> : <Folder size={14} className="text-yellow-400 flex-shrink-0" />}
          <span className="text-sm font-medium truncate flex-1">{item.name}</span>
          <button
            onClick={e => { e.stopPropagation(); onDeleteFolder(item) }}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-red-500 hover:text-red-400 transition-all flex-shrink-0"
            title="删除文件夹"
          >
            <Trash2 size={12} />
          </button>
        </div>
        {isOpen && item.children?.map(child => (
          <TreeNode
            key={child.path}
            item={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            onDeleteFile={onDeleteFile}
            onDeleteFolder={onDeleteFolder}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
          />
        ))}
      </div>
    )
  }

  const isActive = selectedPath === item.path
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer group border-l-2 transition-colors ${
        isActive ? 'bg-purple-600/20 border-purple-500 text-white' : 'border-transparent text-gray-400 hover:bg-gray-700/30 hover:text-gray-200'
      }`}
      style={{ paddingLeft: `${20 + indent}px` }}
      onClick={() => onSelectFile(item)}
    >
      <FileText size={13} className="flex-shrink-0" />
      <span className="text-sm truncate flex-1">{item.name}</span>
      <button
        onClick={e => { e.stopPropagation(); onDeleteFile(item) }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-red-500 hover:text-red-400 transition-all flex-shrink-0"
        title="删除文件"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

export default function DocManagement() {
  const [tree, setTree] = useState<TreeItem[]>([])
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(false)
  const [loadingTree, setLoadingTree] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // 新建文件 modal
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFileFolder, setNewFileFolder] = useState('') // '' = root
  const [creating, setCreating] = useState(false)

  // 新建文件夹 modal
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParent, setNewFolderParent] = useState('')

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ item: TreeItem; type: 'file' | 'dir' } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 重命名/移动 modal
  const [showRename, setShowRename] = useState(false)
  const [renameNewName, setRenameNewName] = useState('')
  const [renameNewFolder, setRenameNewFolder] = useState('')
  const [renaming, setRenaming] = useState(false)

  // 所有文件夹路径（用于下拉选择父文件夹）
  const [allFolders, setAllFolders] = useState<string[]>([])

  useEffect(() => { loadTree() }, [])

  const collectFolders = (items: TreeItem[], acc: string[] = []) => {
    for (const item of items) {
      if (item.type === 'dir') {
        acc.push(item.path)
        if (item.children) collectFolders(item.children, acc)
      }
    }
    return acc
  }

  const loadTree = async () => {
    setLoadingTree(true)
    try {
      const res = await apiFetch('/docs/list')
      const data: TreeItem[] = res.data || []
      setTree(data)
      setAllFolders(collectFolders(data))
    } catch (err: any) {
      toast.error(err.message || '加载文件列表失败')
    } finally {
      setLoadingTree(false)
    }
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const openFile = async (item: TreeItem) => {
    if (loadingFile) return
    setLoadingFile(true)
    setContent('')
    setPreview(false)
    try {
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(item.path)}`)
      setSelectedFile({ name: item.name, path: item.path, sha: res.data.sha })
      setContent(res.data.content)
    } catch (err: any) {
      toast.error(err.message || '加载文件内容失败')
    } finally {
      setLoadingFile(false)
    }
  }

  const saveFile = async () => {
    if (!selectedFile) return
    setSaving(true)
    try {
      await apiFetch('/docs/file', {
        method: 'PUT',
        body: JSON.stringify({ filename: selectedFile.path, content, sha: selectedFile.sha }),
      })
      toast.success('保存成功，GitHub Pages 约1分钟后生效')
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(selectedFile.path)}`)
      setSelectedFile(prev => prev ? { ...prev, sha: res.data.sha } : null)
      await loadTree()
    } catch (err: any) {
      toast.error(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const createFile = async () => {
    let name = newFileName.trim()
    if (!name) return
    if (!name.endsWith('.md')) name += '.md'
    const fullPath = newFileFolder ? `${newFileFolder.replace(/\/$/, '')}/${name}` : name
    setCreating(true)
    try {
      await apiFetch('/docs/file', {
        method: 'PUT',
        body: JSON.stringify({ filename: fullPath, content: `# ${name.replace('.md', '')}\n\n`, sha: null }),
      })
      toast.success('文件创建成功')
      setShowNewFile(false)
      setNewFileName('')
      await loadTree()
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(fullPath)}`)
      setSelectedFile({ name, path: fullPath, sha: res.data.sha })
      setContent(res.data.content)
      if (newFileFolder) setExpandedFolders(prev => new Set(prev).add(newFileFolder.endsWith('/') ? newFileFolder : newFileFolder + '/'))
    } catch (err: any) {
      toast.error(err.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const createFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    const parentPath = newFolderParent ? newFolderParent.replace(/\/$/, '') + '/' : ''
    const placeholder = `${parentPath}${name}/.gitkeep`
    setCreating(true)
    try {
      await apiFetch('/docs/file', {
        method: 'PUT',
        body: JSON.stringify({ filename: placeholder, content: '', sha: null }),
      })
      toast.success('文件夹创建成功')
      setShowNewFolder(false)
      setNewFolderName('')
      await loadTree()
      const folderPath = `${parentPath}${name}/`
      setExpandedFolders(prev => new Set(prev).add(folderPath))
    } catch (err: any) {
      toast.error(err.message || '创建文件夹失败')
    } finally {
      setCreating(false)
    }
  }

  const openRenameModal = () => {
    if (!selectedFile) return
    const basename = selectedFile.name.replace(/\.md$/, '')
    const folder = selectedFile.path.includes('/')
      ? selectedFile.path.split('/').slice(0, -1).join('/') + '/'
      : ''
    setRenameNewName(basename)
    setRenameNewFolder(folder)
    setShowRename(true)
  }

  const doRename = async () => {
    if (!selectedFile || !renameNewName.trim()) return
    let name = renameNewName.trim()
    if (!name.endsWith('.md')) name += '.md'
    const newPath = renameNewFolder
      ? `${renameNewFolder.replace(/\/$/, '')}/${name}`
      : name
    if (newPath === selectedFile.path) { setShowRename(false); return }
    setRenaming(true)
    try {
      // 1. 创建新文件
      await apiFetch('/docs/file', {
        method: 'PUT',
        body: JSON.stringify({ filename: newPath, content, sha: null }),
      })
      // 2. 删除旧文件
      await apiFetch('/docs/file', {
        method: 'DELETE',
        body: JSON.stringify({ filename: selectedFile.path, sha: selectedFile.sha }),
      })
      toast.success('重命名/移动成功')
      setShowRename(false)
      await loadTree()
      // 自动选中新文件
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(newPath)}`)
      setSelectedFile({ name, path: newPath, sha: res.data.sha })
      setContent(res.data.content)
      if (renameNewFolder) setExpandedFolders(prev => new Set(prev).add(
        renameNewFolder.endsWith('/') ? renameNewFolder : renameNewFolder + '/'
      ))
    } catch (err: any) {
      toast.error(err.message || '重命名失败')
    } finally {
      setRenaming(false)
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'file') {
        await apiFetch('/docs/file', {
          method: 'DELETE',
          body: JSON.stringify({ filename: deleteTarget.item.path, sha: deleteTarget.item.sha }),
        })
        if (selectedFile?.path === deleteTarget.item.path) {
          setSelectedFile(null); setContent('')
        }
      } else {
        await apiFetch('/docs/folder', {
          method: 'DELETE',
          body: JSON.stringify({ folderPath: deleteTarget.item.path.replace(/\/$/, '') }),
        })
        if (selectedFile?.path.startsWith(deleteTarget.item.path.replace(/\/$/, '') + '/')) {
          setSelectedFile(null); setContent('')
        }
      }
      toast.success('删除成功')
      setDeleteTarget(null)
      await loadTree()
    } catch (err: any) {
      toast.error(err.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* 左侧文件树 */}
      <aside className="w-64 flex-shrink-0 bg-gray-800/60 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-purple-400" />
            <span className="text-white font-semibold text-sm">官方文档</span>
          </div>
          <div className="flex gap-1">
            <button onClick={loadTree} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors" title="刷新">
              <RefreshCw size={13} />
            </button>
            <button onClick={() => { setNewFileFolder(''); setShowNewFile(true) }} className="p-1.5 text-gray-400 hover:text-purple-400 rounded hover:bg-gray-700 transition-colors" title="新建文件">
              <Plus size={13} />
            </button>
            <button onClick={() => { setNewFolderParent(''); setShowNewFolder(true) }} className="p-1.5 text-gray-400 hover:text-yellow-400 rounded hover:bg-gray-700 transition-colors" title="新建文件夹">
              <FolderPlus size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loadingTree && tree.length === 0 ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
          ) : tree.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">暂无文档，点击 + 新建</div>
          ) : (
            tree.map(item => (
              <TreeNode
                key={item.path}
                item={item}
                depth={0}
                selectedPath={selectedFile?.path || ''}
                onSelectFile={openFile}
                onDeleteFile={item => setDeleteTarget({ item, type: 'file' })}
                onDeleteFolder={item => setDeleteTarget({ item, type: 'dir' })}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            ))
          )}
        </div>
      </aside>

      {/* 右侧编辑区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700 bg-gray-800/30 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            {selectedFile ? (
              <>
                <span className="text-gray-500">{selectedFile.path.includes('/') ? selectedFile.path.split('/').slice(0, -1).join('/') + ' /' : ''}</span>
                <span className="text-white font-semibold">{selectedFile.name}</span>
              </>
            ) : (
              <span className="text-gray-500">← 从左侧选择文档</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedFile && (
              <>
                <button
                  onClick={() => setPreview(!preview)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${preview ? 'bg-purple-600/20 text-purple-300 border border-purple-600/40' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                >
                  {preview ? <Edit3 size={14} /> : <Eye size={14} />}
                  {preview ? '编辑' : '预览'}
                </button>
                <button
                  onClick={openRenameModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  title="重命名 / 移动"
                >
                  <Pencil size={14} />
                  重命名
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

        <div className="flex-1 overflow-hidden">
          {!selectedFile ? (
            <div className="flex items-center justify-center h-full text-gray-600">
              <div className="text-center">
                <FileText size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">从左侧选择文档开始编辑</p>
              </div>
            </div>
          ) : loadingFile ? (
            <div className="flex items-center justify-center h-full"><Loader2 size={32} className="animate-spin text-purple-400" /></div>
          ) : preview ? (
            <div className="h-full overflow-y-auto px-12 py-8">
              <article className="markdown-content max-w-4xl">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>
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

      {/* 重命名/移动 modal */}
      {showRename && selectedFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <h3 className="text-white font-bold text-lg mb-1">重命名 / 移动</h3>
            <p className="text-gray-500 text-xs mb-4">当前：{selectedFile.path}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">新文件名（无需加 .md）</label>
                <input
                  type="text" value={renameNewName} onChange={e => setRenameNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doRename()} autoFocus
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">所在文件夹</label>
                <select
                  value={renameNewFolder}
                  onChange={e => setRenameNewFolder(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">根目录</option>
                  {allFolders.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRename(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
              <button onClick={doRename} disabled={renaming || !renameNewName.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg">
                {renaming ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                {renaming ? '处理中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建文件 modal */}
      {showNewFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <h3 className="text-white font-bold text-lg mb-4">新建文档</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">文件名（无需加 .md）</label>
                <input
                  type="text" value={newFileName} onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createFile()} autoFocus
                  placeholder="如：基础战术"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              {allFolders.length > 0 && (
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">所在文件夹</label>
                  <select
                    value={newFileFolder}
                    onChange={e => setNewFileFolder(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">根目录</option>
                    {allFolders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowNewFile(false); setNewFileName('') }} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
              <button onClick={createFile} disabled={creating || !newFileName.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建文件夹 modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <h3 className="text-white font-bold text-lg mb-4">新建文件夹</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">文件夹名称</label>
                <input
                  type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createFolder()} autoFocus
                  placeholder="如：战术教程"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              {allFolders.length > 0 && (
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">父文件夹</label>
                  <select
                    value={newFolderParent}
                    onChange={e => setNewFolderParent(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">根目录</option>
                    {allFolders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
              <button onClick={createFolder} disabled={creating || !newFolderName.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <AlertCircle className="text-red-400" size={22} />
              <h3 className="text-white font-bold text-lg">确认删除</h3>
            </div>
            <p className="text-gray-400 text-sm mb-5">
              确定删除{deleteTarget.type === 'dir' ? '文件夹' : '文件'}{' '}
              <span className="text-white font-medium">{deleteTarget.item.name}</span>
              {deleteTarget.type === 'dir' && ' 及其所有内容'}？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
              <button onClick={doDelete} disabled={deleting} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg">
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
