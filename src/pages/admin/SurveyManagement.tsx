import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { surveyAPI, memberAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'
import MemberAvatar from '../../components/MemberAvatar'
import PageSkeleton from '../../components/Skeleton'
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  X,
  Save,
  Send,
  Lock,
  ChevronUp,
  ChevronDown,
  Copy,
  Settings2,
  CircleDot,
  CheckSquare,
  Type,
  AlignLeft,
  Star,
  Grid3X3,
  ArrowLeft,
  Edit,
  Ban,
  AlertTriangle,
  UserPlus,
  MoreHorizontal,
  ClipboardList,
} from 'lucide-react'

export type FieldType = 'single' | 'multi' | 'text' | 'textarea' | 'rating' | 'matrix'

export interface SurveyField {
  id: string
  type: FieldType
  label: string
  required: boolean
  options?: string[]
  maxRating?: number
  /** 矩阵题列（量表） */
  columns?: string[]
  /** 矩阵题行 */
  rows?: { id: string; label: string }[]
  /** global=全局题不按人展开；subject/缺省=按评价对象展开 */
  scope?: 'global' | 'subject'
}

interface SurveySubject {
  id: string
  name: string
  member_id?: number | null
}

interface Survey {
  id: number
  title: string
  description: string
  fields: SurveyField[]
  subjects: SurveySubject[]
  is_anonymous: boolean
  start_at: string | null
  end_at: string | null
  /** 填写人数上限，null/不填=不限制 */
  max_responses: number | null
  /** 是否允许学员查看结果 */
  results_public: boolean
  status: 'draft' | 'published' | 'closed'
  audience_roles: string[]
  response_count?: number
  claim_count?: number
  created_at?: string
}

const INSTRUCTOR_ROLES = ['总教', '尖兵教官', '教官', '紫夜尖兵']

const STAGE_ROLES = [
  '未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考',
  '紫夜', '紫夜尖兵', '紫夜助教', '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师',
]

const DEFAULT_SATISFACTION_COLS = ['很满意(5)', '满意(4)', '一般(3)', '不满意(2)', '很不满意(1)']

const TOOLBOX: {
  category: string
  items: { type: FieldType; label: string; icon: ReactNode }[]
}[] = [
  {
    category: '普通题型',
    items: [
      { type: 'single', label: '单选题', icon: <CircleDot size={14} /> },
      { type: 'multi', label: '多选题', icon: <CheckSquare size={14} /> },
      { type: 'matrix', label: '矩阵单选', icon: <Grid3X3 size={14} /> },
    ],
  },
  {
    category: '评分题型',
    items: [{ type: 'rating', label: '评分题', icon: <Star size={14} /> }],
  },
  {
    category: '主观题型',
    items: [
      { type: 'text', label: '单行文本', icon: <Type size={14} /> },
      { type: 'textarea', label: '多行文本', icon: <AlignLeft size={14} /> },
    ],
  },
]

function newId(prefix = 'f') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function createField(type: FieldType): SurveyField {
  const base = { id: newId(), type, label: '请输入题目标题', required: true }
  if (type === 'single' || type === 'multi') {
    return { ...base, label: type === 'single' ? '单选题' : '多选题', options: ['选项1', '选项2', '选项3'] }
  }
  if (type === 'rating') return { ...base, label: '请打分', maxRating: 5 }
  if (type === 'text') return { ...base, label: '请填写', required: false }
  if (type === 'textarea') return { ...base, label: '请详细说明', required: false }
  return {
    ...base,
    label: '矩阵单选题',
    columns: [...DEFAULT_SATISFACTION_COLS],
    rows: [
      { id: newId('r'), label: '请输入评价项 1' },
      { id: newId('r'), label: '请输入评价项 2' },
      { id: newId('r'), label: '请输入评价项 3' },
    ],
  }
}

function toLocalInput(dt: string | null | undefined) {
  if (!dt) return ''
  return String(dt).replace(' ', 'T').slice(0, 16)
}

function fromLocalInput(v: string) {
  if (!v) return null
  return v.length === 16 ? `${v.replace('T', ' ')}:00` : v.replace('T', ' ')
}

