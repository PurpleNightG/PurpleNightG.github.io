import { useEffect, useState } from 'react'
import { Copy, Check, KeyRound, Trash2, Plus, ChevronDown } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export type GuestCodeRow = {
  id: number
  code: string
  mode: 'peerjs' | 'agora' | 'volc'
  created_by_type: 'admin' | 'assistant'
  created_by_member_id: number | null
  created_by_name: string
  status: 'active' | 'used' | 'revoked'
  used_by_nickname: string | null
  used_at: string | null
  room_id: string | null
  created_at: string
}

type Props = {
  /** admin 看全部；assistant 只看自己的 */
  role: 'admin' | 'assistant'
  memberId?: number | null
  creatorName: string
  onConsumedQuota?: () => void
  className?: string
  defaultOpen?: boolean
  /** 作为侧栏长列时拉满中间列高度 */
  tall?: boolean
}

const MODE_OPTIONS = [
  { id: 'peerjs' as const, label: 'WebRTC' },
  { id: 'agora' as const, label: '声网' },
  { id: 'volc' as const, label: '火山' },
]

function modeLabel(m: string) {
  return MODE_OPTIONS.find(o => o.id === m)?.label || m
}

export default function ScreenShareGuestCodesPanel({
  role,
  memberId,
  creatorName,
  onConsumedQuota,
  className,
  defaultOpen = false,
  tall = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [codes, setCodes] = useState<GuestCodeRow[]>([])
  const [mode, setMode] = useState<'peerjs' | 'agora' | 'volc'>('peerjs')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [lastCreated, setLastCreated] = useState<GuestCodeRow | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      let q = ''
      if (role === 'admin') {
        q = '?scope=admin'
      } else if (role === 'assistant') {
        if (!memberId) {
          setCodes([])
          setError('无法确认助教身份，无法加载访客码')
          return
        }
        q = `?scope=assistant&memberId=${memberId}`
      } else {
        setCodes([])
        return
      }
      const res = await fetch(`${API_URL}/room/guest-codes${q}`)
      const data = await res.json()
      const list = Array.isArray(data.data) ? data.data : []
      setCodes(
        role === 'assistant' && memberId
          ? list.filter(
              (row: GuestCodeRow) =>
                Number(row.created_by_member_id) === Number(memberId) &&
                row.created_by_type === 'assistant'
            )
          : list
      )
    } catch {
      setError('加载访客码失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [role, memberId])

  const handleCreate = async () => {
    if (creating) return
    if (role === 'assistant' && !memberId) {
      setError('无法确认助教身份')
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/room/guest-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          creatorType: role,
          memberId: role === 'assistant' ? memberId : undefined,
          creatorName,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || '生成失败')
        return
      }
      setLastCreated(data.data)
      await refresh()
      onConsumedQuota?.()
    } catch {
      setError('生成失败')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/room/guest-codes/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asAdmin: role === 'admin',
          memberId: role === 'assistant' ? memberId : undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || '删除失败')
        return
      }
      await refresh()
    } catch {
      setError('删除失败')
    }
  }

  const copyCode = async (row: GuestCodeRow) => {
    try {
      await navigator.clipboard.writeText(row.code)
      setCopiedId(row.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  const activeCount = codes.filter(c => c.status === 'active').length

  return (
    <div className={`bg-gray-800/30 border border-gray-700/40 rounded-xl anim-fade-last overflow-hidden ${tall ? 'flex flex-col ' : ''}${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors shrink-0"
      >
        <span className="text-gray-300 text-sm font-semibold flex items-center gap-2">
          <KeyRound size={15} className="text-amber-400" />
          访客码
          <span className="text-gray-600 text-xs font-normal">
            ({codes.length}{role === 'assistant' ? ` · 未用 ${activeCount}` : ''})
          </span>
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`collapsible ${open ? 'open' : ''} ${tall && open ? 'flex-1 min-h-0' : ''}`}>
        <div className={tall ? 'h-full' : undefined}>
          <div className={`px-4 pb-4 space-y-4 overflow-y-auto sidebar-scrollbar ${tall ? 'h-full max-h-none' : 'max-h-[min(42vh,32rem)]'}`}>
            <p className="text-gray-500 text-xs leading-relaxed">
              发给无账号访客用于发起共享。助教每生成一枚会消耗一次共享次数；可同时持有的未使用码数量由管理员设定。删除不退还次数。
              {role === 'assistant' && (
                <span className="text-gray-400"> 仅显示你生成的码。</span>
              )}
              {role === 'admin' && (
                <span className="text-gray-400"> 管理可查看所有人生成的访客码。</span>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                {MODE_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setMode(o.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      mode === o.id ? 'bg-amber-600/35 text-amber-100' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Plus size={13} />
                {creating ? '生成中…' : '生成访客码'}
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
              >
                刷新
              </button>
            </div>

            {lastCreated && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-2 anim-slide-down-row">
                <div className="min-w-0">
                  <p className="text-amber-200 text-xs">刚生成 · {modeLabel(lastCreated.mode)}</p>
                  <p className="text-white font-mono text-lg tracking-wider">{lastCreated.code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyCode(lastCreated)}
                  className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-amber-200"
                  title="复制"
                >
                  {copiedId === lastCreated.id ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="space-y-1.5">
              {codes.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-3">{loading ? '加载中…' : '暂无访客码'}</p>
              ) : (
                codes.map(row => (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-900/40 border border-gray-700/40 text-xs anim-slide-down-row"
                  >
                    <span className="font-mono text-white tracking-wide">{row.code}</span>
                    <span className="text-gray-500">{modeLabel(row.mode)}</span>
                    <span className={row.status === 'active' ? 'text-emerald-400' : 'text-blue-400'}>
                      {row.status === 'active' ? '未使用' : '已用'}
                    </span>
                    {row.used_by_nickname && (
                      <span className="text-gray-500 truncate">→ {row.used_by_nickname}</span>
                    )}
                    {role === 'admin' && (
                      <span className="text-gray-600 ml-auto shrink-0 hidden sm:inline">
                        {row.created_by_name}
                        {row.created_by_type === 'admin' ? ' · 管理' : ' · 助教'}
                      </span>
                    )}
                    {role !== 'admin' && <span className="ml-auto" />}
                    {row.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => copyCode(row)}
                        className="p-1 text-gray-500 hover:text-white"
                        title="复制"
                      >
                        {copiedId === row.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    )}
                    {(row.status === 'active' || (role === 'admin' && row.status === 'used')) && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(row.id)}
                        className="p-1 text-gray-500 hover:text-red-400"
                        title="删除"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
