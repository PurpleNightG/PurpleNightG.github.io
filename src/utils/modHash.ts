/** 浏览器端计算 .pak 文件 SHA-256（与桌面 hashlib.sha256 分块读等价） */

const DEFAULT_PAKS = new Set(
  Array.from({ length: 25 }, (_, i) => `pakchunk${i}-Windows.pak`)
)

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256File(file: File): Promise<string> {
  // Web Crypto 无增量 API：整文件读入后 digest（与桌面分块读最终结果一致）
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return bufferToHex(hash)
}

export interface ModFileMeta {
  filename: string
  path: string
  hash: string
  size: number
}

/** 从 webkitRelativePath 推断相对 Paks 根的路径，并过滤根目录原版 pak */
export function filterPakFiles(files: FileList | File[]): File[] {
  const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pak'))
  if (!list.length) return []

  // 有相对路径时：找出最浅的「含 .pak 的目录」作为根，根目录原版包排除
  const withRel = list.filter((f) => (f as any).webkitRelativePath)
  if (!withRel.length) {
    // 单文件/多文件选择：不过滤原版名（用户可能故意加子目录同名包）
    return list
  }

  // 找共同的 Paks 根：优先路径中含 /Paks/ 的段
  const roots = withRel.map((f) => {
    const rel = (f as any).webkitRelativePath as string
    const norm = rel.replace(/\\/g, '/')
    const idx = norm.toLowerCase().lastIndexOf('/paks/')
    if (idx >= 0) return norm.slice(0, idx + '/paks'.length)
    // 若选的就是 Paks 文件夹，第一段即根
    const parts = norm.split('/')
    if (parts.length >= 2) return parts[0]
    return ''
  })
  // 使用最短公共根启发式：取第一个有效根
  const paksRoot = roots.find((r) => r) || ''

  return withRel.filter((f) => {
    const rel = ((f as any).webkitRelativePath as string).replace(/\\/g, '/')
    let relative = rel
    if (paksRoot && rel.toLowerCase().startsWith(paksRoot.toLowerCase() + '/')) {
      relative = rel.slice(paksRoot.length + 1)
    } else if (paksRoot && rel.toLowerCase().startsWith(paksRoot.toLowerCase())) {
      relative = rel.slice(paksRoot.length).replace(/^\//, '')
    } else {
      // 去掉第一层文件夹名
      const parts = rel.split('/')
      relative = parts.length > 1 ? parts.slice(1).join('/') : parts[0]
    }
    const isRoot = !relative.includes('/')
    if (isRoot && DEFAULT_PAKS.has(f.name)) return false
    return true
  })
}

export function relativePakPath(file: File): string {
  const rel = (file as any).webkitRelativePath as string | undefined
  if (!rel) return file.name
  const norm = rel.replace(/\\/g, '/')
  const idx = norm.toLowerCase().lastIndexOf('/paks/')
  if (idx >= 0) return norm.slice(idx + '/paks/'.length)
  const parts = norm.split('/')
  return parts.length > 1 ? parts.slice(1).join('/') : file.name
}

export async function hashPakFiles(
  files: File[],
  onProgress?: (done: number, total: number, current: string) => void
): Promise<ModFileMeta[]> {
  const results: ModFileMeta[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.(i, files.length, file.name)
    const hash = await sha256File(file)
    results.push({
      filename: file.name,
      path: relativePakPath(file),
      hash,
      size: file.size,
    })
  }
  onProgress?.(files.length, files.length, '')
  return results
}
