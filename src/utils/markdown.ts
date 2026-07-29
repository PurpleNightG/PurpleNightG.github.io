import remarkGfm from 'remark-gfm'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough'
import rehypeRaw from 'rehype-raw'

/** 文档预览：GFM + 中日韩 **粗体** 无需空格 + 允许原始 HTML */
export const docRemarkPlugins = [
  remarkGfm,
  remarkCjkFriendly,
  remarkCjkFriendlyGfmStrikethrough,
]

export const docRehypePlugins = [rehypeRaw]
