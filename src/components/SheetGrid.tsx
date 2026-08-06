import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  Square,
  Grid2X2,
  PanelBottom,
  PanelTop,
  PanelLeft,
  PanelRight,
  Ban,
  ClipboardPaste,
  ZoomIn,
  ZoomOut,
  Sigma,
} from 'lucide-react'
import { toast } from '../utils/toast'
import ThemeCheckbox from './ThemeCheckbox'
import { HyperFormula } from 'hyperformula'

export type CellAlign = 'left' | 'center' | 'right'

/** 单元格：html 存选中文字级格式；旧字段兼容整格样式 */
export type CellData = {
  /** 纯文本兜底 / 旧数据 / 公式计算结果 */
  v?: string
  /** 富文本 HTML（选中文字格式）；公式格一般为纯文本结果 */
  html?: string
  /** Excel 风格公式，如 =SUM(A1:B2)；有 f 时显示 v 为计算结果 */
  f?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number
  color?: string
  /** 单元格底色 */
  bg?: string
  fontFamily?: string
  align?: CellAlign
  /** 单元格边框（相对本格四边） */
  borders?: {
    t?: boolean
    r?: boolean
    b?: boolean
    l?: boolean
    color?: string
    /** 边框粗细 px */
    w?: number
  }
}

export type MergeRange = { r: number; c: number; rs: number; cs: number }

export type SheetContent = {
  rows: number
  cols: number
  colWidths?: number[]
  rowHeights?: number[]
  cells: Record<string, CellData>
  merges?: MergeRange[]
  /** 整表网格线：普通 / 加粗更清晰 */
  gridStyle?: 'normal' | 'bold'
}

const DEFAULT_COL_WIDTH = 120
const MIN_COL_WIDTH = 48
const MAX_COL_WIDTH = 480
const DEFAULT_ROW_HEIGHT = 34
const MIN_ROW_HEIGHT = 24
const MAX_ROW_HEIGHT = 240
const HEADER_ROW_HEIGHT = 32
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

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

function cellRef(r: number, c: number) {
  return `${colLabel(c)}${r + 1}`
}

function rangeRef(r0: number, c0: number, r1: number, c1: number) {
  const a = cellRef(Math.min(r0, r1), Math.min(c0, c1))
  const b = cellRef(Math.max(r0, r1), Math.max(c0, c1))
  return a === b ? a : `${a}:${b}`
}

/** 公式点选：把引用写进函数括号内，或替换末尾已有引用 */
function upsertFormulaRef(formula: string, ref: string): string {
  let t = (formula || '').replace(/\s+$/, '')
  if (!t.startsWith('=')) t = `=${t}`

  // …A1 / …A1:B2 在末尾 → 替换
  if (/[A-Za-z]+\d+(?::[A-Za-z]+\d+)?$/i.test(t)) {
    return t.replace(/[A-Za-z]+\d+(?::[A-Za-z]+\d+)?$/i, ref)
  }

  // …A1) / …A1:B2) → 替换括号前的引用（=SUM(A1) 点选时变成 =SUM(B2)）
  if (/[A-Za-z]+\d+(?::[A-Za-z]+\d+)?\)+$/i.test(t)) {
    return t.replace(/[A-Za-z]+\d+(?::[A-Za-z]+\d+)?(?=\)+$)/i, ref)
  }

  // =SUM() → =SUM(ref)
  if (/\(\)$/.test(t)) {
    return t.replace(/\(\)$/, `(${ref})`)
  }

  // 运算符 / 开括号 / 逗号后直接追加
  if (/[=+\-*/^&,(]$/.test(t)) return `${t}${ref}`

  // 落在 ) 前：若括号内已有内容则加逗号
  if (/\)$/.test(t)) {
    const before = t.slice(0, -1)
    if (/[=+\-*/^&,(]$/.test(before)) return `${before}${ref})`
    if (/[A-Za-z]+\d+(?::[A-Za-z]+\d+)?$/i.test(before)) {
      return `${before.replace(/[A-Za-z]+\d+(?::[A-Za-z]+\d+)?$/i, ref)})`
    }
    return `${before},${ref})`
  }

  return `${t}${ref}`
}

/** Excel 风格：不同引用循环配色；函数统一紫色 */
const FORMULA_REF_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c']
const FORMULA_FN_COLOR = '#d8b4fe'
const FORMULA_STR_COLOR = '#86efac'
const FORMULA_NUM_COLOR = '#e2e8f0'
const FORMULA_OP_COLOR = '#94a3b8'

function highlightFormulaHtml(formula: string): string {
  if (!formula) return ''
  if (!formula.trimStart().startsWith('=')) {
    return `<span style="color:#e5e7eb">${escapeHtml(formula)}</span>`
  }
  const refColorMap = new Map<string, string>()
  let refIdx = 0
  const refColor = (ref: string) => {
    const key = ref.toUpperCase()
    let c = refColorMap.get(key)
    if (!c) {
      c = FORMULA_REF_COLORS[refIdx % FORMULA_REF_COLORS.length]
      refColorMap.set(key, c)
      refIdx++
    }
    return c
  }

  let i = 0
  let out = ''
  while (i < formula.length) {
    const rest = formula.slice(i)
    if (rest[0] === '"') {
      let j = 1
      while (j < rest.length) {
        if (rest[j] === '"' && rest[j + 1] === '"') {
          j += 2
          continue
        }
        if (rest[j] === '"') {
          j++
          break
        }
        j++
      }
      const tok = rest.slice(0, j)
      out += `<span style="color:${FORMULA_STR_COLOR}">${escapeHtml(tok)}</span>`
      i += j
      continue
    }
    // 函数名（后接括号）
    const fn = rest.match(/^([A-Za-z][A-Za-z0-9.]*)(?=\()/)
    if (fn) {
      out += `<span style="color:${FORMULA_FN_COLOR};font-weight:600">${escapeHtml(fn[1])}</span>`
      i += fn[1].length
      continue
    }
    // 工作表!引用 或 A1 / A1:B2
    const cell = rest.match(
      /^(?:('[^']+'|[A-Za-z_][\w]*)!)?(\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?)/
    )
    if (cell) {
      out += `<span style="color:${refColor(cell[0])}">${escapeHtml(cell[0])}</span>`
      i += cell[0].length
      continue
    }
    const num = rest.match(/^\d+(\.\d+)?([eE][+-]?\d+)?/)
    if (num) {
      out += `<span style="color:${FORMULA_NUM_COLOR}">${escapeHtml(num[0])}</span>`
      i += num[0].length
      continue
    }
    out += `<span style="color:${FORMULA_OP_COLOR}">${escapeHtml(rest[0])}</span>`
    i += 1
  }
  return out
}

/** 规范化函数插入：始终生成 NAME()，光标落在括号内 */
function normalizeFnInsert(snippet: string): string {
  const name = snippet.replace(/\(\)$/, '').replace(/\($/, '').replace(/\)$/, '').trim()
  return `${name || 'SUM'}()`
}

const COMMON_SHEET_FUNCS: { name: string; desc: string; insert: string }[] = [
  { name: 'SUM', desc: '求和', insert: 'SUM()' },
  { name: 'AVERAGE', desc: '平均值', insert: 'AVERAGE()' },
  { name: 'COUNT', desc: '计数（数字）', insert: 'COUNT()' },
  { name: 'COUNTA', desc: '计数（非空）', insert: 'COUNTA()' },
  { name: 'IF', desc: '条件判断', insert: 'IF()' },
  { name: 'IFERROR', desc: '错误时返回备用值', insert: 'IFERROR()' },
  { name: 'MIN', desc: '最小值', insert: 'MIN()' },
  { name: 'MAX', desc: '最大值', insert: 'MAX()' },
  { name: 'ROUND', desc: '四舍五入', insert: 'ROUND()' },
  { name: 'ABS', desc: '绝对值', insert: 'ABS()' },
  { name: 'AND', desc: '逻辑与', insert: 'AND()' },
  { name: 'OR', desc: '逻辑或', insert: 'OR()' },
  { name: 'LEFT', desc: '左侧文本', insert: 'LEFT()' },
  { name: 'RIGHT', desc: '右侧文本', insert: 'RIGHT()' },
  { name: 'LEN', desc: '文本长度', insert: 'LEN()' },
  { name: 'CONCATENATE', desc: '连接文本', insert: 'CONCATENATE()' },
  { name: 'VLOOKUP', desc: '垂直查找', insert: 'VLOOKUP()' },
  { name: 'INDEX', desc: '索引取值', insert: 'INDEX()' },
  { name: 'MATCH', desc: '匹配位置', insert: 'MATCH()' },
  { name: 'SUMIF', desc: '条件求和', insert: 'SUMIF()' },
]

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
  // 公式格：始终显示计算结果（编辑时另取 f）
  if (cell.f) {
    const text = cell.v || ''
    return text ? escapeHtml(text) : ''
  }
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

/** 进入编辑时的内容：公式显示公式本身 */
function cellEditHtml(cell?: CellData): string {
  if (!cell) return ''
  if (cell.f) return escapeHtml(cell.f)
  return cellToHtml(cell)
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
      const plain = (src?.f || htmlToPlain(cellToHtml(src))).replace(/\t/g, ' ')
      // TSV：含换行或引号时加引号转义
      if (/[\t\n\r"]/.test(plain)) {
        parts.push(`"${plain.replace(/"/g, '""')}"`)
      } else {
        parts.push(plain)
      }
    }
    lines.push(parts.join('\t'))
  }
  return { text: lines.join('\n'), payload: { cells: payloadCells, rows: rs, cols: cs } }
}

/** 解析 Excel/Sheets 的 TSV（支持引号内换行） */
function parseTsv(text: string): string[][] {
  const src = String(text || '').replace(/^\uFEFF/, '')
  if (!src) return []
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let i = 0
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    // 忽略末尾空行
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = []
      return
    }
    rows.push(row)
    row = []
  }

  while (i < src.length) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === '\t') {
      pushField()
      i++
      continue
    }
    if (ch === '\r') {
      if (src[i + 1] === '\n') i++
      pushRow()
      i++
      continue
    }
    if (ch === '\n') {
      pushRow()
      i++
      continue
    }
    field += ch
    i++
  }
  if (inQuotes || field.length > 0 || row.length > 0) pushRow()
  return rows.filter((r, idx, arr) => !(idx === arr.length - 1 && r.length === 1 && r[0] === ''))
}

