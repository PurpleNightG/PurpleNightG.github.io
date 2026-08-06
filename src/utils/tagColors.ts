/** 课程类别 / 难度标签颜色预设 */
export const TAG_COLOR_KEYS = [
  'purple',
  'blue',
  'cyan',
  'yellow',
  'orange',
  'green',
  'red',
  'pink',
  'gray',
] as const

export type TagColorKey = (typeof TAG_COLOR_KEYS)[number]

export const TAG_COLOR_CLASSES: Record<TagColorKey, string> = {
  purple: 'bg-purple-600/20 text-purple-300',
  blue: 'bg-blue-600/20 text-blue-300',
  cyan: 'bg-cyan-600/20 text-cyan-300',
  yellow: 'bg-yellow-600/20 text-yellow-300',
  orange: 'bg-orange-600/20 text-orange-300',
  green: 'bg-green-600/20 text-green-300',
  red: 'bg-red-600/20 text-red-300',
  pink: 'bg-pink-600/20 text-pink-300',
  gray: 'bg-gray-600/20 text-gray-300',
}

export const TAG_COLOR_SWATCH: Record<TagColorKey, string> = {
  purple: '#a78bfa',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  yellow: '#facc15',
  orange: '#fb923c',
  green: '#4ade80',
  red: '#f87171',
  pink: '#f472b6',
  gray: '#9ca3af',
}

export function normalizeTagColor(raw: unknown, fallback: TagColorKey = 'purple'): TagColorKey {
  const c = String(raw || '').trim().toLowerCase()
  return (TAG_COLOR_KEYS as readonly string[]).includes(c) ? (c as TagColorKey) : fallback
}

export function tagBadgeClass(color: unknown): string {
  return TAG_COLOR_CLASSES[normalizeTagColor(color)]
}

export type MetaOption = { name: string; color: TagColorKey }

export function parseMetaOptions(data: unknown, fallbackNames: string[]): MetaOption[] {
  if (!Array.isArray(data) || !data.length) {
    return fallbackNames.map((name, i) => ({
      name,
      color: TAG_COLOR_KEYS[i % TAG_COLOR_KEYS.length],
    }))
  }
  return data.map((item, i) => {
    if (typeof item === 'string') {
      return { name: item, color: TAG_COLOR_KEYS[i % TAG_COLOR_KEYS.length] }
    }
    return {
      name: String(item?.name || '').trim(),
      color: normalizeTagColor(item?.color, TAG_COLOR_KEYS[i % TAG_COLOR_KEYS.length]),
    }
  }).filter((x) => x.name)
}
