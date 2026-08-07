import { useState, useMemo } from 'react'
import { GraduationCap, Plus, RotateCcw, Trash2, CheckSquare, Square, ChevronDown } from 'lucide-react'
import SearchableSelect from './SearchableSelect'
import { cn } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

function formatMemberLabel(nickname: string, qq: string) {
  return `${nickname}（${qq}）`
}

export interface AssistantRow {
  id: number
  username: string
  nickname: string
  qq: string
  status: string
  screen_share_enabled: boolean
  screen_share_quota: number | null
  screen_share_used: number
  guest_code_max: number
  quotaRemaining: number | null
}

export interface AssistantCandidate {
  id: number
  username: string
  nickname: string
  qq: string
  status: string
}

interface Props {
  assistants: AssistantRow[]
  candidates: AssistantCandidate[]
  onRefresh: () => Promise<void>
  defaultOpen?: boolean
  /** 作为侧栏长列时拉满中间列高度 */
  tall?: boolean
  className?: string
}

function ThemeCheckbox({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="flex items-center gap-2 text-left group select-none"
    >
      {checked ? (
        <CheckSquare size={18} className="text-purple-400 flex-shrink-0" />
      ) : (
        <Square size={18} className="text-gray-500 group-hover:text-gray-400 flex-shrink-0" />
      )}
      <span className="text-sm text-gray-200">{label}</span>
    </button>
  )
}

