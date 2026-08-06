import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Type,
  PaintBucket,
  Combine,
  Split,
  Plus,
  Minus,
  ChevronDown,
  ArrowLeftRight,
  ArrowUpDown,
  ListFilter,
  ArrowDownAZ,
  ArrowUpZA,
  Check,
} from 'lucide-react'
import { toast } from '../utils/toast'
import ThemeCheckbox from './ThemeCheckbox'

export type CellAlign = 'left' | 'center' | 'right'

/** 单元格：html 存选中文字级格式；旧字段兼容整格样式 */
export type CellData = {
  /** 纯文本兜底 / 旧数据 */
  v?: string
  /** 富文本 HTML（选中文字格式） */
  html?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number
  color?: string
  /** 单元格底色 */
  bg?: string
  fontFamily?: string
  align?: CellAlign
}

export type MergeRange = { r: number; c: number; rs: number; cs: number }

export type SheetContent = {
  rows: number
  cols: number
  colWidths?: number[]
  rowHeights?: number[]
  cells: Record<string, CellData>
  merges?: MergeRange[]
}

const DEFAULT_COL_WIDTH = 120
const MIN_COL_WIDTH = 48
const MAX_COL_WIDTH = 480
const DEFAULT_ROW_HEIGHT = 34
const MIN_ROW_HEIGHT = 24
const MAX_ROW_HEIGHT = 240
const HEADER_ROW_HEIGHT = 32

const FONT_FAMILIES = [
  { value: 'inherit', label: '默认' },
  { value: 'Microsoft YaHei, 微软雅黑, sans-serif', label: '雅黑' },
  { value: 'SimSun, 宋体, serif', label: '宋体' },
  { value: 'SimHei, 黑体, sans-serif', label: '黑体' },
  { value: 'KaiTi, 楷体, serif', label: '楷体' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Consolas, Monaco, monospace', label: '等宽' },
]

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32]

const TEXT_COLORS = ['#f3f4f6', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899']
const HIGHLIGHT_COLORS = ['#fef08a', '#86efac', '#7dd3fc', '#c4b5fd', '#f9a8d4', '#fdba74', '#ffffff00']
const CELL_BG_COLORS = ['transparent', '#1f2937', '#450a0a', '#422006', '#14532d', '#164e63', '#1e3a8a', '#4a044e']
const BLANK_FILTER_LABEL = '(空白)'

function cellPlain(cell?: CellData): string {
  return htmlToPlain(cellToHtml(cell)).trim()
}

function compareCellValues(a: string, b: string): number {
  if (a === '' && b === '') return 0
  if (a === '') return 1
  if (b === '') return -1
  const na = Number(a.replace(/,/g, ''))
  const nb = Number(b.replace(/,/g, ''))
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && /^-?[\d.]+$/.test(a.replace(/,/g, '')) && /^-?[\d.]+$/.test(b.replace(/,/g, ''))) {
    return na - nb
  }
  return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function colLabel(i: number) {
  let n = i
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

function cellKey(r: number, c: number) {
  return `${r},${c}`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

function normalizeColWidths(cols: number, widths?: number[]) {
  return Array.from({ length: cols }, (_, i) => {
    const w = Number(widths?.[i])
    if (!Number.isFinite(w)) return DEFAULT_COL_WIDTH
    return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(w)))
  })
}

function normalizeRowHeights(rows: number, heights?: number[]) {
  return Array.from({ length: rows }, (_, i) => {
    const h = Number(heights?.[i])
    if (!Number.isFinite(h)) return DEFAULT_ROW_HEIGHT
    return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(h)))
  })
}

function normalizeMerges(merges?: MergeRange[]): MergeRange[] {
  if (!Array.isArray(merges)) return []
  return merges
    .map((m) => ({
      r: Math.max(0, Number(m.r) || 0),
      c: Math.max(0, Number(m.c) || 0),
      rs: Math.max(1, Number(m.rs) || 1),
      cs: Math.max(1, Number(m.cs) || 1),
    }))
    .filter((m) => m.rs > 1 || m.cs > 1)
}

function cellToHtml(cell?: CellData): string {
  if (!cell) return ''
  if (cell.html != null && cell.html !== '') return cell.html
  const text = cell.v || ''
  if (!text) return ''
  const styles: string[] = []
  if (cell.bold) styles.push('font-weight:700')
  if (cell.italic) styles.push('font-style:italic')
  if (cell.underline) styles.push('text-decoration:underline')
  if (cell.fontSize) styles.push(`font-size:${cell.fontSize}px`)
  if (cell.color) styles.push(`color:${cell.color}`)
  if (cell.fontFamily) styles.push(`font-family:${cell.fontFamily}`)
  const escaped = escapeHtml(text)
  if (!styles.length) return escaped
  return `<span style="${styles.join(';')}">${escaped}</span>`
}

function htmlToPlain(html: string): string {
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.innerText || d.textContent || '').replace(/\u00a0/g, ' ')
}

/** 测量单元格内容所需宽高（离屏） */
function measureHtmlSize(html: string, opts?: { maxWidth?: number; nowrap?: boolean }) {
  const el = document.createElement('div')
  const nowrap = !!opts?.nowrap
  el.style.cssText = [
    'position:absolute',
    'left:-10000px',
    'top:0',
    'visibility:hidden',
    'box-sizing:border-box',
    'padding:6px 8px',
    'font-size:14px',
    'line-height:1.45',
    'font-family:Microsoft YaHei,微软雅黑,sans-serif',
    nowrap ? 'white-space:nowrap' : 'white-space:pre-wrap;word-break:break-word',
    opts?.maxWidth != null ? `width:${opts.maxWidth}px` : 'width:max-content',
  ].join(';')
  el.innerHTML = html && html.trim() ? html : '&nbsp;'
  document.body.appendChild(el)
  const w = Math.ceil(el.offsetWidth)
  const h = Math.ceil(el.offsetHeight)
  document.body.removeChild(el)
  return { w, h }
}

function findMergeAt(merges: MergeRange[], r: number, c: number) {
  return merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs) || null
}

function isCovered(merges: MergeRange[], r: number, c: number) {
  const m = findMergeAt(merges, r, c)
  return !!(m && (m.r !== r || m.c !== c))
}

function normalizeSel(a: { r: number; c: number }, b: { r: number; c: number }) {
  return {
    r0: Math.min(a.r, b.r),
    r1: Math.max(a.r, b.r),
    c0: Math.min(a.c, b.c),
    c1: Math.max(a.c, b.c),
  }
}

function inSel(
  r: number,
  c: number,
  sel: { r0: number; r1: number; c0: number; c1: number } | null
) {
  if (!sel) return false
  return r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1
}

function clampCell(r: number, c: number, rows: number, cols: number) {
  return {
    r: Math.max(0, Math.min(rows - 1, r)),
    c: Math.max(0, Math.min(cols - 1, c)),
  }
}

/** 方向键跳过合并单元格 */
function stepCell(
  merges: MergeRange[],
  r: number,
  c: number,
  dr: number,
  dc: number,
  rows: number,
  cols: number
) {
  const m = findMergeAt(merges, r, c)
  let nr = r
  let nc = c
  if (m && m.r === r && m.c === c) {
    if (dr > 0) nr = m.r + m.rs
    else if (dr < 0) nr = m.r - 1
    else if (dc > 0) nc = m.c + m.cs
    else if (dc < 0) nc = m.c - 1
  } else {
    nr = r + dr
    nc = c + dc
  }
  const clamped = clampCell(nr, nc, rows, cols)
  const hit = findMergeAt(merges, clamped.r, clamped.c)
  if (hit) return { r: hit.r, c: hit.c }
  return clamped
}

