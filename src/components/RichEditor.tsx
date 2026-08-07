import { useEditor, EditorContent, Node, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Markdown } from 'tiptap-markdown'
import { Extension } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import markdownItCjkFriendly from 'markdown-it-cjk-friendly'
import { useEffect, useState, useRef } from 'react'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Undo, Redo, AlignLeft, AlignCenter,
  AlignRight, Highlighter, Link as LinkIcon, Image as ImageIcon, RemoveFormatting, X,
  LayoutGrid, AlignJustify, SeparatorVertical, Trash2,
  LayoutTemplate, Info, AlertTriangle, CheckCircle2, Ban, Puzzle,
} from 'lucide-react'

/** 让 markdown-it（富文本导入）支持中文两侧无空格的 **粗体** */
const MarkdownCjkFriendly = Extension.create({
  name: 'markdownCjkFriendly',
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md: any) {
            md.use(markdownItCjkFriendly)
          },
        },
      },
    }
  },
})

/** 空段落用 NBSP 占位，避免写成 <br> 再被 wrapHtmlBlocks 包成「HTML 块」 */
const BLANK_PARA_MARK = '\u00a0'

/**
 * tiptap-markdown 会把 NBSP 序列化成 `&nbsp;` 字符串；
 * 再 setContent 时若当纯文本解析，编辑区就会看到字面量 &nbsp;
 * 统一解码成真正的 Unicode NBSP（\u00a0）。
 */
function decodeNbspEntities(md: string): string {
  if (!md) return md
  return md
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&#160;/g, '\u00a0')
    .replace(/&#x0*a0;/gi, '\u00a0')
}

const ParagraphWithBlankLines = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          if (node.content.size === 0) {
            state.write(BLANK_PARA_MARK)
            state.closeBlock(node)
            return
          }
          // 仅含空白/NBSP 的段落仍按空行写回，避免变成可见空格噪音
          let onlyBlank = true
          node.forEach((child: any) => {
            if (child.isText) {
              if (/[^\s\u00a0\u200b]/.test(child.text || '')) onlyBlank = false
            } else {
              onlyBlank = false
            }
          })
          if (onlyBlank) {
            state.write(BLANK_PARA_MARK)
            state.closeBlock(node)
            return
          }
          state.renderInline(node)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

/** 分隔线前强制空行，避免与图片粘成 ![x](y)--- */
const HorizontalRuleSafe = HorizontalRule.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.ensureNewLine()
          state.write('\n')
          state.write(node.attrs?.markup || '---')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

// Convert any CSS color (rgb/rgba/hex) to #rrggbb for input[type=color]
function rgbToHex(color: string): string {
  if (!color) return '#000000'
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#(.)(.)(.)$/)!
    return `#${r}${r}${g}${g}${b}${b}`
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return '#000000'
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
}

// ---- HTML Block NodeView ----
/** 去掉 contentEditable 产生的尾部空行 / br，避免卡片被撑得很高 */
function sanitizeHtmlBlockHtml(raw: string): string {
  const wrap = document.createElement('div')
  wrap.innerHTML = raw || ''
  wrap.querySelectorAll('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable')
    el.removeAttribute('spellcheck')
    el.removeAttribute('data-html-text-edit')
    ;(el as HTMLElement).style.outline = ''
  })
  wrap.querySelectorAll('[data-html-text-edit]').forEach((el) => {
    el.removeAttribute('data-html-text-edit')
  })

  const isIgnorableNode = (n: ChildNode | null) => {
    if (!n) return false
    if (n.nodeType === Node.TEXT_NODE) return !/[^\s\u00a0]/.test(n.textContent || '')
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement
      if (el.tagName === 'BR') return true
      if ((el.tagName === 'DIV' || el.tagName === 'P' || el.tagName === 'SPAN') && !el.attributes.length) {
        return !el.textContent?.replace(/[\s\u00a0]/g, '') &&
          ![...el.childNodes].some((c) => c.nodeType === Node.ELEMENT_NODE && (c as HTMLElement).tagName !== 'BR')
      }
    }
    return false
  }

  const pruneEdges = (root: HTMLElement) => {
    while (root.firstChild && isIgnorableNode(root.firstChild)) root.removeChild(root.firstChild)
    while (root.lastChild && isIgnorableNode(root.lastChild)) root.removeChild(root.lastChild)
  }

  const trimTextEdges = (el: HTMLElement) => {
    const first = el.firstChild
    if (first?.nodeType === Node.TEXT_NODE) {
      first.textContent = (first.textContent || '').replace(/^[\s\u00a0\r\n]+/, '')
      if (!first.textContent) el.removeChild(first)
    }
    const last = el.lastChild
    if (last?.nodeType === Node.TEXT_NODE) {
      last.textContent = (last.textContent || '').replace(/[\s\u00a0\r\n]+$/, '')
      if (!last.textContent) el.removeChild(last)
    }
  }

  pruneEdges(wrap)
  wrap.querySelectorAll('a, div, p, span').forEach((el) => {
    pruneEdges(el as HTMLElement)
    trimTextEdges(el as HTMLElement)
  })

  // note / 描述：源码开标签后的换行、contentEditable 插入的 <br> 一律压成纯文本
  wrap.querySelectorAll('.note, .doc-card-desc, .doc-card-title').forEach((el) => {
    const node = el as HTMLElement
    const text = (node.textContent || '').replace(/^[\s\u00a0\r\n]+|[\s\u00a0\r\n]+$/g, '')
    node.textContent = text
  })

  return wrap.innerHTML.trim()
}

