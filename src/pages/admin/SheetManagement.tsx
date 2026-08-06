import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Table2,
  Loader2,
  Trash2,
  Edit,
  Eye,
  Share2,
  Lock,
  FileSpreadsheet,
  Copy,
  Users,
  X,
} from 'lucide-react'
import { sheetAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'
import StyledSelect from '../../components/StyledSelect'
import SheetAssigneePicker, {
  ACCESS_MODE_OPTIONS,
  type AccessMode,
} from '../../components/SheetAssigneePicker'

interface WorkbookItem {
  id: number
  title: string
  description: string
  access_mode: AccessMode
  status: 'draft' | 'published' | 'archived'
  updated_by?: string | null
  updated_at?: string
  created_at?: string
  assignee_count?: number
}

const MODE_LABEL: Record<AccessMode, string> = {
  shared: '共享编辑',
  student_readonly: '学员只读',
  assigned: '指定学员',
}

const STATUS_LABEL = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
} as const

function modeBadgeClass(mode: AccessMode) {
  if (mode === 'shared') return 'bg-blue-500/20 text-blue-300'
  if (mode === 'assigned') return 'bg-sky-500/20 text-sky-300'
  return 'bg-amber-500/20 text-amber-300'
}

function ModeIcon({ mode }: { mode: AccessMode }) {
  if (mode === 'shared') return <Share2 size={10} />
  if (mode === 'assigned') return <Users size={10} />
  return <Lock size={10} />
}

