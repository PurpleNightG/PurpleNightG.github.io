/** QQ 公开头像（非官方接口，失败时由组件回退到文字） */
export function qqAvatarUrl(qq?: string | number | null, size: 40 | 100 | 140 | 640 = 100): string | null {
  const n = String(qq ?? '').trim()
  if (!/^\d{5,12}$/.test(n)) return null
  return `https://q1.qlogo.cn/g?b=qq&nk=${n}&s=${size}`
}