const HTML_TEXT_EDIT_SELECTOR = [
  '.doc-card-title',
  '.doc-card-desc',
  '.note',
  '.staff-card h3',
  '.staff-card p',
  '.staff-note',
  '.staff-role',
  '.btn',
].join(',')

function enableHtmlTextEditing(root: HTMLElement) {
  const targets = root.querySelectorAll(HTML_TEXT_EDIT_SELECTOR)
  if (targets.length > 0) {
    targets.forEach((el) => {
      const node = el as HTMLElement
      node.contentEditable = 'true'
      node.spellcheck = false
      node.dataset.htmlTextEdit = '1'
    })
    return
  }
  // 无已知结构时：叶子文本容器可编辑，避免整块 contentEditable 撑高
  root.querySelectorAll('div, p, span, li, h1, h2, h3, h4, td, th').forEach((el) => {
    const node = el as HTMLElement
    if (node.children.length > 0) return
    if (!(node.textContent || '').trim()) return
    node.contentEditable = 'true'
    node.spellcheck = false
    node.dataset.htmlTextEdit = '1'
  })
}

function HtmlBlockView({ node, updateAttributes }: any) {
  const [codeOpen, setCodeOpen] = useState(false)
  const [html, setHtml] = useState(node.attrs.content)
  const [draft, setDraft] = useState(node.attrs.content)
  const previewRef = useRef<HTMLDivElement>(null)
  const selfUpdate = useRef(false)

  const mountPreviewHtml = (source: string) => {
    const el = previewRef.current
    if (!el) return
    const cleaned = sanitizeHtmlBlockHtml(source)
    el.innerHTML = cleaned
    enableHtmlTextEditing(el)
  }

  useEffect(() => {
    const next = node.attrs.content || ''
    setHtml(next)
    if (!codeOpen) setDraft(next)
    if (selfUpdate.current) {
      selfUpdate.current = false
      return
    }
    if (!codeOpen) mountPreviewHtml(next)
  }, [node.attrs.content, codeOpen])

  useEffect(() => {
    if (!codeOpen) mountPreviewHtml(html)
  }, [codeOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitFromPreview = () => {
    const el = previewRef.current
    if (!el) return
    const next = sanitizeHtmlBlockHtml(el.innerHTML)
    el.innerHTML = next
    enableHtmlTextEditing(el)
    if (next === html) return
    selfUpdate.current = true
    setHtml(next)
    setDraft(next)
    updateAttributes({ content: next })
  }

  const openCode = () => {
    commitFromPreview()
    setDraft(html)
    setCodeOpen(true)
  }

  const applyCode = () => {
    const next = sanitizeHtmlBlockHtml(draft)
    selfUpdate.current = true
    setHtml(next)
    setDraft(next)
    updateAttributes({ content: next })
    setCodeOpen(false)
  }

  return (
    <NodeViewWrapper contentEditable={false} className="html-block-node group relative">
      {/* 直接展示渲染结果，无代码框 */}
      <div
        ref={previewRef}
        className="markdown-content html-block-preview"
        onClick={e => {
          const a = (e.target as HTMLElement).closest('a')
          if (a) e.preventDefault()
        }}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          if (codeOpen) return
          commitFromPreview()
        }}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            const t = e.target as HTMLElement
            if (t.dataset.htmlTextEdit === '1' && !t.classList.contains('note')) {
              e.preventDefault()
            }
          }
        }}
      />

      {/* 悬停出现：查看/编辑源码 */}
      {!codeOpen && (
        <button
          type="button"
          title="查看 HTML 源码"
          onMouseDown={e => { e.preventDefault(); openCode() }}
          className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2 py-0.5 rounded text-[11px] bg-gray-900/90 border border-purple-500/40 text-purple-300 hover:bg-purple-600/30"
        >
          &lt;/&gt; 源码
        </button>
      )}

      {/* 源码面板：覆盖在内容上，而不是换成矮代码框 */}
      {codeOpen && (
        <div className="mt-2 rounded-lg border border-purple-500/40 bg-gray-950/95 shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700/80 text-xs">
            <span className="text-gray-400 font-mono">HTML 源码</span>
            <span className="text-gray-600">改完点应用；点标题/描述仍可直接改字</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setCodeOpen(false); setDraft(html) }}
                className="text-gray-400 hover:text-white px-2 py-0.5"
              >
                取消
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); applyCode() }}
                className="text-white bg-purple-600 hover:bg-purple-500 rounded px-2.5 py-0.5"
              >
                应用
              </button>
            </div>
          </div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full font-mono text-xs text-gray-200 bg-transparent p-3 min-h-[140px] outline-none resize-y"
            spellCheck={false}
            autoFocus
          />
        </div>
      )}
    </NodeViewWrapper>
  )
}