export default function SheetManagement() {
  const navigate = useNavigate()
  const [list, setList] = useState<WorkbookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [accessMode, setAccessMode] = useState<AccessMode>('student_readonly')
  const [createAssignees, setCreateAssignees] = useState<number[]>([])
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const [copySource, setCopySource] = useState<WorkbookItem | null>(null)
  const [copyTitle, setCopyTitle] = useState('')
  const [copyMode, setCopyMode] = useState<AccessMode>('assigned')
  const [copyAssignees, setCopyAssignees] = useState<number[]>([])
  const [copyStatus, setCopyStatus] = useState<'draft' | 'published'>('draft')
  const [copying, setCopying] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await sheetAPI.list()
      setList(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!title.trim()) {
      toast.error('请填写标题')
      return
    }
    try {
      setCreating(true)
      const res = await sheetAPI.create({
        title: title.trim(),
        access_mode: accessMode,
        status: 'draft',
        assignee_ids: accessMode === 'assigned' ? createAssignees : [],
      })
      toast.success('已创建')
      setTitle('')
      setCreateAssignees([])
      navigate(`/admin/sheets/${res.data.id}`)
    } catch (e: any) {
      toast.error(e.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const openCopy = (item: WorkbookItem) => {
    setCopySource(item)
    setCopyTitle(`${item.title}（副本）`)
    setCopyMode('assigned')
    setCopyAssignees([])
    setCopyStatus('draft')
  }

  const submitCopy = async () => {
    if (!copySource) return
    const nextTitle = copyTitle.trim()
    if (!nextTitle) {
      toast.error('请填写标题')
      return
    }
    if (copyMode === 'assigned' && copyAssignees.length === 0) {
      toast.error('请至少选择一名可填写学员')
      return
    }
    try {
      setCopying(true)
      const res = await sheetAPI.copy(copySource.id, {
        title: nextTitle,
        access_mode: copyMode,
        status: copyStatus,
        assignee_ids: copyMode === 'assigned' ? copyAssignees : [],
      })
      toast.success('已复制')
      setCopySource(null)
      navigate(`/admin/sheets/${res.data.id}`)
    } catch (e: any) {
      toast.error(e.message || '复制失败')
    } finally {
      setCopying(false)
    }
  }

  const remove = async () => {
    if (deleteId == null) return
    try {
      await sheetAPI.delete(deleteId)
      toast.success('已删除')
      setDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Table2 className="text-purple-400" size={26} />
              表格文档
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              在线协作表格 · 可复制模板并指定学员填写
            </p>
          </div>
          {!loading && (
            <span className="text-xs text-gray-500 tabular-nums">{list.length} 份表格</span>
          )}
        </header>

        <section className="student-glass-panel student-glass-panel--static overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
            <Plus size={14} className="text-emerald-400" />
            <h2 className="text-sm font-medium text-white">新建表格</h2>
          </div>
          <div className="p-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-gray-400">标题</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：本周值班表"
                className="student-glass-field"
                onKeyDown={(e) => e.key === 'Enter' && accessMode !== 'assigned' && create()}
              />
            </label>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="block space-y-1.5 sm:w-64 shrink-0">
                <span className="text-xs text-gray-400">权限</span>
                <StyledSelect
                  value={accessMode}
                  onChange={(v) => setAccessMode(v as AccessMode)}
                  options={ACCESS_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </label>
              <button
                onClick={create}
                disabled={creating}
                className="inline-flex items-center justify-center gap-2 h-[42px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 sm:ml-auto"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                创建
              </button>
            </div>
            {accessMode === 'assigned' && (
              <SheetAssigneePicker selectedIds={createAssignees} onChange={setCreateAssignees} />
            )}
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-20 text-gray-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="student-glass-panel student-glass-panel--static py-16 px-6 text-center">
            <FileSpreadsheet className="mx-auto text-gray-600 mb-3" size={36} />
            <p className="text-gray-400 text-sm">还没有表格</p>
            <p className="text-gray-600 text-xs mt-1">在上方填写标题后创建第一份</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {list.map((item) => (
              <li
                key={item.id}
                className="student-glass-panel student-glass-panel--static group overflow-hidden"
              >
                <div className="flex gap-0">
                  <div
                    className={`w-1 shrink-0 ${
                      item.status === 'published' ? 'bg-emerald-500/70' : 'bg-gray-600/60'
                    }`}
                  />
                  <div className="flex-1 min-w-0 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/sheets/${item.id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white group-hover:text-emerald-100 transition-colors truncate">
                          {item.title}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            item.status === 'published'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-gray-600/40 text-gray-300'
                          }`}
                        >
                          {STATUS_LABEL[item.status] || item.status}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 shrink-0 ${modeBadgeClass(
                            item.access_mode
                          )}`}
                        >
                          <ModeIcon mode={item.access_mode} />
                          {MODE_LABEL[item.access_mode] || item.access_mode}
                          {item.access_mode === 'assigned' && item.assignee_count != null
                            ? ` · ${item.assignee_count}人`
                            : ''}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-400 mt-1 line-clamp-1">{item.description}</p>
                      )}
                      <div className="text-[11px] text-gray-500 mt-1.5">
                        更新 {formatDateTime(item.updated_at)}
                        {item.updated_by ? ` · ${item.updated_by}` : ''}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0 sm:opacity-80 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/sheets/${item.id}?mode=view`)}
                        title="查看"
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs"
                      >
                        <Eye size={14} />
                        <span className="sm:inline">查看</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/sheets/${item.id}`)}
                        title="编辑"
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-violet-600/70 hover:bg-violet-500 text-white text-xs"
                      >
                        <Edit size={14} />
                        <span className="sm:inline">编辑</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openCopy(item)}
                        title="复制并指定学员"
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-sky-600/70 hover:bg-sky-500 text-white text-xs"
                      >
                        <Copy size={14} />
                        <span className="sm:inline">复制</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(item.id)}
                        title="删除"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-red-600/10 hover:bg-red-600/25 text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {deleteId != null && (
        <ConfirmDialog
          title="删除表格"
          message="确定删除该表格？删除后学员将无法再访问。"
          confirmText="删除"
          type="danger"
          onConfirm={remove}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {copySource &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            onClick={() => !copying && setCopySource(null)}
          >
            <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
            <div
              className="relative z-10 glass-modal-frame w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="glass-modal-tilt">
                <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Copy size={18} className="text-sky-300" /> 复制表格
                    </h2>
                    <button
                      type="button"
                      onClick={() => setCopySource(null)}
                      disabled={copying}
                      className="text-gray-400 hover:text-white"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4 max-h-[min(70vh,560px)] overflow-y-auto">
                    <p className="text-xs text-gray-500">
                      源表：{copySource.title} · 复制内容，不复制编辑历史
                    </p>
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-gray-400">新标题</span>
                      <input
                        value={copyTitle}
                        onChange={(e) => setCopyTitle(e.target.value)}
                        className="student-glass-field"
                        autoFocus
                      />
                    </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-gray-400">权限</span>
                        <StyledSelect
                          value={copyMode}
                          onChange={(v) => setCopyMode(v as AccessMode)}
                          options={ACCESS_MODE_OPTIONS.map((o) => ({
                            value: o.value,
                            label: o.label,
                          }))}
                        />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-gray-400">状态</span>
                        <StyledSelect
                          value={copyStatus}
                          onChange={(v) => setCopyStatus(v as 'draft' | 'published')}
                          options={[
                            { value: 'draft', label: '草稿' },
                            { value: 'published', label: '已发布' },
                          ]}
                        />
                      </label>
                    </div>
                    {copyMode === 'assigned' && (
                      <SheetAssigneePicker
                        selectedIds={copyAssignees}
                        onChange={setCopyAssignees}
                        disabled={copying}
                      />
                    )}
                  </div>

                  <div className="px-5 py-4 border-t border-white/10 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setCopySource(null)}
                      disabled={copying}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={submitCopy}
                      disabled={copying}
                      className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {copying ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                      复制并打开
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
