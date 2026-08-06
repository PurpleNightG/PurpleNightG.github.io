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
  'blackgold',
  'blacksilver',
  'blackcopper',
  'blackrose',
  'blackice',
  'blackviolet',
  'blackemerald',
] as const

export type TagColorKey = (typeof TAG_COLOR_KEYS)[number]

/** 色点选择器旁的中文名 */
export const TAG_COLOR_LABELS: Record<TagColorKey, string> = {
  purple: '紫色',
  blue: '蓝色',
  cyan: '青色',
  yellow: '黄色',
  orange: '橙色',
  green: '绿色',
  red: '红色',
  pink: '粉色',
  gray: '灰色',
  blackgold: '黑金',
  blacksilver: '黑银',
  blackcopper: '黑铜',
  blackrose: '黑玫',
  blackice: '黑冰蓝',
  blackviolet: '黑紫',
  blackemerald: '黑翠绿',
}

/** 黑金属系列：金属高光球面参数 */
type MetalSwatch = {
  highlight: string
  mid: string
  dark: string
  edge: string
  bright: string
}

const METAL_SWATCHES: Partial<Record<TagColorKey, MetalSwatch>> = {
  blackgold: {
    highlight: 'rgba(255,240,190,0.95)',
    mid: 'rgba(232,200,110,0.55)',
    dark: '#14110c',
    edge: '#8a7028',
    bright: '#e0c56a',
  },
  blacksilver: {
    highlight: 'rgba(255,255,255,0.95)',
    mid: 'rgba(210,218,230,0.55)',
    dark: '#121418',
    edge: '#7a8494',
    bright: '#e8eef6',
  },
  blackcopper: {
    highlight: 'rgba(255,210,170,0.95)',
    mid: 'rgba(205,120,70,0.55)',
    dark: '#160e0a',
    edge: '#8a4a28',
    bright: '#e0a070',
  },
  blackrose: {
    highlight: 'rgba(255,220,230,0.95)',
    mid: 'rgba(232,160,175,0.55)',
    dark: '#160c10',
    edge: '#9a5060',
    bright: '#f0b8c4',
  },
  blackice: {
    highlight: 'rgba(220,245,255,0.95)',
    mid: 'rgba(140,200,230,0.55)',
    dark: '#0a1218',
    edge: '#3a7090',
    bright: '#b8e0f5',
  },
  blackviolet: {
    highlight: 'rgba(235,220,255,0.95)',
    mid: 'rgba(180,140,230,0.55)',
    dark: '#100c18',
    edge: '#6a48a0',
    bright: '#d0b8f5',
  },
  blackemerald: {
    highlight: 'rgba(200,255,220,0.95)',
    mid: 'rgba(80,200,140,0.55)',
    dark: '#0a1410',
    edge: '#2a8058',
    bright: '#90e8b8',
  },
}

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
  blackgold: 'tag-color-metal tag-color-blackgold',
  blacksilver: 'tag-color-metal tag-color-blacksilver',
  blackcopper: 'tag-color-metal tag-color-blackcopper',
  blackrose: 'tag-color-metal tag-color-blackrose',
  blackice: 'tag-color-metal tag-color-blackice',
  blackviolet: 'tag-color-metal tag-color-blackviolet',
  blackemerald: 'tag-color-metal tag-color-blackemerald',
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
  blackgold: '#d4af37',
  blacksilver: '#c8d0dc',
  blackcopper: '#d4926a',
  blackrose: '#e8a8b4',
  blackice: '#8ec8e8',
  blackviolet: '#b894e8',
  blackemerald: '#5ecf98',
}

/** 选色圆点样式（黑金属系列用高光球面，其余纯色） */
export function tagSwatchStyle(color: TagColorKey): Record<string, string> {
  const metal = METAL_SWATCHES[color]
  if (metal) {
    return {
      backgroundImage: [
        `radial-gradient(circle at 32% 28%, ${metal.highlight} 0%, ${metal.mid} 18%, transparent 42%)`,
        'radial-gradient(circle at 78% 78%, rgba(0,0,0,0.55) 0%, transparent 46%)',
        `linear-gradient(152deg, ${metal.edge}55 0%, ${metal.dark} 38%, #0a0907 62%, ${metal.edge} 88%, ${metal.bright} 100%)`,
      ].join(', '),
      boxShadow:
        'inset 0 1px 1px rgba(255,245,210,0.45), inset 0 -2px 3px rgba(0,0,0,0.55)',
    }
  }
  return { backgroundColor: TAG_COLOR_SWATCH[color] }
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