const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  addAttributes() { return { content: { default: '' } } },
  parseHTML() {
    return [{
      tag: 'div[data-html-block]',
      getAttrs: (dom) => {
        const raw = (dom as HTMLElement).getAttribute('data-html-block') || ''
        try {
          return { content: decodeURIComponent(raw) }
        } catch {
          return { content: raw }
        }
      },
    }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-html-block': encodeURIComponent(node.attrs.content) }]
  },
  addNodeView() { return ReactNodeViewRenderer(HtmlBlockView) },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(node.attrs.content)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

// 需要原样保留的 HTML（避免被 tiptap-markdown 改写成 MD 语法导致丢属性 / 粘连 ---）
const VOID_TAGS = 'img|br|hr|input|meta|link|source|area|base|col|embed|wbr'
const BLOCK_TAGS = `div|section|article|aside|figure|details|nav|header|footer|main|table|iframe|video|audio|a|p|span|ul|ol|blockquote|${VOID_TAGS}`
const BLOCK_OPEN = new RegExp(`^<(${BLOCK_TAGS})\\b`, 'i')
const VOID_LINE = new RegExp(`^<(?:${VOID_TAGS})\\b[^>]*\\/?>\\s*$`, 'i')
const LIST_PREFIX = /^(\s*(?:[-*+]|\d+\.)\s+)/

function toHtmlBlock(html: string) {
  return `<div data-html-block="${encodeURIComponent(html)}"></div>`
}

/** CommonMark：div 类 HTML 块会一直吞行直到空行，必须在块后补空行，否则后续列表会变成纯文本 */
function isBlankMdLine(s: string): boolean {
  return !s || /^[\s\u00a0]*$/.test(s)
}

function pushHtmlBlock(result: string[], html: string, remainingLines: string[], nextIndex: number) {
  // MD 里 HTML 前的空行会变成富文本空段落，看起来像多一截空白 —— 导入时去掉
  while (result.length > 0 && isBlankMdLine(result[result.length - 1])) {
    result.pop()
  }
  result.push(toHtmlBlock(html))
  if (nextIndex < remainingLines.length && remainingLines[nextIndex].trim() !== '') {
    result.push('')
  }
}

function isBalancedSingleLineHtml(s: string): boolean {
  const t = s.trim()
  if (VOID_LINE.test(t)) return true
  const m = t.match(/^<([a-zA-Z][\w:-]*)\b[^>]*>[\s\S]*<\/\1\s*>$/i)
  return !!m
}

function countTagDepth(line: string): number {
  // void 标签不参与深度（无闭合）
  const withoutVoid = line.replace(new RegExp(`<(?:${VOID_TAGS})\\b[^>]*\\/?>`, 'gi'), '')
  const openRe = new RegExp(`<(${BLOCK_TAGS})\\b[^>]*>`, 'gi')
  const closeRe = new RegExp(`<\\/(${BLOCK_TAGS})>`, 'gi')
  const opens = (withoutVoid.match(openRe) || []).length
  const closes = (withoutVoid.match(closeRe) || []).length
  return opens - closes
}

/**
 * 把原始 HTML（含列表行内的 <a>、独立 <img width=...>）包成 htmlBlock，
 * 避免往返时被序列化成 [text](url) / ![alt](src) 并与 --- 粘连。
 * 独立空行占位（历史 <br>）不包成可视化 HTML 块。
 */
const BARE_BLANK_HTML = /^<(?:br|p)\s*\/?\s*>(?:\s*<\/p>)?\s*$/i

function normalizeBlankLineHtml(md: string): string {
  return md.replace(/^[ \t]*<(?:br|p)\s*\/?\s*>(?:\s*<\/p>)?[ \t]*$/gim, BLANK_PARA_MARK)
}

/** 从 Markdown 抽出 HTML 注释：预览本就不显示，且会破坏 TipTap DOM 解析导致后续正文丢失 */
type PreservedHtmlComment = { beforeLine: string; comment: string }

function extractHtmlComments(md: string): { text: string; comments: PreservedHtmlComment[] } {
  const comments: PreservedHtmlComment[] = []
  const text = md.replace(/<!--[\s\S]*?-->/g, (comment, offset, full: string) => {
    const head = full.slice(0, offset)
    const lines = head.split('\n')
    let beforeLine = ''
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) {
        beforeLine = lines[i]
        break
      }
    }
    comments.push({ beforeLine, comment })
    return '\n'
  })
  return { text, comments }
}

