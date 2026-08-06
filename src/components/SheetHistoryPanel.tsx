import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, History, Loader2, RotateCcw, Users, X } from 'lucide-react'
import { formatDateTime } from '../utils/dateFormat'
import ConfirmDialog from './ConfirmDialog'
import SheetGrid from './SheetGrid'
import SheetTabBar from './SheetTabBar'
import {
  getActiveSheet,
  normalizeWorkbook,
  setActiveSheetId,
  type WorkbookDocument,
} from '../utils/workbookModel'

export type SheetRevision = {
  id: number
  edited_by: string
  edited_by_type: 'admin' | 'student'
  created_at: string
}

export type SheetEditorSummary = {
  name: string
  count: number
  last_at: string
  type: 'admin' | 'student'
}

type Props = {
  open: boolean
  onClose: () => void
  /** 管理员可回退；学员仅预览 */
  canRestore: boolean
  loadHistory: () => Promise<{ revisions: SheetRevision[]; editors: SheetEditorSummary[] }>
  loadRevisionContent: (revId: number) => Promise<{ content: unknown; edited_by: string; created_at: string }>
  onRestore: (revId: number) => Promise<void>
}

export default function SheetHistoryPanel({
  open,
  onClose,
  canRestore,
  loadHistory,
  loadRevisionContent,
  onRestore,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [revisions, setRevisions] = useState<SheetRevision[]>([])
  const [editors, setEditors] = useState<SheetEditorSummary[]>([])
  const [preview, setPreview] = useState<{
    rev: SheetRevision
    workbook: WorkbookDocument
  } | null>(null)
  const [confirmRev, setConfirmRev] = useState<SheetRevision | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadHistory()
      setRevisions(data.revisions || [])
      setEditors(data.editors || [])
    } catch {
      setRevisions([])
      setEditors([])
    } finally {
      setLoading(false)
    }
  }, [loadHistory])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const openPreview = async (r: SheetRevision) => {
    setPreviewLoading(true)
    try {
      const data = await loadRevisionContent(r.id)
      setPreview({
        rev: r,
        workbook: normalizeWorkbook(data.content),
      })
    } catch {
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const doRestore = async () => {
    if (!confirmRev) return
    try {
      setRestoring(true)
      await onRestore(confirmRev.id)
      setConfirmRev(null)
      setPreview(null)
      await refresh()
    } finally {
      setRestoring(false)
    }
  }

  if (!open) return null

  const previewActive = preview ? getActiveSheet(preview.workbook) : null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10000] flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden />
        <aside
          className="relative z-10 h-full w-full max-w-md student-glass-panel student-glass-panel--static !rounded-none border-l border-white/10 flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <History size={18} className="text-emerald-400" /> 编辑历史
            </h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto sheet-scrollbar p-4 space-y-5">
            <section>
              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                <Users size={12} /> 参与编辑
              </div>
              {loading ? (
                <div className="text-gray-500 text-sm py-2">加载中…</div>
              ) : editors.length === 0 ? (
                <p className="text-sm text-gray-500">暂无编辑记录（保存改动后会出现）</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {editors.map((e) => (
                    <li
                      key={e.name}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-200"
                      title={`最近 ${formatDateTime(e.last_at)} · ${e.count} 次`}
                    >
                      <span className="font-medium text-white">{e.name}</span>
                      <span className="text-gray-500 ml-1.5">
                        {e.type === 'admin' ? '管理' : '学员'} · {e.count}次
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="text-xs text-gray-500 mb-2">历史版本</div>
              <p className="text-[11px] text-gray-600 mb-3 leading-relaxed">
                每条为某人编辑前的快照。可先预览；回退后当前内容会记为「回退前」版本，可再预览/回退。
                {!canRestore && ' 学员仅可预览，不可回退。'}
              </p>
              {loading || previewLoading ? (
                <div className="flex justify-center py-8 text-gray-400">
                  <Loader2 className="animate-spin" size={20} />
                </div>
              ) : revisions.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">还没有历史版本</p>
              ) : (
                <ul className="space-y-2">
                  {revisions.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3 flex items-start gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">{r.edited_by}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {formatDateTime(r.created_at)}
                          <span className="text-gray-600">
                            {' '}
                            · {r.edited_by_type === 'admin' ? '管理员' : '学员'}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          {String(r.edited_by).includes('回退前')
                            ? '回退前的表格内容'
                            : '此人编辑之前的状态'}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={previewLoading}
                          onClick={() => openPreview(r)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 text-xs disabled:opacity-50"
                        >
                          <Eye size={12} /> 预览
                        </button>
                        {canRestore && (
                          <button
                            type="button"
                            disabled={restoring}
                            onClick={() => setConfirmRev(r)}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs disabled:opacity-50"
                          >
                            <RotateCcw size={12} /> 回退
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </aside>
      </div>

      {preview && previewActive && (
        <div
          className="fixed inset-0 z-[10010] flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreview(null)}
        >
          <div className="absolute inset-0 bg-black/70" aria-hidden />
          <div
            className="relative z-10 w-full max-w-5xl h-[min(88vh,900px)] flex flex-col student-glass-panel student-glass-panel--static overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/10 shrink-0">
              <div className="min-w-0">
                <div className="text-white font-medium truncate">
                  预览 · {preview.rev.edited_by}
                </div>
                <div className="text-[11px] text-gray-500">
                  {formatDateTime(preview.rev.created_at)} · 只读预览，不会改动当前表格
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canRestore && (
                  <button
                    type="button"
                    onClick={() => setConfirmRev(preview.rev)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-sm"
                  >
                    <RotateCcw size={14} /> 回退到此版本
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 text-sm"
                >
                  <X size={14} /> 关闭
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-3 flex flex-col overflow-hidden">
              <SheetGrid
                key={previewActive.id}
                className="flex-1 min-h-0"
                value={previewActive.content}
                readOnly
                allowResizeColumns={false}
              />
              <SheetTabBar
                doc={preview.workbook}
                readOnly
                onSelect={(sid) =>
                  setPreview((p) =>
                    p ? { ...p, workbook: setActiveSheetId(p.workbook, sid) } : p
                  )
                }
                onRename={() => {}}
                onAdd={() => {}}
                onDelete={() => {}}
              />
            </div>
          </div>
        </div>
      )}

      {confirmRev && (
        <ConfirmDialog
          title="回退表格"
          message={`确定回退到「${confirmRev.edited_by}」在 ${formatDateTime(confirmRev.created_at)} 对应的历史版本吗？\n\n回退前的当前内容会保存为「回退前」历史，之后仍可预览或再次回退。`}
          confirmText={restoring ? '回退中…' : '确认回退'}
          type="warning"
          zClassName="z-[10020]"
          onConfirm={doRestore}
          onCancel={() => !restoring && setConfirmRev(null)}
        />
      )}
    </>,
    document.body
  )
}
