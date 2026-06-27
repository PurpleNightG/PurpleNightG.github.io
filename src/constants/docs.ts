/** 文档 slug 与 public/docs/index.json 中的文件名（不含 .md）一致 */
export const DEFAULT_DOC_SLUG = '紫夜CQB战术公会'

export const DOC_SLUGS = {
  guild: '紫夜CQB战术公会',
  newTrainee: '紫夜新训须知',
  rules: '紫夜战术公会公告细则',
  modGuide: '模组详细说明',
  modManager: '模组管理器介绍',
  faq: '一些关于本游戏的小问题',
} as const

export function docPath(slug: string) {
  return `/docs/${slug}`
}