function restoreHtmlComments(md: string, comments: PreservedHtmlComment[]): string {
  if (!comments.length) return md
  let out = md
  for (let i = comments.length - 1; i >= 0; i--) {
    const { beforeLine, comment } = comments[i]
    if (!beforeLine) {
      out = `${comment}\n${out}`
      continue
    }
    const idx = out.indexOf(beforeLine)
    if (idx === -1) {
      out = `${out.replace(/\s+$/, '')}\n\n${comment}\n`
      continue
    }
    const insertAt = idx + beforeLine.length
    out = `${out.slice(0, insertAt)}\n\n${comment}${out.slice(insertAt)}`
  }
  return out
}

function wrapHtmlBlocks(md: string): string {
  const lines = normalizeBlankLineHtml(md).split('\n')
  const result: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const listMatch = line.match(LIST_PREFIX)
    const payload = listMatch ? line.slice(listMatch[0].length) : line.trimStart()

    // 独立 void 行：整行保护（保留 width 等属性）；裸 <br> 已在上方规范化，不再进 HTML 块
    if (!listMatch && VOID_LINE.test(line.trim())) {
      if (BARE_BLANK_HTML.test(line.trim())) {
        result.push(BLANK_PARA_MARK)
        i++
        continue
      }
      pushHtmlBlock(result, line.trim(), lines, i + 1)
      i++
      continue
    }

    // 列表项整行就是一段 HTML：整行保护（含 "- <a>...</a>"）
    if (listMatch && isBalancedSingleLineHtml(payload)) {
      if (BARE_BLANK_HTML.test(payload.trim())) {
        result.push(`${listMatch[0]}${BLANK_PARA_MARK}`)
        i++
        continue
      }
      pushHtmlBlock(result, line, lines, i + 1)
      i++
      continue
    }

    // 行首（或去列表前缀后）是 HTML 开标签：按深度收齐
    if (BLOCK_OPEN.test(payload.trimStart())) {
      const htmlLines: string[] = []
      let depth = 0
      while (i < lines.length) {
        const cur = lines[i]
        const depthSrc = htmlLines.length === 0 ? payload : cur
        depth += countTagDepth(depthSrc)
        htmlLines.push(htmlLines.length === 0 ? line : cur)
        i++
        if (depth <= 0 && htmlLines.length > 0) break
        if (htmlLines.length === 1 && VOID_LINE.test(payload.trim())) break
      }
      const joined = htmlLines.join('\n')
      // 整块其实只是空行占位（连续 <br>）时，展开为多个空段落，而不是一个 HTML 块
      if (/^(?:\s*<br\s*\/?\s*>\s*)+$/i.test(joined)) {
        const n = (joined.match(/<br\b/gi) || []).length || 1
        for (let k = 0; k < n; k++) result.push(BLANK_PARA_MARK)
        continue
      }
      pushHtmlBlock(result, joined, lines, i)
      continue
    }

    result.push(line)
    i++
  }
  return result.join('\n')
}

