import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import PageSkeleton from '../../components/Skeleton'
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
  Search,
  Filter,
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
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [accessMode, setAccessMode] = useState<AccessMode>('student_readonly')
  const [createAssignees, setCreateAssignees] = useState<number[]>([])
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const [copySource, setCopySource] = useState<WorkbookItem | null>(null)
  const [copyTitle, setCopyTitle] = useState('')
  const [copyMode, setCopyMode] = useState<AccessMode>('assigned')
  const [copyAssignees, setCopyAssignees] = useState<number[]>([])
  const [copyStatus, setCopyStatus] = useState<'draft' | 'published'>('draft')
  const [copying, setCopying] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | WorkbookItem['status']>('all')
  const [modeFilter, setModeFilter] = useState<'all' | AccessMode>('all')

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return list.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (modeFilter !== 'all' && item.access_mode !== modeFilter) return false
      if (!q) return true
      const hay = [item.title, item.description, item.updated_by || '', String(item.id)]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [list, searchQuery, statusFilter, modeFilter])

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (modeFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setStatusFilter('all')
    setModeFilter('all')
  }

  const openCreate = () => {
    setTitle('')
    setDescription('')
    setAccessMode('student_readonly')
    setCreateAssignees([])
    setShowCreate(true)
  }

  const closeCreate = () => {
    if (creating) return
    setShowCreate(false)
  }

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
    if (accessMode === 'assigned' && createAssignees.length === 0) {
      toast.error('请至少选择一名可填写学员')
      return
    }
    try {
      setCreating(true)
      const res = await sheetAPI.create({
        title: title.trim(),
        description: description.trim(),
        access_mode: accessMode,
        status: 'draft',
        assignee_ids: accessMode === 'assigned' ? createAssignees : [],
      })
      toast.success('已创建')
      setShowCreate(false)
      setTitle('')
      setDescription('')
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Table2 className="text-purple-400" size={26} />
            表格文档
          </h1>
          {!loading && (
            <span className="text-sm text-gray-400 tabular-nums">
              {searchQuery.trim() || activeFilterCount > 0
                ? `显示 ${filteredList.length} / ${list.length}`
                : `共 ${list.length} 份`}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、说明、更新人…"
              className="bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-gray-400 w-full sm:w-64 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Filter size={18} />
            筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={18} />
            新建表格
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">筛选条件</h3>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                清空筛选
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-2">状态</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', '全部'],
                    ['draft', '草稿'],
                    ['published', '已发布'],
                    ['archived', '已归档'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      statusFilter === value
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-2">权限</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', '全部'],
                    ['shared', '共享编辑'],
                    ['student_readonly', '学员只读'],
                    ['assigned', '指定学员'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setModeFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      modeFilter === value
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : list.length === 0 ? (
        <div className="student-glass-panel student-glass-panel--static py-16 px-6 text-center">
          <FileSpreadsheet className="mx-auto text-gray-600 mb-3" size={36} />
          <p className="text-gray-400 text-sm">还没有表格</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm"
          >
            <Plus size={16} />
            新建第一份表格
          </button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="student-glass-panel student-glass-panel--static py-14 px-6 text-center">
          <Search className="mx-auto text-gray-600 mb-3" size={32} />
          <p className="text-gray-400 text-sm">没有符合条件的表格</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              clearFilters()
            }}
            className="mt-3 text-xs text-purple-300 hover:text-purple-200"
          >
            清空搜索与筛选
          </button>
        </div>
      ) : (
        <ul className="student-glass-panel student-glass-panel--static overflow-hidden divide-y divide-white/[0.06]">
          {filteredList.map((item) => (
            <li key={item.id} className="group">
              <div className="flex">
                <div
                  className={`w-0.5 shrink-0 ${
                    item.status === 'published' ? 'bg-emerald-500/70' : 'bg-transparent'
                  }`}
                />
                <div className="flex-1 min-w-0 px-3.5 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 hover:bg-white/[0.02] transition-colors">
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
                    <div className="text-[11px] text-gray-500 mt-1">
                      更新 {formatDateTime(item.updated_at)}
                      {item.updated_by ? ` · ${item.updated_by}` : ''}
                    </div>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/sheets/${item.id}?mode=view`)}
                      title="查看"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:bg-white/8 hover:text-gray-200"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/sheets/${item.id}`)}
                      title="编辑"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-violet-300 hover:bg-violet-500/20"
                    >
                      <Edit size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openCopy(item)}
                      title="复制并指定学员"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-sky-300 hover:bg-sky-500/20"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(item.id)}
                      title="删除"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-red-300/80 hover:bg-red-600/20"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

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

      {showCreate &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            onClick={closeCreate}
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
                      <Plus size={18} className="text-purple-300" /> 新建表格
                    </h2>
                    <button
                      type="button"
                      onClick={closeCreate}
                      disabled={creating}
                      className="text-gray-400 hover:text-white"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4 max-h-[min(70vh,560px)] overflow-y-auto">
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-gray-400">标题</span>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="例如：本周值班表"
                        className="student-glass-field"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && accessMode !== 'assigned') create()
                        }}
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-gray-400">
                        备注 <span className="text-gray-600">（可选）</span>
                      </span>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="简要说明用途、填写要求等"
                        rows={3}
                        className="student-glass-field resize-y min-h-[4.5rem]"
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-gray-400">权限</span>
                      <StyledSelect
                        value={accessMode}
                        onChange={(v) => setAccessMode(v as AccessMode)}
                        options={ACCESS_MODE_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                      />
                    </label>
                    {accessMode === 'assigned' && (
                      <SheetAssigneePicker
                        selectedIds={createAssignees}
                        onChange={setCreateAssignees}
                        disabled={creating}
                      />
                    )}
                  </div>

                  <div className="px-5 py-4 border-t border-white/10 flex gap-3">
                    <button
                      type="button"
                      onClick={closeCreate}
                      disabled={creating}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={create}
                      disabled={creating}
                      className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      创建并打开
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
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