function applyExecToHtml(html: string, cmd: string, val?: string): string {
  const div = document.createElement('div')
  div.contentEditable = 'true'
  div.innerHTML = html || ''
  div.style.position = 'fixed'
  div.style.left = '-9999px'
  document.body.appendChild(div)
  try {
    const range = document.createRange()
    range.selectNodeContents(div)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, val)
    return div.innerHTML
  } catch {
    return html
  } finally {
    document.body.removeChild(div)
  }
}

type ClipboardPayload = {
  cells: Record<string, CellData>
  rows: number
  cols: number
}

function serializeClipboard(
  cells: Record<string, CellData | undefined>,
  sel: { r0: number; r1: number; c0: number; c1: number }
): { text: string; payload: ClipboardPayload } {
  const rs = sel.r1 - sel.r0 + 1
  const cs = sel.c1 - sel.c0 + 1
  const payloadCells: Record<string, CellData> = {}
  const lines: string[] = []
  for (let r = 0; r < rs; r++) {
    const parts: string[] = []
    for (let c = 0; c < cs; c++) {
      const src = cells[cellKey(sel.r0 + r, sel.c0 + c)]
      if (src) payloadCells[cellKey(r, c)] = { ...src }
      parts.push(htmlToPlain(cellToHtml(src)).replace(/\t/g, ' ').replace(/\r?\n/g, ' '))
    }
    lines.push(parts.join('\t'))
  }
  return { text: lines.join('\n'), payload: { cells: payloadCells, rows: rs, cols: cs } }
}

function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((row, i, arr) => !(i === arr.length - 1 && row.length === 1 && row[0] === ''))
}

type Props = {
  value: SheetContent
  onChange?: (next: SheetContent) => void
  readOnly?: boolean
  allowResizeColumns?: boolean
  className?: string
}

type ResizeState =
  | { kind: 'col'; index: number; startPos: number; startSize: number; sizes: number[] }
  | { kind: 'row'; index: number; startPos: number; startSize: number; sizes: number[] }

function Divider() {
  return <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />
}

function TbBtn({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors disabled:opacity-35 disabled:pointer-events-none ${
        active
          ? 'bg-violet-500/90 text-white shadow-sm shadow-violet-900/40'
          : 'text-gray-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function ColorMenu({
  title,
  icon,
  colors,
  value,
  onPick,
  disabled,
}: {
  title: string
  icon: React.ReactNode
  colors: string[]
  value?: string
  onPick: (c: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        title={title}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-35"
      >
        {icon}
        <span
          className="w-3.5 h-1 rounded-sm border border-white/20"
          style={{
            background:
              !value || value === 'transparent' || value === '#ffffff00'
                ? 'repeating-conic-gradient(#666 0% 25%, #333 0% 50%) 50%/6px 6px'
                : value,
          }}
        />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-8 z-[60] p-2 rounded-lg border border-white/10 bg-gray-900 shadow-xl grid grid-cols-4 gap-1.5 min-w-[152px]">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c)
                  setOpen(false)
                }}
                className="w-6 h-6 rounded border border-white/15 hover:scale-110 transition-transform"
                style={{
                  background:
                    c === 'transparent' || c === '#ffffff00'
                      ? 'repeating-conic-gradient(#666 0% 25%, #333 0% 50%) 50%/8px 8px'
                      : c,
                }}
              />
            ))}
            <label className="col-span-4 mt-1.5 flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer whitespace-nowrap">
              <span className="shrink-0">自定义</span>
              <input
                type="color"
                className="h-6 min-w-0 flex-1 rounded border border-white/10 bg-transparent cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  onPick(e.target.value)
                  setOpen(false)
                }}
              />
            </label>
          </div>
        </>
      )}
    </div>
  )
}