function unwrapHtmlBlocks(md: string): string {
  return md.replace(
    /<div\s+data-html-block="([^"]*?)"\s*(?:\/>|>\s*<\/div>)/g,
    (_, enc) => decodeURIComponent(enc)
  )
}

/** 删除紧挨 HTML 块的空段落（MD 空行残留，删不掉的那种空白） */
function removeEmptyParagraphsAroundHtmlBlocks(ed: any) {
  const { state } = ed
  const ranges: { from: number; to: number }[] = []
  const isEmptyPara = (node: any) => {
    if (node.type.name !== 'paragraph') return false
    return !String(node.textContent || '').replace(/[\s\u00a0\u200b]/g, '')
  }
  state.doc.descendants((node: any, pos: number) => {
    if (!isEmptyPara(node)) return
    const $pos = state.doc.resolve(pos)
    const index = $pos.index()
    const parent = $pos.parent
    const prev = index > 0 ? parent.child(index - 1) : null
    const next = index < parent.childCount - 1 ? parent.child(index + 1) : null
    if (prev?.type.name === 'htmlBlock' || next?.type.name === 'htmlBlock') {
      ranges.push({ from: pos, to: pos + node.nodeSize })
    }
  })
  if (!ranges.length) return
  let tr = state.tr
  for (let i = ranges.length - 1; i >= 0; i--) {
    tr = tr.delete(ranges[i].from, ranges[i].to)
  }
  ed.view.dispatch(tr)
}

interface RichEditorProps {
  value: string
  onChange: (markdown: string) => void
}

