import { HyperFormula, type CellValue, type RawCellContent } from 'hyperformula'
import type { CellData } from '../components/SheetGrid'
import type { WorkbookDocument } from './workbookModel'

/** 将引擎返回值格式化为单元格显示文本 */
export function formatFormulaValue(val: CellValue): string {
  if (val == null) return ''
  if (typeof val === 'object') {
    const err = val as { type?: string; message?: string }
    if (err.type) return `#${String(err.type).toUpperCase()}!`
    return '#ERROR!'
  }
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '#NUM!'
    // 避免过长浮点
    if (Number.isInteger(val)) return String(val)
    const s = val.toPrecision(12).replace(/\.?0+$/, '')
    return s
  }
  return String(val)
}

function plainFromCell(cell?: CellData): string {
  if (!cell) return ''
  if (cell.v != null && cell.v !== '') return String(cell.v)
  if (cell.html) {
    const d = document.createElement('div')
    d.innerHTML = cell.html
    return (d.innerText || d.textContent || '').replace(/\u00a0/g, ' ').trim()
  }
  return ''
}

function cellToEngineRaw(cell?: CellData): RawCellContent {
  if (!cell) return null
  if (cell.f && String(cell.f).trim()) {
    const f = String(cell.f).trim()
    return f.startsWith('=') ? f : `=${f}`
  }
  const plain = plainFromCell(cell).trim()
  if (!plain) return null
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(plain)) return Number(plain)
  return plain
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

function uniqueHfSheetName(used: Set<string>, base: string): string {
  let name = (base || 'Sheet').trim().slice(0, 31) || 'Sheet'
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase())
    return name
  }
  let i = 2
  while (used.has(`${name} (${i})`.toLowerCase())) i++
  const next = `${name} (${i})`.slice(0, 31)
  used.add(next.toLowerCase())
  return next
}

/**
 * 用 HyperFormula 重算整个工作簿中的公式格，写回 v/html 显示值。
 * 每次调用会新建并销毁引擎实例（数据量在本项目限制内足够快）。
 */
export function evaluateWorkbook(doc: WorkbookDocument): WorkbookDocument {
  if (!doc?.sheets?.length) return doc

  let hf: HyperFormula
  try {
    hf = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
      maxRows: 220,
      maxColumns: 60,
      precisionRounding: 10,
    })
  } catch {
    return doc
  }

  try {
    const usedNames = new Set<string>()
    const idToSheet: Record<string, number> = {}

    for (const tab of doc.sheets) {
      const name = uniqueHfSheetName(usedNames, tab.name)
      const added = hf.addSheet(name)
      const sid = hf.getSheetId(added)
      if (sid == null) continue
      idToSheet[tab.id] = sid
    }

    for (const tab of doc.sheets) {
      const sid = idToSheet[tab.id]
      if (sid == null) continue
      const cells = tab.content.cells || {}
      const entries = Object.entries(cells)
      if (!entries.length) continue

      // 按单元格写入（只写有内容的格）
      for (const [key, cell] of entries) {
        const [rs, cs] = key.split(',')
        const r = Number(rs)
        const c = Number(cs)
        if (!Number.isFinite(r) || !Number.isFinite(c)) continue
        if (r < 0 || c < 0 || r >= 220 || c >= 60) continue
        const raw = cellToEngineRaw(cell)
        if (raw === null || raw === '') continue
        try {
          hf.setCellContents({ sheet: sid, row: r, col: c }, [[raw]])
        } catch {
          /* 单格失败不阻断 */
        }
      }
    }

    const sheets = doc.sheets.map((tab) => {
      const sid = idToSheet[tab.id]
      if (sid == null) return tab
      const cells = { ...(tab.content.cells || {}) }
      let changed = false
      for (const [key, cell] of Object.entries(cells)) {
        if (!cell?.f) continue
        const [rs, cs] = key.split(',')
        const r = Number(rs)
        const c = Number(cs)
        if (!Number.isFinite(r) || !Number.isFinite(c)) continue
        let display = ''
        try {
          display = formatFormulaValue(hf.getCellValue({ sheet: sid, row: r, col: c }))
        } catch {
          display = '#ERROR!'
        }
        if (cell.v !== display || cell.html !== escapeHtml(display)) {
          cells[key] = {
            ...cell,
            v: display,
            html: escapeHtml(display),
            // 公式结果用纯文本展示，避免旧富文本残留
            bold: undefined,
            italic: undefined,
            underline: undefined,
            fontSize: undefined,
            color: undefined,
            fontFamily: undefined,
          }
          changed = true
        }
      }
      if (!changed) return tab
      return { ...tab, content: { ...tab.content, cells } }
    })

    return { ...doc, sheets }
  } finally {
    try {
      hf.destroy()
    } catch {
      /* ignore */
    }
  }
}

export function isFormulaInput(text: string): boolean {
  return text.trim().startsWith('=')
}