/** 暗色自定义下拉：mousedown preventDefault，避免 contentEditable 失焦丢选区 */
function SelectMenu({
  title,
  value,
  options,
  disabled,
  onPick,
  onBeforeOpen,
  className = '',
}: {
  title: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onPick: (v: string) => void
  onBeforeOpen?: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const label = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? ''
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault()
          onBeforeOpen?.()
        }}
        onClick={() => setOpen((v) => !v)}
        className="h-7 max-w-[7.5rem] inline-flex items-center gap-1 rounded-md bg-black/35 border border-white/10 px-2 text-xs text-gray-200 hover:border-white/25 hover:bg-black/45 disabled:opacity-35 disabled:pointer-events-none"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-8 z-[60] min-w-full max-h-56 overflow-auto sheet-scrollbar rounded-lg border border-white/10 bg-gray-900 py-1 shadow-xl shadow-black/40">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(o.value)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                  o.value === value
                    ? 'bg-violet-500/25 text-violet-100'
                    : 'text-gray-200 hover:bg-white/10'
                }`}
                style={o.value !== 'inherit' ? { fontFamily: o.value } : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function clampDimCount(n: number) {
  if (!Number.isFinite(n)) return 1
  return Math.min(10, Math.max(1, Math.round(n)))
}

/** 暗色主题复选框已统一为 ThemeCheckbox */

function FilterColMenu({
  open,
  values,
  selected,
  onClose,
  onApply,
  onClear,
}: {
  open: boolean
  values: string[]
  selected: Set<string> | null
  onClose: () => void
  onApply: (next: Set<string> | null) => void
  onClear: () => void
}) {
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setQ('')
    setDraft(selected ? new Set(selected) : new Set(values))
    // 仅在打开时初始化草稿，避免父级重渲染清空勾选
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const filtered = values.filter((v) => !q.trim() || v.toLowerCase().includes(q.trim().toLowerCase()))
  const allChecked = filtered.length > 0 && filtered.every((v) => draft.has(v))

  return (
    <>
      <div
        className="fixed inset-0 z-[55]"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClose}
      />
      <div
        className="absolute right-0 top-8 z-[60] w-56 rounded-lg border border-white/10 bg-gray-900 shadow-xl shadow-black/40 overflow-hidden"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="px-2.5 py-1.5 border-b border-white/10 text-[11px] text-gray-500">
          仅本地筛选，不修改表格数据
        </div>
        <div className="p-2 border-b border-white/10">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索…"
            className="w-full h-7 rounded-md bg-black/40 border border-white/10 px-2 text-xs text-gray-200 outline-none focus:border-violet-500/50"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="max-h-44 overflow-auto sheet-scrollbar px-1.5 py-1">
          <ThemeCheckbox
            checked={allChecked}
            size={15}
            className="w-full px-1.5 py-1 text-xs text-gray-300 hover:bg-white/5 rounded"
            label="（全选）"
            onCheckedChange={() => {
              const next = new Set(draft)
              if (allChecked) filtered.forEach((v) => next.delete(v))
              else filtered.forEach((v) => next.add(v))
              setDraft(next)
            }}
          />
          {filtered.map((v) => (
            <ThemeCheckbox
              key={v}
              checked={draft.has(v)}
              size={15}
              className="w-full px-1.5 py-1 text-xs text-gray-300 hover:bg-white/5 rounded"
              label={
                <span className="truncate block" title={v}>
                  {v}
                </span>
              }
              onCheckedChange={() => {
                const next = new Set(draft)
                if (next.has(v)) next.delete(v)
                else next.add(v)
                setDraft(next)
              }}
            />
          ))}
          {!filtered.length && (
            <div className="px-2 py-3 text-[11px] text-gray-500 text-center">无匹配项</div>
          )}
        </div>
        <div className="p-1.5 border-t border-white/10 flex gap-1">
          <button
            type="button"
            onClick={() => {
              onClear()
              onClose()
            }}
            className="flex-1 h-7 rounded-md text-xs text-gray-400 hover:bg-white/10"
          >
            清除
          </button>
          <button
            type="button"
            onClick={() => {
              const all = values.length > 0 && values.every((v) => draft.has(v))
              onApply(all || draft.size === 0 ? null : draft)
              onClose()
            }}
            className="flex-1 h-7 rounded-md text-xs bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center justify-center gap-1"
          >
            <Check size={12} /> 确定
          </button>
        </div>
      </div>
    </>
  )
}

export default function SheetGrid({
  value,
  onChange,
  readOnly = false,
  allowResizeColumns,
  className = '',
}: Props) {
  const canResize = allowResizeColumns ?? !readOnly
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null)
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [fontFamily, setFontFamily] = useState('inherit')
  const [fontSize, setFontSize] = useState(14)
  const [dimCount, setDimCount] = useState(1)
  const [filterOn, setFilterOn] = useState(false)
  /** 首行作为表头，不参与排序/筛选 */
  const [headerAsTitle, setHeaderAsTitle] = useState(true)
  /** col -> allowed values；无 key 表示该列不筛选 */
  const [colFilters, setColFilters] = useState<Record<number, Set<string>>>({})
  const [filterMenuCol, setFilterMenuCol] = useState<number | null>(null)
  const editRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const gridWrapRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef<ResizeState | null>(null)
  const savedRange = useRef<Range | null>(null)
  const undoStack = useRef<SheetContent[]>([])
  const redoStack = useRef<SheetContent[]>([])
  const applyingHistory = useRef(false)
  const clipRef = useRef<ClipboardPayload | null>(null)
  const lastCopiedText = useRef('')
  const seedEditRef = useRef<string | null>(null)
  const resizeHistPushed = useRef(false)

  const rows = value.rows || 40
  const cols = value.cols || 16
  const colWidths = useMemo(() => normalizeColWidths(cols, value.colWidths), [cols, value.colWidths])
  const rowHeights = useMemo(
    () => normalizeRowHeights(rows, value.rowHeights),
    [rows, value.rowHeights]
  )
  const merges = useMemo(() => normalizeMerges(value.merges), [value.merges])
  const dataStartRow = headerAsTitle ? 1 : 0

  const sel = useMemo(() => {
    if (!anchor || !focus) return null
    return normalizeSel(anchor, focus)
  }, [anchor, focus])

  const activeCell = focus ? value.cells?.[cellKey(focus.r, focus.c)] : undefined

  const rowVisible = useCallback(
    (r: number) => {
      if (!filterOn) return true
      if (headerAsTitle && r === 0) return true
      const entries = Object.entries(colFilters)
      if (!entries.length) return true
      for (const [cStr, allowed] of entries) {
        const c = Number(cStr)
        const plain = cellPlain(value.cells?.[cellKey(r, c)])
        const label = plain || BLANK_FILTER_LABEL
        if (!allowed.has(label)) return false
      }
      return true
    },
    [filterOn, headerAsTitle, colFilters, value.cells]
  )

  const visibleRowList = useMemo(() => {
    const list: number[] = []
    for (let r = 0; r < rows; r++) {
      if (rowVisible(r)) list.push(r)
    }
    return list
  }, [rows, rowVisible])

  const hasActiveFilter = filterOn && Object.keys(colFilters).length > 0

  const uniqueValuesForCol = useCallback(
    (c: number) => {
      const map = new Map<string, string>()
      for (let r = dataStartRow; r < rows; r++) {
        const plain = cellPlain(value.cells?.[cellKey(r, c)])
        const label = plain || BLANK_FILTER_LABEL
        if (!map.has(label)) map.set(label, label)
      }
      return Array.from(map.keys()).sort((a, b) => {
        if (a === BLANK_FILTER_LABEL) return 1
        if (b === BLANK_FILTER_LABEL) return -1
        return compareCellValues(a, b)
      })
    },
    [dataStartRow, rows, value.cells]
  )

  const persist = useCallback(
    (patch: Partial<SheetContent>, opts?: { recordHistory?: boolean }) => {
      if (!onChange || readOnly) return
      const record = opts?.recordHistory !== false
      if (record && !applyingHistory.current && !resizingRef.current) {
        undoStack.current.push(
          structuredClone({
            ...value,
            colWidths,
            rowHeights,
            merges,
          })
        )
        if (undoStack.current.length > 80) undoStack.current.shift()
        redoStack.current = []
      }
      onChange({
        ...value,
        colWidths,
        rowHeights,
        merges,
        ...patch,
      })
    },
    [onChange, readOnly, value, colWidths, rowHeights, merges]
  )

  const getCell = useCallback(
    (r: number, c: number) => value.cells?.[cellKey(r, c)],
    [value.cells]
  )

  const saveEditHtml = useCallback(() => {
    if (!focus || !editRef.current || readOnly) return
    const html = editRef.current.innerHTML
    const plain = htmlToPlain(html).trim()
    const key = cellKey(focus.r, focus.c)
    const nextCells = { ...(value.cells || {}) }
    if (!plain && !html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, '').trim()) {
      delete nextCells[key]
    } else {
      nextCells[key] = {
        ...(nextCells[key] || {}),
        html,
        v: plain,
        // 清除旧整格文字样式，避免与 html 冲突
        bold: undefined,
        italic: undefined,
        underline: undefined,
        fontSize: undefined,
        color: undefined,
        fontFamily: undefined,
      }
    }
    persist({ cells: nextCells })
  }, [focus, readOnly, value.cells, persist])

  const beginEdit = useCallback(
    (r: number, c: number) => {
      if (readOnly) return
      if (isCovered(merges, r, c)) return
      setAnchor({ r, c })
      setFocus({ r, c })
      setEditing(true)
    },
    [readOnly, merges]
  )

  useEffect(() => {
    if (!editing || !editRef.current || !focus) return
    if (seedEditRef.current != null) {
      const ch = seedEditRef.current
      seedEditRef.current = null
      editRef.current.innerHTML = escapeHtml(ch)
    } else {
      const html = cellToHtml(getCell(focus.r, focus.c))
      editRef.current.innerHTML = html || ''
    }
    editRef.current.focus()
    const range = document.createRange()
    range.selectNodeContents(editRef.current)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editing, focus?.r, focus?.c]) // eslint-disable-line react-hooks/exhaustive-deps

  const rememberSelection = () => {
    const s = window.getSelection()
    if (s && s.rangeCount > 0) savedRange.current = s.getRangeAt(0).cloneRange()
  }

  const restoreSelection = () => {
    if (!savedRange.current || !editRef.current) return
    editRef.current.focus()
    const s = window.getSelection()
    s?.removeAllRanges()
    try {
      s?.addRange(savedRange.current)
    } catch {
      /* ignore */
    }
  }

  const ensureEditing = () => {
    if (!focus || readOnly) return false
    if (!editing) {
      beginEdit(focus.r, focus.c)
      return false
    }
    return true
  }

  const runCmd = (cmd: string, val?: string) => {
    if (!ensureEditing()) return
    restoreSelection()
    try {
      document.execCommand('styleWithCSS', false, 'true')
      document.execCommand(cmd, false, val)
    } catch {
      /* ignore */
    }
    rememberSelection()
    saveEditHtml()
  }

  /** 选中多格时批量套格式；编辑中则走 execCommand */
  const applyFormatCmd = (cmd: string, val?: string) => {
    if (readOnly) return
    if (editing) {
      runCmd(cmd, val)
      return
    }
    if (!sel) return
    const nextCells = { ...(value.cells || {}) }
    for (let r = sel.r0; r <= sel.r1; r++) {
      for (let c = sel.c0; c <= sel.c1; c++) {
        if (isCovered(merges, r, c)) continue
        const key = cellKey(r, c)
        const prev = nextCells[key]
        const html = applyExecToHtml(cellToHtml(prev), cmd, val)
        const plain = htmlToPlain(html).trim()
        if (!plain && !html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, '').trim()) {
          if (prev?.bg || prev?.align) {
            nextCells[key] = { bg: prev.bg, align: prev.align }
          } else {
            delete nextCells[key]
          }
        } else {
          nextCells[key] = {
            ...(prev || {}),
            html,
            v: plain,
            bold: undefined,
            italic: undefined,
            underline: undefined,
            fontSize: undefined,
            color: undefined,
            fontFamily: undefined,
          }
        }
      }
    }
    persist({ cells: nextCells })
  }

  const applyFontSize = (px: number) => {
    if (!ensureEditing()) return
    restoreSelection()
    const s = window.getSelection()
    if (!s || s.rangeCount === 0) return
    const range = s.getRangeAt(0)
    if (range.collapsed && editRef.current) {
      editRef.current.style.fontSize = `${px}px`
      const all = document.createRange()
      all.selectNodeContents(editRef.current)
      s.removeAllRanges()
      s.addRange(all)
    }
    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    try {
      if (!range.collapsed) {
        const contents = range.extractContents()
        span.appendChild(contents)
        range.insertNode(span)
      }
    } catch {
      document.execCommand('fontSize', false, '3')
    }
    rememberSelection()
    saveEditHtml()
  }

  const applyFontName = (name: string) => {
    setFontFamily(name)
    if (name === 'inherit') {
      applyFormatCmd('fontName', 'sans-serif')
      return
    }
    applyFormatCmd('fontName', name)
  }

  const applyFontSizePx = (px: number) => {
    setFontSize(px)
    applyFontSize(px)
  }

  const endEdit = () => {
    if (!editing) return
    saveEditHtml()
    setEditing(false)
  }

  const cancelEdit = () => {
    if (!editing) return
    setEditing(false)
    seedEditRef.current = null
  }

  const onEditBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null
    if (next && toolbarRef.current?.contains(next)) return
    requestAnimationFrame(() => {
      const ae = document.activeElement
      if (ae === editRef.current) return
      if (ae && toolbarRef.current?.contains(ae)) return
      if (ae === gridWrapRef.current) return
      endEdit()
    })
  }

  const moveFocusTo = (r: number, c: number, extend: boolean) => {
    const next = clampCell(r, c, rows, cols)
    const hit = findMergeAt(merges, next.r, next.c)
    const cell = hit ? { r: hit.r, c: hit.c } : next
    setFocus(cell)
    if (!extend || !anchor) setAnchor(cell)
  }

  const navigate = (dr: number, dc: number, extend: boolean) => {
    if (!focus) {
      moveFocusTo(0, 0, false)
      return
    }
    if (dc !== 0 && dr === 0) {
      const next = stepCell(merges, focus.r, focus.c, 0, dc, rows, cols)
      moveFocusTo(next.r, next.c, extend)
      return
    }
    // 纵向移动时跳过被筛选隐藏的行
    let r = focus.r
    let c = focus.c
    let guard = 0
    while (guard++ < rows + 2) {
      const next = stepCell(merges, r, c, dr, dc, rows, cols)
      if (next.r === r && next.c === c) break
      r = next.r
      c = next.c
      if (rowVisible(r)) {
        moveFocusTo(r, c, extend)
        return
      }
      if (dr === 0) break
    }
    moveFocusTo(r, c, extend)
  }

  const sortByColumn = (col: number, dir: 'asc' | 'desc') => {
    if (readOnly) return
    if (merges.length) {
      toast.error('请先取消合并单元格后再排序')
      return
    }
    if (col < 0 || col >= cols) return
    const start = dataStartRow
    if (start >= rows) return
    const order = Array.from({ length: rows - start }, (_, i) => start + i)
    order.sort((a, b) => {
      const cmp = compareCellValues(
        cellPlain(value.cells?.[cellKey(a, col)]),
        cellPlain(value.cells?.[cellKey(b, col)])
      )
      return dir === 'asc' ? cmp : -cmp
    })
    const nextCells: Record<string, CellData> = {}
    const nextHeights = [...rowHeights]
    for (const [key, cell] of Object.entries(value.cells || {})) {
      const [rs] = key.split(',').map(Number)
      if (rs < start) nextCells[key] = cell
    }
    for (let i = 0; i < order.length; i++) {
      const srcR = order[i]
      const dstR = start + i
      nextHeights[dstR] = rowHeights[srcR] || DEFAULT_ROW_HEIGHT
      for (let c = 0; c < cols; c++) {
        const src = value.cells?.[cellKey(srcR, c)]
        if (src) nextCells[cellKey(dstR, c)] = { ...src }
      }
    }
    persist({ cells: nextCells, rowHeights: normalizeRowHeights(rows, nextHeights) })
    toast.success(dir === 'asc' ? `已按 ${colLabel(col)} 列升序并保存` : `已按 ${colLabel(col)} 列降序并保存`)
  }

  const toggleFilterMode = () => {
    // 筛选仅本地隐藏行，不写回；有合并也可筛选
    setFilterMenuCol(null)
    if (filterOn) {
      setFilterOn(false)
      setColFilters({})
    } else {
      setFilterOn(true)
      toast.success('已开启筛选（仅本机查看，不保存到表格）')
    }
  }

  const clearSelectionCells = () => {
    if (!sel || readOnly) return
    const nextCells = { ...(value.cells || {}) }
    for (let r = sel.r0; r <= sel.r1; r++) {
      for (let c = sel.c0; c <= sel.c1; c++) {
        if (isCovered(merges, r, c)) continue
        const key = cellKey(r, c)
        const prev = nextCells[key]
        if (!prev) continue
        if (prev.bg || prev.align) {
          nextCells[key] = { bg: prev.bg, align: prev.align }
        } else {
          delete nextCells[key]
        }
      }
    }
    persist({ cells: nextCells })
  }

  const copySelection = async () => {
    if (!sel) return
    const { text, payload } = serializeClipboard(value.cells || {}, sel)
    clipRef.current = payload
    lastCopiedText.current = text
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  const cutSelection = async () => {
    if (readOnly) return
    await copySelection()
    clearSelectionCells()
  }

  const pasteAtFocus = async () => {
    if (!focus || readOnly) return
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      /* ignore */
    }
    const nextCells = { ...(value.cells || {}) }
    const payload =
      clipRef.current && text === lastCopiedText.current ? clipRef.current : null

    if (payload) {
      for (let r = 0; r < payload.rows; r++) {
        for (let c = 0; c < payload.cols; c++) {
          const tr = focus.r + r
          const tc = focus.c + c
          if (tr >= rows || tc >= cols || isCovered(merges, tr, tc)) continue
          const src = payload.cells[cellKey(r, c)]
          const key = cellKey(tr, tc)
          if (src) nextCells[key] = { ...src }
          else delete nextCells[key]
        }
      }
      persist({ cells: nextCells })
      setAnchor({ r: focus.r, c: focus.c })
      setFocus({
        r: Math.min(rows - 1, focus.r + payload.rows - 1),
        c: Math.min(cols - 1, focus.c + payload.cols - 1),
      })
      return
    }

    const tsv = text ? parseTsv(text) : []
    if (!tsv.length) return
    for (let r = 0; r < tsv.length; r++) {
      for (let c = 0; c < (tsv[r]?.length || 0); c++) {
        const tr = focus.r + r
        const tc = focus.c + c
        if (tr >= rows || tc >= cols || isCovered(merges, tr, tc)) continue
        const plain = tsv[r][c] ?? ''
        const key = cellKey(tr, tc)
        if (!plain) delete nextCells[key]
        else nextCells[key] = { ...(nextCells[key] || {}), v: plain, html: escapeHtml(plain) }
      }
    }
    persist({ cells: nextCells })
  }

  const undo = () => {
    if (readOnly || !onChange) return
    const prev = undoStack.current.pop()
    if (!prev) return
    if (editing) setEditing(false)
    redoStack.current.push(
      structuredClone({
        ...value,
        colWidths,
        rowHeights,
        merges,
      })
    )
    applyingHistory.current = true
    onChange(prev)
    applyingHistory.current = false
  }

  const redo = () => {
    if (readOnly || !onChange) return
    const next = redoStack.current.pop()
    if (!next) return
    if (editing) setEditing(false)
    undoStack.current.push(
      structuredClone({
        ...value,
        colWidths,
        rowHeights,
        merges,
      })
    )
    applyingHistory.current = true
    onChange(next)
    applyingHistory.current = false
  }

  const selectAll = () => {
    setAnchor({ r: 0, c: 0 })
    setFocus({ r: rows - 1, c: cols - 1 })
  }

  const mergeSelection = () => {
    if (!sel || readOnly || !onChange) return
    const { r0, r1, c0, c1 } = sel
    const rs = r1 - r0 + 1
    const cs = c1 - c0 + 1
    if (rs === 1 && cs === 1) return
    // 去掉与新区域重叠的旧合并
    const nextMerges = merges.filter((m) => {
      const mr1 = m.r + m.rs - 1
      const mc1 = m.c + m.cs - 1
      return mr1 < r0 || m.r > r1 || mc1 < c0 || m.c > c1
    })
    nextMerges.push({ r: r0, c: c0, rs, cs })
    persist({ merges: nextMerges })
    setAnchor({ r: r0, c: c0 })
    setFocus({ r: r0, c: c0 })
    setEditing(false)
  }

  const unmergeSelection = () => {
    if (!sel || readOnly) return
    const next = merges.filter((m) => {
      // 去掉与选区相交的合并
      const mr1 = m.r + m.rs - 1
      const mc1 = m.c + m.cs - 1
      return !(mr1 >= sel.r0 && m.r <= sel.r1 && mc1 >= sel.c0 && m.c <= sel.c1)
    })
    persist({ merges: next })
  }

  const setCellBg = (bg: string) => {
    if (!sel || readOnly) return
    const nextCells = { ...(value.cells || {}) }
    for (let r = sel.r0; r <= sel.r1; r++) {
      for (let c = sel.c0; c <= sel.c1; c++) {
        if (isCovered(merges, r, c)) continue
        const key = cellKey(r, c)
        const prev = nextCells[key] || {}
        if (bg === 'transparent') {
          const { bg: _, ...rest } = prev
          if (!rest.html && !rest.v && !rest.align) delete nextCells[key]
          else nextCells[key] = rest
        } else {
          nextCells[key] = { ...prev, bg }
        }
      }
    }
    persist({ cells: nextCells })
  }

  const setCellAlign = (align: CellAlign) => {
    if (!sel || readOnly) return
    const nextCells = { ...(value.cells || {}) }
    for (let r = sel.r0; r <= sel.r1; r++) {
      for (let c = sel.c0; c <= sel.c1; c++) {
        if (isCovered(merges, r, c)) continue
        const key = cellKey(r, c)
        nextCells[key] = { ...(nextCells[key] || {}), align }
      }
    }
    persist({ cells: nextCells })
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = resizingRef.current
      if (!st) return
      if (st.kind === 'col') {
        const next = [...st.sizes]
        next[st.index] = Math.min(
          MAX_COL_WIDTH,
          Math.max(MIN_COL_WIDTH, Math.round(st.startSize + e.clientX - st.startPos))
        )
        persist({ colWidths: normalizeColWidths(cols, next) }, { recordHistory: false })
      } else {
        const next = [...st.sizes]
        next[st.index] = Math.min(
          MAX_ROW_HEIGHT,
          Math.max(MIN_ROW_HEIGHT, Math.round(st.startSize + e.clientY - st.startPos))
        )
        persist({ rowHeights: normalizeRowHeights(rows, next) }, { recordHistory: false })
      }
    }
    const onUp = () => {
      resizingRef.current = null
      resizeHistPushed.current = false
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [persist, cols, rows])

  const beginResize = (st: ResizeState) => {
    if (!resizeHistPushed.current && !readOnly && onChange) {
      undoStack.current.push(
        structuredClone({
          ...value,
          colWidths,
          rowHeights,
          merges,
        })
      )
      if (undoStack.current.length > 80) undoStack.current.shift()
      redoStack.current = []
      resizeHistPushed.current = true
    }
    resizingRef.current = st
  }

  const onCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    const m = findMergeAt(merges, r, c)
    const tr = m ? m.r : r
    const tc = m ? m.c : c
    const editingThis = editing && focus?.r === tr && focus?.c === tc
    // 非编辑态拖选时禁止浏览器文本选中（空白/&nbsp; 的蓝色高亮）
    if (!editingThis) {
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      document.body.style.userSelect = 'none'
    }
    if (editing && focus && (focus.r !== tr || focus.c !== tc)) endEdit()
    setAnchor({ r: tr, c: tc })
    setFocus({ r: tr, c: tc })
    setDragging(true)
    gridWrapRef.current?.focus({ preventScroll: true })
  }

  const onCellMouseEnter = (r: number, c: number) => {
    if (!dragging || readOnly) return
    window.getSelection()?.removeAllRanges()
    const m = findMergeAt(merges, r, c)
    setFocus({ r: m ? m.r : r, c: m ? m.c : c })
  }

  const onCellDoubleClick = (r: number, c: number) => {
    const m = findMergeAt(merges, r, c)
    beginEdit(m ? m.r : r, m ? m.c : c)
  }

  const addRows = () => {
    if (readOnly) return
    const n = clampDimCount(dimCount)
    const nextRows = Math.min(200, rows + n)
    persist({
      rows: nextRows,
      rowHeights: normalizeRowHeights(nextRows, rowHeights),
    })
  }

  const addCols = () => {
    if (readOnly) return
    const n = clampDimCount(dimCount)
    const nextCols = Math.min(52, cols + n)
    persist({
      cols: nextCols,
      colWidths: normalizeColWidths(nextCols, colWidths),
    })
  }

  const trimSheet = (nextRows: number, nextCols: number) => {
    const nextCells: Record<string, CellData> = {}
    for (const [key, cell] of Object.entries(value.cells || {})) {
      const [rs, cs] = key.split(',').map(Number)
      if (rs < nextRows && cs < nextCols) nextCells[key] = cell
    }
    const nextMerges = merges
      .map((m) => {
        if (m.r >= nextRows || m.c >= nextCols) return null
        const rs = Math.min(m.rs, nextRows - m.r)
        const cs = Math.min(m.cs, nextCols - m.c)
        if (rs < 1 || cs < 1) return null
        if (rs === 1 && cs === 1) return null
        return { r: m.r, c: m.c, rs, cs }
      })
      .filter(Boolean) as MergeRange[]

    if (focus && (focus.r >= nextRows || focus.c >= nextCols)) {
      setFocus(null)
      setAnchor(null)
      setEditing(false)
    }

    persist({
      rows: nextRows,
      cols: nextCols,
      rowHeights: normalizeRowHeights(nextRows, rowHeights),
      colWidths: normalizeColWidths(nextCols, colWidths),
      cells: nextCells,
      merges: nextMerges,
    })
  }

  const removeRows = () => {
    if (readOnly) return
    const n = clampDimCount(dimCount)
    const nextRows = Math.max(10, rows - n)
    if (nextRows === rows) return
    trimSheet(nextRows, cols)
  }

  const removeCols = () => {
    if (readOnly) return
    const n = clampDimCount(dimCount)
    const nextCols = Math.max(5, cols - n)
    if (nextCols === cols) return
    trimSheet(rows, nextCols)
  }

  const autofitColWidth = (colIndex: number, widths: number[]) => {
    let maxW = MIN_COL_WIDTH
    // 表头字母宽度
    maxW = Math.max(maxW, measureHtmlSize(colLabel(colIndex), { nowrap: true }).w)
    for (let r = 0; r < rows; r++) {
      if (isCovered(merges, r, colIndex)) continue
      const merge = findMergeAt(merges, r, colIndex)
      if (merge && merge.c !== colIndex) continue
      const html = cellToHtml(getCell(r, colIndex))
      if (!html) continue
      const { w } = measureHtmlSize(html, { nowrap: true })
      const span = merge && merge.cs > 1 ? merge.cs : 1
      if (span > 1) {
        // 合并单元格：扣除其他列宽，剩余记到当前列
        let others = 0
        for (let i = 1; i < span; i++) others += widths[colIndex + i] || DEFAULT_COL_WIDTH
        maxW = Math.max(maxW, w - others)
      } else {
        maxW = Math.max(maxW, w)
      }
    }
    return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxW + 4))
  }

  const autofitRowHeight = (rowIndex: number, widths: number[]) => {
    let maxH = MIN_ROW_HEIGHT
    for (let c = 0; c < cols; c++) {
      if (isCovered(merges, rowIndex, c)) continue
      const merge = findMergeAt(merges, rowIndex, c)
      if (merge && merge.r !== rowIndex) continue
      const html = cellToHtml(getCell(rowIndex, c))
      if (!html) continue
      let cellW = widths[c] || DEFAULT_COL_WIDTH
      const cs = merge && merge.cs > 1 ? merge.cs : 1
      const rs = merge && merge.rs > 1 ? merge.rs : 1
      if (cs > 1) {
        cellW = 0
        for (let i = 0; i < cs; i++) cellW += widths[c + i] || DEFAULT_COL_WIDTH
      }
      const { h } = measureHtmlSize(html, { maxWidth: cellW })
      maxH = Math.max(maxH, rs > 1 ? Math.ceil(h / rs) : h)
    }
    return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, maxH))
  }

  const autoFitColumns = (indices?: number[]) => {
    if (readOnly || !canResize) return
    const list =
      indices && indices.length
        ? indices
        : sel
          ? Array.from({ length: sel.c1 - sel.c0 + 1 }, (_, i) => sel.c0 + i)
          : focus
            ? [focus.c]
            : Array.from({ length: cols }, (_, i) => i)
    const next = [...colWidths]
    for (const c of list) {
      if (c < 0 || c >= cols) continue
      next[c] = autofitColWidth(c, next)
    }
    persist({ colWidths: normalizeColWidths(cols, next) })
  }

  const autoFitRows = (indices?: number[]) => {
    if (readOnly || !canResize) return
    const list =
      indices && indices.length
        ? indices
        : sel
          ? Array.from({ length: sel.r1 - sel.r0 + 1 }, (_, i) => sel.r0 + i)
          : focus
            ? [focus.r]
            : Array.from({ length: rows }, (_, i) => i)
    const next = [...rowHeights]
    for (const r of list) {
      if (r < 0 || r >= rows) continue
      next[r] = autofitRowHeight(r, colWidths)
    }
    persist({ rowHeights: normalizeRowHeights(rows, next) })
  }

  const tableWidth = 40 + colWidths.reduce((a, b) => a + b, 0)
  const canFormatText = !readOnly && !!focus
  const multiSel = !!(sel && (sel.r0 !== sel.r1 || sel.c0 !== sel.c1))

  const onEditKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
      gridWrapRef.current?.focus({ preventScroll: true })
      return
    }
    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault()
      endEdit()
      navigate(e.shiftKey ? -1 : 1, 0, false)
      gridWrapRef.current?.focus({ preventScroll: true })
      return
    }
    if (e.key === 'Enter' && e.altKey) {
      // Alt+Enter 换行，交给浏览器默认 / insertLineBreak
      try {
        document.execCommand('insertLineBreak')
        e.preventDefault()
      } catch {
        /* ignore */
      }
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      endEdit()
      navigate(0, e.shiftKey ? -1 : 1, false)
      gridWrapRef.current?.focus({ preventScroll: true })
      return
    }
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'b') {
        e.preventDefault()
        runCmd('bold')
      } else if (k === 'i') {
        e.preventDefault()
        runCmd('italic')
      } else if (k === 'u') {
        e.preventDefault()
        runCmd('underline')
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        endEdit()
        undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        endEdit()
        redo()
      }
    }
  }

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, button')) return

    const mod = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const key = e.key

    if (mod && !e.altKey) {
      const k = key.toLowerCase()
      if (k === 'b') {
        e.preventDefault()
        applyFormatCmd('bold')
        return
      }
      if (k === 'i') {
        e.preventDefault()
        applyFormatCmd('italic')
        return
      }
      if (k === 'u') {
        e.preventDefault()
        applyFormatCmd('underline')
        return
      }
      if (k === 'c') {
        e.preventDefault()
        void copySelection()
        return
      }
      if (k === 'x') {
        e.preventDefault()
        void cutSelection()
        return
      }
      if (k === 'v') {
        e.preventDefault()
        void pasteAtFocus()
        return
      }
      if (k === 'z' && !shift) {
        e.preventDefault()
        undo()
        return
      }
      if (k === 'y' || (k === 'z' && shift)) {
        e.preventDefault()
        redo()
        return
      }
      if (k === 'a') {
        e.preventDefault()
        selectAll()
        return
      }
      if (key === 'Home') {
        e.preventDefault()
        moveFocusTo(0, 0, shift)
        return
      }
      if (key === 'End') {
        e.preventDefault()
        moveFocusTo(rows - 1, cols - 1, shift)
        return
      }
    }

    if (key === 'ArrowUp') {
      e.preventDefault()
      navigate(-1, 0, shift)
      return
    }
    if (key === 'ArrowDown') {
      e.preventDefault()
      navigate(1, 0, shift)
      return
    }
    if (key === 'ArrowLeft') {
      e.preventDefault()
      navigate(0, -1, shift)
      return
    }
    if (key === 'ArrowRight') {
      e.preventDefault()
      navigate(0, 1, shift)
      return
    }
    if (key === 'Tab') {
      e.preventDefault()
      navigate(0, shift ? -1 : 1, false)
      return
    }
    if (key === 'Enter') {
      e.preventDefault()
      if (readOnly || !focus) return
      if (shift) navigate(-1, 0, false)
      else navigate(1, 0, false)
      return
    }
    if (key === 'F2') {
      e.preventDefault()
      if (focus && !readOnly) beginEdit(focus.r, focus.c)
      return
    }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault()
      clearSelectionCells()
      return
    }
    if (key === 'Home') {
      e.preventDefault()
      if (focus) moveFocusTo(focus.r, 0, shift)
      return
    }
    if (key === 'End') {
      e.preventDefault()
      if (focus) moveFocusTo(focus.r, cols - 1, shift)
      return
    }
    if (key === 'PageUp') {
      e.preventDefault()
      navigate(-10, 0, shift)
      return
    }
    if (key === 'PageDown') {
      e.preventDefault()
      navigate(10, 0, shift)
      return
    }

    // 直接输入：覆盖单元格并进入编辑（与 Excel 一致）
    if (
      !readOnly &&
      focus &&
      !mod &&
      !e.altKey &&
      key.length === 1 &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault()
      seedEditRef.current = key
      beginEdit(focus.r, focus.c)
    }
  }

  return (
    <div className={`flex flex-col gap-2 min-h-0 ${className}`}>
      {!readOnly && (
        <div
          ref={toolbarRef}
          className="relative z-50 flex flex-wrap items-center gap-0.5 rounded-xl border border-white/10 bg-gradient-to-b from-gray-800/90 to-gray-900/90 px-2 py-1.5 shadow-lg shadow-black/20 backdrop-blur-sm"
        >
          <SelectMenu
            title="字体（作用于选中文字）"
            value={fontFamily}
            options={FONT_FAMILIES}
            disabled={!canFormatText}
            onBeforeOpen={rememberSelection}
            onPick={applyFontName}
          />
          <SelectMenu
            title="字号（作用于选中文字）"
            value={String(fontSize)}
            options={FONT_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
            disabled={!canFormatText}
            onBeforeOpen={rememberSelection}
            onPick={(v) => applyFontSizePx(Number(v))}
            className="w-[4.25rem]"
          />

          <Divider />

          <TbBtn title="粗体 (Ctrl+B)" disabled={!canFormatText} onClick={() => applyFormatCmd('bold')}>
            <Bold size={14} />
          </TbBtn>
          <TbBtn title="斜体 (Ctrl+I)" disabled={!canFormatText} onClick={() => applyFormatCmd('italic')}>
            <Italic size={14} />
          </TbBtn>
          <TbBtn title="下划线 (Ctrl+U)" disabled={!canFormatText} onClick={() => applyFormatCmd('underline')}>
            <Underline size={14} />
          </TbBtn>

          <Divider />

          <ColorMenu
            title="文字颜色（选中文字）"
            icon={<Type size={14} />}
            colors={TEXT_COLORS}
            disabled={!canFormatText}
            onPick={(c) => {
              rememberSelection()
              applyFormatCmd('foreColor', c)
            }}
          />
          <ColorMenu
            title="文本高亮（选中文字）"
            icon={<Highlighter size={14} />}
            colors={HIGHLIGHT_COLORS}
            disabled={!canFormatText}
            onPick={(c) => {
              if (editing) {
                if (!ensureEditing()) return
                restoreSelection()
                try {
                  document.execCommand('styleWithCSS', false, 'true')
                  if (c === '#ffffff00') document.execCommand('removeFormat')
                  else {
                    try {
                      document.execCommand('hiliteColor', false, c)
                    } catch {
                      document.execCommand('backColor', false, c)
                    }
                  }
                } catch {
                  /* ignore */
                }
                rememberSelection()
                saveEditHtml()
              } else if (c === '#ffffff00') {
                applyFormatCmd('removeFormat')
              } else {
                applyFormatCmd('hiliteColor', c)
              }
            }}
          />

          <Divider />

          <TbBtn
            title="左对齐"
            active={(activeCell?.align || 'left') === 'left'}
            disabled={!focus}
            onClick={() => setCellAlign('left')}
          >
            <AlignLeft size={14} />
          </TbBtn>
          <TbBtn
            title="居中"
            active={activeCell?.align === 'center'}
            disabled={!focus}
            onClick={() => setCellAlign('center')}
          >
            <AlignCenter size={14} />
          </TbBtn>
          <TbBtn
            title="右对齐"
            active={activeCell?.align === 'right'}
            disabled={!focus}
            onClick={() => setCellAlign('right')}
          >
            <AlignRight size={14} />
          </TbBtn>

          <ColorMenu
            title="单元格底色"
            icon={<PaintBucket size={14} />}
            colors={CELL_BG_COLORS}
            value={activeCell?.bg}
            disabled={!focus}
            onPick={setCellBg}
          />

          <Divider />

          <TbBtn
            title="合并单元格"
            disabled={!multiSel}
            onClick={mergeSelection}
          >
            <Combine size={14} />
          </TbBtn>
          <TbBtn title="取消合并" disabled={!focus} onClick={unmergeSelection}>
            <Split size={14} />
          </TbBtn>

          <Divider />

          <TbBtn
            title={filterOn ? '关闭筛选（仅本地，不改数据）' : '开启筛选（观看可用，不写回表格）'}
            active={filterOn}
            onClick={toggleFilterMode}
          >
            <ListFilter size={14} />
          </TbBtn>
          <TbBtn
            title="按当前列升序（编辑：会重排并保存）"
            disabled={readOnly || !focus || !!merges.length}
            onClick={() => focus && sortByColumn(focus.c, 'asc')}
          >
            <ArrowDownAZ size={14} />
          </TbBtn>
          <TbBtn
            title="按当前列降序（编辑：会重排并保存）"
            disabled={readOnly || !focus || !!merges.length}
            onClick={() => focus && sortByColumn(focus.c, 'desc')}
          >
            <ArrowUpZA size={14} />
          </TbBtn>
          <ThemeCheckbox
            checked={headerAsTitle}
            size={15}
            className="h-7 px-1.5 text-[11px] text-gray-400"
            title="首行不参与筛选与排序"
            label="首行为表头"
            onCheckedChange={setHeaderAsTitle}
          />
          {hasActiveFilter && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColFilters({})}
              className="h-7 px-2 rounded-md text-xs text-amber-300 hover:bg-amber-500/15"
              title="清除所有列筛选（不改表格数据）"
            >
              清除筛选
            </button>
          )}

          <Divider />

          <input
            type="number"
            min={1}
            max={10}
            value={dimCount}
            title="一次增减行/列数量（1–10）"
            onChange={(e) => setDimCount(clampDimCount(Number(e.target.value)))}
            className="h-7 w-11 rounded-md bg-black/35 border border-white/10 px-1.5 text-center text-xs text-gray-200 outline-none hover:border-white/25 focus:border-violet-500/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addRows}
            title={`增加 ${clampDimCount(dimCount)} 行`}
            className="h-7 px-2 rounded-md text-xs text-gray-300 hover:bg-white/10 inline-flex items-center gap-0.5"
          >
            <Plus size={12} /> 行
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={removeRows}
            title={`减少 ${clampDimCount(dimCount)} 行（最少 10 行）`}
            disabled={rows <= 10}
            className="h-7 px-1.5 rounded-md text-xs text-gray-300 hover:bg-white/10 inline-flex items-center disabled:opacity-35"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addCols}
            title={`增加 ${clampDimCount(dimCount)} 列`}
            className="h-7 px-2 rounded-md text-xs text-gray-300 hover:bg-white/10 inline-flex items-center gap-0.5"
          >
            <Plus size={12} /> 列
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={removeCols}
            title={`减少 ${clampDimCount(dimCount)} 列（最少 5 列）`}
            disabled={cols <= 5}
            className="h-7 px-1.5 rounded-md text-xs text-gray-300 hover:bg-white/10 inline-flex items-center disabled:opacity-35"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => autoFitColumns()}
            title="自动列宽（当前选区；无选区则整表）· 也可双击列分隔线"
            className="h-7 px-2 rounded-md text-xs text-gray-300 hover:bg-white/10 inline-flex items-center gap-0.5"
          >
            <ArrowLeftRight size={12} /> 列宽
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => autoFitRows()}
            title="自动行高（当前选区；无选区则整表）· 也可双击行分隔线"
            className="h-7 px-2 rounded-md text-xs text-gray-300 hover:bg-white/10 inline-flex items-center gap-0.5"
          >
            <ArrowUpDown size={12} /> 行高
          </button>

          <span className="text-[11px] text-gray-500 ml-1 hidden lg:inline">
            {editing
              ? '选中文字后点格式 · Enter确认 · Alt+Enter换行'
              : multiSel
                ? `已选 ${(sel!.r1 - sel!.r0 + 1) * (sel!.c1 - sel!.c0 + 1)} 格`
                : focus
                  ? `${colLabel(focus.c)}${focus.r + 1} · F2编辑 · 筛选/排序`
                  : '单击选中 · 拖拽多选 · 双击编辑'}
          </span>
        </div>
      )}

      {readOnly && (
        <div className="relative z-50 flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-gray-900/80 px-2 py-1.5">
          <TbBtn
            title={filterOn ? '关闭筛选' : '开启筛选（仅本地查看，不保存）'}
            active={filterOn}
            onClick={toggleFilterMode}
          >
            <ListFilter size={14} />
          </TbBtn>
          <ThemeCheckbox
            checked={headerAsTitle}
            size={15}
            className="h-7 px-1.5 text-[11px] text-gray-400"
            title="首行不参与筛选与排序"
            label="首行为表头"
            onCheckedChange={setHeaderAsTitle}
          />
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => setColFilters({})}
              className="h-7 px-2 rounded-md text-xs text-amber-300 hover:bg-amber-500/15"
            >
              清除筛选
            </button>
          )}
          <span className="text-[11px] text-gray-500 ml-1">只读 · 可筛选查看（不保存）</span>
        </div>
      )}

      {canResize && (
        <div className="text-[11px] text-gray-500">
          拖表头右缘调列宽 · 拖行号下缘调行高 · 双击分隔线自动调整
        </div>
      )}

      <div
        ref={gridWrapRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        className="relative z-0 flex-1 min-h-0 overflow-auto sheet-scrollbar rounded-lg border border-gray-700/70 bg-gray-900 outline-none focus:ring-1 focus:ring-violet-500/40 select-none"
      >
        <table
          className="border-separate border-spacing-0 text-sm table-fixed select-none"
          style={{ width: tableWidth, minWidth: tableWidth }}
        >
          <colgroup>
            <col style={{ width: 40 }} />
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: HEADER_ROW_HEIGHT }}>
              <th
                className="sticky left-0 top-0 z-30 border-b border-r border-gray-700/70 bg-gray-800 text-gray-500 font-normal"
                style={{ boxShadow: '0 -4px 0 0 #1f2937' }}
              />
              {Array.from({ length: cols }, (_, c) => {
                const filtered = !!colFilters[c]
                return (
                <th
                  key={c}
                  className="sticky top-0 z-20 border-b border-r border-gray-700/70 bg-gray-800 px-2 py-1 text-center text-gray-400 font-medium relative select-none"
                  style={{
                    width: colWidths[c],
                    height: HEADER_ROW_HEIGHT,
                    // 盖住 sticky 表头与滚动容器顶边之间的透缝
                    boxShadow: '0 -4px 0 0 #1f2937',
                  }}
                >
                  <div className="flex items-center justify-center gap-0.5 min-w-0">
                    <span className="truncate">{colLabel(c)}</span>
                    {filterOn && (
                      <button
                        type="button"
                        title="筛选（不改表格数据）"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setFilterMenuCol((v) => (v === c ? null : c))
                        }}
                        className={`shrink-0 p-0.5 rounded hover:bg-white/10 ${
                          filtered ? 'text-violet-300' : 'text-gray-500'
                        }`}
                      >
                        <ChevronDown size={12} />
                      </button>
                    )}
                  </div>
                  {filterOn && filterMenuCol === c && (
                    <FilterColMenu
                      open
                      values={uniqueValuesForCol(c)}
                      selected={colFilters[c] || null}
                      onClose={() => setFilterMenuCol(null)}
                      onApply={(next) => {
                        setColFilters((prev) => {
                          const copy = { ...prev }
                          if (!next) delete copy[c]
                          else copy[c] = next
                          return copy
                        })
                      }}
                      onClear={() => {
                        setColFilters((prev) => {
                          const copy = { ...prev }
                          delete copy[c]
                          return copy
                        })
                      }}
                    />
                  )}
                  {canResize && (
                    <span
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        beginResize({
                          kind: 'col',
                          index: c,
                          startPos: e.clientX,
                          startSize: colWidths[c],
                          sizes: [...colWidths],
                        })
                        document.body.style.cursor = 'col-resize'
                        document.body.style.userSelect = 'none'
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        resizingRef.current = null
                        document.body.style.cursor = ''
                        document.body.style.userSelect = ''
                        autoFitColumns([c])
                      }}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-violet-500/60"
                      title="拖动调整 · 双击自动列宽"
                    />
                  )}
                </th>
              )})}
            </tr>
          </thead>
          <tbody>
            {visibleRowList.map((r) => {
              const rh = rowHeights[r] || DEFAULT_ROW_HEIGHT
              return (
                <tr key={r} style={{ height: rh }}>
                  <td
                    className="sticky left-0 z-10 bg-gray-800 border-b border-r border-gray-700/70 px-1 text-center text-gray-500 text-xs relative select-none align-middle"
                    style={{ height: rh, boxShadow: '-2px 0 0 0 #1f2937' }}
                  >
                    {r + 1}
                    {canResize && (
                      <span
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          beginResize({
                            kind: 'row',
                            index: r,
                            startPos: e.clientY,
                            startSize: rh,
                            sizes: [...rowHeights],
                          })
                          document.body.style.cursor = 'row-resize'
                          document.body.style.userSelect = 'none'
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          resizingRef.current = null
                          document.body.style.cursor = ''
                          document.body.style.userSelect = ''
                          autoFitRows([r])
                        }}
                        className="absolute left-0 bottom-0 w-full h-1.5 cursor-row-resize hover:bg-violet-500/60"
                        title="拖动调整 · 双击自动行高"
                      />
                    )}
                  </td>
                  {Array.from({ length: cols }, (_, c) => {
                    if (isCovered(merges, r, c)) return null
                    const merge = findMergeAt(merges, r, c)
                    const isOrigin = merge && merge.r === r && merge.c === c
                    const rowspan = isOrigin ? merge!.rs : 1
                    const colspan = isOrigin ? merge!.cs : 1
                    const cell = getCell(r, c)
                    const isFocused = focus?.r === r && focus?.c === c
                    const selected = inSel(r, c, sel)
                    const isEditingHere = editing && isFocused
                    let width = colWidths[c]
                    let height = rh
                    if (isOrigin && merge) {
                      width = 0
                      height = 0
                      for (let i = 0; i < merge.cs; i++) width += colWidths[c + i] || DEFAULT_COL_WIDTH
                      for (let i = 0; i < merge.rs; i++)
                        height += rowHeights[r + i] || DEFAULT_ROW_HEIGHT
                    }

                    return (
                      <td
                        key={c}
                        rowSpan={rowspan}
                        colSpan={colspan}
                        className={`border-b border-r border-gray-700/80 p-0 align-top overflow-hidden relative select-none ${
                          selected ? 'ring-2 ring-inset ring-violet-500/80' : ''
                        } ${readOnly ? '' : 'cursor-cell'}`}
                        style={{
                          width,
                          maxWidth: width,
                          height,
                          maxHeight: height,
                          backgroundColor:
                            cell?.bg && cell.bg !== 'transparent' ? cell.bg : undefined,
                          textAlign: cell?.align || 'left',
                        }}
                        onMouseDown={(e) => onCellMouseDown(r, c, e)}
                        onMouseEnter={() => onCellMouseEnter(r, c)}
                        onDoubleClick={() => onCellDoubleClick(r, c)}
                      >
                        {isEditingHere ? (
                          <div
                            ref={editRef}
                            contentEditable
                            suppressContentEditableWarning
                            className="w-full h-full px-2 py-1 outline-none text-gray-100 overflow-auto whitespace-pre-wrap break-words select-text"
                            style={{
                              minHeight: height,
                              maxHeight: height,
                              textAlign: cell?.align || 'left',
                            }}
                            onMouseUp={rememberSelection}
                            onKeyUp={rememberSelection}
                            onBlur={onEditBlur}
                            onKeyDown={onEditKeyDown}
                          />
                        ) : (
                          <div
                            className="px-2 py-1 text-gray-100 overflow-hidden break-words select-none [&_a]:text-blue-300"
                            style={{
                              height,
                              maxHeight: height,
                              textAlign: cell?.align || 'left',
                            }}
                            dangerouslySetInnerHTML={{ __html: cellToHtml(cell) || '&nbsp;' }}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function emptySheetContent(): SheetContent {
  return {
    rows: 40,
    cols: 16,
    colWidths: Array.from({ length: 16 }, () => DEFAULT_COL_WIDTH),
    rowHeights: Array.from({ length: 40 }, () => DEFAULT_ROW_HEIGHT),
    cells: {},
    merges: [],
  }
}
