import { emptySheetContent, type SheetContent } from '../components/SheetGrid'

export type SheetTab = {
  id: string
  name: string
  content: SheetContent
}

/** 工作簿文档：一张表可含多个 sheet（兼容旧版单 sheet JSON） */
export type WorkbookDocument = {
  version: 2
  activeSheetId: string
  sheets: SheetTab[]
}

function newSheetId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clampSheetContent(raw: any): SheetContent {
  const base = emptySheetContent()
  if (!raw || typeof raw !== 'object') return base
  const cols = Math.min(52, Math.max(5, Number(raw.cols) || base.cols))
  const rows = Math.min(200, Math.max(10, Number(raw.rows) || base.rows))
  const colWidths = Array.from({ length: cols }, (_, i) => {
    const w = Number(raw.colWidths?.[i])
    return Number.isFinite(w) ? Math.min(480, Math.max(48, Math.round(w))) : 120
  })
  const rowHeights = Array.from({ length: rows }, (_, i) => {
    const h = Number(raw.rowHeights?.[i])
    return Number.isFinite(h) ? Math.min(240, Math.max(24, Math.round(h))) : 34
  })
  return {
    rows,
    cols,
    colWidths,
    rowHeights,
    cells: raw.cells && typeof raw.cells === 'object' ? raw.cells : {},
    merges: Array.isArray(raw.merges) ? raw.merges : [],
    gridStyle: raw.gridStyle === 'bold' ? 'bold' : 'normal',
  }
}

function isLegacySheetContent(raw: any): boolean {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw.sheets) &&
    (raw.cells != null || raw.rows != null || raw.cols != null)
  )
}

export function emptyWorkbook(name = '工作表1'): WorkbookDocument {
  const id = newSheetId()
  return {
    version: 2,
    activeSheetId: id,
    sheets: [{ id, name, content: emptySheetContent() }],
  }
}

/** 将接口返回的 content 规范为多 sheet 工作簿 */
export function normalizeWorkbook(raw: unknown): WorkbookDocument {
  if (!raw) return emptyWorkbook()
  let data: any = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return emptyWorkbook()
    }
  }

  if (data?.version === 2 && Array.isArray(data.sheets) && data.sheets.length > 0) {
    const sheets: SheetTab[] = data.sheets
      .map((s: any, i: number) => ({
        id: String(s?.id || newSheetId()),
        name: String(s?.name || `工作表${i + 1}`).trim() || `工作表${i + 1}`,
        content: clampSheetContent(s?.content),
      }))
      .filter((s: SheetTab) => s.id)
    if (!sheets.length) return emptyWorkbook()
    const activeSheetId =
      sheets.find((s) => s.id === data.activeSheetId)?.id || sheets[0].id
    return { version: 2, activeSheetId, sheets }
  }

  if (isLegacySheetContent(data)) {
    const id = 's_legacy_main'
    return {
      version: 2,
      activeSheetId: id,
      sheets: [{ id, name: '工作表1', content: clampSheetContent(data) }],
    }
  }

  return emptyWorkbook()
}

export function getActiveSheet(doc: WorkbookDocument): SheetTab {
  return doc.sheets.find((s) => s.id === doc.activeSheetId) || doc.sheets[0]
}

export function setActiveSheetId(doc: WorkbookDocument, id: string): WorkbookDocument {
  if (!doc.sheets.some((s) => s.id === id)) return doc
  return { ...doc, activeSheetId: id }
}

export function updateActiveSheetContent(
  doc: WorkbookDocument,
  content: SheetContent
): WorkbookDocument {
  const activeId = getActiveSheet(doc).id
  return {
    ...doc,
    sheets: doc.sheets.map((s) => (s.id === activeId ? { ...s, content } : s)),
  }
}

export function renameSheet(
  doc: WorkbookDocument,
  id: string,
  name: string
): WorkbookDocument {
  const nextName = name.trim() || '工作表'
  return {
    ...doc,
    sheets: doc.sheets.map((s) => (s.id === id ? { ...s, name: nextName.slice(0, 32) } : s)),
  }
}

export function addSheet(doc: WorkbookDocument, name?: string): WorkbookDocument {
  if (doc.sheets.length >= 30) return doc
  const id = newSheetId()
  const n = doc.sheets.length + 1
  const tab: SheetTab = {
    id,
    name: (name || `工作表${n}`).slice(0, 32),
    content: emptySheetContent(),
  }
  return {
    ...doc,
    activeSheetId: id,
    sheets: [...doc.sheets, tab],
  }
}

export function deleteSheet(doc: WorkbookDocument, id: string): WorkbookDocument {
  if (doc.sheets.length <= 1) return doc
  const sheets = doc.sheets.filter((s) => s.id !== id)
  const activeSheetId =
    doc.activeSheetId === id
      ? sheets[Math.max(0, doc.sheets.findIndex((s) => s.id === id) - 1)]?.id || sheets[0].id
      : doc.activeSheetId
  return { ...doc, sheets, activeSheetId }
}

export function duplicateSheet(doc: WorkbookDocument, id: string): WorkbookDocument {
  if (doc.sheets.length >= 30) return doc
  const src = doc.sheets.find((s) => s.id === id)
  if (!src) return doc
  const newId = newSheetId()
  const copy: SheetTab = {
    id: newId,
    name: `${src.name} 副本`.slice(0, 32),
    content: structuredClone(src.content),
  }
  const idx = doc.sheets.findIndex((s) => s.id === id)
  const sheets = [...doc.sheets]
  sheets.splice(idx + 1, 0, copy)
  return { ...doc, sheets, activeSheetId: newId }
}