export default function ScreenShareAssistantPanel({
  assistants,
  candidates,
  onRefresh,
  defaultOpen = false,
  tall = false,
  className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | number>('')
  const [drafts, setDrafts] = useState<Record<number, { enabled: boolean; quota: string; unlimited: boolean; guestCodeMax: string }>>({})

  const candidateOptions = useMemo(
    () => candidates.map(c => ({
      id: c.id,
      label: formatMemberLabel(c.nickname, c.qq),
      searchText: c.username !== c.nickname ? c.username : undefined,
    })),
    [candidates]
  )

  const getDraft = (a: AssistantRow) => {
    if (drafts[a.id]) return drafts[a.id]
    return {
      enabled: a.screen_share_enabled,
      quota: a.screen_share_quota == null ? '' : String(a.screen_share_quota),
      unlimited: a.screen_share_quota == null,
      guestCodeMax: String(a.guest_code_max ?? 1),
    }
  }

  const updateAssistant = async (memberId: number, body: Record<string, unknown>) => {
    setSavingId(memberId)
    try {
      await fetch(`${API_URL}/room/assistants/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await onRefresh()
    } finally {
      setSavingId(null)
    }
  }

  const handleAdd = async (memberId: number) => {
    setAddingId(memberId)
    await updateAssistant(memberId, {
      is_assistant: true,
      screen_share_enabled: true,
      screen_share_quota: null,
      guest_code_max: 1,
      reset_used: true,
    })
    setAddingId(null)
    setSelectedCandidateId('')
  }

  const handleRemove = async (memberId: number) => {
    await updateAssistant(memberId, { is_assistant: false })
    setDrafts(prev => {
      const next = { ...prev }
      delete next[memberId]
      return next
    })
  }

  const handleSave = async (a: AssistantRow) => {
    const draft = getDraft(a)
    await updateAssistant(a.id, {
      is_assistant: true,
      screen_share_enabled: draft.enabled,
      screen_share_quota: draft.unlimited ? null : (parseInt(draft.quota, 10) || 0),
      guest_code_max: Math.max(0, parseInt(draft.guestCodeMax, 10) || 0),
    })
  }

  return (
    <div className={cn(
      'bg-gray-800/30 border border-gray-700/40 rounded-xl anim-fade-last overflow-hidden',
      tall && 'flex flex-col',
      className,
    )}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors shrink-0"
      >
        <span className="text-gray-300 text-sm font-semibold flex items-center gap-2">
          <GraduationCap size={16} className="text-emerald-400" />
          助教管理
          <span className="text-gray-600 text-xs font-normal">({assistants.length})</span>
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={cn('collapsible', open && 'open', tall && open && 'flex-1 min-h-0')}>
        <div className={tall ? 'h-full' : undefined}>
          <div className={cn(
            'px-4 pb-4 space-y-4 overflow-y-auto sidebar-scrollbar',
            tall ? 'h-full max-h-none' : 'max-h-[min(42vh,32rem)]',
          )}>
            {candidates.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 block">添加助教（成员，非管理员）</label>
                <div className="flex gap-2">
                  <SearchableSelect
                    className="flex-1"
                    options={candidateOptions}
                    value={selectedCandidateId}
                    onChange={setSelectedCandidateId}
                    placeholder="搜索昵称、QQ 或用户名…"
                    disabled={addingId !== null}
                  />
                  <button
                    onClick={() => {
                      const id = parseInt(String(selectedCandidateId), 10)
                      if (id) handleAdd(id)
                    }}
                    disabled={addingId !== null || !selectedCandidateId}
                    className="flex items-center gap-1 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Plus size={14} />
                    {addingId ? '添加中…' : '添加'}
                  </button>
                </div>
              </div>
            )}

            {assistants.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">暂无助教，可从上方成员列表添加</p>
            ) : (
              <div className="space-y-3">
                {assistants.map(a => {
                  const draft = getDraft(a)
                  const remaining = a.screen_share_quota == null ? '不限' : `${a.quotaRemaining ?? 0} / ${a.screen_share_quota}`
                  return (
                    <div key={a.id} className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-white text-sm font-medium">{formatMemberLabel(a.nickname, a.qq)}</div>
                          <div className="text-emerald-400/80 text-xs mt-1">已用 {a.screen_share_used} 次 · 剩余 {remaining}</div>
                        </div>
                        <button
                          onClick={() => handleRemove(a.id)}
                          disabled={savingId === a.id}
                          className="text-red-400/70 hover:text-red-400 transition-colors p-1"
                          title="取消助教"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                        <ThemeCheckbox
                          checked={draft.enabled}
                          label="允许使用火山引擎"
                          onCheckedChange={enabled => setDrafts(prev => ({
                            ...prev,
                            [a.id]: { ...getDraft(a), enabled },
                          }))}
                        />
                        <ThemeCheckbox
                          checked={draft.unlimited}
                          label="不限次数"
                          onCheckedChange={unlimited => setDrafts(prev => ({
                            ...prev,
                            [a.id]: { ...getDraft(a), unlimited },
                          }))}
                        />

                        {!draft.unlimited && (
                          <input
                            type="number"
                            min={0}
                            value={draft.quota}
                            onChange={e => setDrafts(prev => ({
                              ...prev,
                              [a.id]: { ...getDraft(a), quota: e.target.value, unlimited: false },
                            }))}
                            placeholder="次数上限"
                            className="w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500/40"
                          />
                        )}

                        <label className="flex items-center gap-1.5 text-gray-300">
                          <span className="text-xs text-gray-500 whitespace-nowrap">访客码上限</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={draft.guestCodeMax}
                            onChange={e => setDrafts(prev => ({
                              ...prev,
                              [a.id]: { ...getDraft(a), guestCodeMax: e.target.value },
                            }))}
                            title="一次最多可同时持有几个未使用访客码"
                            className="w-16 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500/40"
                          />
                        </label>

                        <button
                          onClick={() => updateAssistant(a.id, { reset_used: true })}
                          disabled={savingId === a.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-md transition-colors"
                        >
                          <RotateCcw size={12} /> 重置次数
                        </button>

                        <button
                          onClick={() => handleSave(a)}
                          disabled={savingId === a.id}
                          className="ml-auto px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {savingId === a.id ? '保存中…' : '保存'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-gray-600 text-xs leading-relaxed">
              助教可使用火山引擎分享屏幕，无需管理员逐次审批。WebRTC 模式所有人可用。次数在<strong className="text-gray-500">发起共享</strong>或<strong className="text-gray-500">生成访客码</strong>时扣除。「访客码上限」控制助教一次可同时持有多少枚未使用访客码。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
