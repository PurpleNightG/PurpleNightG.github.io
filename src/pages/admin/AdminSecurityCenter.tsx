import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ShieldAlert, RefreshCw, LogOut, ScrollText, MonitorSmartphone,
  Users, KeyRound, Trash2, Mail, Crown, Plus, X, Ban, CheckCircle2,
} from 'lucide-react'
import { securityAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'
import ThemeCheckbox from '../../components/ThemeCheckbox'
import PageSkeleton from '../../components/Skeleton'
import StyledSelect from '../../components/StyledSelect'
import DateInput from '../../components/DateInput'

interface AuditRow {
  id: number
  admin_id: number | null
  admin_username: string | null
  action: string
  method: string
  path: string
  resource_type: string | null
  resource_id: string | number | null
  summary: string | null
  /** 人话说明（服务端生成；旧数据也会按路径翻译） */
  summary_human?: string | null
  /** 技术路径 METHOD /api/... */
  summary_tech?: string | null
  ip: string | null
  created_at: string
}

interface SessionRow {
  id: number
  session_id: string
  device_name: string
  ip: string | null
  last_active_at: string | null
  created_at: string
  revoked: boolean
  expired?: boolean
  is_current?: boolean
}

interface AdminSessionGroup {
  admin_id: number
  username: string
  name: string | null
  is_super_admin?: boolean
  sessions: SessionRow[]
}

interface AdminAccount {
  id: number
  username: string
  name: string | null
  email: string | null
  email_bound: boolean
  is_super_admin: boolean
  login_disabled?: boolean
  created_at: string
}

type Tab = 'sessions' | 'audit' | 'admins'

const AUDIT_PAGE_SIZE = 20

type AuditFilters = {
  q: string
  adminId: string
  from: string
  to: string
}

const emptyAuditFilters = (): AuditFilters => ({
  q: '',
  adminId: '',
  from: '',
  to: '',
})

export default function AdminSecurityCenter() {
  const [tab, setTab] = useState<Tab>('sessions')
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<AdminSessionGroup[]>([])
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [isSuper, setIsSuper] = useState(false)
  const [auditDraft, setAuditDraft] = useState<AuditFilters>(emptyAuditFilters)
  const [auditApplied, setAuditApplied] = useState<AuditFilters>(emptyAuditFilters)
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditJumpInput, setAuditJumpInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [superKey, setSuperKey] = useState('')
  const [confirmKick, setConfirmKick] = useState<AdminSessionGroup | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminAccount | null>(null)
  const [confirmBan, setConfirmBan] = useState<AdminAccount | null>(null)
  const [emailEdit, setEmailEdit] = useState<{ id: number; email: string } | null>(null)
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    is_super_admin: false,
  })
  const [showCreate, setShowCreate] = useState(false)

  const resetCreateForm = () =>
    setCreateForm({ username: '', password: '', name: '', email: '', is_super_admin: false })

  const closeCreate = () => {
    if (busy) return
    setShowCreate(false)
    resetCreateForm()
  }

  const loadSessions = useCallback(async () => {
    const res = await securityAPI.getAdminSessions()
    setGroups(res.data || [])
    if (res.meta?.is_super_admin != null) setIsSuper(!!res.meta.is_super_admin)
  }, [])

  const loadAudits = useCallback(async (filters: AuditFilters, page: number) => {
    const adminIdNum = filters.adminId ? Number(filters.adminId) : NaN
    const res = await securityAPI.getAuditLogs({
      page,
      pageSize: AUDIT_PAGE_SIZE,
      q: filters.q.trim() || undefined,
      admin_id: Number.isFinite(adminIdNum) && adminIdNum > 0 ? adminIdNum : undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    })
    setAudits(res.data || [])
    setAuditTotal(Number(res.meta?.total) || 0)
    if (res.meta?.page) setAuditPage(Number(res.meta.page) || page)
  }, [])

  const loadAdmins = useCallback(async () => {
    const res = await securityAPI.getAdmins()
    setAdmins(res.data || [])
    if (res.meta?.is_super_admin != null) setIsSuper(!!res.meta.is_super_admin)
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const me = await securityAPI.getMe().catch(() => null)
      if (me?.data?.is_super_admin != null) setIsSuper(!!me.data.is_super_admin)
      if (tab === 'sessions') await loadSessions()
      else if (tab === 'audit') {
        await Promise.all([loadAudits(auditApplied, auditPage), loadAdmins()])
      } else await loadAdmins()
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [tab, auditApplied, auditPage, loadSessions, loadAudits, loadAdmins])

  useEffect(() => {
    void load()
  }, [load])

  const applyAuditFilters = () => {
    setAuditApplied({ ...auditDraft })
    setAuditPage(1)
  }

  const resetAuditFilters = () => {
    const empty = emptyAuditFilters()
    setAuditDraft(empty)
    setAuditApplied(empty)
    setAuditPage(1)
  }

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE))

  const auditAdminOptions = useMemo(
    () => [
      { value: '', label: '全部管理员' },
      ...admins.map((a) => ({
        value: String(a.id),
        label: a.name || a.username,
        description: a.name ? `@${a.username}` : undefined,
      })),
    ],
    [admins]
  )

  const jumpToAuditPage = () => {
    const n = parseInt(auditJumpInput.trim(), 10)
    if (!Number.isFinite(n)) {
      toast.error('请输入有效页码')
      return
    }
    const next = Math.min(auditTotalPages, Math.max(1, n))
    setAuditPage(next)
    setAuditJumpInput('')
  }

  const needKey = () => {
    if (!superKey.trim()) {
      toast.error('请先填写操作密钥')
      return false
    }
    return true
  }

  const kickAdmin = async (g: AdminSessionGroup) => {
    if (!needKey()) return
    try {
      setBusy(true)
      const res = await securityAPI.revokeAdminSessions(g.admin_id, superKey.trim())
      toast.success(res.message || '已强制登出')
      setConfirmKick(null)
      await loadSessions()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const kickSession = async (adminId: number, rowId: number) => {
    if (!needKey()) return
    try {
      setBusy(true)
      await securityAPI.revokeSession(rowId, adminId, superKey.trim())
      toast.success('已登出该设备')
      await loadSessions()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const saveEmail = async () => {
    if (!emailEdit || !needKey()) return
    try {
      setBusy(true)
      await securityAPI.setAdminEmail(emailEdit.id, emailEdit.email, superKey.trim())
      toast.success('邮箱已更新')
      setEmailEdit(null)
      await loadAdmins()
    } catch (e: any) {
      toast.error(e.message || '更新失败')
    } finally {
      setBusy(false)
    }
  }

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!needKey()) return
    try {
      setBusy(true)
      await securityAPI.createAdmin({
        ...createForm,
        super_key: superKey.trim(),
      })
      toast.success('管理员已创建')
      setShowCreate(false)
      resetCreateForm()
      await loadAdmins()
    } catch (err: any) {
      toast.error(err.message || '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const toggleSuper = async (a: AdminAccount) => {
    if (!needKey()) return
    try {
      setBusy(true)
      await securityAPI.setSuperAdmin(a.id, !a.is_super_admin, superKey.trim())
      toast.success('已更新')
      await loadAdmins()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const deleteAdmin = async (a: AdminAccount) => {
    if (!needKey()) return
    try {
      setBusy(true)
      await securityAPI.deleteAdmin(a.id, superKey.trim())
      toast.success('已删除')
      setConfirmDelete(null)
      await loadAdmins()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    } finally {
      setBusy(false)
    }
  }

  const toggleLoginDisabled = async (a: AdminAccount) => {
    if (!needKey()) return
    const disable = !a.login_disabled
    try {
      setBusy(true)
      const res = await securityAPI.setLoginDisabled(a.id, disable, superKey.trim())
      toast.success(res.message || (disable ? '已禁止登录' : '已恢复登录'))
      setConfirmBan(null)
      await loadAdmins()
      if (disable) await loadSessions().catch(() => {})
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const activeCount = (g: AdminSessionGroup) =>
    (g.sessions || []).filter((s) => !s.revoked && !s.expired).length

  return (
    <div className="p-6 md:p-8 w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="text-amber-400" size={28} />
            安全中心
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {isSuper
              ? '超级管理员：可管理账号、绑邮箱、踢下线；踢人与改账号仍须填写操作密钥。'
              : '普通管理员：仅可查看会话与审计；不可踢人。邮箱由超级管理员绑定。'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 text-sm border border-white/10"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {isSuper && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2">
          <label className="text-sm text-amber-100/90 flex items-center gap-2">
            <KeyRound size={16} />
            操作密钥（踢人 / 删号 / 绑邮箱等写操作必填）
          </label>
          <input
            type="password"
            value={superKey}
            onChange={(e) => setSuperKey(e.target.value)}
            placeholder="输入操作密钥"
            className="w-full max-w-md px-3 py-2 rounded-lg bg-black/40 border border-amber-500/20 text-gray-100 text-sm outline-none focus:border-amber-400/50"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {(
          [
            ['sessions', MonitorSmartphone, '管理员会话'],
            ['audit', ScrollText, '操作审计'],
            ['admins', Users, '账号与邮箱'],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Icon size={16} />
              {label}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : tab === 'sessions' ? (
        <div className="space-y-4">
          {groups.length === 0 ? (
            <p className="text-gray-500 text-center py-12">暂无管理员账号</p>
          ) : (
            groups.map((g) => (
              <div
                key={g.admin_id}
                className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/5">
                  <div>
                    <div className="text-white font-medium">
                      {g.name || g.username}
                      <span className="text-gray-500 font-normal ml-2">@{g.username}</span>
                      {g.is_super_admin ? (
                        <span className="ml-2 text-xs text-amber-400 inline-flex items-center gap-1">
                          <Crown size={12} /> 超管
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ID {g.admin_id} · 活跃会话 {activeCount(g)}
                    </div>
                  </div>
                  {isSuper ? (
                    <button
                      type="button"
                      disabled={busy || activeCount(g) === 0}
                      onClick={() => setConfirmKick(g)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 disabled:opacity-40"
                    >
                      <LogOut size={14} />
                      强制全部下线
                    </button>
                  ) : null}
                </div>
                <div className="divide-y divide-white/5">
                  {(g.sessions || []).length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500">无会话记录</p>
                  ) : (
                    (g.sessions || []).map((s) => {
                      const dead = s.revoked || s.expired
                      return (
                        <div
                          key={s.id}
                          className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="text-gray-200">
                              {s.device_name || '未知设备'}
                              {s.is_current ? (
                                <span className="ml-2 text-xs text-emerald-400">当前</span>
                              ) : null}
                              {dead ? (
                                <span className="ml-2 text-xs text-gray-500">
                                  {s.revoked ? '已登出' : '已过期'}
                                </span>
                              ) : (
                                <span className="ml-2 text-xs text-emerald-500/80">在线</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              IP {s.ip || '—'} · 最近活跃{' '}
                              {s.last_active_at ? formatDateTime(s.last_active_at) : '—'}
                              {' · '}登录 {formatDateTime(s.created_at)}
                            </div>
                          </div>
                          {isSuper && !dead && !s.is_current ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void kickSession(g.admin_id, s.id)}
                              className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-red-600/20 text-gray-300 hover:text-red-300 border border-white/10"
                            >
                              踢下线
                            </button>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'audit' ? (
        <div className="space-y-4">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              applyAuditFilters()
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end [&_.student-glass-field]:!h-[42px] [&_.student-glass-field]:!min-h-[42px] [&_.student-glass-field]:!max-h-[42px] [&_.student-glass-field]:!py-0 [&_.student-glass-field]:!box-border [&_button.student-glass-field]:!flex [&_button.student-glass-field]:!items-center [&_div.student-glass-field]:!flex [&_div.student-glass-field]:!items-center">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-300 mb-1">关键词</label>
                <input
                  value={auditDraft.q}
                  onChange={(e) => setAuditDraft((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="用户名 / 说明 / 路径 / IP"
                  className="student-glass-field w-full text-sm !px-4"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-300 mb-1">管理员</label>
                <StyledSelect
                  options={auditAdminOptions}
                  value={auditDraft.adminId}
                  onChange={(v) => setAuditDraft((prev) => ({ ...prev, adminId: v }))}
                  placeholder="全部管理员"
                  searchable
                  className="w-full"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-300 mb-1">开始日期</label>
                <DateInput
                  value={auditDraft.from}
                  onChange={(value) => setAuditDraft((prev) => ({ ...prev, from: value }))}
                  className="w-full"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-300 mb-1">结束日期</label>
                <DateInput
                  value={auditDraft.to}
                  onChange={(value) => setAuditDraft((prev) => ({ ...prev, to: value }))}
                  className="w-full"
                  min={auditDraft.from || undefined}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-purple-600/40 text-purple-100 text-sm border border-purple-500/40 hover:bg-purple-600/55"
              >
                查询
              </button>
              <button
                type="button"
                onClick={resetAuditFilters}
                className="px-4 py-2 rounded-lg bg-white/5 text-gray-300 text-sm border border-white/10 hover:bg-white/10"
              >
                重置
              </button>
              <span className="text-xs text-gray-500 ml-auto">
                共 {auditTotal} 条
              </span>
            </div>
          </form>
          <div className="rounded-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/[0.04] text-gray-400 text-xs">
                <tr>
                  <th className="px-3 py-2.5 font-medium">时间</th>
                  <th className="px-3 py-2.5 font-medium">管理员</th>
                  <th className="px-3 py-2.5 font-medium">说明</th>
                  <th className="px-3 py-2.5 font-medium">接口</th>
                  <th className="px-3 py-2.5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {audits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-gray-500">
                      暂无审计记录
                    </td>
                  </tr>
                ) : (
                  audits.map((row) => {
                    const human =
                      row.summary_human ||
                      row.summary ||
                      row.action ||
                      '—'
                    const tech =
                      row.summary_tech ||
                      `${row.method || ''} ${row.path || ''}`.trim() ||
                      '—'
                    return (
                      <tr key={row.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-200 whitespace-nowrap">
                          {row.admin_username || '—'}
                        </td>
                        <td
                          className="px-3 py-2.5 text-gray-100"
                          title={human}
                        >
                          <span className="break-words">{human}</span>
                        </td>
                        <td
                          className="px-3 py-2.5 text-purple-300/80 font-mono text-xs break-all"
                          title={tech}
                        >
                          {tech}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{row.ip || '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            {!loading && auditTotal > 0 && (
              <div className="p-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage <= 1}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm whitespace-nowrap"
                  >
                    上一页
                  </button>
                  <span className="text-gray-400 text-sm whitespace-nowrap tabular-nums">
                    第 {auditPage} / {auditTotalPages} 页
                  </span>
                  <button
                    type="button"
                    onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage >= auditTotalPages}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm whitespace-nowrap"
                  >
                    下一页
                  </button>
                </div>
                <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                  <span className="text-gray-500 text-sm shrink-0">跳至</span>
                  <input
                    type="number"
                    min={1}
                    max={auditTotalPages}
                    value={auditJumpInput}
                    onChange={(e) => setAuditJumpInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        jumpToAuditPage()
                      }
                    }}
                    placeholder={String(auditPage)}
                    className="student-glass-field !w-16 !min-w-16 max-w-16 shrink-0 px-2 py-1.5 text-sm text-center"
                  />
                  <span className="text-gray-500 text-sm shrink-0">页</span>
                  <button
                    type="button"
                    onClick={jumpToAuditPage}
                    className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg bg-purple-600/40 text-purple-100 text-sm border border-purple-500/40 hover:bg-purple-600/55"
                  >
                    跳转
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {isSuper ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600/40 text-purple-50 text-sm border border-purple-500/40 hover:bg-purple-600/55"
              >
                <Plus size={16} />
                新建管理员
              </button>
            </div>
          ) : null}
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/[0.04] text-gray-400 text-xs">
                <tr>
                  <th className="px-3 py-2.5">用户名</th>
                  <th className="px-3 py-2.5">邮箱</th>
                  <th className="px-3 py-2.5">角色</th>
                  <th className="px-3 py-2.5">状态</th>
                  {isSuper ? <th className="px-3 py-2.5">操作</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-3 text-gray-200">
                      {a.name || a.username}
                      <div className="text-xs text-gray-500">@{a.username}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-300">
                      {a.email_bound ? a.email : <span className="text-red-400">未绑定（无法登录）</span>}
                    </td>
                    <td className="px-3 py-3">
                      {a.is_super_admin ? (
                        <span className="text-amber-400 text-xs">超级管理员</span>
                      ) : (
                        <span className="text-gray-500 text-xs">管理员</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {a.login_disabled ? (
                        <span className="text-red-400 text-xs">已禁止登录</span>
                      ) : (
                        <span className="text-emerald-400/90 text-xs">可登录</span>
                      )}
                    </td>
                    {isSuper ? (
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-300 inline-flex items-center gap-1"
                            onClick={() =>
                              setEmailEdit({
                                id: a.id,
                                email: a.email_bound && a.email && !a.email.includes('*') ? a.email : '',
                              })
                            }
                          >
                            <Mail size={12} /> 绑邮箱
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-300"
                            onClick={() => void toggleSuper(a)}
                          >
                            {a.is_super_admin ? '取消超管' : '设为超管'}
                          </button>
                          <button
                            type="button"
                            className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 border ${
                              a.login_disabled
                                ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-300'
                                : 'bg-amber-600/15 border-amber-500/30 text-amber-200'
                            }`}
                            onClick={() => {
                              if (a.login_disabled) void toggleLoginDisabled(a)
                              else setConfirmBan(a)
                            }}
                          >
                            {a.login_disabled ? (
                              <>
                                <CheckCircle2 size={12} /> 恢复登录
                              </>
                            ) : (
                              <>
                                <Ban size={12} /> 禁止登录
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded bg-red-600/15 border border-red-500/30 text-red-300 inline-flex items-center gap-1"
                            onClick={() => setConfirmDelete(a)}
                          >
                            <Trash2 size={12} /> 删除
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            onClick={closeCreate}
          >
            <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
            <div
              className="relative z-10 glass-modal-frame w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="glass-modal-tilt">
                <form
                  onSubmit={createAdmin}
                  className="student-glass-panel student-glass-panel--static student-glass-modal w-full overflow-hidden"
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Plus size={18} className="text-purple-300" /> 新建管理员
                    </h2>
                    <button
                      type="button"
                      onClick={closeCreate}
                      disabled={busy}
                      className="text-gray-400 hover:text-white disabled:opacity-40"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-sm sm:col-span-1">
                        <span className="text-gray-400">用户名</span>
                        <input
                          required
                          autoFocus
                          value={createForm.username}
                          onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-gray-200 outline-none focus:border-purple-500/50"
                        />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-gray-400">初始密码（≥6位）</span>
                        <input
                          required
                          type="password"
                          value={createForm.password}
                          onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-gray-200 outline-none focus:border-purple-500/50"
                        />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-gray-400">显示名</span>
                        <input
                          value={createForm.name}
                          onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-gray-200 outline-none focus:border-purple-500/50"
                        />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-gray-400">安全邮箱（必填）</span>
                        <input
                          required
                          type="email"
                          value={createForm.email}
                          onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-gray-200 outline-none focus:border-purple-500/50"
                        />
                      </label>
                    </div>
                    <ThemeCheckbox
                      checked={createForm.is_super_admin}
                      onCheckedChange={(v) => setCreateForm((f) => ({ ...f, is_super_admin: v }))}
                      label={<span className="text-sm text-gray-300">同时设为超级管理员</span>}
                    />
                    <p className="text-xs text-gray-500">创建前请已在页面顶部填写操作密钥。</p>
                  </div>

                  <div className="px-5 py-4 border-t border-white/10 flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={closeCreate}
                      disabled={busy}
                      className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm disabled:opacity-40"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white text-sm disabled:opacity-40"
                    >
                      {busy ? '创建中…' : '创建'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {confirmKick && (
        <ConfirmDialog
          title="强制全部下线"
          message={`确定强制登出「${confirmKick.name || confirmKick.username}」的全部会话吗？需已填写操作密钥。`}
          confirmText={busy ? '处理中…' : '强制下线'}
          type="danger"
          onConfirm={() => void kickAdmin(confirmKick)}
          onCancel={() => !busy && setConfirmKick(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="删除管理员"
          message={`确定删除「${confirmDelete.username}」吗？其会话将全部失效，且未绑定邮箱的账号本来也无法登录。需已填写操作密钥。`}
          confirmText={busy ? '删除中…' : '删除'}
          type="danger"
          onConfirm={() => void deleteAdmin(confirmDelete)}
          onCancel={() => !busy && setConfirmDelete(null)}
        />
      )}

      {confirmBan && (
        <ConfirmDialog
          title="禁止登录"
          message={`确定禁止「${confirmBan.name || confirmBan.username}」登录吗？其当前所有会话将立刻失效并退回登录页，之后也无法再登录，直至恢复。需已填写操作密钥。`}
          confirmText={busy ? '处理中…' : '禁止登录'}
          type="danger"
          onConfirm={() => void toggleLoginDisabled(confirmBan)}
          onCancel={() => !busy && setConfirmBan(null)}
        />
      )}

      {emailEdit &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            onClick={() => !busy && setEmailEdit(null)}
          >
            <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
            <div
              className="relative z-10 w-full max-w-md rounded-xl border border-white/10 bg-gray-900 p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-white font-semibold">绑定 / 修改安全邮箱</h3>
              <p className="text-sm text-gray-400">仅超级管理员可操作。未绑定邮箱的管理员无法登录。</p>
              <input
                type="email"
                value={emailEdit.email}
                onChange={(e) => setEmailEdit({ ...emailEdit, email: e.target.value })}
                placeholder="name@example.com"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-300 border border-white/10"
                  onClick={() => setEmailEdit(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-sm bg-purple-600/60 text-white"
                  onClick={() => void saveEmail()}
                >
                  保存
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
