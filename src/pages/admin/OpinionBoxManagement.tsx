import { useEffect, useMemo, useState } from 'react'
import { Trash2, Eye, Archive, RotateCcw } from 'lucide-react'
import { opinionBoxAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useBadges } from '../../contexts/BadgeContext'
import MemberNameCell from '../../components/MemberNameCell'

const STATUS_LABEL: Record<string, string> = {
  pending: '待查阅',
  read: '已读',
  archived: '已归档',
}

const CATEGORY_STAMP: Record<string, { label: string; tone: string }> = {
  问题反馈: { label: '错误报告', tone: 'bug' },
  建议: { label: '功能建议', tone: 'suggest' },
  表扬: { label: '表扬感谢', tone: 'praise' },
  其他: { label: '其他事项', tone: 'other' },
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
  avatar?: string | null
}

function padSerial(n: number) {
  return String(n).padStart(4, '0')
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

  const filters = [
    ['all', '全部'],
    ['pending', '待查阅'],
    ['read', '已读'],
    ['archived', '已归档'],
  ] as const

  return (
    <div className="opinion-fax-page opinion-fax-page--admin">
      <div className="opinion-fax opinion-fax--wide" aria-label="意见收件台">
        <header className="opinion-fax__titlebar">
          <span className="opinion-fax__brand">意见箱 · 收件专线 INBOX LINE</span>
          <span className="opinion-fax__model">FX-02</span>
        </header>

        <div className="opinion-fax__panel">
          <div className="opinion-fax__led">
            <span className="opinion-fax__led-msg">
              {loading
                ? '检索中 · SCANNING'
                : filter === 'pending' || filter === 'all'
                  ? `待命收件 · PENDING ${pendingCount}`
                  : `已载入 ${items.length} 份 · LOADED`}
            </span>
            <span className="opinion-fax__led-chars">{items.length} 份传真</span>
          </div>

          <div className="opinion-fax__modes opinion-fax__modes--filter" role="group" aria-label="筛选">
            {filters.map(([key, label]) => {
              const on = filter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`opinion-fax__mode${on ? ' is-on' : ''}`}
                >
                  {on && <span className="opinion-fax__mode-dot" aria-hidden />}
                  <span className="opinion-fax__mode-en">{key.toUpperCase()}</span>
                  <span className="opinion-fax__mode-zh">{label}</span>
                </button>
              )
            })}
          </div>

          <div className="opinion-fax__feed-label">收件托盘 · INCOMING</div>
          <div className="opinion-fax__slot" aria-hidden />

          <div className="opinion-fax-admin__tray">
            {loading ? (
              <p className="opinion-fax__outbox-empty">正在拉取传真…</p>
            ) : items.length === 0 ? (
              <p className="opinion-fax__outbox-empty">托盘空着，暂无意见。</p>
            ) : (
              items.map((item) => (
                <article
                  key={item.id}
                  className={`opinion-fax-admin__sheet${item.status === 'pending' ? ' is-pending' : ''}`}
                >
                  <div className="opinion-fax-admin__sheet-head">
                    <div>
                      <div className="opinion-fax__doc-title">紫夜 · 来信传真 NO.{padSerial(item.id)}</div>
                      <div className="opinion-fax__doc-meta">
                        <span>分类：{item.category}</span>
                        <span>时间：{formatDateTime(item.created_at)}</span>
                        <span className="opinion-fax-admin__from">
                          发件：
                          {item.is_anonymous ? (
                            item.display_label
                          ) : (
                            <MemberNameCell
                              name={item.member_name || item.display_label}
                              avatar={item.avatar}
                              qq={item.member_qq}
                            />
                          )}
                          {!item.is_anonymous && item.member_qq ? ` · QQ ${item.member_qq}` : ''}
                        </span>
                        <span>状态：{STATUS_LABEL[item.status] || item.status}</span>
                      </div>
                    </div>
                    <div
                      className={`opinion-fax__stamp opinion-fax__stamp--${
                        CATEGORY_STAMP[item.category]?.tone || 'other'
                      }`}
                    >
                      {CATEGORY_STAMP[item.category]?.label || item.category}
                    </div>
                  </div>

                  <p className="opinion-fax-admin__body">{item.content}</p>

                  <div className="opinion-fax-admin__reply">
                    <label>管理回复（学员可见）</label>
                    <div className="opinion-fax-admin__reply-row">
                      <input
                        value={noteDraft[item.id] ?? ''}
                        onChange={(e) =>
                          setNoteDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="可选：给学员的简短回复"
                      />
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => saveNote(item.id)}
                        className="opinion-fax__btn-clear"
                      >
                        保存
                      </button>
                    </div>
                  </div>

                  <div className="opinion-fax-admin__actions">
                    {item.status !== 'read' && (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => setStatus(item.id, 'read')}
                        className="opinion-fax__btn-clear"
                      >
                        <Eye size={14} /> 标为已读
                      </button>
                    )}
                    {item.status !== 'pending' && (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => setStatus(item.id, 'pending')}
                        className="opinion-fax__btn-clear"
                      >
                        <RotateCcw size={14} /> 待查阅
                      </button>
                    )}
                    {item.status !== 'archived' && (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => setStatus(item.id, 'archived')}
                        className="opinion-fax__btn-clear"
                      >
                        <Archive size={14} /> 归档
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setConfirmDelete(item)}
                      className="opinion-fax-admin__btn-del"
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
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
