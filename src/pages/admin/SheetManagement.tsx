import { useEffect, useMemo, useRef, useState } from 'react'
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
  Pin,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { sheetAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDate, formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'
import StyledSelect from '../../components/StyledSelect'
import DateInput from '../../components/DateInput'
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
  is_pinned?: boolean
  sort_order?: number
  updated_by?: string | null
  updated_at?: string
  created_at?: string
  assignee_count?: number
}

type SortMode = 'manual' | 'updated_desc' | 'updated_asc' | 'created_desc' | 'created_asc'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '自定义（置顶 + 手动）' },
  { value: 'updated_desc', label: '最近编辑优先' },
  { value: 'updated_asc', label: '最早编辑优先' },
  { value: 'created_desc', label: '最近创建优先' },
  { value: 'created_asc', label: '最早创建优先' },
]

function toDayKey(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timeOf(iso?: string | null) {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

function sortWorkbookList(items: WorkbookItem[], mode: SortMode) {
  const arr = [...items]
  if (mode === 'manual') {
    return arr.sort((a, b) => {
      const ap = a.is_pinned ? 1 : 0
      const bp = b.is_pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      const ao = a.sort_order ?? 0
      const bo = b.sort_order ?? 0
      if (ao !== bo) return ao - bo
      return timeOf(b.updated_at) - timeOf(a.updated_at)
    })
  }
  return arr.sort((a, b) => {
    if (mode === 'updated_desc') return timeOf(b.updated_at) - timeOf(a.updated_at)
    if (mode === 'updated_asc') return timeOf(a.updated_at) - timeOf(b.updated_at)
    if (mode === 'created_desc') return timeOf(b.created_at) - timeOf(a.created_at)
    return timeOf(a.created_at) - timeOf(b.created_at)
  })
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
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('manual')
  const [reordering, setReordering] = useState(false)
  const [pinBusyId, setPinBusyId] = useState<number | null>(null)
  const dragIdRef = useRef<number | null>(null)

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = list.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (modeFilter !== 'all' && item.access_mode !== modeFilter) return false
      const day = toDayKey(item.created_at)
      if (createdFrom && (!day || day < createdFrom)) return false
      if (createdTo && (!day || day > createdTo)) return false
      if (!q) return true
      const hay = [item.title, item.description, item.updated_by || '', String(item.id)]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    return sortWorkbookList(filtered, sortMode)
  }, [list, searchQuery, statusFilter, modeFilter, createdFrom, createdTo, sortMode])

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (modeFilter !== 'all' ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0)

  const clearFilters = () => {
    setStatusFilter('all')
    setModeFilter('all')
    setCreatedFrom('')
    setCreatedTo('')
  }

  const persistManualOrder = async (ordered: WorkbookItem[]) => {
    const ids = ordered.map((x) => x.id)
    setList((prev) => {
      const map = new Map(ordered.map((x, i) => [x.id, i]))
      return sortWorkbookList(
        prev.map((x) =>
          map.has(x.id) ? { ...x, sort_order: map.get(x.id)! } : x
        ),
        'manual'
      )
    })
    try {
      setReordering(true)
      await sheetAPI.reorder(ids)
    } catch (e: any) {
      toast.error(e.message || '保存排序失败')
      load()
    } finally {
      setReordering(false)
    }
  }

  const canMoveItem = (id: number, dir: -1 | 1) => {
    const ordered = sortWorkbookList(list, 'manual')
    const idx = ordered.findIndex((x) => x.id === id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= ordered.length) return false
    return !!ordered[idx].is_pinned === !!ordered[j].is_pinned
  }

  const moveItem = async (id: number, dir: -1 | 1) => {
    if (sortMode !== 'manual' || reordering) return
    if (!canMoveItem(id, dir)) {
      toast.info('置顶与非置顶请分别排序')
      return
    }
    const ordered = sortWorkbookList(list, 'manual')
    const idx = ordered.findIndex((x) => x.id === id)
    const j = idx + dir
    const next = [...ordered]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    await persistManualOrder(next)
  }

  const onDragStart = (id: number) => {
    if (sortMode !== 'manual') return
    dragIdRef.current = id
  }

  const onDropOn = async (targetId: number) => {
    if (sortMode !== 'manual' || reordering) return
    const fromId = dragIdRef.current
    dragIdRef.current = null
    if (fromId == null || fromId === targetId) return
    const ordered = sortWorkbookList(list, 'manual')
    const fromIdx = ordered.findIndex((x) => x.id === fromId)
    const toIdx = ordered.findIndex((x) => x.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    if (!!ordered[fromIdx].is_pinned !== !!ordered[toIdx].is_pinned) {
      toast.info('置顶与非置顶请分别排序')
      return
    }
    const next = [...ordered]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    await persistManualOrder(next)
  }

  const togglePin = async (item: WorkbookItem) => {
    try {
      setPinBusyId(item.id)
      const res = await sheetAPI.pin(item.id, !item.is_pinned)
      const pinned = !!res.data?.is_pinned
      setList((prev) =>
        sortWorkbookList(
          prev.map((x) => (x.id === item.id ? { ...x, is_pinned: pinned } : x)),
          sortMode === 'manual' ? 'manual' : sortMode
        )
      )
      toast.success(pinned ? '已置顶' : '已取消置顶')
      if (sortMode !== 'manual') setSortMode('manual')
    } catch (e: any) {
      toast.error(e.message || '置顶失败')
    } finally {
      setPinBusyId(null)
    }
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
      <header className="mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/20">
                <Table2 className="text-emerald-300" size={22} />
              </span>
              表格文档
            </h1>
            <p className="text-sm text-gray-400 mt-2">
              管理共享表格 · 支持置顶与手动排序
              {!loading && (
                <span className="text-gray-500">
                  {' '}
                  ·{' '}
                  {searchQuery.trim() || activeFilterCount > 0
                    ? `显示 ${filteredList.length} / ${list.length}`
                    : `共 ${list.length} 份`}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="self-start lg:self-auto bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20"
          >
            <Plus size={18} />
            新建表格
          </button>
        </div>
      </header>

      <div className="student-glass-panel student-glass-panel--tilt-only p-3 sm:p-4 mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
          <div className="relative flex-1 min-w-[12rem]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、说明、更新人…"
              className="w-full bg-black/25 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-[12rem] sm:min-w-[14rem]">
            <ArrowUpDown size={14} className="text-gray-500 shrink-0 hidden sm:block" />
            <StyledSelect
              value={sortMode}
              onChange={(v) => setSortMode(v as SortMode)}
              options={SORT_OPTIONS}
              size="sm"
              className="flex-1"
              dropdownMinWidth={200}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`px-3.5 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors border ${
              showFilters || activeFilterCount > 0
                ? 'bg-emerald-600/90 border-emerald-400/30 text-white'
                : 'bg-black/25 border-white/10 text-gray-300 hover:bg-white/5'
            }`}
          >
            <Filter size={16} />
            筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
          </button>
        </div>

        {showFilters && (
          <div className="rounded-xl border border-white/8 bg-black/20 p-3.5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white/90 font-medium text-sm">筛选条件</h3>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  清空筛选
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-2">状态</div>
                <div className="flex flex-wrap gap-1.5">
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
                      className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                        statusFilter === value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-2">权限</div>
                <div className="flex flex-wrap gap-1.5">
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
                      className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                        modeFilter === value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-gray-500 mb-2">创建日期</div>
                <div className="flex flex-wrap items-end gap-2">
                  <DateInput
                    label="起始"
                    value={createdFrom}
                    onChange={setCreatedFrom}
                    max={createdTo || undefined}
                    size="sm"
                    className="min-w-[9.5rem]"
                  />
                  <span className="text-gray-500 text-sm pb-2">至</span>
                  <DateInput
                    label="结束"
                    value={createdTo}
                    onChange={setCreatedTo}
                    min={createdFrom || undefined}
                    size="sm"
                    className="min-w-[9.5rem]"
                  />
                  {(createdFrom || createdTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedFrom('')
                        setCreatedTo('')
                      }}
                      className="text-xs text-gray-400 hover:text-white pb-2.5"
                    >
                      清除日期
                    </button>
                  )}
                </div>
              </div>
            </div>
            {sortMode === 'manual' && (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                自定义排序：右侧可拖拽或上下调整；置顶与非置顶分区排序。学员端同步此顺序。
              </p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : list.length === 0 ? (
        <div className="student-glass-panel student-glass-panel--tilt-only py-16 px-6 text-center">
          <FileSpreadsheet className="mx-auto text-gray-600 mb-3" size={36} />
          <p className="text-gray-400 text-sm">还没有表格</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
          >
            <Plus size={16} />
            新建第一份表格
          </button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="student-glass-panel student-glass-panel--tilt-only py-14 px-6 text-center">
          <Search className="mx-auto text-gray-600 mb-3" size={32} />
          <p className="text-gray-400 text-sm">没有符合条件的表格</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              clearFilters()
            }}
            className="mt-3 text-xs text-emerald-300 hover:text-emerald-200"
          >
            清空搜索与筛选
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredList.map((item) => (
            <li
              key={item.id}
              className="student-glass-panel student-glass-panel--tilt-only overflow-hidden"
              draggable={sortMode === 'manual' && !reordering}
              onDragStart={() => onDragStart(item.id)}
              onDragOver={(e) => {
                if (sortMode === 'manual') e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                void onDropOn(item.id)
              }}
            >
              <div className="flex">
                <div
                  className={`w-1 shrink-0 ${
                    item.is_pinned
                      ? 'bg-amber-400/80'
                      : item.status === 'published'
                        ? 'bg-emerald-500/70'
                        : 'bg-white/10'
                  }`}
                />
                <div className="flex-1 min-w-0 px-3.5 sm:px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/sheets/${item.id}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white truncate">
                        {item.title}
                      </span>
                      {item.is_pinned && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-amber-500/20 text-amber-200 inline-flex items-center gap-0.5">
                          <Pin size={10} /> 置顶
                        </span>
                      )}
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
                    <div className="text-[11px] text-gray-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>创建 {formatDate(item.created_at)}</span>
                      <span>
                        更新 {formatDateTime(item.updated_at)}
                        {item.updated_by ? ` · ${item.updated_by}` : ''}
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center justify-end gap-0.5 shrink-0 border-t border-white/[0.06] sm:border-t-0 pt-2 sm:pt-0">
                    <button
                      type="button"
                      disabled={pinBusyId === item.id}
                      onClick={() => void togglePin(item)}
                      title={item.is_pinned ? '取消置顶' : '置顶'}
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-lg ${
                        item.is_pinned
                          ? 'text-amber-300 hover:bg-amber-500/20'
                          : 'text-gray-400 hover:bg-white/8 hover:text-amber-200'
                      }`}
                    >
                      {pinBusyId === item.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Pin size={15} className={item.is_pinned ? 'fill-current' : ''} />
                      )}
                    </button>
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
                    {sortMode === 'manual' && (
                      <>
                        <span className="w-px h-5 bg-white/10 mx-1" />
                        <button
                          type="button"
                          disabled={reordering || !canMoveItem(item.id, -1)}
                          onClick={() => void moveItem(item.id, -1)}
                          title="上移"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-white/8 disabled:opacity-25"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={reordering || !canMoveItem(item.id, 1)}
                          onClick={() => void moveItem(item.id, 1)}
                          title="下移"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-white/8 disabled:opacity-25"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 cursor-grab active:cursor-grabbing hover:bg-white/8"
                          title="拖拽排序"
                        >
                          <GripVertical size={15} />
                        </span>
                      </>
                    )}
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
