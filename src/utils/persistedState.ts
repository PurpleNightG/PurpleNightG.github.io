/** localStorage JSON / 字符串读写（管理端、助教端列表记忆） */

export function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null || raw === '') return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readLocalString(key: string, fallback = ''): string {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null

export function cycleSort(current: SortConfig, key: string): SortConfig {
  if (current?.key === key) {
    if (current.direction === 'asc') return { key, direction: 'desc' }
    return null
  }
  return { key, direction: 'asc' }
}

export function cmpBasic(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'zh-CN')
}
