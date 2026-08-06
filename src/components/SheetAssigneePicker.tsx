import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Users } from 'lucide-react'
import { memberAPI } from '../utils/api'
import ThemeCheckbox from './ThemeCheckbox'

export type AccessMode = 'shared' | 'student_readonly' | 'assigned'

export const ACCESS_MODE_OPTIONS = [
  { value: 'student_readonly', label: '学员只读 · 管理员可改' },
  { value: 'shared', label: '共享编辑 · 全员可填' },
  { value: 'assigned', label: '指定学员 · 仅选中可填' },
] as const

interface MemberLite {
  id: number
  nickname: string
  qq?: string
  stage_role?: string
}

interface Props {
  selectedIds: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}

export default function SheetAssigneePicker({ selectedIds, onChange, disabled }: Props) {
  const [members, setMembers] = useState<MemberLite[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    memberAPI
      .getAll()
      .then((res) => {
        if (cancelled) return
        const list = (res.data || []).map((m: any) => ({
          id: Number(m.id),
          nickname: m.nickname || m.member_name || `学员#${m.id}`,
          qq: m.qq,
          stage_role: m.stage_role,
        }))
        setMembers(list)
      })
      .catch(() => {
        if (!cancelled) setMembers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.nickname.toLowerCase().includes(q) ||
        String(m.qq || '').includes(q) ||
        String(m.stage_role || '')
          .toLowerCase()
          .includes(q)
    )
  }, [members, query])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggle = (id: number) => {
    if (disabled) return
    if (selectedSet.has(id)) onChange(selectedIds.filter((x) => x !== id))
    else onChange([...selectedIds, id])
  }

  const selectFiltered = () => {
    if (disabled) return
    const next = new Set(selectedIds)
    filtered.forEach((m) => next.add(m.id))
    onChange(Array.from(next))
  }

  const clearAll = () => {
    if (disabled) return
    onChange([])
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-400 inline-flex items-center gap-1.5">
          <Users size={12} className="text-sky-400" />
          可填写学员
          <span className="text-gray-500 tabular-nums">（已选 {selectedIds.length}）</span>
        </span>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={selectFiltered}
            disabled={disabled || filtered.length === 0}
            className="text-sky-400/90 hover:text-sky-300 disabled:opacity-40"
          >
            全选当前
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled || selectedIds.length === 0}
            className="text-gray-500 hover:text-gray-300 disabled:opacity-40"
          >
            清空
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="搜索昵称 / QQ / 阶段"
          className="student-glass-field pl-9 text-sm"
        />
      </div>

      <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
        {loading ? (
          <div className="flex justify-center py-8 text-gray-500">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-gray-500 py-6">没有匹配的学员</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map((m) => {
              const checked = selectedSet.has(m.id)
              return (
                <li key={m.id}>
                  <ThemeCheckbox
                    checked={checked}
                    disabled={disabled}
                    size={18}
                    className="w-full px-3 py-2 hover:bg-white/5"
                    onCheckedChange={() => toggle(m.id)}
                    label={
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-sm text-white truncate">{m.nickname}</span>
                        <span className="block text-[11px] text-gray-500 truncate">
                          {[m.qq, m.stage_role].filter(Boolean).join(' · ') || `ID ${m.id}`}
                        </span>
                      </span>
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-gray-500">未选任何人时，学员端将看不到此表，也无法填写。</p>
    </div>
  )
}