function ToolbarButton({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-purple-600/30 text-purple-300'
          : 'text-gray-400 hover:text-white hover:bg-gray-600/50'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-gray-600 mx-0.5 flex-shrink-0" />
}

type ModalType = 'link' | 'image' | 'docCard' | 'note' | null
type NoteTone = 'info' | 'warning' | 'success' | 'danger'

function escapeHtmlAttr(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlText(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildDocCardHtml(url: string, title: string, desc: string): string {
  return (
    `<a href="${escapeHtmlAttr(url.trim())}" target="_blank" rel="noopener noreferrer" class="doc-card">\n` +
    `  <div class="doc-card-title">${escapeHtmlText(title.trim() || '标题')}</div>\n` +
    `  <div class="doc-card-desc">${escapeHtmlText(desc.trim() || '描述')}</div>\n` +
    `</a>`
  )
}

function buildNoteHtml(tone: NoteTone, text: string): string {
  return `<div class="note ${tone}">\n${escapeHtmlText(text.trim() || '在此输入提示内容')}\n</div>`
}

const NOTE_OPTIONS: { tone: NoteTone; label: string; hint: string; Icon: typeof Info }[] = [
  { tone: 'info', label: '信息提示', hint: '蓝色说明框', Icon: Info },
  { tone: 'warning', label: '警告提示', hint: '黄色注意框', Icon: AlertTriangle },
  { tone: 'success', label: '成功提示', hint: '绿色成功框', Icon: CheckCircle2 },
  { tone: 'danger', label: '危险提示', hint: '红色警告框', Icon: Ban },
]

export default function RichEditor({ value, onChange }: RichEditorProps) {
  const [modal, setModal] = useState<ModalType>(null)
  const [inputUrl, setInputUrl] = useState('')
  const [inputText, setInputText] = useState('')
  const [inputDesc, setInputDesc] = useState('')
  const [noteTone, setNoteTone] = useState<NoteTone>('info')
  const [snippetMenu, setSnippetMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const serializerPatched = useRef(false)
  const savedSel = useRef<{ from: number; to: number } | null>(null)  // saved selection for color pickers
  const applyingColor = useRef(false)  // lock: prevent onSelectionUpdate from overwriting savedSel mid-apply
  const lastEmittedMd = useRef('')     // last markdown emitted by onUpdate; skip setContent re-import for self-changes
  const hydrating = useRef(false)      // setContent 期间禁止 onUpdate 写回
  const preservedComments = useRef<PreservedHtmlComment[]>([])
  const [tableGrid, setTableGrid] = useState<{ rows: number; cols: number } | null>(null)
  const [tableHover, setTableHover] = useState({ r: 0, c: 0 })

  const applyEditorContent = (ed: any, md: string) => {
    hydrating.current = true
    const { text, comments } = extractHtmlComments(decodeNbspEntities(md))
    preservedComments.current = comments
    // 去掉 HTML 注释后再导入，避免注释内标签破坏解析、吞掉后续 UU 等内容
    ed.commands.setContent(wrapHtmlBlocks(text), {
      emitUpdate: false,
      parseOptions: { preserveWhitespace: 'full' },
    })
    removeEmptyParagraphsAroundHtmlBlocks(ed)
    hydrating.current = false
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        horizontalRule: false,
      }),
      ParagraphWithBlankLines,
      HorizontalRuleSafe,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ allowBase64: true }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      HtmlBlock,
      MarkdownCjkFriendly,
      Markdown.configure({ html: true, tightLists: true }),
    ],
    content: '',
    parseOptions: {
      preserveWhitespace: 'full',
    },
    editorProps: {
      attributes: {
        class: 'markdown-content focus:outline-none min-h-full px-12 py-8',
        style: 'white-space: pre-wrap;',
      },
    },
    onUpdate({ editor: ed }) {
      if (!serializerPatched.current || hydrating.current) return
      let md = (ed.storage as any).markdown.getMarkdown()
      md = unwrapHtmlBlocks(md)
      // 序列化结果里的 &nbsp; 一律还原为 Unicode，防止下次加载变成可见文本
      md = decodeNbspEntities(md)
      // 兜底：图片/HTML 与 --- 粘连时拆开
      md = md.replace(/(!\[[^\]]*\]\([^)]+\)|<img\b[^>]*>)\s*(---)/gi, '$1\n\n$2')
      // 写回原先抽出的 HTML 注释，避免误删
      md = restoreHtmlComments(md, preservedComments.current)
      lastEmittedMd.current = md
      onChange(md)
    },
    onSelectionUpdate({ editor: ed }) {
      if (applyingColor.current) return
      const { from, to } = ed.state.selection
      if (from !== to) savedSel.current = { from, to }
    },
  })

  useEffect(() => {
    if (!editor || serializerPatched.current) return
    serializerPatched.current = true
    applyEditorContent(editor, value)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editor || !serializerPatched.current) return
    if (value === lastEmittedMd.current) return
    applyEditorContent(editor, value)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-focus the url input when modal opens
  useEffect(() => {
    if (modal) setTimeout(() => inputRef.current?.focus(), 50)
  }, [modal])

  if (!editor) return null

  const insertHtmlBlock = (html: string) => {
    const content = sanitizeHtmlBlockHtml(html)
    const { selection } = editor.state
    // atom 块插入后会被整块选中；再用 insertContent 会替换而非追加
    if (selection instanceof NodeSelection) {
      editor
        .chain()
        .focus()
        .setTextSelection(selection.to)
        .insertContent({ type: 'htmlBlock', attrs: { content } })
        .run()
      return
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: 'htmlBlock', attrs: { content } })
      .run()
  }

  const openLinkModal = () => {
    const existing = editor.getAttributes('link').href || ''
    setInputUrl(existing)
    setInputText('')
    setInputDesc('')
    setModal('link')
  }

  const openImageModal = () => {
    setInputUrl('')
    setInputText('')
    setInputDesc('')
    setModal('image')
  }

  const openDocCardModal = () => {
    setSnippetMenu(false)
    setInputUrl('https://')
    setInputText('')
    setInputDesc('')
    setModal('docCard')
  }

  const openNoteModal = (tone: NoteTone = 'info') => {
    setSnippetMenu(false)
    setNoteTone(tone)
    setInputText('')
    setModal('note')
  }

  const confirmLink = () => {
    if (!inputUrl.trim()) { editor.chain().focus().unsetLink().run(); setModal(null); return }
    editor.chain().focus().setLink({ href: inputUrl.trim() }).run()
    setModal(null)
  }

  const confirmImage = () => {
    if (!inputUrl.trim()) { setModal(null); return }
    editor.chain().focus().setImage({ src: inputUrl.trim(), alt: inputText.trim() || undefined } as any).run()
    setModal(null)
  }

  const confirmDocCard = () => {
    if (!inputUrl.trim() || inputUrl.trim() === 'https://') return
    insertHtmlBlock(buildDocCardHtml(inputUrl, inputText, inputDesc))
    setModal(null)
    setInputUrl('')
    setInputText('')
    setInputDesc('')
  }

  const confirmNote = () => {
    insertHtmlBlock(buildNoteHtml(noteTone, inputText))
    setModal(null)
    setInputText('')
  }

  const closeModal = () => {
    setModal(null)
    setInputUrl('')
    setInputText('')
    setInputDesc('')
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 relative">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
        {/* Undo / Redo */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销 (Ctrl+Z)">
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做 (Ctrl+Y)">
          <Redo size={15} />
        </ToolbarButton>
        <Divider />

        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="标题 1">
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="标题 2">
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="标题 3">
          <Heading3 size={15} />
        </ToolbarButton>
        <Divider />

        {/* Formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="加粗 (Ctrl+B)">
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体 (Ctrl+I)">
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线 (Ctrl+U)">
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线">
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="行内代码">
          <Code size={15} />
        </ToolbarButton>

        {/* Text color */}
        <label className="flex flex-col items-center gap-0.5 p-1.5 rounded cursor-pointer hover:bg-gray-600/50 transition-colors" title="文字颜色">
          <span className="text-xs font-black" style={{ color: editor.getAttributes('textStyle').color || '#ffffff' }}>A</span>
          <span className="block h-1 w-4 rounded-sm border border-gray-600" style={{ background: editor.getAttributes('textStyle').color || '#ffffff' }} />
          <input type="color"
            style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            value={rgbToHex(editor.getAttributes('textStyle').color || '#000000')}
            onChange={e => {
              applyingColor.current = true
              const sel = savedSel.current
              if (sel) editor.commands.setTextSelection(sel)
              editor.chain().setColor(e.target.value).run()
              applyingColor.current = false
            }} />
        </label>

        {/* Highlight color */}
        <label className="flex flex-col items-center gap-0.5 p-1.5 rounded cursor-pointer hover:bg-gray-600/50 transition-colors" title="高亮颜色">
          <Highlighter size={14} className="text-gray-300" />
          <span className="block h-1 w-4 rounded-sm border border-gray-600" style={{ background: (editor.getAttributes('highlight').color as string) || '#fbbf24' }} />
          <input type="color"
            style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            value={rgbToHex((editor.getAttributes('highlight').color as string) || '#fbbf24')}
            onChange={e => {
              applyingColor.current = true
              const sel = savedSel.current
              if (sel) editor.commands.setTextSelection(sel)
              editor.chain().setHighlight({ color: e.target.value }).run()
              applyingColor.current = false
            }} />
        </label>
        <Divider />

        {/* Alignment */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="左对齐">
          <AlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="居中">
          <AlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="右对齐">
          <AlignRight size={15} />
        </ToolbarButton>
        <Divider />

        {/* Lists */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块">
          <Code size={15} className="text-yellow-400" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分隔线">
          <Minus size={15} />
        </ToolbarButton>
        <Divider />

        {/* Link & Image */}
        <ToolbarButton onClick={openLinkModal} active={editor.isActive('link')} title="插入链接">
          <LinkIcon size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={openImageModal} title="插入图片">
          <ImageIcon size={15} />
        </ToolbarButton>

        {/* 文档专用组件：链接卡片 / 提示框 */}
        <div className="relative">
          <ToolbarButton
            onClick={() => { setTableGrid(null); setSnippetMenu(v => !v) }}
            active={snippetMenu || modal === 'docCard' || modal === 'note'}
            title="插入文档组件（链接卡片 / 提示框）"
          >
            <Puzzle size={15} />
          </ToolbarButton>
          {snippetMenu && (
            <div className="absolute top-full left-0 mt-1 w-56 p-1.5 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); openDocCardModal() }}
                className="w-full flex items-start gap-2 px-2.5 py-2 rounded text-left hover:bg-gray-700/80 transition-colors"
              >
                <LayoutTemplate size={16} className="text-purple-300 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="block text-sm text-white">链接卡片</span>
                  <span className="block text-[11px] text-gray-500">doc-card 下载/外链卡片</span>
                </span>
              </button>
              <div className="my-1 border-t border-gray-700" />
              {NOTE_OPTIONS.map(({ tone, label, hint, Icon }) => (
                <button
                  key={tone}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); openNoteModal(tone) }}
                  className="w-full flex items-start gap-2 px-2.5 py-2 rounded text-left hover:bg-gray-700/80 transition-colors"
                >
                  <Icon size={16} className={`mt-0.5 flex-shrink-0 ${
                    tone === 'info' ? 'text-blue-400'
                      : tone === 'warning' ? 'text-amber-400'
                        : tone === 'success' ? 'text-emerald-400'
                          : 'text-red-400'
                  }`} />
                  <span>
                    <span className="block text-sm text-white">{label}</span>
                    <span className="block text-[11px] text-gray-500">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Divider />

        {/* Table insert — Word-like grid picker */}
        <div className="relative">
          <ToolbarButton
            onClick={() => { setSnippetMenu(false); setTableGrid(g => g ? null : { rows: 0, cols: 0 }) }}
            active={editor.isActive('table') || tableGrid !== null} title="插入表格">
            <LayoutGrid size={15} />
          </ToolbarButton>
          {tableGrid !== null && (
            <div
              className="absolute top-full left-0 mt-1 p-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 select-none"
              onMouseLeave={() => setTableHover({ r: 0, c: 0 })}
            >
              <div className="text-xs text-gray-400 mb-1.5 text-center">
                {tableHover.r > 0 ? `${tableHover.r} × ${tableHover.c} 表格` : '选择行列数'}
              </div>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 18px)' }}>
                {Array.from({ length: 8 * 8 }).map((_, idx) => {
                  const r = Math.floor(idx / 8) + 1
                  const c = (idx % 8) + 1
                  const active = r <= tableHover.r && c <= tableHover.c
                  return (
                    <div
                      key={idx}
                      className={`w-[18px] h-[18px] border rounded-sm cursor-pointer transition-colors ${
                        active ? 'border-purple-400 bg-purple-600/30' : 'border-gray-600 hover:border-gray-400'
                      }`}
                      onMouseEnter={() => setTableHover({ r, c })}
                      onClick={() => {
                        editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run()
                        setTableGrid(null)
                        setTableHover({ r: 0, c: 0 })
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
        {editor.isActive('table') && (
          <>
            <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="在下方插入行">
              <AlignJustify size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="在右方插入列">
              <SeparatorVertical size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="删除当前行">
              <Trash2 size={13} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="删除当前列">
              <SeparatorVertical size={13} className="text-red-400" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="删除表格">
              <Trash2 size={13} className="text-red-500" />
            </ToolbarButton>
          </>
        )}
        <Divider />

        {/* Clear formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="清除格式">
          <RemoveFormatting size={15} />
        </ToolbarButton>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Link modal */}
      {modal === 'link' && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">插入链接</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">链接地址</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmLink()}
                  placeholder="https://..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">取消</button>
              <button onClick={confirmLink} className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* Image modal */}
      {modal === 'image' && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">插入图片</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">图片 URL</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmImage()}
                  placeholder="https://example.com/image.png"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">替代文字（可选）</label>
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmImage()}
                  placeholder="图片描述"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">取消</button>
              <button onClick={confirmImage} disabled={!inputUrl.trim()} className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors">插入</button>
            </div>
          </div>
        </div>
      )}

      {/* Doc card modal */}
      {modal === 'docCard' && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">插入链接卡片</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">链接地址</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  placeholder="#/docs/紫夜新训须知"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">标题</label>
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="紫夜新训须知"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">描述</label>
                <input
                  type="text"
                  value={inputDesc}
                  onChange={e => setInputDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmDocCard()}
                  placeholder="查看新人入队准备与必装模组教程"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>
              {(inputText || inputDesc) && (
                <div className="pt-1">
                  <div className="text-[11px] text-gray-500 mb-1.5">预览</div>
                  <div className="markdown-content pointer-events-none scale-[0.92] origin-top-left">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: buildDocCardHtml(inputUrl || '#', inputText || '标题', inputDesc || '描述'),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">取消</button>
              <button
                onClick={confirmDocCard}
                disabled={!inputUrl.trim() || inputUrl.trim() === 'https://'}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                插入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note modal */}
      {modal === 'note' && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">插入提示框</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">类型</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {NOTE_OPTIONS.map(({ tone, label, Icon }) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setNoteTone(tone)}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm border transition-colors ${
                        noteTone === tone
                          ? 'border-purple-500 bg-purple-600/20 text-white'
                          : 'border-gray-600 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">内容</label>
                <textarea
                  ref={inputRef as any}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  rows={4}
                  placeholder="移动/广电宽带因国际出口限制严格……"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm resize-y"
                />
              </div>
              {inputText.trim() && (
                <div className="pt-1">
                  <div className="text-[11px] text-gray-500 mb-1.5">预览</div>
                  <div className="markdown-content pointer-events-none">
                    <div dangerouslySetInnerHTML={{ __html: buildNoteHtml(noteTone, inputText) }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">取消</button>
              <button onClick={confirmNote} className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
                插入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
