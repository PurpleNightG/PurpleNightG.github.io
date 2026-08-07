import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Save, Lock, Share2, RefreshCw, History } from 'lucide-react'
import { sheetAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { formatDateTime } from '../utils/dateFormat'
import SheetGrid, { type SheetContent } from '../components/SheetGrid'
import SheetHistoryPanel from '../components/SheetHistoryPanel'
import SheetTabBar from '../components/SheetTabBar'
import PageSkeleton from '../components/Skeleton'
import {
  addSheet,
  deleteSheet,
  duplicateSheet,
  emptyWorkbook,
  getActiveSheet,
  normalizeWorkbook,
  renameSheet,
  setActiveSheetId,
  updateActiveSheetContent,
  type WorkbookDocument,
} from '../utils/workbookModel'
import { evaluateWorkbook } from '../utils/sheetFormulaEngine'

export default function StudentSheetView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const workbookId = Number(id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [workbook, setWorkbook] = useState<WorkbookDocument>(emptyWorkbook())
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workbookRef = useRef(workbook)
  workbookRef.current = workbook

  const scheduleSave = (next: WorkbookDocument) => {
    setDirty(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      sheetAPI
        .studentSave(workbookId, next)
        .then(() => setDirty(false))
        .catch(() => {})
    }, 1200)
  }

  const commitWorkbook = (next: WorkbookDocument) => {
    const evaluated = evaluateWorkbook(next)
    scheduleSave(evaluated)
    return evaluated
  }

  const patchWorkbook = (updater: (doc: WorkbookDocument) => WorkbookDocument) => {
    if (!canEdit) return
    setWorkbook((prev) => commitWorkbook(updater(prev)))
  }

  const load = useCallback(async (silent = false) => {
    if (!workbookId) return
    try {
      if (!silent) setLoading(true)
      const res = await sheetAPI.studentGet(workbookId)
      const d = res.data
      setTitle(d.title || '')
      setDescription(d.description || '')
      setCanEdit(!!d.can_edit)
      setWorkbook(evaluateWorkbook(normalizeWorkbook(d.content)))
      setUpdatedAt(d.updated_at || null)
      setUpdatedBy(d.updated_by || null)
      setDirty(false)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
      navigate('/student/sheets')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [workbookId, navigate])

  useEffect(() => {
    load()
  }, [load])

  // 只读表格定时刷新；共享编辑时不自动覆盖本地未保存内容
  useEffect(() => {
    if (canEdit) return
    const t = setInterval(() => load(true), 30000)
    return () => clearInterval(t)
  }, [canEdit, load])

  const save = async (next?: WorkbookDocument) => {
    if (!canEdit || !workbookId) return
    try {
      setSaving(true)
      await sheetAPI.studentSave(workbookId, next || workbookRef.current)
      setDirty(false)
      toast.success('已保存')
      await load(true)
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onContentChange = (next: SheetContent) => {
    if (!canEdit) return
    setWorkbook((prev) => commitWorkbook(updateActiveSheetContent(prev, next)))
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  if (loading) {
    return <PageSkeleton variant="detail" />
  }

  const active = getActiveSheet(workbook)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-4 sm:p-6 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <button
          onClick={() => navigate('/student/sheets')}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft size={16} /> 返回列表
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">
            {dirty ? '编辑中…' : '已同步'}
            {updatedAt ? ` · ${formatDateTime(updatedAt)}` : ''}
            {updatedBy ? ` · ${updatedBy}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-gray-200 text-sm hover:bg-white/15"
          >
            <History size={14} /> 历史
          </button>
          <button
            type="button"
            onClick={() => load(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-gray-200 text-sm hover:bg-white/15"
          >
            <RefreshCw size={14} /> 刷新
          </button>
          {canEdit && (
            <button
              onClick={() => save()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              保存
            </button>
          )}
        </div>
      </div>

      <div className="student-glass-panel student-glass-panel--static p-4 sm:p-5 shrink-0">
        <h1 className="text-xl font-bold text-white flex flex-wrap items-center gap-2">
          {title}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 font-normal ${
              canEdit ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {canEdit ? (
              <>
                <Share2 size={10} /> 共享编辑
              </>
            ) : (
              <>
                <Lock size={10} /> 只读
              </>
            )}
          </span>
        </h1>
        {description && (
          <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">{description}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/20">
        <SheetGrid
          key={active.id}
          className="flex-1 min-h-0"
          value={active.content}
          onChange={canEdit ? onContentChange : undefined}
          readOnly={!canEdit}
        />
        <SheetTabBar
          doc={workbook}
          readOnly={!canEdit}
          onSelect={(sid) => {
            if (!canEdit) {
              setWorkbook((prev) => setActiveSheetId(prev, sid))
              return
            }
            patchWorkbook((doc) => setActiveSheetId(doc, sid))
          }}
          onRename={(sid, name) => patchWorkbook((doc) => renameSheet(doc, sid, name))}
          onAdd={() => patchWorkbook((doc) => addSheet(doc))}
          onDelete={(sid) => patchWorkbook((doc) => deleteSheet(doc, sid))}
          onDuplicate={(sid) => patchWorkbook((doc) => duplicateSheet(doc, sid))}
        />
      </div>

      <SheetHistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        canRestore={false}
        loadHistory={async () => {
          const res = await sheetAPI.studentRevisions(workbookId)
          return res.data
        }}
        loadRevisionContent={async (revId) => {
          const res = await sheetAPI.studentRevisionDetail(workbookId, revId)
          return res.data
        }}
        onRestore={async () => {
          toast.error('学员不可回退，请联系管理员')
          throw new Error('forbidden')
        }}
      />
    </div>
  )
}