const emptyForm = (): Omit<Survey, 'id'> => ({
  title: '未命名问卷',
  description: '感谢您参与填写。本问卷可用于匿名收集意见，帮助改进教学与管理。',
  fields: [createField('matrix')],
  subjects: [],
  is_anonymous: true,
  start_at: null,
  end_at: null,
  max_responses: null,
  results_public: false,
  status: 'draft',
  audience_roles: [],
})

function isExpired(s: { end_at?: string | null; status?: string }) {
  if (s.status === 'closed') return true
  if (!s.end_at) return false
  const end = new Date(String(s.end_at).replace(' ', 'T'))
  return !Number.isNaN(end.getTime()) && end < new Date()
}

/** 页面式题目预览（编辑/填写共用样式） */
function MatrixPreview({
  field,
  editable,
  onChangeRow,
  value,
  onAnswer,
}: {
  field: SurveyField
  editable?: boolean
  onChangeRow?: (rowIdx: number, label: string) => void
  value?: Record<string, string>
  onAnswer?: (rowId: string, col: string) => void
}) {
  const cols = field.columns || DEFAULT_SATISFACTION_COLS
  const rows = field.rows || []
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[520px]">
        <thead>
          <tr>
            <th className="p-2 border border-gray-200 bg-gray-50 text-left font-normal text-gray-500 w-[40%]" />
            {cols.map((c) => (
              <th
                key={c}
                className="p-2 border border-gray-200 bg-gray-50 text-center font-normal text-gray-600 text-xs whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.id} className="hover:bg-blue-50/40">
              <td className="p-2 border border-gray-200 text-gray-800 align-middle">
                {editable ? (
                  <input
                    value={row.label}
                    onChange={(e) => onChangeRow?.(ri, e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-sm text-gray-800 survey-ghost-input"
                  />
                ) : (
                  row.label
                )}
              </td>
              {cols.map((c) => (
                <td key={c} className="p-2 border border-gray-200 text-center">
                  <input
                    type="radio"
                    name={`${field.id}_${row.id}`}
                    checked={value?.[row.id] === c}
                    onChange={() => onAnswer?.(row.id, c)}
                    disabled={editable && !onAnswer}
                    className="accent-blue-600 cursor-pointer"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SurveyManagement() {
  const navigate = useNavigate()
  const [list, setList] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<null | 'new' | number>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(0)
  const [showSettings, setShowSettings] = useState(false)
  const [members, setMembers] = useState<{ id: number; nickname: string; stage_role: string; avatar?: string | null; qq?: string }[]>([])
  const [memberFilter, setMemberFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionMenu, setActionMenu] = useState<{
    id: number
    top: number
    right: number
  } | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const actionBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({})

  const closeActionMenu = () => setActionMenu(null)

  const openActionMenu = (id: number) => {
    if (actionMenu?.id === id) {
      closeActionMenu()
      return
    }
    const btn = actionBtnRefs.current[id]
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setActionMenu({
      id,
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }

  useEffect(() => {
    if (!actionMenu) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (actionMenuRef.current?.contains(target)) return
      if (actionBtnRefs.current[actionMenu.id]?.contains(target)) return
      closeActionMenu()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeActionMenu()
    }
    const onRepositionClose = () => closeActionMenu()
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onRepositionClose, true)
    window.addEventListener('resize', onRepositionClose)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onRepositionClose, true)
      window.removeEventListener('resize', onRepositionClose)
    }
  }, [actionMenu])

  const load = async () => {
    try {
      setLoading(true)
      const res = await surveyAPI.list()
      setList(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    memberAPI.getAll().then((res) => {
      setMembers(res.data || [])
    }).catch(() => {})
  }, [])

  const openNew = () => {
    setForm(emptyForm())
    setSelectedIdx(0)
    setShowSettings(false)
    setEditing('new')
  }

  const openEdit = async (id: number) => {
    try {
      const res = await surveyAPI.get(id)
      const s = res.data
      setForm({
        title: s.title,
        description: s.description || '',
        fields: s.fields || [],
        subjects: s.subjects || [],
        is_anonymous: !!s.is_anonymous,
        start_at: s.start_at,
        end_at: s.end_at,
        max_responses: s.max_responses != null && Number(s.max_responses) > 0 ? Number(s.max_responses) : null,
        results_public: !!s.results_public,
        status: s.status,
        audience_roles: s.audience_roles || [],
      })
      setSelectedIdx(0)
      setShowSettings(false)
      setEditing(id)
    } catch (e: any) {
      toast.error(e.message || '打开失败')
    }
  }

  const save = async (publish = false) => {
    if (!form.title.trim()) {
      toast.error('请填写标题')
      return
    }
    if (!form.fields.length) {
      toast.error('请至少添加一道题')
      return
    }
    for (const f of form.fields) {
      if (!f.label.trim()) {
        toast.error('题目不能为空')
        return
      }
      if ((f.type === 'single' || f.type === 'multi') && !(f.options || []).filter(Boolean).length) {
        toast.error(`「${f.label}」请填写选项`)
        return
      }
      if (f.type === 'matrix') {
        if (!(f.columns || []).length || !(f.rows || []).length) {
          toast.error(`「${f.label}」矩阵题需有行与列`)
          return
        }
      }
    }
    try {
      setSaving(true)
      const payload = {
        ...form,
        subjects: form.subjects || [],
        status: publish ? 'published' : form.status,
      }
      if (editing === 'new') {
        await surveyAPI.create(payload)
        toast.success(publish ? '已创建并发布' : '已保存')
      } else if (typeof editing === 'number') {
        await surveyAPI.update(editing, payload)
        toast.success(publish ? '已更新并发布' : '已保存')
      }
      setEditing(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (id: number, status: string) => {
    try {
      await surveyAPI.update(id, { status })
      toast.success(status === 'published' ? '已发布' : status === 'closed' ? '已关闭' : '已更新')
      load()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    }
  }

  const remove = (id: number, title: string) => {
    setDeleteTarget({ id, title })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const id = deleteTarget.id
      await surveyAPI.delete(id)
      setList((prev) => prev.filter((s) => s.id !== id))
      setDeleteTarget(null)
      toast.success('已删除')
      await load()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const duplicateSurvey = async (id: number) => {
    try {
      const res = await surveyAPI.get(id)
      const s = res.data
      await surveyAPI.create({
        title: `${s.title || '未命名问卷'}（副本）`,
        description: s.description || '',
        fields: s.fields || [],
        subjects: s.subjects || [],
        is_anonymous: !!s.is_anonymous,
        start_at: s.start_at,
        end_at: s.end_at,
        max_responses: s.max_responses != null && Number(s.max_responses) > 0 ? Number(s.max_responses) : null,
        results_public: !!s.results_public,
        audience_roles: s.audience_roles || [],
        status: 'draft',
      })
      toast.success('已复制为草稿')
      await load()
    } catch (e: any) {
      toast.error(e.message || '复制失败')
    }
  }

  const toggleSubjectMember = (m: { id: number; nickname: string }) => {
    setForm((prev) => {
      const exists = prev.subjects.some((s) => s.member_id === m.id)
      if (exists) {
        return { ...prev, subjects: prev.subjects.filter((s) => s.member_id !== m.id) }
      }
      return {
        ...prev,
        subjects: [
          ...prev.subjects,
          { id: `m${m.id}`, name: m.nickname, member_id: m.id },
        ],
      }
    })
  }

  const addCustomSubject = () => {
    const name = prompt('输入评价对象姓名（如教官昵称）')
    if (!name?.trim()) return
    setForm((prev) => ({
      ...prev,
      subjects: [
        ...prev.subjects,
        { id: newId('sub'), name: name.trim(), member_id: null },
      ],
    }))
  }

  const addField = (type: FieldType) => {
    setForm((prev) => {
      const fields = [...prev.fields, createField(type)]
      setSelectedIdx(fields.length - 1)
      return { ...prev, fields }
    })
  }

  const updateField = (idx: number, patch: Partial<SurveyField>) => {
    setForm((prev) => {
      const fields = [...prev.fields]
      fields[idx] = { ...fields[idx], ...patch }
      return { ...prev, fields }
    })
  }

  const moveField = (idx: number, dir: -1 | 1) => {
    setForm((prev) => {
      const fields = [...prev.fields]
      const j = idx + dir
      if (j < 0 || j >= fields.length) return prev
      ;[fields[idx], fields[j]] = [fields[j], fields[idx]]
      setSelectedIdx(j)
      return { ...prev, fields }
    })
  }

  const duplicateField = (idx: number) => {
    setForm((prev) => {
      const src = prev.fields[idx]
      const copy: SurveyField = {
        ...JSON.parse(JSON.stringify(src)),
        id: newId(),
        label: `${src.label}（副本）`,
      }
      if (copy.rows) {
        copy.rows = copy.rows.map((r) => ({ ...r, id: newId('r') }))
      }
      const fields = [...prev.fields]
      fields.splice(idx + 1, 0, copy)
      setSelectedIdx(idx + 1)
      return { ...prev, fields }
    })
  }

  const statusLabel: Record<string, string> = {
    draft: '草稿',
    published: '已发布',
    closed: '已关闭',
  }

  const selected = selectedIdx != null ? form.fields[selectedIdx] : null

  // ─── 问卷星式全屏编辑器 ───
  if (editing != null) {
    return (
      <div className="survey-editor-light fixed inset-0 z-50 flex flex-col bg-[#e8eef5] text-gray-800" style={{ colorScheme: 'light' }}>
        {/* 顶栏 */}
        <header className="h-12 shrink-0 bg-[#2f4050] text-white flex items-center px-4 gap-3 shadow">
          <button
            onClick={() => setEditing(null)}
            className="flex items-center gap-1 text-sm text-gray-300 hover:text-white"
          >
            <ArrowLeft size={16} /> 返回
          </button>
          <div className="h-4 w-px bg-white/20" />
          <span className="text-sm font-medium truncate max-w-[280px]">{form.title || '未命名问卷'}</span>
          <span className="text-xs text-gray-400">{statusLabel[form.status]}</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-200 hover:bg-white/10"
          >
            <Settings2 size={14} /> 投放设置
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-white/10 hover:bg-white/20 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
          >
            <Send size={14} /> 完成编辑并发布
          </button>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* 左侧题型 */}
          <aside className="w-52 shrink-0 bg-white border-r border-gray-200 overflow-y-auto text-gray-700">
            <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">题目类型</div>
            {TOOLBOX.map((cat) => (
              <div key={cat.category} className="px-2 py-2">
                <div className="px-2 py-1 text-xs text-gray-400">{cat.category}</div>
                <div className="space-y-0.5">
                  {cat.items.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => addField(item.type)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <span className="text-gray-400">{item.icon}</span>
                      {item.label}
                      <Plus size={12} className="ml-auto opacity-40" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* 中间画布 */}
          <main className="flex-1 overflow-y-auto py-4 px-4">
            <div className="w-full bg-white shadow-md rounded-sm border border-gray-200/80 min-h-[70vh]">
              {/* 标题区 */}
              <div className="px-8 md:px-12 lg:px-16 pt-8 pb-4 border-b border-dashed border-gray-200">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="survey-ghost-input w-full text-center text-2xl font-bold text-gray-900 border-0 outline-none placeholder:text-gray-300 bg-transparent"
                  placeholder="请输入问卷标题"
                />
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="survey-ghost-input w-full mt-4 text-sm text-gray-600 leading-relaxed border-0 outline-none resize-none placeholder:text-gray-300 bg-transparent"
                  placeholder="请输入问卷说明（可写匿名承诺、填写须知等）"
                />
                {form.is_anonymous && (
                  <p className="mt-2 text-xs text-emerald-600 flex items-center justify-center gap-1">
                    <Lock size={12} /> 匿名问卷：交卷不携带登录身份
                  </p>
                )}
                {form.subjects.length > 0 && (
                  <p className="mt-2 text-xs text-blue-600 text-center">
                    按人评价：{form.subjects.map((s) => s.name).join('、')}（共 {form.subjects.length} 人）。
                    学员端将先询问是否上过课，未上过则隐藏对应满意度题。下方为题目模板。
                  </p>
                )}
              </div>

              {/* 题目列表 */}
              <div className="px-8 py-4 space-y-2">
                {form.fields.map((field, idx) => {
                  const active = selectedIdx === idx
                  return (
                    <div
                      key={field.id}
                      onClick={() => setSelectedIdx(idx)}
                      className={`group relative rounded-lg border-2 p-4 transition cursor-pointer ${
                        active
                          ? 'border-blue-400 bg-blue-50/30 shadow-sm'
                          : 'border-transparent hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-3">
                        <span className="text-red-500 text-sm mt-0.5">{field.required ? '*' : ''}</span>
                        <span className="text-sm font-medium text-gray-800 shrink-0">{idx + 1}.</span>
                        <input
                          value={field.label}
                          onChange={(e) => updateField(idx, { label: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="survey-ghost-input flex-1 bg-transparent border-0 outline-none text-sm font-medium text-gray-900"
                        />
                        {form.subjects.length > 0 && (
                          <span
                            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                              field.scope === 'global'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {field.scope === 'global' ? '全局' : '按人'}
                          </span>
                        )}
                      </div>

                      {/* 题干预览 */}
                      {(field.type === 'single' || field.type === 'multi') && (
                        <div className="pl-6 space-y-2">
                          {(field.options || []).map((opt, oi) => (
                            <label key={oi} className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type={field.type === 'single' ? 'radio' : 'checkbox'}
                                disabled
                                className="accent-blue-600"
                              />
                              <input
                                value={opt}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const options = [...(field.options || [])]
                                  options[oi] = e.target.value
                                  updateField(idx, { options })
                                }}
                                className="survey-ghost-input flex-1 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none text-sm text-gray-800"
                              />
                            </label>
                          ))}
                          {active && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateField(idx, {
                                  options: [...(field.options || []), `选项${(field.options || []).length + 1}`],
                                })
                              }}
                              className="text-xs text-blue-600 pl-6"
                            >
                              + 添加选项
                            </button>
                          )}
                        </div>
                      )}

                      {field.type === 'text' && (
                        <div className="pl-6">
                          <div className="h-9 border border-gray-200 rounded bg-gray-50" />
                        </div>
                      )}
                      {field.type === 'textarea' && (
                        <div className="pl-6">
                          <div className="h-20 border border-gray-200 rounded bg-gray-50" />
                        </div>
                      )}
                      {field.type === 'rating' && (
                        <div className="pl-6 flex gap-2">
                          {Array.from({ length: field.maxRating || 5 }, (_, i) => i + 1).map((n) => (
                            <span
                              key={n}
                              className="w-9 h-9 rounded border border-gray-200 flex items-center justify-center text-sm text-gray-500"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      )}
                      {field.type === 'matrix' && (
                        <div className="pl-2" onClick={(e) => e.stopPropagation()}>
                          <MatrixPreview
                            field={field}
                            editable
                            onChangeRow={(ri, label) => {
                              const rows = [...(field.rows || [])]
                              rows[ri] = { ...rows[ri], label }
                              updateField(idx, { rows })
                            }}
                          />
                        </div>
                      )}

                      {/* 悬浮操作 */}
                      {active && (
                        <div className="absolute -right-1 top-2 flex flex-col gap-1 opacity-100 translate-x-full pl-2">
                          <button
                            type="button"
                            title="上移"
                            onClick={(e) => {
                              e.stopPropagation()
                              moveField(idx, -1)
                            }}
                            className="p-1.5 rounded bg-white border shadow-sm text-gray-500 hover:text-blue-600"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            title="下移"
                            onClick={(e) => {
                              e.stopPropagation()
                              moveField(idx, 1)
                            }}
                            className="p-1.5 rounded bg-white border shadow-sm text-gray-500 hover:text-blue-600"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            type="button"
                            title="复制"
                            onClick={(e) => {
                              e.stopPropagation()
                              duplicateField(idx)
                            }}
                            className="p-1.5 rounded bg-white border shadow-sm text-gray-500 hover:text-blue-600"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            title="删除"
                            onClick={(e) => {
                              e.stopPropagation()
                              setForm((prev) => ({
                                ...prev,
                                fields: prev.fields.filter((_, i) => i !== idx),
                              }))
                              setSelectedIdx(null)
                            }}
                            className="p-1.5 rounded bg-white border shadow-sm text-gray-500 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {!form.fields.length && (
                  <p className="text-center text-gray-400 py-16 text-sm">从左侧点击题型添加到问卷</p>
                )}
              </div>
            </div>
          </main>

          {/* 右侧属性 */}
          <aside className="w-64 shrink-0 bg-white border-l border-gray-200 overflow-y-auto text-gray-700">
            <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">题目属性</div>
            {!selected ? (
              <p className="p-4 text-sm text-gray-400">选中题目后可编辑属性</p>
            ) : (
              <div className="p-3 space-y-3 text-sm text-gray-700">
                <label className="flex items-center gap-2 text-gray-700">
                  <input
                    type="checkbox"
                    checked={selected.required}
                    onChange={(e) => updateField(selectedIdx!, { required: e.target.checked })}
                    className="accent-blue-600"
                  />
                  必填
                </label>

                {form.subjects.length > 0 && (
                  <label className="flex items-start gap-2 text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.scope === 'global'}
                      onChange={(e) =>
                        updateField(selectedIdx!, {
                          scope: e.target.checked ? 'global' : 'subject',
                        })
                      }
                      className="accent-blue-600 mt-0.5"
                    />
                    <span>
                      <span className="block">全局题（不按人展开）</span>
                      <span className="block text-xs text-gray-400 mt-0.5">
                        如整体建议、开放反馈；未勾选则套用到每位评价对象
                      </span>
                    </span>
                  </label>
                )}

                {(selected.type === 'single' || selected.type === 'multi') && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">选项（每行一个）</div>
                    <textarea
                      value={(selected.options || []).join('\n')}
                      onChange={(e) =>
                        updateField(selectedIdx!, {
                          options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      rows={6}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-mono bg-white text-gray-900"
                    />
                  </div>
                )}

                {selected.type === 'rating' && (
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">最高分</span>
                    <input
                      type="number"
                      min={2}
                      max={10}
                      value={selected.maxRating || 5}
                      onChange={(e) =>
                        updateField(selectedIdx!, { maxRating: Number(e.target.value) || 5 })
                      }
                      className="w-full border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-900"
                    />
                  </label>
                )}

                {selected.type === 'matrix' && (
                  <>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">列（量表，每行一个）</div>
                      <textarea
                        value={(selected.columns || []).join('\n')}
                        onChange={(e) =>
                          updateField(selectedIdx!, {
                            columns: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        rows={5}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-mono bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">行（评价项）</span>
                        <button
                          type="button"
                          className="text-xs text-blue-600"
                          onClick={() =>
                            updateField(selectedIdx!, {
                              rows: [
                                ...(selected.rows || []),
                                { id: newId('r'), label: `评价项${(selected.rows || []).length + 1}` },
                              ],
                            })
                          }
                        >
                          + 行
                        </button>
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {(selected.rows || []).map((row, ri) => (
                          <div key={row.id} className="flex gap-1">
                            <input
                              value={row.label}
                              onChange={(e) => {
                                const rows = [...(selected.rows || [])]
                                rows[ri] = { ...rows[ri], label: e.target.value }
                                updateField(selectedIdx!, { rows })
                              }}
                              className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white text-gray-900"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateField(selectedIdx!, {
                                  rows: (selected.rows || []).filter((_, i) => i !== ri),
                                })
                              }
                              className="text-red-400 px-1"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* 投放设置弹窗 */}
        {showSettings && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-xl w-full max-w-xl shadow-xl text-gray-800 max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                <h3 className="font-medium text-gray-900">投放设置</h3>
                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-700">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-4 text-sm text-gray-700 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-gray-500">开始时间</span>
                    <input
                      type="datetime-local"
                      value={toLocalInput(form.start_at)}
                      onChange={(e) => setForm({ ...form, start_at: fromLocalInput(e.target.value) })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-gray-500">结束时间</span>
                    <input
                      type="datetime-local"
                      value={toLocalInput(form.end_at)}
                      onChange={(e) => setForm({ ...form, end_at: fromLocalInput(e.target.value) })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-gray-500">填写人数上限</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="留空表示不限制"
                    value={form.max_responses ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim()
                      if (!v) {
                        setForm({ ...form, max_responses: null })
                        return
                      }
                      const n = Math.floor(Number(v))
                      setForm({ ...form, max_responses: Number.isFinite(n) && n > 0 ? n : null })
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900"
                  />
                  <span className="text-xs text-gray-500">
                    达到上限后将自动关闭问卷，并提示「此表格填写人数已达上限」
                  </span>
                </label>
                <label className="flex items-center gap-2 text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_anonymous}
                    onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })}
                    className="accent-blue-600"
                  />
                  匿名填写（登录领券，交卷不带身份）
                </label>
                <label className="flex items-start gap-2 text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.results_public}
                    onChange={(e) => setForm({ ...form, results_public: e.target.checked })}
                    className="accent-blue-600 mt-0.5"
                  />
                  <span>
                    公开查看结果
                    <span className="block text-xs text-gray-500 mt-0.5">
                      开启后，投放范围内的学员可查看统计结果（不含答卷身份明细）
                    </span>
                  </span>
                </label>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <div className="font-medium text-gray-900 flex items-center gap-1.5">
                    <UserPlus size={16} /> 满意度评价对象（按人）
                  </div>
                  <p className="text-xs text-gray-600">
                    选定后，下方题目模板会套用到每个人：先问「是否上过课」，选「我没有上过这个教官的课」则自动隐藏该人的满意度题。
                  </p>
                  {form.subjects.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.subjects.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white text-xs"
                        >
                          {s.name}
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                subjects: prev.subjects.filter((x) => x.id !== s.id),
                              }))
                            }
                            className="hover:text-red-200"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                    placeholder="搜索成员昵称…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-900"
                  />
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                    {members
                      .filter((m) => {
                        const q = memberFilter.trim()
                        if (q && !String(m.nickname || '').includes(q)) return false
                        if (!q) return INSTRUCTOR_ROLES.includes(m.stage_role)
                        return true
                      })
                      .slice(0, 40)
                      .map((m) => {
                        const on = form.subjects.some((s) => s.member_id === m.id)
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleSubjectMember(m)}
                            className={`w-full text-left px-3 py-2 text-xs flex justify-between ${
                              on ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <MemberAvatar avatar={m.avatar} qq={m.qq} name={m.nickname} size="sm" />
                              <span className="truncate">
                                {m.nickname}
                                <span className="text-gray-400 ml-2">{m.stage_role}</span>
                              </span>
                            </span>
                            <span>{on ? '已选' : '+'}</span>
                          </button>
                        )
                      })}
                  </div>
                  <button
                    type="button"
                    onClick={addCustomSubject}
                    className="text-xs text-blue-600"
                  >
                    + 手动添加姓名
                  </button>
                </div>

                <div>
                  <div className="text-gray-500 mb-2">投放范围（不选=全体学员）</div>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGE_ROLES.map((role) => {
                      const on = form.audience_roles.includes(role)
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              audience_roles: on
                                ? prev.audience_roles.filter((r) => r !== role)
                                : [...prev.audience_roles, role],
                            }))
                          }
                          className={`px-2 py-1 rounded text-xs ${
                            on ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {role}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t flex justify-end shrink-0">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── 列表页 ───
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="text-purple-400" size={26} />
            填表管理
          </h1>
          <p className="text-sm text-gray-400 mt-1">创建问卷、设期限，查看统计结果</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white"
        >
          <Plus size={16} /> 新建问卷
        </button>
      </div>

      {list.some((s) => isExpired(s) && s.status === 'published') && (
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/15 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-amber-100">
            <span className="font-medium">有问卷已过期：</span>
            {list
              .filter((s) => isExpired(s) && s.status === 'published')
              .map((s) => s.title)
              .join('、')}
            。学员端无法再提交，可到结果页查看已收集数据。
          </div>
        </div>
      )}

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : (
        <div className="student-glass-panel student-glass-panel--static overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-300">
              <tr>
                <th className="px-3 py-3 text-left">标题</th>
                <th className="px-3 py-3 text-left">状态</th>
                <th className="px-3 py-3 text-left">匿名</th>
                <th className="px-3 py-3 text-left">期限</th>
                <th className="px-3 py-3 text-left">答卷</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const expired = isExpired(s)
                return (
                  <tr key={s.id} className="border-t border-gray-700/40 text-gray-200">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white flex items-center gap-2">
                        {s.title}
                        {expired && s.status === 'published' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            已过期
                          </span>
                        )}
                        {(s.subjects?.length || 0) > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            按人
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{(s.fields || []).length} 题</div>
                    </td>
                    <td className="px-3 py-2">{statusLabel[s.status] || s.status}</td>
                    <td className="px-3 py-2">
                      {s.is_anonymous ? (
                        <span className="text-emerald-400 text-xs">匿名</span>
                      ) : (
                        <span className="text-amber-400 text-xs">实名</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {formatDateTime(s.start_at)} ~ {formatDateTime(s.end_at)}
                    </td>
                    <td className="px-3 py-2">
                      {s.response_count ?? 0}
                      {s.max_responses != null && Number(s.max_responses) > 0 && (
                        <span className="text-xs text-gray-500"> / {s.max_responses}</span>
                      )}
                      {s.is_anonymous && s.claim_count != null && (
                        <span className="text-xs text-gray-500 ml-1">（领券 {s.claim_count}）</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        ref={(el) => {
                          actionBtnRefs.current[s.id] = el
                        }}
                        type="button"
                        onClick={() => openActionMenu(s.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-600/70 bg-white/5 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700/80 hover:text-white transition-colors"
                        aria-expanded={actionMenu?.id === s.id}
                        aria-haspopup="menu"
                      >
                        操作
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!list.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                    暂无问卷，点击右上角新建
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除问卷"
          message={`确认删除「${deleteTarget.title}」及全部答卷？此操作不可恢复。`}
          confirmText={deleting ? '删除中…' : '确认删除'}
          type="danger"
          onConfirm={() => {
            if (!deleting) confirmDelete()
          }}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null)
          }}
        />
      )}

      {actionMenu &&
        (() => {
          const s = list.find((item) => item.id === actionMenu.id)
          if (!s) return null
          return createPortal(
            <div
              ref={actionMenuRef}
              role="menu"
              style={{
                position: 'fixed',
                top: actionMenu.top,
                right: actionMenu.right,
                zIndex: 9999,
              }}
              className="min-w-[8.5rem] overflow-hidden rounded-lg border border-gray-600/80 bg-gray-900 shadow-xl shadow-black/50"
            >
              <button
                role="menuitem"
                onClick={() => {
                  closeActionMenu()
                  openEdit(s.id)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-400 hover:bg-white/10"
              >
                <Edit size={14} /> 编辑
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  closeActionMenu()
                  duplicateSurvey(s.id)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-violet-400 hover:bg-white/10"
              >
                <Copy size={14} /> 复制
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  closeActionMenu()
                  navigate(`/admin/surveys/${s.id}/results`)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-cyan-400 hover:bg-white/10"
              >
                <Eye size={14} /> 结果
              </button>
              {s.status !== 'published' && (
                <button
                  role="menuitem"
                  onClick={() => {
                    closeActionMenu()
                    setStatus(s.id, 'published')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-400 hover:bg-white/10"
                >
                  <Send size={14} /> 发布
                </button>
              )}
              {s.status === 'published' && (
                <button
                  role="menuitem"
                  onClick={() => {
                    closeActionMenu()
                    setStatus(s.id, 'closed')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-400 hover:bg-white/10"
                >
                  <Ban size={14} /> 关闭
                </button>
              )}
              <div className="border-t border-gray-700/80" />
              <button
                role="menuitem"
                onClick={() => {
                  closeActionMenu()
                  remove(s.id, s.title)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10"
              >
                <Trash2 size={14} /> 删除
              </button>
            </div>,
            document.body,
          )
        })()}
    </div>
  )
}
