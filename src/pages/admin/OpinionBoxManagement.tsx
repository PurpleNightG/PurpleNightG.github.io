import { useEffect, useMemo, useState } from 'react'
import { Mailbox, Loader2, Trash2, Eye, Archive, RotateCcw } from 'lucide-react'
import { opinionBoxAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useBadges } from '../../contexts/BadgeContext'

const STATUS_LABEL: Record<string, string> = {
  pending: '待查阅',
  read: '已读',
  archived: '已归档',
}

interface OpinionItem {
  id: number
  is_anonymous: boolean
  category: string
  content: string
  status: string
  admin_note: string | null
  created_at: string
  display_label: string
  member_id: number | null
  member_name: string | null
  member_qq: string | null
}

export default function OpinionBoxManagement() {
  const { refreshBadges } = useBadges()
  const [items, setItems] = useState<OpinionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'read' | 'archived'>('all')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState<Record<number, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<OpinionItem | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const res = await opinionBoxAPI.list(filter === 'all' ? undefined : filter)
      const data: OpinionItem[] = res.data || []
      setItems(data)
      const drafts: Record<number, string> = {}
      data.forEach((item) => {
        drafts[item.id] = item.admin_note || ''
      })
      setNoteDraft(drafts)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [filter])

  const pendingCount = useMemo(
    () => items.filter((i) => i.status === 'pending').length,
    [items]
  )

  const afterChange = async () => {
    await load()
    await refreshBadges()
  }

  const setStatus = async (id: number, status: string) => {
    try {
      setBusyId(id)
      await opinionBoxAPI.update(id, { status })
      toast.success('状态已更新')
      await afterChange()
    } catch (e: any) {
      toast.error(e.message || '更新失败')
    } finally {
      setBusyId(null)
    }
  }

  const saveNote = async (id: number) => {
    try {
      setBusyId(id)
      await opinionBoxAPI.update(id, { admin_note: noteDraft[id] ?? '' })
      toast.success('备注已保存')
      await load()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (item: OpinionItem) => {
    try {
      setBusyId(item.id)
      await opinionBoxAPI.delete(item.id)
      toast.success('已删除')
      setConfirmDelete(null)
      await afterChange()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Mailbox className="text-purple-400" size={26} />
            意见箱
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            学员投递的建议与反馈。匿名条目不会展示身份信息。
            {filter === 'all' || filter === 'pending' ? (
              <span className="text-amber-300/90"> 待查阅 {pendingCount} 条</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap student-glass-chip student-glass-seg">
          {([
            ['all', '全部'],
            ['pending', '待查阅'],
            ['read', '已读'],
            ['archived', '已归档'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                filter === key ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="student-glass-panel student-glass-panel--static overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-500 py-14 text-sm">暂无意见</p>
        ) : (
          <div className="divide-y divide-white/5">
            {items.map((item) => (
              <div key={item.id} className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200">{item.category}</span>
                  <span
                    className={`px-2 py-0.5 rounded ${
                      item.is_anonymous
                        ? 'bg-white/5 text-gray-300'
                        : 'bg-sky-500/15 text-sky-200'
                    }`}
                  >
                    {item.display_label}
                    {!item.is_anonymous && item.member_qq ? ` · QQ ${item.member_qq}` : ''}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 text-gray-400">
                    {STATUS_LABEL[item.status] || item.status}
                  </span>
                  <span className="text-gray-500 ml-auto">{formatDateTime(item.created_at)}</span>
                </div>

                <p className="text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">{item.content}</p>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1">
                    <label className="block text-[11px] text-gray-500 mb-1">管理备注（学员本人可见）</label>
                    <input
                      value={noteDraft[item.id] ?? ''}
                      onChange={(e) =>
                        setNoteDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      className="student-glass-field text-sm py-1.5"
                      placeholder="可选：给学员的简短回复"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => saveNote(item.id)}
                    className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm text-white disabled:opacity-50"
                  >
                    保存备注
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.status !== 'read' && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setStatus(item.id, 'read')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-sky-600/80 text-white disabled:opacity-50"
                    >
                      <Eye size={12} /> 标为已读
                    </button>
                  )}
                  {item.status !== 'pending' && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setStatus(item.id, 'pending')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-amber-600/70 text-white disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> 标为待查阅
                    </button>
                  )}
                  {item.status !== 'archived' && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setStatus(item.id, 'archived')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-gray-600 text-white disabled:opacity-50"
                    >
                      <Archive size={12} /> 归档
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => setConfirmDelete(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50 ml-auto"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="删除意见"
          message="确定删除这条意见？此操作不可撤销。"
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={() => remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
