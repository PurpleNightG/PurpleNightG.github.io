import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import type { WorkbookDocument } from '../utils/workbookModel'

type Props = {
  doc: WorkbookDocument
  readOnly?: boolean
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
}

type MenuState = {
  id: string
  x: number
  y: number
}

export default function SheetTabBar({
  doc,
  readOnly,
  onSelect,
  onRename,
  onAdd,
  onDelete,
  onDuplicate,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingId])

  const startRename = (id: string, name: string) => {
    if (readOnly) return
    setMenu(null)
    setEditingId(id)
    setDraft(name)
  }

  const commitRename = () => {
    if (!editingId) return
    onRename(editingId, draft)
    setEditingId(null)
  }

  const openMenuAt = (id: string, x: number, y: number) => {
    if (readOnly) return
    onSelect(id)
    const left = Math.min(x, window.innerWidth - 160)
    const top = Math.min(y, window.innerHeight - 140)
    setMenu({ id, x: Math.max(8, left), y: Math.max(8, top) })
  }

  const onTabContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (readOnly) return
    openMenuAt(id, e.clientX, e.clientY)
  }

  const menuSheet = menu ? doc.sheets.find((s) => s.id === menu.id) : null

  return (
    <div
      className="shrink-0 flex items-end gap-1 px-1 pt-1 border-t border-white/10 bg-gray-950/80"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex-1 min-w-0 overflow-x-auto sheet-scrollbar flex items-end gap-0.5">
        {doc.sheets.map((s) => {
          const active = s.id === doc.activeSheetId
          return (
            <div
              key={s.id}
              className="relative shrink-0"
              onContextMenu={(e) => onTabContextMenu(e, s.id)}
            >
              {editingId === s.id ? (
                <input
                  ref={inputRef}
                  value={draft}
                  maxLength={32}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="h-8 min-w-[5.5rem] max-w-[10rem] px-2.5 rounded-t-md bg-violet-600/30 border border-b-0 border-violet-400/40 text-xs text-white outline-none"
                />
              ) : (
                <button
                  type="button"
                  title={`${s.name}（右键可重命名 / 删除）`}
                  onClick={() => onSelect(s.id)}
                  onDoubleClick={() => startRename(s.id, s.name)}
                  className={`h-8 max-w-[9rem] px-3 rounded-t-md text-xs truncate transition-colors border border-b-0 ${
                    active
                      ? 'bg-gray-800 text-white border-white/15'
                      : 'bg-gray-900/60 text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/70'
                  }`}
                >
                  {s.name}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!readOnly && (
        <button
          type="button"
          title="新建工作表"
          disabled={doc.sheets.length >= 30}
          onClick={onAdd}
          className="shrink-0 h-8 w-8 mb-0 rounded-t-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 inline-flex items-center justify-center"
        >
          <Plus size={14} />
        </button>
      )}

      {menu && menuSheet && !readOnly &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[200]"
              onClick={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu(null)
              }}
            />
            <div
              className="fixed z-[210] w-36 rounded-lg border border-white/10 bg-gray-900 shadow-xl py-1"
              style={{ left: menu.x, top: menu.y }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10"
                onClick={() => startRename(menuSheet.id, menuSheet.name)}
              >
                重命名
              </button>
              {onDuplicate && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10"
                  onClick={() => {
                    onDuplicate(menuSheet.id)
                    setMenu(null)
                  }}
                >
                  复制工作表
                </button>
              )}
              <button
                type="button"
                disabled={doc.sheets.length <= 1}
                title={doc.sheets.length <= 1 ? '至少保留一个工作表' : '删除此工作表'}
                className="w-full text-left px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15 disabled:opacity-40"
                onClick={() => {
                  onDelete(menuSheet.id)
                  setMenu(null)
                }}
              >
                删除
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
