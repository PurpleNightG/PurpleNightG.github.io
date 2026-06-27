import { useState, useMemo } from 'react'
import { GraduationCap, ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react'
import SearchableSelect from './SearchableSelect'

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
}

export default function ScreenShareAssistantPanel({ assistants, candidates, onRefresh }: Props) {
  const [open, setOpen] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | number>('')
  const [drafts, setDrafts] = useState<Record<number, { enabled: boolean; quota: string; unlimited: boolean }>>({})

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
    })
  }

  return (
    <div className="mt-6 bg-gray-800/30 border border-gray-700/40 rounded-xl anim-fade-last">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
      >
        <span className="text-gray-300 text-sm font-semibold flex items-center gap-2">
          <GraduationCap size={16} className="text-emerald-400" />
          助教管理
          <span className="text-gray-600 text-xs font-normal">({assistants.length})</span>
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`collapsible ${open ? 'open' : ''}`}>
        <div>
          <div className="px-4 pb-4 space-y-4">
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

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={e => setDrafts(prev => ({
                            ...prev,
                            [a.id]: { ...getDraft(a), enabled: e.target.checked },
                          }))}
                          className="rounded border-gray-600"
                        />
                        允许使用声网/火山
                      </label>

                      <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.unlimited}
                          onChange={e => setDrafts(prev => ({
                            ...prev,
                            [a.id]: { ...getDraft(a), unlimited: e.target.checked },
                          }))}
                          className="rounded border-gray-600"
                        />
                        不限次数
                      </label>

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
                          className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500/40"
                        />
                      )}

                      <button
                        onClick={() => updateAssistant(a.id, { reset_used: true })}
                        disabled={savingId === a.id}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded transition-colors"
                      >
                        <RotateCcw size={12} /> 清零次数
                      </button>

                      <button
                        onClick={() => handleSave(a)}
                        disabled={savingId === a.id}
                        className="ml-auto px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded text-xs font-medium transition-colors disabled:opacity-50"
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
            助教可使用声网/火山引擎分享屏幕，无需管理员逐次审批。PeerJS 模式所有人可用。次数仅在<strong className="text-gray-500">发起共享</strong>时扣除。
          </p>
          </div>
        </div>
      </div>
    </div>
  )
}