function parseCssColor(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const s = raw.trim().toLowerCase()
  if (!s || s === 'transparent' || s === 'inherit' || s === 'initial') return undefined
  if (s.startsWith('#')) {
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
    }
    if (/^#[0-9a-f]{6}$/i.test(s)) return s
    return undefined
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    const a = s.startsWith('rgba') ? Number(s.split(',')[3]) : 1
    if (a === 0) return undefined
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`
  }
  return undefined
}

function parseFontSizePx(raw?: string | null): number | undefined {
  if (!raw) return undefined
  const m = String(raw).trim().match(/^([\d.]+)\s*(px|pt)?$/i)
  if (!m) return undefined
  let n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return undefined
  if ((m[2] || 'px').toLowerCase() === 'pt') n = Math.round(n * (96 / 72))
  return Math.min(72, Math.max(10, Math.round(n)))
}

/** 清洗粘贴 HTML，仅保留安全的文字级标签 */
function sanitizePasteInnerHtml(root: Element): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml((node.textContent || '').replace(/\u00a0/g, ' '))
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'img'].includes(tag)) {
      return ''
    }
    if (tag === 'br') return '<br>'
    const inner = Array.from(el.childNodes).map(walk).join('')
    if (tag === 'b' || tag === 'strong') return `<b>${inner}</b>`
    if (tag === 'i' || tag === 'em') return `<i>${inner}</i>`
    if (tag === 'u') return `<u>${inner}</u>`
    if (tag === 'span' || tag === 'font') {
      const styles: string[] = []
      const color = parseCssColor(el.style.color || el.getAttribute('color'))
      const size = parseFontSizePx(el.style.fontSize || el.getAttribute('size') || undefined)
      const weight = el.style.fontWeight
      const fs = el.style.fontStyle
      const td = el.style.textDecoration
      const ff = el.style.fontFamily
      if (color) styles.push(`color:${color}`)
      if (size) styles.push(`font-size:${size}px`)
      if (weight === 'bold' || Number(weight) >= 600) styles.push('font-weight:700')
      if (fs === 'italic') styles.push('font-style:italic')
      if (td.includes('underline')) styles.push('text-decoration:underline')
      if (ff) styles.push(`font-family:${ff.split(',')[0].replace(/['"]/g, '').trim()}`)
      if (styles.length) return `<span style="${styles.join(';')}">${inner}</span>`
      return inner
    }
    if (tag === 'p' || tag === 'div') {
      return inner ? `${inner}<br>` : ''
    }
    return inner
  }
  return Array.from(root.childNodes)
    .map(walk)
    .join('')
    .replace(/(<br>)+$/g, '')
}

function cellDataFromTd(td: Element): CellData {
  const el = td as HTMLElement
  const plain = (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trimEnd()
  const style = el.style
  const bg =
    parseCssColor(style.backgroundColor) ||
    parseCssColor(style.background) ||
    parseCssColor(el.getAttribute('bgcolor'))
  const color = parseCssColor(style.color)
  const fontSize = parseFontSizePx(style.fontSize)
  const weight = style.fontWeight
  const bold = weight === 'bold' || Number(weight) >= 600 || !!el.querySelector('b,strong')
  const italic = style.fontStyle === 'italic' || !!el.querySelector('i,em')
  const underline =
    (style.textDecoration || '').includes('underline') || !!el.querySelector('u')
  const alignRaw = (style.textAlign || el.getAttribute('align') || '').toLowerCase()
  const align: CellAlign | undefined =
    alignRaw === 'center' || alignRaw === 'right' || alignRaw === 'left'
      ? (alignRaw as CellAlign)
      : undefined
  const ff = style.fontFamily
    ? style.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
    : undefined

  const borders: NonNullable<CellData['borders']> = {}
  const borderColor =
    parseCssColor(style.borderColor) ||
    parseCssColor(style.borderTopColor) ||
    parseCssColor(style.borderRightColor) ||
    '#e5e7eb'
  const hasBorder = (side: string) => {
    const w = style.getPropertyValue(`border-${side}-width`)
    const st = style.getPropertyValue(`border-${side}-style`)
    if (st && st !== 'none' && st !== 'hidden') return true
    if (w && w !== '0px' && w !== '0') return true
    return false
  }
  if (hasBorder('top')) borders.t = true
  if (hasBorder('right')) borders.r = true
  if (hasBorder('bottom')) borders.b = true
  if (hasBorder('left')) borders.l = true
  if (borders.t || borders.r || borders.b || borders.l) {
    borders.color = borderColor
    borders.w = 1
  }

  const innerHtml = sanitizePasteInnerHtml(el)
  const cell: CellData = {}
  if (plain.trim()) {
    cell.v = plain
    cell.html = innerHtml || escapeHtml(plain)
  }
  if (bg) cell.bg = bg
  if (color) cell.color = color
  if (fontSize) cell.fontSize = fontSize
  if (bold) cell.bold = true
  if (italic) cell.italic = true
  if (underline) cell.underline = true
  if (align) cell.align = align
  if (ff) cell.fontFamily = ff
  if (borders.t || borders.r || borders.b || borders.l) cell.borders = borders
  return cell
}

function cellToTextOnly(cell?: CellData): CellData | undefined {
  if (!cell) return undefined
  const plain = htmlToPlain(cellToHtml(cell)).replace(/\u00a0/g, ' ')
  if (!plain.trim()) return undefined
  return { v: plain, html: escapeHtml(plain) }
}

/** 从剪贴板 HTML 抽表（纯文本，兼容旧逻辑） */
function parseHtmlTable(html: string): string[][] | null {
  if (!html || !/<\s*table[\s>]/i.test(html)) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (!table) return null
    const rows: string[][] = []
    table.querySelectorAll('tr').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('th,td')).map((td) =>
        (td.textContent || '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trimEnd()
      )
      if (cells.length) rows.push(cells)
    })
    return rows.length ? rows : null
  } catch {
    return null
  }
}

/** Excel/HTML 表 → 带格式的单元格矩阵 */
function parseHtmlTableRich(html: string): CellData[][] | null {
  if (!html || !/<\s*table[\s>]/i.test(html)) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (!table) return null
    const rows: CellData[][] = []
    table.querySelectorAll('tr').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('th,td')).map((td) => cellDataFromTd(td))
      if (cells.length) rows.push(cells)
    })
    return rows.length ? rows : null
  } catch {
    return null
  }
}

function gridLooksMultiCell(grid: unknown[][]): boolean {
  if (grid.length > 1) return true
  return (grid[0]?.length || 0) > 1
}

function cellsHaveFormatDiff(
  formatted: Record<string, CellData>,
  textOnly: Record<string, CellData>
): boolean {
  const keys = new Set([...Object.keys(formatted), ...Object.keys(textOnly)])
  for (const k of keys) {
    const a = formatted[k]
    const b = textOnly[k]
    if (!a && !b) continue
    if (!a || !b) return true
    if ((a.html || '') !== (b.html || '')) return true
    if (a.bg || a.color || a.bold || a.italic || a.underline || a.fontSize || a.fontFamily || a.align || a.borders) {
      return true
    }
  }
  return false
}

function hasAnyBorder(borders?: CellData['borders']) {
  return !!(borders && (borders.t || borders.r || borders.b || borders.l))
}

type OverlayRect = { left: number; top: number; width: number; height: number }

function measureElInRoot(el: HTMLElement, root: HTMLElement): OverlayRect {
  const rr = root.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  return {
    left: er.left - rr.left,
    top: er.top - rr.top,
    width: er.width,
    height: er.height,
  }
}

function querySheetCell(
  root: HTMLElement,
  r: number,
  c: number,
  merges: MergeRange[]
): HTMLElement | null {
  const m = findMergeAt(merges, r, c)
  const rr = m ? m.r : r
  const cc = m ? m.c : c
  return root.querySelector(`[data-cell="${rr},${cc}"]`)
}

