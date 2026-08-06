import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Save,
  Share2,
  Lock,
  Edit,
  Eye,
  Settings2,
  X,
  History,
  Users,
} from 'lucide-react'
import { sheetAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDateTime } from '../../utils/dateFormat'
import SheetGrid, { emptySheetContent, type SheetContent } from '../../components/SheetGrid'
import SheetHistoryPanel from '../../components/SheetHistoryPanel'
import StyledSelect from '../../components/StyledSelect'
import SheetAssigneePicker, {
  ACCESS_MODE_OPTIONS,
  type AccessMode,
} from '../../components/SheetAssigneePicker'

export default function SheetEditor() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const workbookId = Number(id)
  const isView = searchParams.get('mode') === 'view'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [accessMode, setAccessMode] = useState<AccessMode>('student_readonly')
  const [assigneeIds, setAssigneeIds] = useState<number[]>([])
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [content, setContent] = useState<SheetContent>(emptySheetContent())
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 模态框内草稿，确认后再写回
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftAccessMode, setDraftAccessMode] = useState<AccessMode>('student_readonly')
  const [draftAssignees, setDraftAssignees] = useState<number[]>([])
  const [draftStatus, setDraftStatus] = useState<'draft' | 'published'>('draft')

  const normalizeMode = (mode: string | undefined): AccessMode => {
    if (mode === 'shared' || mode === 'assigned') return mode
    return 'student_readonly'
  }

  const load = useCallback(async () => {
    if (!workbookId) return
    try {
      setLoading(true)
      const res = await sheetAPI.get(workbookId)
      const d = res.data
      setTitle(d.title || '')
      setDescription(d.description || '')
      setAccessMode(normalizeMode(d.access_mode))
      setAssigneeIds(Array.isArray(d.assignee_ids) ? d.assignee_ids.map(Number) : [])
      setStatus(d.status === 'published' ? 'published' : 'draft')
      setContent(d.content || emptySheetContent())
      setUpdatedAt(d.updated_at || null)
      setUpdatedBy(d.updated_by || null)
      setDirty(false)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
      navigate('/admin/sheets')
    } finally {
      setLoading(false)
    }
  }, [workbookId, navigate])

  useEffect(() => {
    load()
  }, [load])

  const switchMode = (mode: 'view' | 'edit') => {
    if (mode === 'view') setSearchParams({ mode: 'view' })
    else setSearchParams({})
  }

  const openSettings = () => {
    setDraftTitle(title)
    setDraftDescription(description)
    setDraftAccessMode(accessMode)
    setDraftAssignees(assigneeIds)
    setDraftStatus(status)
    setShowSettings(true)
  }

  const applySettings = async () => {
    const nextTitle = draftTitle.trim()
    if (!nextTitle) {
      toast.error('请填写标题')
      return
    }
    if (draftAccessMode === 'assigned' && draftAssignees.length === 0) {
      toast.error('指定学员模式下请至少选择一名学员')
      return
    }
    setTitle(nextTitle)
    setDescription(draftDescription)
    setAccessMode(draftAccessMode)
    setAssigneeIds(draftAccessMode === 'assigned' ? draftAssignees : [])
    setStatus(draftStatus)
    setShowSettings(false)
    try {
      setSaving(true)
      await sheetAPI.update(workbookId, {
        title: nextTitle,
        description: draftDescription,
        access_mode: draftAccessMode,
        status: draftStatus,
        assignee_ids: draftAccessMode === 'assigned' ? draftAssignees : [],
      })
      setDirty(false)
      toast.success('设置已保存')
      const res = await sheetAPI.get(workbookId)
      setUpdatedAt(res.data.updated_at || null)
      setUpdatedBy(res.data.updated_by || null)
      setAssigneeIds(
        Array.isArray(res.data.assignee_ids) ? res.data.assignee_ids.map(Number) : []
      )
    } catch (e: any) {
      toast.error(e.message || '保存设置失败')
      setDirty(true)
    } finally {
      setSaving(false)
    }
  }

  const save = async (partial?: Record<string, unknown>) => {
    if (!workbookId || isView) return
    try {
      setSaving(true)
      await sheetAPI.update(workbookId, {
        title,
        description,
        access_mode: accessMode,
        status,
        content,
        ...partial,
      })
      setDirty(false)
      toast.success('已保存')
      const res = await sheetAPI.get(workbookId)
      setUpdatedAt(res.data.updated_at || null)
      setUpdatedBy(res.data.updated_by || null)
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onContentChange = (next: SheetContent) => {
    if (isView) return
    setContent(next)
    setDirty(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      sheetAPI
        .update(workbookId, { content: next })
        .then(() => {
          setDirty(false)
        })
        .catch(() => {})
    }, 1200)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-gray-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100dvh)] max-h-[calc(100dvh)] overflow-hidden p-4 sm:p-6 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/admin/sheets')}
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white shrink-0"
          >
            <ArrowLeft size={16} /> 返回
          </button>
          <div className="min-w-0">
            <div className="font-medium text-white truncate">{title || '未命名表格'}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
                  accessMode === 'shared'
                    ? 'bg-blue-500/20 text-blue-300'
                    : accessMode === 'assigned'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {accessMode === 'shared' ? (
                  <Share2 size={10} />
                ) : accessMode === 'assigned' ? (
                  <Users size={10} />
                ) : (
                  <Lock size={10} />
                )}
                {accessMode === 'shared'
                  ? '共享编辑'
                  : accessMode === 'assigned'
                    ? `指定学员 · ${assigneeIds.length}人`
                    : '学员只读'}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  status === 'published'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-gray-600/40 text-gray-300'
                }`}
              >
                {status === 'published' ? '已发布' : '草稿'}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isView ? 'bg-gray-600/50 text-gray-300' : 'bg-violet-600/30 text-violet-200'
                }`}
              >
                {isView ? '查看' : '编辑'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">
            {!isView && (dirty ? '有未保存更改 · ' : '已同步 · ')}
            {updatedAt ? formatDateTime(updatedAt) : ''}
            {updatedBy ? ` · ${updatedBy}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 text-sm"
            title="查看编辑过的人与历史回退"
          >
            <History size={16} /> 历史
          </button>
          {!isView && (
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 text-sm"
            >
              <Settings2 size={16} /> 表格设置
            </button>
          )}
          {isView ? (
            <button
              type="button"
              onClick={() => switchMode('edit')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white"
            >
              <Edit size={16} /> 进入编辑
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => switchMode('view')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200"
              >
                <Eye size={16} /> 仅查看
              </button>
              <button
                onClick={() => save()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                保存
              </button>
            </>
          )}
        </div>
      </div>

      {description && isView && (
        <p className="text-sm text-gray-400 whitespace-pre-wrap px-1 shrink-0">{description}</p>
      )}

      <SheetGrid
        className="flex-1 min-h-0"
        value={content}
        onChange={isView ? undefined : onContentChange}
        readOnly={isView}
        allowResizeColumns={!isView}
      />

      <SheetHistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        canRestore
        loadHistory={async () => {
          const res = await sheetAPI.revisions(workbookId)
          return res.data
        }}
        loadRevisionContent={async (revId) => {
          const res = await sheetAPI.revisionDetail(workbookId, revId)
          return res.data
        }}
        onRestore={async (revId) => {
          if (saveTimer.current) clearTimeout(saveTimer.current)
          try {
            const res = await sheetAPI.restoreRevision(workbookId, revId)
            if (res.data?.content) setContent(res.data.content)
            else await load()
            setDirty(false)
            toast.success(res.message || '已回退')
            const fresh = await sheetAPI.get(workbookId)
            setUpdatedAt(fresh.data.updated_at || null)
            setUpdatedBy(fresh.data.updated_by || null)
          } catch (e: any) {
            toast.error(e.message || '回退失败')
            throw e
          }
        }}
      />

      {showSettings &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            onClick={() => setShowSettings(false)}
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
                      <Settings2 size={18} className="text-violet-300" /> 表格设置
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4 max-h-[min(70vh,560px)] overflow-y-auto">
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-gray-400">标题</span>
                      <input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        className="student-glass-field"
                        placeholder="表格标题"
                        autoFocus
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-gray-400">说明（可选）</span>
                      <textarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        className="student-glass-field h-24"
                        placeholder="给学员看的简要说明"
                      />
                    </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-gray-400">权限模式</span>
                        <StyledSelect
                          value={draftAccessMode}
                          onChange={(v) => setDraftAccessMode(v as AccessMode)}
                          options={ACCESS_MODE_OPTIONS.map((o) => ({
                            value: o.value,
                            label: o.label,
                          }))}
                        />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-gray-400">发布状态</span>
                        <StyledSelect
                          value={draftStatus}
                          onChange={(v) => setDraftStatus(v as 'draft' | 'published')}
                          options={[
                            { value: 'draft', label: '草稿（学员不可见）' },
                            { value: 'published', label: '已发布' },
                          ]}
                        />
                      </label>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      {draftAccessMode === 'shared' ? (
                        <>
                          <Share2 size={12} className="text-blue-400" />
                          全员打开后可直接编辑并保存
                        </>
                      ) : draftAccessMode === 'assigned' ? (
                        <>
                          <Users size={12} className="text-sky-400" />
                          仅名单内学员可见并可填写，其他人看不到
                        </>
                      ) : (
                        <>
                          <Lock size={12} className="text-amber-400" />
                          学员只能查看，修改请由管理员完成
                        </>
                      )}
                    </div>
                    {draftAccessMode === 'assigned' && (
                      <SheetAssigneePicker
                        selectedIds={draftAssignees}
                        onChange={setDraftAssignees}
                        disabled={saving}
                      />
                    )}
                  </div>

                  <div className="px-5 py-4 border-t border-white/10 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={applySettings}
                      disabled={saving}
                      className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                      保存设置
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
