import { useEditor, EditorContent, Node, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
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
import { useEffect, useState, useRef } from 'react'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Undo, Redo, AlignLeft, AlignCenter,
  AlignRight, Highlighter, Link as LinkIcon, Image as ImageIcon, RemoveFormatting, X,
  LayoutGrid, AlignJustify, SeparatorVertical, Trash2
} from 'lucide-react'

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
function HtmlBlockView({ node, updateAttributes }: any) {
  const [editing, setEditing] = useState(false)
  const [html, setHtml] = useState(node.attrs.content)
  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="my-2 rounded border border-purple-600/30 bg-gray-800/20 overflow-hidden select-none">
        <div className="flex items-center gap-2 px-3 py-1 bg-gray-800/60 border-b border-gray-700/50 text-xs">
          <span className="text-gray-500 font-mono">{'<HTML 块>'}</span>
          <button onMouseDown={e => { e.preventDefault(); setEditing(v => !v) }}
            className="text-purple-400 hover:text-purple-300">{editing ? '预览' : '编辑代码'}</button>
        </div>
        {editing ? (
          <textarea
            value={html}
            onChange={e => { setHtml(e.target.value); updateAttributes({ content: e.target.value }) }}
            className="w-full font-mono text-xs text-gray-300 bg-gray-900/80 p-3 min-h-[80px] outline-none resize-y"
            spellCheck={false}
          />
        ) : (
          <div className="p-3 markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </NodeViewWrapper>
  )
}

const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  addAttributes() { return { content: { default: '' } } },
  parseHTML() {
    return [{ tag: 'div[data-html-block]', getAttrs: dom => ({ content: decodeURIComponent((dom as HTMLElement).getAttribute('data-html-block') || '') }) }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-html-block': encodeURIComponent(node.attrs.content) }]
  },
  addNodeView() { return ReactNodeViewRenderer(HtmlBlockView) },
})

// Tags that can appear as block-level HTML in markdown
const BLOCK_TAGS = 'div|section|article|aside|figure|details|nav|header|footer|main|a|table'
const BLOCK_OPEN  = new RegExp(`^<(${BLOCK_TAGS})\\b`, 'i')

// Use depth counting so nested elements are captured as one block.
// For <a> we only treat it as a block when it starts at column 0 (already guaranteed by BLOCK_OPEN).
function wrapHtmlBlocks(md: string): string {
  const lines = md.split('\n')
  const result: string[] = []
  let i = 0
  while (i < lines.length) {
    if (BLOCK_OPEN.test(lines[i])) {
      const htmlLines: string[] = []
      let depth = 0
      while (i < lines.length) {
        const line = lines[i]
        const openRe  = new RegExp(`<(${BLOCK_TAGS})\\b[^>]*>`, 'gi')
        const closeRe = new RegExp(`<\\/(${BLOCK_TAGS})>`, 'gi')
        const opens  = (line.match(openRe)  || []).length
        const closes = (line.match(closeRe) || []).length
        depth += opens - closes
        htmlLines.push(line)
        i++
        if (depth <= 0 && htmlLines.length > 0) break
      }
      result.push(`<div data-html-block="${encodeURIComponent(htmlLines.join('\n'))}"></div>`)
    } else {
      result.push(lines[i])
      i++
    }
  }
  return result.join('\n')
}

function unwrapHtmlBlocks(md: string): string {
  return md.replace(/<div\s+data-html-block="([^"]*?)"\s*(?:\/>|>\s*<\/div>)/g,
    (_, enc) => '\n' + decodeURIComponent(enc) + '\n'
  )
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

type ModalType = 'link' | 'image' | null

export default function RichEditor({ value, onChange }: RichEditorProps) {
  const [modal, setModal] = useState<ModalType>(null)
  const [inputUrl, setInputUrl] = useState('')
  const [inputText, setInputText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const serializerPatched = useRef(false)
  const savedSel = useRef<{ from: number; to: number } | null>(null)  // saved selection for color pickers
  const applyingColor = useRef(false)  // lock: prevent onSelectionUpdate from overwriting savedSel mid-apply
  const lastEmittedMd = useRef('')     // last markdown emitted by onUpdate; skip setContent re-import for self-changes
  const [tableGrid, setTableGrid] = useState<{ rows: number; cols: number } | null>(null)
  const [tableHover, setTableHover] = useState({ r: 0, c: 0 })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      HtmlBlock,
      Markdown.configure({ html: true, tightLists: true }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'markdown-content focus:outline-none min-h-full px-12 py-8' },
    },
    onUpdate({ editor }) {
      if (!serializerPatched.current) return
      let md = (editor.storage as any).markdown.getMarkdown()
      md = unwrapHtmlBlocks(md)
      lastEmittedMd.current = md
      onChange(md)
    },
    // Always track the last non-empty selection so color pickers can restore it.
    // Gated by applyingColor so that the atom-node selection Tiptap creates
    // internally after setColor doesn't overwrite the user's real selection.
    onSelectionUpdate({ editor }) {
      if (applyingColor.current) return
      const { from, to } = editor.state.selection
      if (from !== to) savedSel.current = { from, to }
    },
  })

  // Patch serializer once, then load initial content (no emitUpdate)
  useEffect(() => {
    if (!editor || serializerPatched.current) return
    const storage = (editor.storage as any).markdown
    if (storage?.serializer?.nodes) {
      storage.serializer.nodes.htmlBlock = (state: any, node: any) => {
        state.write(node.attrs.content)
        state.ensureNewLine()
        state.write('\n')
      }
    }
    serializerPatched.current = true
    ;(editor.commands as any).setContent(wrapHtmlBlocks(value), false)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when a *different* file is opened from outside.
  // Skip when value is just the round-trip of what this editor emitted (e.g. after setColor).
  useEffect(() => {
    if (!editor || !serializerPatched.current) return
    if (value === lastEmittedMd.current) return
    ;(editor.commands as any).setContent(wrapHtmlBlocks(value), false)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-focus the url input when modal opens
  useEffect(() => {
    if (modal) setTimeout(() => inputRef.current?.focus(), 50)
  }, [modal])

  if (!editor) return null

  const openLinkModal = () => {
    const existing = editor.getAttributes('link').href || ''
    setInputUrl(existing)
    setInputText('')
    setModal('link')
  }

  const openImageModal = () => {
    setInputUrl('')
    setInputText('')
    setModal('image')
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

  const closeModal = () => { setModal(null); setInputUrl(''); setInputText('') }

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
        <Divider />

        {/* Table insert — Word-like grid picker */}
        <div className="relative">
          <ToolbarButton
            onClick={() => setTableGrid(g => g ? null : { rows: 0, cols: 0 })}
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
    </div>
  )
}