function unionOverlayRects(rects: OverlayRect[]): OverlayRect | null {
  if (!rects.length) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.left + r.width)
    bottom = Math.max(bottom, r.top + r.height)
  }
  return { left, top, width: right - left, height: bottom - top }
}

type BorderMode = 'none' | 'all' | 'outer' | 'top' | 'bottom' | 'left' | 'right' | 'thick'

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

function BorderMenu({
  disabled,
  onPick,
  boldGrid,
  onToggleBoldGrid,
}: {
  disabled?: boolean
  onPick: (mode: BorderMode) => void
  boldGrid?: boolean
  onToggleBoldGrid?: () => void
}) {
  const [open, setOpen] = useState(false)
  const items: { mode: BorderMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'all', label: '全部边框', icon: <Square size={14} /> },
    { mode: 'outer', label: '外侧边框', icon: <Grid2X2 size={14} /> },
    { mode: 'thick', label: '粗边框（全）', icon: <Square size={14} strokeWidth={2.5} /> },
    { mode: 'top', label: '上边框', icon: <PanelTop size={14} /> },
    { mode: 'bottom', label: '下边框', icon: <PanelBottom size={14} /> },
    { mode: 'left', label: '左边框', icon: <PanelLeft size={14} /> },
    { mode: 'right', label: '右边框', icon: <PanelRight size={14} /> },
    { mode: 'none', label: '无边框', icon: <Ban size={14} /> },
  ]
  return (
    <div className="relative">
      <button
        type="button"
        title="单元格边框"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-1.5 rounded-md text-gray-300 hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none inline-flex items-center gap-0.5"
      >
        <Square size={14} />
        <ChevronDown size={11} className="opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-[60] w-44 rounded-lg border border-white/10 bg-gray-900 shadow-xl shadow-black/40 overflow-hidden py-1">
            {items.map((it) => (
              <button
                key={it.mode}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(it.mode)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10"
              >
                <span className="text-gray-400">{it.icon}</span>
                {it.label}
              </button>
            ))}
            {onToggleBoldGrid && (
              <>
                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onToggleBoldGrid()
                    setOpen(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/10 ${
                    boldGrid ? 'text-violet-200' : 'text-gray-200'
                  }`}
                >
                  <Grid2X2 size={14} className="text-gray-400" />
                  {boldGrid ? '关闭加粗网格线' : '整表加粗网格线'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Excel 式「格式 → 单元格大小」 */
function FormatSizeMenu({
  disabled,
  onRowHeight,
  onAutoRow,
  onColWidth,
  onAutoCol,
  onDefaultCol,
}: {
  disabled?: boolean
  onRowHeight: () => void
  onAutoRow: () => void
  onColWidth: () => void
  onAutoCol: () => void
  onDefaultCol: () => void
}) {
  const [open, setOpen] = useState(false)
  const Item = ({
    icon,
    label,
    onClick,
  }: {
    icon?: React.ReactNode
    label: string
    onClick: () => void
  }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onClick()
        setOpen(false)
      }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10"
    >
      <span className="w-4 text-gray-400 inline-flex justify-center">{icon}</span>
      {label}
    </button>
  )
  return (
    <div className="relative">
      <button
        type="button"
        title="格式（行高 / 列宽）"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2 rounded-md text-gray-300 hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none inline-flex items-center gap-1 text-xs"
      >
        <Grid2X2 size={14} />
        格式
        <ChevronDown size={11} className="opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-[60] w-52 rounded-lg border border-white/10 bg-gray-900 shadow-xl shadow-black/40 overflow-hidden py-1">
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-500 tracking-wide">
              单元格大小
            </div>
            <Item icon={<ArrowUpDown size={13} />} label="行高..." onClick={onRowHeight} />
            <Item label="自动调整行高" onClick={onAutoRow} />
            <div className="my-1 border-t border-white/10" />
            <Item icon={<ArrowLeftRight size={13} />} label="列宽..." onClick={onColWidth} />
            <Item label="自动调整列宽" onClick={onAutoCol} />
            <Item label="默认列宽..." onClick={onDefaultCol} />
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
  const [editHost, setEditHost] = useState<{ r: number; c: number } | null>(null)
  const [editText, setEditText] = useState('')
  const [fnPickerOpen, setFnPickerOpen] = useState(false)
  const [fnQuery, setFnQuery] = useState('')
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
  const [zoom, setZoom] = useState(1)
  const [colWidthInput, setColWidthInput] = useState(String(DEFAULT_COL_WIDTH))
  const [rowHeightInput, setRowHeightInput] = useState(String(DEFAULT_ROW_HEIGHT))
  const [sizeDialog, setSizeDialog] = useState<null | {
    kind: 'row' | 'col' | 'defaultCol'
    value: string
  }>(null)
  const [pasteOpts, setPasteOpts] = useState<{
    r0: number
    c0: number
    rows: number
    cols: number
    mode: 'keep' | 'text'
    formatted: Record<string, CellData>
    textOnly: Record<string, CellData>
    menuOpen: boolean
  } | null>(null)
  const editRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const gridWrapRef = useRef<HTMLDivElement>(null)
  const gridContentRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef<ResizeState | null>(null)
  const savedRange = useRef<Range | null>(null)
  const undoStack = useRef<SheetContent[]>([])
  const redoStack = useRef<SheetContent[]>([])
  const applyingHistory = useRef(false)
  const clipRef = useRef<ClipboardPayload | null>(null)
  const lastCopiedText = useRef('')
  const seedEditRef = useRef<string | null>(null)
  const resizeHistPushed = useRef(false)
  const formulaBarRef = useRef<HTMLInputElement>(null)
  const formulaBarRowRef = useRef<HTMLDivElement>(null)
  const formulaPointingRef = useRef(false)
  const formulaPointStartRef = useRef<{ r: number; c: number } | null>(null)
  const skipBlurEndRef = useRef(false)

  const rows = value.rows || 40
  const cols = value.cols || 16
  const colWidths = useMemo(() => normalizeColWidths(cols, value.colWidths), [cols, value.colWidths])
  const rowHeights = useMemo(
    () => normalizeRowHeights(rows, value.rowHeights),
    [rows, value.rowHeights]
  )
  const merges = useMemo(() => normalizeMerges(value.merges), [value.merges])
  /** 视图缩放：放大行列像素与字号（不取整，避免各缩放比累加误差） */
  const viewColWidths = useMemo(() => colWidths.map((w) => w * zoom), [colWidths, zoom])
  const viewRowHeights = useMemo(() => rowHeights.map((h) => h * zoom), [rowHeights, zoom])
  const viewHeaderH = HEADER_ROW_HEIGHT * zoom
  const viewFontPx = 14 * zoom
  const viewGutter = 40 * zoom
  const dataStartRow = headerAsTitle ? 1 : 0

  const sel = useMemo(() => {
    if (!anchor || !focus) return null
    return normalizeSel(anchor, focus)
  }, [anchor, focus])

  useEffect(() => {
    const c = focus?.c ?? sel?.c0
    const r = focus?.r ?? sel?.r0
    if (c != null && c >= 0 && c < colWidths.length) {
      setColWidthInput(String(colWidths[c]))
    }
    if (r != null && r >= 0 && r < rowHeights.length) {
      setRowHeightInput(String(rowHeights[r]))
    }
  }, [focus?.r, focus?.c, sel?.c0, sel?.r0, colWidths, rowHeights])

  useEffect(() => {
    const el = gridWrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const dir = e.deltaY > 0 ? -1 : 1
      setZoom((z) => {
        const next = Math.round((z + dir * ZOOM_STEP) * 100) / 100
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const activeCell = focus ? value.cells?.[cellKey(focus.r, focus.c)] : undefined
  const hostCell = editHost ? value.cells?.[cellKey(editHost.r, editHost.c)] : undefined
  const isFormulaMode = editing && editText.trimStart().startsWith('=')

  const allFnNames = useMemo(() => {
    try {
      return HyperFormula.getRegisteredFunctionNames('enGB').slice().sort()
    } catch {
      return COMMON_SHEET_FUNCS.map((f) => f.name)
    }
  }, [])

  const filteredFns = useMemo(() => {
    const q = fnQuery.trim().toUpperCase()
    if (!q) return allFnNames.slice(0, 60)
    return allFnNames.filter((n) => n.includes(q)).slice(0, 80)
  }, [allFnNames, fnQuery])

  const syncEditDomPlain = useCallback((text: string) => {
    if (editRef.current) {
      editRef.current.innerHTML = text
        ? text.trimStart().startsWith('=')
          ? highlightFormulaHtml(text)
          : escapeHtml(text)
        : ''
    }
    if (formulaBarRef.current && document.activeElement !== formulaBarRef.current) {
      formulaBarRef.current.value = text
    }
  }, [])

  const focusFormulaBarAt = (text: string, caret: number) => {
    requestAnimationFrame(() => {
      const el = formulaBarRef.current
      if (!el) return
      el.focus()
      if (el.value !== text) el.value = text
      const pos = Math.max(0, Math.min(caret, text.length))
      try {
        el.setSelectionRange(pos, pos)
      } catch {
        /* ignore */
      }
    })
  }

  const applyFormulaPointRef = useCallback(
    (r0: number, c0: number, r1: number, c1: number) => {
      const ref = rangeRef(r0, c0, r1, c1)
      setEditText((prev) => {
        const next = upsertFormulaRef(prev.startsWith('=') ? prev : `=${prev}`, ref)
        syncEditDomPlain(next)
        return next
      })
    },
    [syncEditDomPlain]
  )

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
    if (!editHost || readOnly) return
    const htmlFromDom = editRef.current?.innerHTML ?? ''
    const plainFromDom = htmlToPlain(htmlFromDom).trim()
    // 公式模式以 editText / 公式栏为准；富文本仍可读 DOM
    const plain = (isFormulaMode || editText.trimStart().startsWith('=')
      ? editText
      : editText || plainFromDom
    ).trim()
    const html =
      plain.startsWith('=')
        ? escapeHtml(plain)
        : editText && !editRef.current
          ? escapeHtml(editText)
          : htmlFromDom || escapeHtml(plain)
    const key = cellKey(editHost.r, editHost.c)
    const nextCells = { ...(value.cells || {}) }
    const prev = nextCells[key] || {}
    if (!plain && !html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, '').trim()) {
      delete nextCells[key]
    } else if (plain.startsWith('=')) {
      nextCells[key] = {
        ...prev,
        f: plain,
        v: plain,
        html: escapeHtml(plain),
        bold: undefined,
        italic: undefined,
        underline: undefined,
        fontSize: undefined,
        color: undefined,
        fontFamily: undefined,
      }
    } else {
      const { f: _drop, ...rest } = prev
      nextCells[key] = {
        ...rest,
        html: html || escapeHtml(plain),
        v: plain,
        f: undefined,
        bold: undefined,
        italic: undefined,
        underline: undefined,
        fontSize: undefined,
        color: undefined,
        fontFamily: undefined,
      }
    }
    persist({ cells: nextCells })
  }, [editHost, readOnly, value.cells, persist, editText, isFormulaMode])

  const beginEdit = useCallback(
    (r: number, c: number, seed?: string) => {
      if (readOnly) return
      if (isCovered(merges, r, c)) return
      setPasteOpts(null)
      setAnchor({ r, c })
      setFocus({ r, c })
      setEditHost({ r, c })
      setEditing(true)
      const cell = value.cells?.[cellKey(r, c)]
      const initial =
        seed != null
          ? seed
          : cell?.f
            ? cell.f
            : htmlToPlain(cellToHtml(cell))
      setEditText(initial)
      formulaPointingRef.current = false
      formulaPointStartRef.current = null
    },
    [readOnly, merges, value.cells]
  )

  useEffect(() => {
    if (!editing || !editHost || !editRef.current) return
    if (seedEditRef.current != null) {
      const ch = seedEditRef.current
      seedEditRef.current = null
      setEditText(ch)
      editRef.current.innerHTML = ch.trimStart().startsWith('=')
        ? highlightFormulaHtml(ch)
        : escapeHtml(ch)
    } else if (isFormulaMode || editText.trimStart().startsWith('=') || hostCell?.f) {
      editRef.current.innerHTML = highlightFormulaHtml(editText)
    } else if (!editRef.current.innerHTML) {
      editRef.current.innerHTML = cellEditHtml(hostCell) || ''
      if (!editText) setEditText(htmlToPlain(editRef.current.innerHTML))
    }
    // 公式点选后保持编辑焦点
    if (!formulaPointingRef.current) {
      editRef.current.focus()
      const range = document.createRange()
      range.selectNodeContents(editRef.current)
      range.collapse(false)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(range)
    }
  }, [editing, editHost?.r, editHost?.c]) // eslint-disable-line react-hooks/exhaustive-deps

  const endEdit = () => {
    if (!editing) return
    formulaPointingRef.current = false
    formulaPointStartRef.current = null
    saveEditHtml()
    setEditing(false)
    setEditHost(null)
    setEditText('')
  }

  const cancelEdit = () => {
    if (!editing) return
    formulaPointingRef.current = false
    formulaPointStartRef.current = null
    setEditing(false)
    setEditHost(null)
    setEditText('')
    seedEditRef.current = null
  }

  const shouldKeepEditing = (node: Node | null) => {
    if (!node) return false
    if (node === editRef.current || node === formulaBarRef.current) return true
    if (toolbarRef.current?.contains(node)) return true
    if (formulaBarRowRef.current?.contains(node)) return true
    return false
  }

  const onEditBlur = (e: React.FocusEvent) => {
    if (skipBlurEndRef.current || formulaPointingRef.current) return
    if (shouldKeepEditing(e.relatedTarget as Node | null)) return
    requestAnimationFrame(() => {
      if (skipBlurEndRef.current || formulaPointingRef.current) return
      const ae = document.activeElement
      if (shouldKeepEditing(ae)) return
      if (ae === gridWrapRef.current) return
      endEdit()
    })
  }

  const onFormulaBarBlur = (e: React.FocusEvent) => {
    if (skipBlurEndRef.current || formulaPointingRef.current) return
    if (shouldKeepEditing(e.relatedTarget as Node | null)) return
    requestAnimationFrame(() => {
      if (skipBlurEndRef.current || formulaPointingRef.current) return
      const ae = document.activeElement
      if (shouldKeepEditing(ae)) return
      if (ae === gridWrapRef.current) return
      endEdit()
    })
  }

  const commitEditAndMove = (dr: number, dc: number) => {
    const host = editHost || focus
    endEdit()
    if (!host) return
    if (dc !== 0 && dr === 0) {
      const next = stepCell(merges, host.r, host.c, 0, dc, rows, cols)
      setAnchor({ r: next.r, c: next.c })
      setFocus({ r: next.r, c: next.c })
      return
    }
    let r = host.r
    let c = host.c
    let guard = 0
    while (guard++ < rows + 2) {
      const next = stepCell(merges, r, c, dr, dc, rows, cols)
      if (next.r === r && next.c === c) break
      r = next.r
      c = next.c
      if (rowVisible(r)) {
        setAnchor({ r, c })
        setFocus({ r, c })
        return
      }
      if (dr === 0) break
    }
    setAnchor({ r, c })
    setFocus({ r, c })
  }

  const insertFunctionSnippet = (snippet: string) => {
    if (readOnly) return
    const insert = normalizeFnInsert(snippet)
    if (!editing || !editHost) {
      if (!focus) {
        toast.error('请先选中单元格')
        return
      }
      const next = `=${insert}`
      beginEdit(focus.r, focus.c, next)
      setFnPickerOpen(false)
      focusFormulaBarAt(next, next.length - 1)
      return
    }
    const t = editText.trimEnd()
    let next: string
    if (!t || !t.startsWith('=')) next = `=${insert}`
    else if (/[=+\-*/^&,(]$/.test(t)) next = `${t}${insert}`
    else next = `${t}${insert}`
    const caret = next.length - 1
    setEditText(next)
    syncEditDomPlain(next)
    setFnPickerOpen(false)
    focusFormulaBarAt(next, caret)
  }

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
    if (!editing || !editHost) {
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
        if (prev.bg || prev.align || prev.borders) {
          nextCells[key] = { bg: prev.bg, align: prev.align, borders: prev.borders }
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

  const pasteAtFocus = async (clip?: { text?: string; html?: string }) => {
    if (!focus || readOnly) return
    let text = clip?.text ?? ''
    let html = clip?.html ?? ''
    if (!text && !html) {
      try {
        text = await navigator.clipboard.readText()
      } catch {
        /* ignore */
      }
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          if (item.types.includes('text/html')) {
            html = await (await item.getType('text/html')).text()
            break
          }
        }
      } catch {
        /* 无权限时仅用 plain text */
      }
    }

    const nextCells = { ...(value.cells || {}) }
    const payload =
      clipRef.current && text && text === lastCopiedText.current ? clipRef.current : null

    const finishSelection = (rowCount: number, colCount: number, nextRows: number, nextCols: number) => {
      setAnchor({ r: focus.r, c: focus.c })
      setFocus({
        r: Math.min(nextRows - 1, focus.r + Math.max(0, rowCount - 1)),
        c: Math.min(nextCols - 1, focus.c + Math.max(0, colCount - 1)),
      })
    }

    const applyMatrix = (
      formatted: Record<string, CellData>,
      textOnly: Record<string, CellData>,
      rowCount: number,
      colCount: number
    ) => {
      const needRows = Math.max(rows, focus.r + rowCount)
      const needCols = Math.max(cols, focus.c + colCount)
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const tr = focus.r + r
          const tc = focus.c + c
          if (isCovered(merges, tr, tc)) continue
          const src = formatted[cellKey(r, c)]
          const key = cellKey(tr, tc)
          if (src && (src.v || src.html || src.bg || src.align || src.borders)) {
            nextCells[key] = { ...src }
          } else {
            delete nextCells[key]
          }
        }
      }
      persist({
        cells: nextCells,
        rows: needRows,
        cols: needCols,
        colWidths: normalizeColWidths(needCols, colWidths),
        rowHeights: normalizeRowHeights(needRows, rowHeights),
      })
      finishSelection(rowCount, colCount, needRows, needCols)
      if (cellsHaveFormatDiff(formatted, textOnly)) {
        setPasteOpts({
          r0: focus.r,
          c0: focus.c,
          rows: rowCount,
          cols: colCount,
          mode: 'keep',
          formatted,
          textOnly,
          menuOpen: false,
        })
      } else {
        setPasteOpts(null)
      }
      if (needRows > rows || needCols > cols) {
        toast.success(`已粘贴并扩展表格至 ${needRows} 行 × ${needCols} 列`)
      }
    }

    if (payload) {
      const formatted: Record<string, CellData> = {}
      const textOnly: Record<string, CellData> = {}
      for (let r = 0; r < payload.rows; r++) {
        for (let c = 0; c < payload.cols; c++) {
          const k = cellKey(r, c)
          const src = payload.cells[k]
          if (src) {
            formatted[k] = { ...src }
            const t = cellToTextOnly(src)
            if (t) textOnly[k] = t
          }
        }
      }
      applyMatrix(formatted, textOnly, payload.rows, payload.cols)
      return
    }

    // 外部粘贴：优先带格式 HTML 表，再纯文本 TSV
    const rich = html ? parseHtmlTableRich(html) : null
    const fromHtml = html ? parseHtmlTable(html) : null
    const fromTsv = text ? parseTsv(text) : []

    const preferRich =
      !!rich &&
      rich.length > 0 &&
      (gridLooksMultiCell(rich) ||
        (fromHtml && gridLooksMultiCell(fromHtml)) ||
        !fromTsv.length ||
        (rich.length === 1 && rich[0].length === 1 && /style\s*=/i.test(html)))

    let formatted: Record<string, CellData> = {}
    let textOnly: Record<string, CellData> = {}
    let rowCount = 0
    let colCount = 0

    if (preferRich && rich) {
      colCount = rich.reduce((m, row) => Math.max(m, row.length), 0)
      rowCount = rich.length
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const src = rich[r]?.[c]
          const k = cellKey(r, c)
          if (src && (src.v || src.html || src.bg || src.align || src.borders || src.color || src.bold)) {
            formatted[k] = { ...src }
            const t = cellToTextOnly(src)
            if (t) textOnly[k] = t
          }
        }
      }
    } else {
      const grid =
        fromHtml && gridLooksMultiCell(fromHtml)
          ? fromHtml
          : fromTsv.length
            ? fromTsv
            : fromHtml || []
      if (!grid.length) return
      colCount = grid.reduce((m, row) => Math.max(m, row.length), 0)
      rowCount = grid.length
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const plain = (grid[r]?.[c] ?? '').replace(/\u00a0/g, ' ')
          const k = cellKey(r, c)
          if (plain.trim()) {
            const cell = { v: plain, html: escapeHtml(plain) }
            formatted[k] = cell
            textOnly[k] = { ...cell }
          }
        }
      }
    }

    if (!rowCount) return
    applyMatrix(formatted, textOnly, rowCount, colCount)
  }

  const applyPasteOption = (mode: 'keep' | 'text') => {
    if (!pasteOpts || readOnly) return
    const srcMap = mode === 'keep' ? pasteOpts.formatted : pasteOpts.textOnly
    const nextCells = { ...(value.cells || {}) }
    for (let r = 0; r < pasteOpts.rows; r++) {
      for (let c = 0; c < pasteOpts.cols; c++) {
        const tr = pasteOpts.r0 + r
        const tc = pasteOpts.c0 + c
        if (isCovered(merges, tr, tc)) continue
        const src = srcMap[cellKey(r, c)]
        const key = cellKey(tr, tc)
        if (src) nextCells[key] = { ...src }
        else delete nextCells[key]
      }
    }
    persist({ cells: nextCells })
    setPasteOpts((p) => (p ? { ...p, mode, menuOpen: false } : null))
  }

  const applyManualColWidth = (raw?: string, opts?: { allColumns?: boolean }) => {
    if (readOnly || !canResize) return
    const n = Math.round(Number(raw ?? colWidthInput))
    if (!Number.isFinite(n)) {
      toast.error('请输入有效列宽')
      return
    }
    const w = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, n))
    let indices: number[]
    if (opts?.allColumns || (!sel && !focus)) {
      indices = Array.from({ length: cols }, (_, i) => i)
    } else if (sel) {
      indices = Array.from({ length: sel.c1 - sel.c0 + 1 }, (_, i) => sel.c0 + i)
    } else if (focus) {
      indices = [focus.c]
    } else {
      indices = Array.from({ length: cols }, (_, i) => i)
    }
    const next = [...colWidths]
    for (const c of indices) next[c] = w
    persist({ colWidths: normalizeColWidths(cols, next) })
    setColWidthInput(String(w))
  }

  const applyManualRowHeight = (raw?: string) => {
    if (readOnly || !canResize) return
    const n = Math.round(Number(raw ?? rowHeightInput))
    if (!Number.isFinite(n)) {
      toast.error('请输入有效行高')
      return
    }
    const h = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, n))
    let indices: number[]
    if (!sel && !focus) {
      indices = Array.from({ length: rows }, (_, i) => i)
    } else if (sel) {
      indices = Array.from({ length: sel.r1 - sel.r0 + 1 }, (_, i) => sel.r0 + i)
    } else if (focus) {
      indices = [focus.r]
    } else {
      indices = Array.from({ length: rows }, (_, i) => i)
    }
    const next = [...rowHeights]
    for (const r of indices) next[r] = h
    persist({ rowHeights: normalizeRowHeights(rows, next) })
    setRowHeightInput(String(h))
  }

  const openSizeDialog = (kind: 'row' | 'col' | 'defaultCol') => {
    if (kind === 'row') {
      const r = focus?.r ?? sel?.r0 ?? 0
      setSizeDialog({ kind, value: String(rowHeights[r] || DEFAULT_ROW_HEIGHT) })
    } else {
      const c = focus?.c ?? sel?.c0 ?? 0
      setSizeDialog({
        kind,
        value: String(kind === 'defaultCol' ? DEFAULT_COL_WIDTH : colWidths[c] || DEFAULT_COL_WIDTH),
      })
    }
  }

  const confirmSizeDialog = () => {
    if (!sizeDialog) return
    if (sizeDialog.kind === 'row') applyManualRowHeight(sizeDialog.value)
    else if (sizeDialog.kind === 'defaultCol') {
      applyManualColWidth(sizeDialog.value, { allColumns: true })
    } else applyManualColWidth(sizeDialog.value)
    setSizeDialog(null)
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
          if (!rest.html && !rest.v && !rest.align && !rest.borders) delete nextCells[key]
          else nextCells[key] = rest
        } else {
          nextCells[key] = { ...prev, bg }
        }
      }
    }
    persist({ cells: nextCells })
  }

  const applyBorders = (mode: BorderMode) => {
    if (!sel || readOnly) return
    const { r0, r1, c0, c1 } = sel
    const nextCells = { ...(value.cells || {}) }
    const color = '#e5e7eb'
    const w = mode === 'thick' ? 2 : 1

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const merge = findMergeAt(merges, r, c)
        if (merge && (merge.r !== r || merge.c !== c)) continue
        const key = cellKey(r, c)
        const prev = { ...(nextCells[key] || {}) }
        if (mode === 'none') {
          delete prev.borders
          if (!prev.html && !prev.v && !prev.align && !prev.bg) delete nextCells[key]
          else nextCells[key] = prev
          continue
        }
        let borders: NonNullable<CellData['borders']>
        if (mode === 'all' || mode === 'thick') {
          borders = { t: true, r: true, b: true, l: true, color, w }
        } else if (mode === 'outer') {
          borders = {
            t: r === r0 || undefined,
            b: r === r1 || undefined,
            l: c === c0 || undefined,
            r: c === c1 || undefined,
            color,
            w: 2,
          }
          if (!borders.t && !borders.b && !borders.l && !borders.r) {
            delete prev.borders
            nextCells[key] = prev
            continue
          }
        } else if (mode === 'top') {
          borders = { ...prev.borders, t: true, color, w: prev.borders?.w || 1 }
        } else if (mode === 'bottom') {
          borders = { ...prev.borders, b: true, color, w: prev.borders?.w || 1 }
        } else if (mode === 'left') {
          borders = { ...prev.borders, l: true, color, w: prev.borders?.w || 1 }
        } else {
          borders = { ...prev.borders, r: true, color, w: prev.borders?.w || 1 }
        }
        prev.borders = borders
        nextCells[key] = prev
      }
    }
    persist({ cells: nextCells })
  }

  const toggleBoldGrid = () => {
    if (readOnly) return
    persist({ gridStyle: value.gridStyle === 'bold' ? 'normal' : 'bold' })
  }

  const onGridPaste = (e: React.ClipboardEvent) => {
    if (readOnly) return
    const text = e.clipboardData.getData('text/plain')
    const html = e.clipboardData.getData('text/html')
    const fromHtml = html ? parseHtmlTable(html) : null
    const fromTsv = text ? parseTsv(text) : []
    const multi =
      (fromHtml && gridLooksMultiCell(fromHtml)) ||
      (fromTsv.length > 0 && gridLooksMultiCell(fromTsv))

    if (editing) {
      if (multi) {
        e.preventDefault()
        e.stopPropagation()
        setEditing(false)
        void pasteAtFocus({ text, html })
        return
      }
      // 单格编辑：只插入纯文本，避免 Excel HTML 边框样式灌入
      e.preventDefault()
      const plain = text || ''
      try {
        document.execCommand('insertText', false, plain)
      } catch {
        /* ignore */
      }
      return
    }

    e.preventDefault()
    e.stopPropagation()
    void pasteAtFocus({ text, html })
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

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = resizingRef.current
      if (!st) return
      const z = zoomRef.current || 1
      if (st.kind === 'col') {
        const next = [...st.sizes]
        next[st.index] = Math.min(
          MAX_COL_WIDTH,
          Math.max(MIN_COL_WIDTH, Math.round(st.startSize + (e.clientX - st.startPos) / z))
        )
        persist({ colWidths: normalizeColWidths(cols, next) }, { recordHistory: false })
      } else {
        const next = [...st.sizes]
        next[st.index] = Math.min(
          MAX_ROW_HEIGHT,
          Math.max(MIN_ROW_HEIGHT, Math.round(st.startSize + (e.clientY - st.startPos) / z))
        )
        persist({ rowHeights: normalizeRowHeights(rows, next) }, { recordHistory: false })
      }
    }
    const onUp = () => {
      resizingRef.current = null
      resizeHistPushed.current = false
      if (formulaPointingRef.current) {
        formulaPointingRef.current = false
        formulaPointStartRef.current = null
        requestAnimationFrame(() => formulaBarRef.current?.focus())
      }
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
    const editingThis = editing && editHost?.r === tr && editHost?.c === tc

    // 公式编辑中点选其他格 → 插入引用，不结束编辑
    if (
      editing &&
      editHost &&
      editText.trimStart().startsWith('=') &&
      (editHost.r !== tr || editHost.c !== tc)
    ) {
      e.preventDefault()
      e.stopPropagation()
      window.getSelection()?.removeAllRanges()
      skipBlurEndRef.current = true
      formulaPointingRef.current = true
      formulaPointStartRef.current = { r: tr, c: tc }
      applyFormulaPointRef(tr, tc, tr, tc)
      setAnchor({ r: tr, c: tc })
      setFocus({ r: tr, c: tc })
      setDragging(true)
      requestAnimationFrame(() => {
        formulaBarRef.current?.focus()
        skipBlurEndRef.current = false
      })
      return
    }

    if (!editingThis) {
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      document.body.style.userSelect = 'none'
    }
    if (editing && editHost && (editHost.r !== tr || editHost.c !== tc)) endEdit()
    setAnchor({ r: tr, c: tc })
    setFocus({ r: tr, c: tc })
    setDragging(true)
    gridWrapRef.current?.focus({ preventScroll: true })
  }

  const onCellMouseEnter = (r: number, c: number) => {
    if (!dragging || readOnly) return
    window.getSelection()?.removeAllRanges()
    const m = findMergeAt(merges, r, c)
    const tr = m ? m.r : r
    const tc = m ? m.c : c
    if (formulaPointingRef.current && formulaPointStartRef.current && isFormulaMode) {
      const s = formulaPointStartRef.current
      applyFormulaPointRef(s.r, s.c, tr, tc)
      setFocus({ r: tr, c: tc })
      return
    }
    setFocus({ r: tr, c: tc })
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

  const [selOverlayStyle, setSelOverlayStyle] = useState<OverlayRect | null>(null)
  const [focusOverlayStyle, setFocusOverlayStyle] = useState<OverlayRect | null>(null)
  const [editHostOverlayStyle, setEditHostOverlayStyle] = useState<OverlayRect | null>(null)
  const [borderSegments, setBorderSegments] = useState<
    { key: string; left: number; top: number; width: number; height: number; color: string }[]
  >([])

  const tableWidth = viewGutter + viewColWidths.reduce((a, b) => a + b, 0)
  const tableHeight =
    viewHeaderH + visibleRowList.reduce((a, r) => a + (viewRowHeights[r] || DEFAULT_ROW_HEIGHT), 0)
  const canFormatText = !readOnly && !!focus
  const multiSel = !!(sel && (sel.r0 !== sel.r1 || sel.c0 !== sel.c1))

  const pasteIconPos = useMemo(() => {
    if (!pasteOpts) return null
    let x = viewGutter
    const cEnd = Math.min(cols - 1, pasteOpts.c0 + pasteOpts.cols - 1)
    for (let c = 0; c <= cEnd; c++) x += viewColWidths[c] || DEFAULT_COL_WIDTH
    let y = viewHeaderH
    const rEnd = Math.min(rows - 1, pasteOpts.r0 + pasteOpts.rows - 1)
    for (let r = 0; r <= rEnd; r++) y += viewRowHeights[r] || DEFAULT_ROW_HEIGHT
    return { left: Math.max(48, x - 28), top: y + 2 }
  }, [pasteOpts, viewColWidths, viewRowHeights, cols, rows, viewHeaderH, viewGutter])

  /** 选区/焦点/线框一律按 DOM 实测，保证任意缩放比例都贴齐格子 */
  useLayoutEffect(() => {
    const root = gridContentRef.current
    if (!root) {
      setSelOverlayStyle(null)
      setFocusOverlayStyle(null)
      setEditHostOverlayStyle(null)
      setBorderSegments([])
      return
    }

    const measure = () => {
      const rootEl = gridContentRef.current
      if (!rootEl) return

      const showSelWhileEdit = isFormulaMode
      if (sel && (!editing || showSelWhileEdit)) {
        const corners: Array<[number, number]> = [
          [sel.r0, sel.c0],
          [sel.r0, sel.c1],
          [sel.r1, sel.c0],
          [sel.r1, sel.c1],
        ]
        const rects: OverlayRect[] = []
        for (const [r, c] of corners) {
          const el = querySheetCell(rootEl, r, c, merges)
          if (el) rects.push(measureElInRoot(el, rootEl))
        }
        setSelOverlayStyle(unionOverlayRects(rects))
      } else {
        setSelOverlayStyle(null)
      }

      if (focus && (!editing || showSelWhileEdit)) {
        const el = querySheetCell(rootEl, focus.r, focus.c, merges)
        setFocusOverlayStyle(el ? measureElInRoot(el, rootEl) : null)
      } else {
        setFocusOverlayStyle(null)
      }

      if (editing && editHost) {
        const el = querySheetCell(rootEl, editHost.r, editHost.c, merges)
        setEditHostOverlayStyle(el ? measureElInRoot(el, rootEl) : null)
      } else {
        setEditHostOverlayStyle(null)
      }

      const segs: {
        key: string
        left: number
        top: number
        width: number
        height: number
        color: string
      }[] = []
      rootEl.querySelectorAll<HTMLElement>('[data-cell]').forEach((el) => {
        const key = el.getAttribute('data-cell') || ''
        const [rs, cs] = key.split(',')
        const r = Number(rs)
        const c = Number(cs)
        if (!Number.isFinite(r) || !Number.isFinite(c)) return
        const b = value.cells?.[cellKey(r, c)]?.borders
        if (!hasAnyBorder(b) || !b) return
        const rect = measureElInRoot(el, rootEl)
        const color = b.color || '#e5e7eb'
        const thick = Math.max(1, (Number(b.w) || 1) * zoom)
        const above = r > 0 ? value.cells?.[cellKey(r - 1, c)]?.borders : undefined
        const leftB = c > 0 ? value.cells?.[cellKey(r, c - 1)]?.borders : undefined
        if (b.t && !above?.b) {
          segs.push({ key: `t-${key}`, left: rect.left, top: rect.top, width: rect.width, height: thick, color })
        }
        if (b.b) {
          segs.push({
            key: `b-${key}`,
            left: rect.left,
            top: rect.top + rect.height - thick,
            width: rect.width,
            height: thick,
            color,
          })
        }
        if (b.l && !leftB?.r) {
          segs.push({ key: `l-${key}`, left: rect.left, top: rect.top, width: thick, height: rect.height, color })
        }
        if (b.r) {
          segs.push({
            key: `r-${key}`,
            left: rect.left + rect.width - thick,
            top: rect.top,
            width: thick,
            height: rect.height,
            color,
          })
        }
      })
      setBorderSegments(segs)
    }

    measure()
    const raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [
    sel,
    focus,
    editing,
    editHost,
    isFormulaMode,
    merges,
    zoom,
    viewColWidths,
    viewRowHeights,
    visibleRowList,
    value.cells,
    rows,
    cols,
  ])

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
      commitEditAndMove(e.shiftKey ? -1 : 1, 0)
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
      commitEditAndMove(0, e.shiftKey ? -1 : 1)
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

    if (key === 'Escape' && pasteOpts) {
      e.preventDefault()
      setPasteOpts(null)
      return
    }

    if (mod && !e.altKey) {
      const k = key.toLowerCase()
      if (k === '0') {
        e.preventDefault()
        setZoom(1)
        return
      }
      if (k === '=' || k === '+') {
        e.preventDefault()
        setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))
        return
      }
      if (k === '-') {
        e.preventDefault()
        setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))
        return
      }
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
        // 交给 onPaste，才能读到 Excel 的 text/html
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
      beginEdit(focus.r, focus.c, key)
    }
  }

  const formulaBarAddr = editHost
    ? `${colLabel(editHost.c)}${editHost.r + 1}`
    : focus
      ? `${colLabel(focus.c)}${focus.r + 1}`
      : ''
  const formulaBarDisplay = editing
    ? editText
    : activeCell?.f || cellPlain(activeCell) || ''

  return (
    <div className={`flex flex-col gap-0 min-h-0 ${className}`}>
      {!readOnly && (
        <div
          ref={toolbarRef}
          className="relative z-50 shrink-0 flex flex-wrap items-center gap-0.5 border-b border-white/10 bg-gradient-to-b from-gray-800/90 to-gray-900/90 px-2 py-1.5"
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
          <BorderMenu
            disabled={!focus}
            onPick={applyBorders}
            boldGrid={value.gridStyle === 'bold'}
            onToggleBoldGrid={toggleBoldGrid}
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

          <FormatSizeMenu
            disabled={!canResize}
            onRowHeight={() => openSizeDialog('row')}
            onAutoRow={() => autoFitRows()}
            onColWidth={() => openSizeDialog('col')}
            onAutoCol={() => autoFitColumns()}
            onDefaultCol={() => openSizeDialog('defaultCol')}
          />

          <Divider />

          <TbBtn
            title="缩小 (Ctrl+- / Ctrl+滚轮)"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}
          >
            <ZoomOut size={14} />
          </TbBtn>
          <button
            type="button"
            title="重置缩放 (Ctrl+0)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setZoom(1)}
            className="h-7 min-w-[2.75rem] px-1 rounded-md text-xs text-gray-300 hover:bg-white/10"
          >
            {Math.round(zoom * 100)}%
          </button>
          <TbBtn
            title="放大 (Ctrl+= / Ctrl+滚轮)"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}
          >
            <ZoomIn size={14} />
          </TbBtn>

          <span className="text-[11px] text-gray-500 ml-1 hidden xl:inline max-w-[20rem] truncate">
            {isFormulaMode
              ? '公式编辑中 · 点选单元格插入引用 · Enter确认'
              : editing
                ? '编辑中 · Enter确认'
                : multiSel
                  ? `已选 ${(sel!.r1 - sel!.r0 + 1) * (sel!.c1 - sel!.c0 + 1)} 格`
                  : focus
                    ? `${colLabel(focus.c)}${focus.r + 1}`
                    : '单击选中 · 双击编辑'}
          </span>
        </div>
      )}

      {!readOnly && (
        <div
          ref={formulaBarRowRef}
          className="relative z-50 shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-white/10 bg-gray-950/70"
        >
          <div
            className="w-14 shrink-0 h-7 rounded-md bg-black/35 border border-white/10 text-[11px] text-gray-300 flex items-center justify-center font-medium"
            title="当前单元格"
          >
            {formulaBarAddr || '—'}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              title="插入函数"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setFnPickerOpen((v) => !v)
                setFnQuery('')
              }}
              className="h-7 px-2 rounded-md text-xs text-sky-200 hover:bg-sky-500/15 border border-sky-500/20 inline-flex items-center gap-1"
            >
              <Sigma size={14} />
              函数
              <ChevronDown size={11} className="opacity-60" />
            </button>
            {fnPickerOpen && (
              <>
                <div className="fixed inset-0 z-[55]" onClick={() => setFnPickerOpen(false)} />
                <div className="absolute left-0 top-8 z-[60] w-72 max-h-80 rounded-lg border border-white/10 bg-gray-900 shadow-xl overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-white/10">
                    <input
                      autoFocus
                      value={fnQuery}
                      onChange={(e) => setFnQuery(e.target.value)}
                      placeholder="搜索函数…"
                      className="w-full h-7 rounded-md bg-black/40 border border-white/10 px-2 text-xs text-gray-200 outline-none focus:border-sky-500/50"
                    />
                  </div>
                  {!fnQuery.trim() && (
                    <div className="px-2 pt-2 pb-1 text-[10px] text-gray-500">常用</div>
                  )}
                  <div className="overflow-y-auto sheet-scrollbar flex-1 py-1">
                    {(!fnQuery.trim() ? COMMON_SHEET_FUNCS.map((f) => f.name) : filteredFns).map(
                      (name) => {
                        const common = COMMON_SHEET_FUNCS.find((f) => f.name === name)
                        return (
                          <button
                            key={name}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => insertFunctionSnippet(common?.insert || `${name}()`)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-baseline gap-2"
                          >
                            <span className="text-sky-300 font-medium shrink-0">{name}</span>
                            {common && (
                              <span className="text-gray-500 truncate">{common.desc}</span>
                            )}
                          </button>
                        )
                      }
                    )}
                    {fnQuery.trim() && filteredFns.length === 0 && (
                      <div className="px-3 py-4 text-xs text-gray-500 text-center">无匹配函数</div>
                    )}
                  </div>
                  <div className="px-2 py-1.5 border-t border-white/10 text-[10px] text-gray-600">
                    共 {allFnNames.length} 个可用函数 · HyperFormula
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="text-[11px] text-sky-400/80 shrink-0 font-medium px-0.5">fx</div>
          <div className="relative flex-1 min-w-0 h-7 rounded-md bg-black/35 border border-white/10 focus-within:border-sky-500/50">
            <div
              aria-hidden
              className="absolute inset-0 px-2 flex items-center overflow-hidden pointer-events-none text-xs whitespace-pre font-sans leading-7"
              dangerouslySetInnerHTML={{
                __html: formulaBarDisplay
                  ? highlightFormulaHtml(formulaBarDisplay)
                  : `<span style="color:#4b5563">输入数值，或以 = 开始公式</span>`,
              }}
            />
            <input
              ref={formulaBarRef}
              value={formulaBarDisplay}
              disabled={readOnly}
              placeholder=""
              spellCheck={false}
              autoComplete="off"
              onFocus={() => {
                if (readOnly) return
                if (!editing && focus) beginEdit(focus.r, focus.c)
              }}
              onChange={(e) => {
                const v = e.target.value
                if (!editing && focus) {
                  beginEdit(focus.r, focus.c, v)
                  return
                }
                setEditText(v)
                if (v.trimStart().startsWith('=') || !editRef.current?.querySelector('b,i,u')) {
                  syncEditDomPlain(v)
                } else if (editRef.current) {
                  editRef.current.innerHTML = escapeHtml(v)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitEditAndMove(e.shiftKey ? -1 : 1, 0)
                  gridWrapRef.current?.focus({ preventScroll: true })
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelEdit()
                  gridWrapRef.current?.focus({ preventScroll: true })
                } else if (e.key === 'Tab') {
                  e.preventDefault()
                  commitEditAndMove(0, e.shiftKey ? -1 : 1)
                  gridWrapRef.current?.focus({ preventScroll: true })
                }
              }}
              onBlur={onFormulaBarBlur}
              className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-sky-300 px-2 text-xs outline-none font-sans leading-7"
              style={{ WebkitTextFillColor: 'transparent', caretColor: '#7dd3fc' }}
            />
          </div>
        </div>
      )}

      {readOnly && (
        <div className="relative z-50 shrink-0 flex flex-wrap items-center gap-1 border-b border-white/10 bg-gray-900/80 px-2 py-1.5">
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
          <Divider />
          <TbBtn
            title="缩小 (Ctrl+滚轮)"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}
          >
            <ZoomOut size={14} />
          </TbBtn>
          <button
            type="button"
            title="重置缩放"
            onClick={() => setZoom(1)}
            className="h-7 min-w-[2.75rem] px-1 rounded-md text-xs text-gray-300 hover:bg-white/10"
          >
            {Math.round(zoom * 100)}%
          </button>
          <TbBtn
            title="放大 (Ctrl+滚轮)"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}
          >
            <ZoomIn size={14} />
          </TbBtn>
          <span className="text-[11px] text-gray-500 ml-1">只读 · 可筛选查看（不保存）</span>
        </div>
      )}

      {canResize && (
        <div className="shrink-0 text-[11px] text-gray-500 px-2 py-1 border-b border-white/5 bg-gray-950/40">
          「格式」调行高列宽 · 拖表头/行号调整 · 双击分隔线自适应 · Ctrl+滚轮缩放
        </div>
      )}

      <div
        ref={gridWrapRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onPaste={onGridPaste}
        className="relative z-0 flex-1 min-h-0 overflow-auto sheet-scrollbar bg-gray-900 outline-none focus:ring-1 focus:ring-inset focus:ring-violet-500/40 select-none"
      >
        <div
          ref={gridContentRef}
          style={{
            width: tableWidth,
            minHeight: tableHeight,
            position: 'relative',
            fontSize: viewFontPx,
          }}
        >
            <table
              className={`border-separate border-spacing-0 table-fixed select-none ${
                value.gridStyle === 'bold' ? 'sheet-grid-bold' : ''
              }`}
              style={{ width: tableWidth, minWidth: tableWidth, fontSize: viewFontPx }}
            >
          <colgroup>
            <col style={{ width: viewGutter }} />
            {viewColWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: viewHeaderH }}>
              <th
                className="sticky left-0 top-0 z-30 border-b border-r border-gray-700/70 bg-gray-800 text-gray-500 font-normal"
                style={{ boxShadow: '0 -4px 0 0 #1f2937', width: viewGutter }}
              />
              {Array.from({ length: cols }, (_, c) => {
                const filtered = !!colFilters[c]
                return (
                <th
                  key={c}
                  className="sticky top-0 z-20 border-b border-r border-gray-700/70 bg-gray-800 px-2 py-1 text-center text-gray-400 font-medium relative select-none"
                  style={{
                    width: viewColWidths[c],
                    height: viewHeaderH,
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
              const rh = viewRowHeights[r] || DEFAULT_ROW_HEIGHT
              return (
                <tr key={r} style={{ height: rh }}>
                  <td
                    className="sticky left-0 z-10 bg-gray-800 border-b border-r border-gray-700/70 px-1 text-center text-gray-500 text-xs relative select-none align-middle"
                    style={{ height: rh, width: viewGutter, boxShadow: '-2px 0 0 0 #1f2937' }}
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
                            startSize: rowHeights[r] || DEFAULT_ROW_HEIGHT,
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
                    const selected = inSel(r, c, sel)
                    const isEditingHere = !!(editHost && editHost.r === r && editHost.c === c)
                    let width = viewColWidths[c]
                    let height = rh
                    if (isOrigin && merge) {
                      width = 0
                      height = 0
                      for (let i = 0; i < merge.cs; i++) width += viewColWidths[c + i] || DEFAULT_COL_WIDTH
                      for (let i = 0; i < merge.rs; i++)
                        height += viewRowHeights[r + i] || DEFAULT_ROW_HEIGHT
                    }

                    return (
                      <td
                        key={c}
                        rowSpan={rowspan}
                        colSpan={colspan}
                        data-cell={`${r},${c}`}
                        className={`border-b border-r p-0 align-top overflow-hidden relative select-none ${
                          value.gridStyle === 'bold'
                            ? 'border-gray-500/70'
                            : 'border-gray-700/80'
                        } ${
                          selected &&
                          (!editing || isFormulaMode) &&
                          !(cell?.bg && cell.bg !== 'transparent')
                            ? isFormulaMode
                              ? 'bg-sky-500/[0.10]'
                              : 'bg-violet-500/[0.08]'
                            : ''
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
                            onInput={() => {
                              if (!editRef.current) return
                              const plain = htmlToPlain(editRef.current.innerHTML)
                              setEditText(plain)
                            }}
                            onMouseUp={rememberSelection}
                            onKeyUp={rememberSelection}
                            onBlur={onEditBlur}
                            onKeyDown={onEditKeyDown}
                            onPaste={onGridPaste}
                          />
                        ) : (
                          <div
                            className={`px-2 py-1 overflow-hidden break-words select-none [&_a]:text-blue-300 ${
                              cell?.f ? 'text-sky-200' : 'text-gray-100'
                            }`}
                            style={{
                              height,
                              maxHeight: height,
                              textAlign: cell?.align || 'left',
                            }}
                            title={cell?.f || undefined}
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

            {selOverlayStyle && (!editing || isFormulaMode) && multiSel && (
              <div
                className="absolute pointer-events-none z-[5]"
                style={{
                  left: selOverlayStyle.left,
                  top: selOverlayStyle.top,
                  width: selOverlayStyle.width,
                  height: selOverlayStyle.height,
                  backgroundColor: isFormulaMode ? 'rgba(14,165,233,0.06)' : 'rgba(139,92,246,0.04)',
                  boxShadow: isFormulaMode
                    ? 'inset 0 0 0 2px rgb(56 189 248)'
                    : 'inset 0 0 0 2px rgb(167 139 250)',
                }}
              />
            )}
            {focusOverlayStyle && !(editing && editHost && focus && editHost.r === focus.r && editHost.c === focus.c) && (
              <div
                className="absolute pointer-events-none z-[6]"
                style={{
                  left: focusOverlayStyle.left,
                  top: focusOverlayStyle.top,
                  width: focusOverlayStyle.width,
                  height: focusOverlayStyle.height,
                  boxShadow: isFormulaMode
                    ? 'inset 0 0 0 2px rgb(56 189 248)'
                    : 'inset 0 0 0 2px rgb(196 181 253)',
                }}
              />
            )}
            {editing && editHost && editHostOverlayStyle && (
              <div
                className="absolute pointer-events-none z-[7]"
                style={{
                  left: editHostOverlayStyle.left,
                  top: editHostOverlayStyle.top,
                  width: editHostOverlayStyle.width,
                  height: editHostOverlayStyle.height,
                  boxShadow: 'inset 0 0 0 2px rgb(125 211 252)',
                }}
              />
            )}
            {borderSegments.map((s) => (
              <div
                key={s.key}
                className="absolute pointer-events-none z-[25]"
                style={{
                  left: s.left,
                  top: s.top,
                  width: s.width,
                  height: s.height,
                  backgroundColor: s.color,
                }}
              />
            ))}

            {pasteOpts && pasteIconPos && !readOnly && (
              <div
                className="absolute z-40"
                style={{ left: pasteIconPos.left, top: pasteIconPos.top }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button
                  type="button"
                  title="粘贴选项"
                  onClick={() =>
                    setPasteOpts((p) => (p ? { ...p, menuOpen: !p.menuOpen } : null))
                  }
                  className={`h-7 w-7 rounded border shadow-lg inline-flex items-center justify-center ${
                    pasteOpts.mode === 'keep'
                      ? 'bg-violet-600/90 border-violet-400/50 text-white'
                      : 'bg-gray-800 border-white/20 text-gray-200'
                  }`}
                >
                  <ClipboardPaste size={14} />
                </button>
                {pasteOpts.menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[45]"
                      onClick={() => setPasteOpts((p) => (p ? { ...p, menuOpen: false } : null))}
                    />
                    <div className="absolute left-0 bottom-8 z-50 w-40 rounded-lg border border-white/15 bg-gray-900 shadow-xl py-1">
                      <button
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2 ${
                          pasteOpts.mode === 'keep' ? 'text-violet-200' : 'text-gray-200'
                        }`}
                        onClick={() => applyPasteOption('keep')}
                      >
                        {pasteOpts.mode === 'keep' ? <Check size={12} /> : <span className="w-3" />}
                        保留源格式
                      </button>
                      <button
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2 ${
                          pasteOpts.mode === 'text' ? 'text-violet-200' : 'text-gray-200'
                        }`}
                        onClick={() => applyPasteOption('text')}
                      >
                        {pasteOpts.mode === 'text' ? <Check size={12} /> : <span className="w-3" />}
                        仅粘贴文本
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
        </div>
      </div>

      {sizeDialog && (
        <div
          className="fixed inset-0 z-[10050] flex items-center justify-center p-4"
          onClick={() => setSizeDialog(null)}
        >
          <div className="absolute inset-0 bg-black/50" aria-hidden />
          <div
            className="relative z-10 w-full max-w-xs rounded-xl border border-white/10 bg-gray-900 shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-medium text-white mb-3">
              {sizeDialog.kind === 'row'
                ? '行高'
                : sizeDialog.kind === 'defaultCol'
                  ? '默认列宽'
                  : '列宽'}
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              {sizeDialog.kind === 'row'
                ? !sel && !focus
                  ? `作用于全部 ${rows} 行`
                  : `作用于选中行（像素 ${MIN_ROW_HEIGHT}–${MAX_ROW_HEIGHT}）`
                : sizeDialog.kind === 'defaultCol'
                  ? `将全部 ${cols} 列设为同一宽度`
                  : !sel && !focus
                    ? `作用于全部 ${cols} 列`
                    : `作用于选中列（像素 ${MIN_COL_WIDTH}–${MAX_COL_WIDTH}）`}
            </p>
            <input
              type="number"
              autoFocus
              min={sizeDialog.kind === 'row' ? MIN_ROW_HEIGHT : MIN_COL_WIDTH}
              max={sizeDialog.kind === 'row' ? MAX_ROW_HEIGHT : MAX_COL_WIDTH}
              value={sizeDialog.value}
              onChange={(e) => setSizeDialog({ ...sizeDialog, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmSizeDialog()
                }
                if (e.key === 'Escape') setSizeDialog(null)
              }}
              className="w-full h-9 rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white outline-none focus:border-violet-400/60"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setSizeDialog(null)}
                className="flex-1 h-9 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-gray-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmSizeDialog}
                className="flex-1 h-9 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm text-white"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
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
