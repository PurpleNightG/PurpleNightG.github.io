import { useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import {
  FileText, FolderOpen, Folder, Plus, Trash2, Save,
  Eye, Edit3, Loader2, RefreshCw, AlertCircle, ChevronRight, ChevronDown, FolderPlus, Pencil, Type
} from 'lucide-react'
import { toast } from '../../utils/toast'
import RichEditor from '../../components/RichEditor'

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

// --- 树转换工具 ---

function flattenTree(items: TreeItem[]): TreeItem[] {
  const files: TreeItem[] = []
  for (const item of items) {
    if (item.type === 'file') files.push(item)
    else if (item.type === 'dir' && item.children) files.push(...flattenTree(item.children))
  }
  return files
}

function buildTreeFromFlat(files: TreeItem[]): TreeItem[] {
  const root: TreeItem[] = []
  const dirMap = new Map<string, TreeItem>()

  const ensureDir = (parts: string[]): TreeItem => {
    const fullPath = parts.join('/') + '/'
    if (dirMap.has(fullPath)) return dirMap.get(fullPath)!
    const node: TreeItem = { name: parts[parts.length - 1], path: fullPath, type: 'dir', children: [] }
    dirMap.set(fullPath, node)
    if (parts.length === 1) {
      root.push(node)
    } else {
      const parent = ensureDir(parts.slice(0, -1))
      parent.children!.push(node)
    }
    return node
  }

  for (const file of files) {
    const parts = file.path.split('/')
    if (parts.length === 1) {
      root.push(file)
    } else {
      const dir = ensureDir(parts.slice(0, -1))
      dir.children!.push(file)
    }
  }

  const sortLevel = (items: TreeItem[]) => {
    items.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1
      if (a.type !== 'dir' && b.type === 'dir') return 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
    items.forEach(item => { if (item.children) sortLevel(item.children) })
  }
  sortLevel(root)
  return root
}

// Collect all dir nodes (path → TreeItem) from a tree
function collectDirs(items: TreeItem[], out: Map<string, TreeItem> = new Map()): Map<string, TreeItem> {
  for (const item of items) {
    if (item.type === 'dir') {
      out.set(item.path, item)
      if (item.children) collectDirs(item.children, out)
    }
  }
  return out
}

function applyPendingRenames(
  tree: TreeItem[],
  pendingRenames: Map<string, { newPath: string; sha: string }>
): TreeItem[] {
  if (pendingRenames.size === 0) return tree
  const files = flattenTree(tree).map(file => {
    const pending = pendingRenames.get(file.path)
    if (pending) {
      const newName = pending.newPath.split('/').pop()!
      return { ...file, path: pending.newPath, name: newName }
    }
    return file
  })
  const rebuilt = buildTreeFromFlat(files)

  // Graft back any empty dirs that existed in the original tree but got lost
  // because buildTreeFromFlat only creates dirs that contain files.
  const existingDirPaths = new Set<string>()
  collectDirs(rebuilt).forEach((_, p) => existingDirPaths.add(p))

  const insertDir = (nodes: TreeItem[], dirPath: string, dirNode: TreeItem) => {
    const parts = dirPath.replace(/\/$/, '').split('/')
    if (parts.length === 1) {
      if (!nodes.some(n => n.type === 'dir' && n.path === dirPath)) {
        nodes.push({ ...dirNode, children: [] })
        nodes.sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1
          if (a.type !== 'dir' && b.type === 'dir') return 1
          return a.name.localeCompare(b.name, 'zh-CN')
        })
      }
      return
    }
    const parentPath = parts.slice(0, -1).join('/') + '/'
    const parent = nodes.find(n => n.type === 'dir' && n.path === parentPath)
    if (parent?.children) insertDir(parent.children, dirPath, dirNode)
  }

  collectDirs(tree).forEach((dirNode, path) => {
    if (!existingDirPaths.has(path)) insertDir(rebuilt, path, dirNode)
  })

  return rebuilt
}

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
  const [editorMode, setEditorMode] = useState<'md' | 'rich' | 'preview'>('md')
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

  // 待提交队列: repoPath -> { newPath, sha }
  const [pendingRenames, setPendingRenames] = useState<Map<string, { newPath: string; sha: string }>>(new Map())
  const [submitting, setSubmitting] = useState(false)

  const displayTree = useMemo(
    () => applyPendingRenames(tree, pendingRenames),
    [tree, pendingRenames]
  )

  const allFolders = useMemo(() => {
    const acc = new Set<string>()
    const collect = (items: TreeItem[]) => {
      for (const item of items) {
        if (item.type === 'dir') { acc.add(item.path); if (item.children) collect(item.children) }
      }
    }
    collect(displayTree)  // folders visible after pending renames
    collect(tree)         // also keep original tree folders (e.g. empty ones lost from displayTree)
    return Array.from(acc).sort()
  }, [displayTree, tree])

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
    setEditorMode('md')
    // item.path may be the preview (new) path from displayTree; resolve to real GitHub path
    const realPath = originalPath(item.path)
    try {
      const res = await apiFetch(`/docs/file?filename=${encodeURIComponent(realPath)}`)
      setSelectedFile({ name: item.name, path: realPath, sha: res.data.sha })
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

  // 获取文件的有效路径（考虑待提交队列中的重命名）
  const effectivePath = (repoPath: string) =>
    pendingRenames.get(repoPath)?.newPath ?? repoPath

  // 反向查找：给定 displayTree 中的预览路径，返回 GitHub 上的实际原始路径
  const originalPath = (displayPath: string): string => {
    for (const [orig, { newPath }] of pendingRenames) {
      if (newPath === displayPath) return orig
    }
    return displayPath
  }

  const openRenameModal = () => {
    if (!selectedFile) return
    const eff = effectivePath(selectedFile.path)
    const basename = eff.split('/').pop()!.replace(/\.md$/, '')
    const folder = eff.includes('/')
      ? eff.split('/').slice(0, -1).join('/') + '/'
      : ''
    setRenameNewName(basename)
    setRenameNewFolder(folder)
    setShowRename(true)
  }

  // 加入待提交队列，不立即调 API
  const doRename = () => {
    if (!selectedFile || !renameNewName.trim()) return
    let name = renameNewName.trim()
    if (!name.endsWith('.md')) name += '.md'
    const newPath = renameNewFolder
      ? `${renameNewFolder.replace(/\/$/, '')}/${name}`
      : name
    setPendingRenames(prev => {
      const next = new Map(prev)
      if (newPath === selectedFile.path) {
        next.delete(selectedFile.path)  // 还原成原路径则取消
      } else {
        next.set(selectedFile.path, { newPath, sha: selectedFile.sha })
      }
      return next
    })
    setShowRename(false)
    toast.success(`已加入待提交队列：${selectedFile.path} → ${newPath}`)
  }

  const submitAllRenames = async () => {
    if (pendingRenames.size === 0) return
    setSubmitting(true)
    try {
      const operations = Array.from(pendingRenames.entries()).map(([oldPath, { newPath, sha }]) => ({
        oldPath, newPath, sha
      }))
      const res = await apiFetch('/docs/batch-rename', {
        method: 'POST',
        body: JSON.stringify({ operations }),
      })
      toast.success(res.message || '批量提交成功')
      setPendingRenames(new Map())
      if (selectedFile && pendingRenames.has(selectedFile.path)) {
        setSelectedFile(null); setContent('')
      }
      await loadTree()
    } catch (err: any) {
      toast.error(err.message || '批量提交失败')
    } finally {
      setSubmitting(false)
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

        {/* 待提交队列面板 */}
        {pendingRenames.size > 0 && (
          <div className="border-t border-gray-700 bg-gray-900/60 flex-shrink-0">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-yellow-400 text-xs font-semibold">待提交 ({pendingRenames.size})</span>
              <button onClick={() => setPendingRenames(new Map())} className="text-gray-500 hover:text-red-400 text-xs transition-colors">清空</button>
            </div>
            <div className="max-h-32 overflow-y-auto px-3 pb-1 space-y-1">
              {Array.from(pendingRenames.entries()).map(([oldPath, { newPath }]) => (
                <div key={oldPath} className="flex items-start gap-1 text-xs">
                  <button
                    onClick={() => setPendingRenames(prev => { const n = new Map(prev); n.delete(oldPath); return n })}
                    className="text-red-500 hover:text-red-400 flex-shrink-0 mt-0.5"
                  >✕</button>
                  <span className="text-gray-500 truncate">{oldPath}</span>
                  <span className="text-gray-600 flex-shrink-0">→</span>
                  <span className="text-gray-300 truncate">{newPath}</span>
                </div>
              ))}
            </div>
            <div className="px-3 pb-2">
              <button
                onClick={submitAllRenames}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
                {submitting ? '提交中...' : `提交全部 (${pendingRenames.size})`}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {loadingTree && tree.length === 0 ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
          ) : tree.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">暂无文档，点击 + 新建</div>
          ) : (
            displayTree.map(item => (
              <TreeNode
                key={item.path}
                item={item}
                depth={0}
                selectedPath={selectedFile ? (pendingRenames.get(selectedFile.path)?.newPath ?? selectedFile.path) : ''}
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
                {/* 编辑模式切换 */}
                <div className="flex items-center rounded border border-gray-700 overflow-hidden text-xs">
                  <button onClick={() => setEditorMode('md')} className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${editorMode === 'md' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`} title="Markdown 模式">
                    <Edit3 size={13} /> MD
                  </button>
                  <button onClick={() => setEditorMode('rich')} className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${editorMode === 'rich' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`} title="富文本模式">
                    <Type size={13} /> 富文本
                  </button>
                  <button onClick={() => setEditorMode('preview')} className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${editorMode === 'preview' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`} title="预览">
                    <Eye size={13} /> 预览
                  </button>
                </div>
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
          ) : editorMode === 'preview' ? (
            <div className="h-full overflow-y-auto px-12 py-8">
              <article className="markdown-content max-w-4xl">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>
              </article>
            </div>
          ) : editorMode === 'rich' ? (
            <RichEditor value={content} onChange={setContent} />
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
              <button onClick={doRename} disabled={!renameNewName.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg">
                <Pencil size={14} />
                加入队列
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
