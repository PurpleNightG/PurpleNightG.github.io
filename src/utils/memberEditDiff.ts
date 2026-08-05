/** 助教「信息修改」审批：解析 / 展示变更 diff */

export const MEMBER_EDIT_FIELD_LABELS: Record<string, string> = {
  nickname: '昵称',
  qq: 'QQ号',
  game_id: '游戏ID',
  join_date: '加入时间',
  phase3_reached_at: '首次达三期',
  remarks: '备注',
  status: '状态',
  last_training_date: '最后新训',
}

export type MemberEditDiffItem = {
  key: string
  label: string
  from: string
  to: string
  /** 原值来自当前档案补全（旧申请未存 from） */
  fromInferred?: boolean
}

function displayVal(v: unknown): string {
  if (v == null || v === '') return '空'
  if (typeof v === 'object' && v !== null && ('to' in (v as object) || 'from' in (v as object))) {
    return displayVal((v as { to?: unknown }).to)
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s || '空'
}

function parseRaw(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  try {
    return JSON.parse(String(raw))
  } catch {
    return {}
  }
}

function normalizeCompare(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

/** 兼容旧格式（扁平值）与新格式（{ from, to }） */
export function listMemberEditDiffs(
  raw: unknown,
  currentMember?: Record<string, unknown> | null
): MemberEditDiffItem[] {
  const changes = parseRaw(raw)
  const items: MemberEditDiffItem[] = []

  for (const [key, value] of Object.entries(changes)) {
    const label = MEMBER_EDIT_FIELD_LABELS[key] || key

    let entry = value
    // 偶发双重序列化：值为 JSON 字符串
    if (typeof entry === 'string' && (entry.startsWith('{') || entry.startsWith('"'))) {
      try {
        entry = JSON.parse(entry)
      } catch {
        /* keep string */
      }
    }

    if (entry && typeof entry === 'object' && !Array.isArray(entry) && ('from' in entry || 'to' in entry)) {
      const obj = entry as { from?: unknown; to?: unknown }
      const from = displayVal(obj.from)
      const to = displayVal(obj.to)
      if (from === to) continue
      items.push({ key, label, from, to })
      continue
    }

    const to = displayVal(entry)
    if (currentMember && Object.prototype.hasOwnProperty.call(currentMember, key)) {
      const fromRaw = currentMember[key]
      const from = displayVal(fromRaw)
      if (normalizeCompare(fromRaw) === normalizeCompare(entry)) continue
      items.push({ key, label, from, to, fromInferred: true })
    } else {
      items.push({ key, label, from: '（未记录）', to })
    }
  }

  return items
}

export function memberEditDiffTitle(
  raw: unknown,
  currentMember?: Record<string, unknown> | null
): string {
  return listMemberEditDiffs(raw, currentMember)
    .map((d) => `${d.label}: ${d.from} → ${d.to}`)
    .join('；')
}

export function memberEditDiffCount(raw: unknown): number {
  return listMemberEditDiffs(raw).length
}
