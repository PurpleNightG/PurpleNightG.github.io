import { useEffect, useMemo, useState } from 'react'
import { assistantAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDate, formatDateTime } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import { listMemberEditDiffs, memberEditDiffCount } from '../../utils/memberEditDiff'
import {
  readLocalJson, readLocalString, cycleSort, cmpBasic, type SortConfig,
} from '../../utils/persistedState'
import {
  Users, UserRoundPlus, ArrowUpRight, ClipboardList, Inbox, Pencil, AlertCircle, Calendar,
  Eye, X, Search, Filter, ChevronUp, ChevronDown,
} from 'lucide-react'

type TabKey = 'assignments' | 'creates' | 'promotions' | 'edits' | 'blackPoints' | 'leaves'
type Filters = { status: string[] }
const DEFAULT_FILTERS: Filters = { status: [] }
const TAB_ORDER: TabKey[] = ['assignments', 'creates', 'promotions', 'edits', 'blackPoints', 'leaves']

function statusBadgeClass(status: string) {
  if (status === '待审批') return 'bg-amber-500/25 text-amber-100'
  if (status === '已通过' || status === '已批准') return 'bg-emerald-500/25 text-emerald-100'
  if (status === '已拒绝' || status === '已驳回' || status === '已解除') return 'bg-rose-500/25 text-rose-100'
  return 'bg-white/10 text-gray-300'
}

function matchesTabSearch(tab: TabKey, r: any, q: string): boolean {
  const fields: string[] = []
  switch (tab) {
    case 'assignments':
      fields.push(r.student_name, r.student_qq, r.status)
      break
    case 'creates':
      fields.push(r.nickname, r.qq, r.stage_role, r.status, r.restore_member_id ? '恢复' : '新建')
      break
    case 'promotions':
      fields.push(r.student_name, r.from_stage, r.to_stage, r.reason, r.status)
      break
    case 'edits':
      fields.push(r.student_name, r.status)
      break
    case 'blackPoints':
      fields.push(r.student_name, r.reason, r.status)
      break
    case 'leaves':
      fields.push(r.student_name, r.reason, r.status)
      break
  }
  return fields.some((f) => f && String(f).toLowerCase().includes(q))
}

function sortTabRows(_tab: TabKey, rows: any[], sortConfig: SortConfig): any[] {
  if (!sortConfig) return rows
  const { key, direction } = sortConfig
  return [...rows].sort((a, b) => {
    let cmp = 0
    if (key === 'start_date') {
      cmp = cmpBasic(a.start_date, b.start_date)
    } else if (key === 'register_date') {
      cmp = cmpBasic(a.register_date, b.register_date)
    } else if (key === 'created_at') {
      cmp = cmpBasic(a.created_at, b.created_at)
    } else {
      cmp = cmpBasic(a[key], b[key])
    }
    return direction === 'asc' ? cmp : -cmp
  })
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center gap-3">
      <div className="p-3 rounded-full bg-white/5 border border-white/10">
        <Inbox size={28} className="text-gray-500" />
      </div>
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  )
}

export default function AssistantRequests() {
  const [data, setData] = useState<{
    assignments: any[]
    creates: any[]
    promotions: any[]
    edits: any[]
    blackPoints: any[]
    leaves: any[]
  }>({
    assignments: [],
    creates: [],
    promotions: [],
    edits: [],
    blackPoints: [],
    leaves: [],
  })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = readLocalString('assistantRequestsTab', '')
    return TAB_ORDER.includes(saved as TabKey) ? (saved as TabKey) : 'assignments'
  })
  const [searchQuery, setSearchQuery] = useState(() => readLocalString('assistantRequestsSearch'))
  const [filters, setFilters] = useState<Filters>(() =>
    readLocalJson('assistantRequestsFilters', DEFAULT_FILTERS)
  )
  const [sortConfig, setSortConfig] = useState<SortConfig>(() =>
    readLocalJson('assistantRequestsSort', null)
  )
  const [showFilters, setShowFilters] = useState(false)
  const [editDetail, setEditDetail] = useState<any | null>(null)

  useEffect(() => { localStorage.setItem('assistantRequestsSearch', searchQuery) }, [searchQuery])
  useEffect(() => {
    localStorage.setItem('assistantRequestsFilters', JSON.stringify(filters))
  }, [filters])
  useEffect(() => {
    if (sortConfig) localStorage.setItem('assistantRequestsSort', JSON.stringify(sortConfig))
    else localStorage.removeItem('assistantRequestsSort')
  }, [sortConfig])
  useEffect(() => { localStorage.setItem('assistantRequestsTab', tab) }, [tab])

  const editDetailDiffs = useMemo(() => {
    if (!editDetail) return []
    const current =
      editDetail.status === '已通过' ? null : editDetail.student_current || null
    return listMemberEditDiffs(editDetail.changes_json, current)
  }, [editDetail])

  const load = () =>
    assistantAPI
      .myRequests()
      .then((res) => {
        const next = res.data || {
          assignments: [],
          creates: [],
          promotions: [],
          edits: [],
          blackPoints: [],
          leaves: [],
        }
        setData(next)
        return next
      })

  useEffect(() => {
    load()
      .then((next) => {
        const saved = readLocalString('assistantRequestsTab', '') as TabKey | ''
        if (saved && TAB_ORDER.includes(saved)) {
          // 记忆优先：即使当前标签为空也保留，避免刷新被待审批逻辑抢走
          setTab(saved)
          return
        }
        const pendingFirst = TAB_ORDER.find((k) =>
          (next[k] || []).some((r: any) => r.status === '待审批')
        )
        const anyFirst = TAB_ORDER.find((k) => (next[k] || []).length > 0)
        if (pendingFirst) setTab(pendingFirst)
        else if (anyFirst) setTab(anyFirst)
      })
      .catch((e) => toast.error(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const pendingTotal = useMemo(() => {
    const pend = (arr: any[] = []) => arr.filter((r) => r.status === '待审批').length
    return (
      pend(data.assignments) +
      pend(data.creates) +
      pend(data.promotions) +
      pend(data.edits) +
      pend(data.blackPoints) +
      pend(data.leaves)
    )
  }, [data])

  const handleSort = (key: string) => setSortConfig((prev) => cycleSort(prev, key))

  const toggleStatus = (s: string) => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status.includes(s)
        ? prev.status.filter((x) => x !== s)
        : [...prev.status, s],
    }))
  }

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    ;(data[tab] || []).forEach((r) => r.status && set.add(r.status))
    return Array.from(set)
  }, [data, tab])

  const filteredItems = useMemo(() => {
    let rows = [...(data[tab] || [])]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter((r) => matchesTabSearch(tab, r, q))
    }
    if (filters.status.length > 0) {
      rows = rows.filter((r) => filters.status.includes(r.status))
    }
    return sortTabRows(tab, rows, sortConfig)
  }, [data, tab, searchQuery, filters, sortConfig])

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button type="button" onClick={() => handleSort(field)} className="flex items-center gap-1 hover:text-white">
      <span>{label}</span>
      {sortConfig?.key === field &&
        (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
    </button>
  )

  const tabs = [
    {
      key: 'assignments' as const,
      label: '带人申请',
      icon: Users,
      items: data.assignments,
      pending: data.assignments.filter((r) => r.status === '待审批').length,
    },
    {
      key: 'creates' as const,
      label: '添加成员',
      icon: UserRoundPlus,
      items: data.creates,
      pending: data.creates.filter((r) => r.status === '待审批').length,
    },
    {
      key: 'promotions' as const,
      label: '升阶申请',
      icon: ArrowUpRight,
      items: data.promotions,
      pending: data.promotions.filter((r) => r.status === '待审批').length,
    },
    {
      key: 'edits' as const,
      label: '信息修改',
      icon: Pencil,
      items: data.edits || [],
      pending: (data.edits || []).filter((r) => r.status === '待审批').length,
    },
    {
      key: 'blackPoints' as const,
      label: '黑点登记',
      icon: AlertCircle,
      items: data.blackPoints || [],
      pending: (data.blackPoints || []).filter((r) => r.status === '待审批').length,
    },
    {
      key: 'leaves' as const,
      label: '请假登记',
      icon: Calendar,
      items: data.leaves || [],
      pending: (data.leaves || []).filter((r) => r.status === '待审批').length,
    },
  ]

  const active = tabs.find((t) => t.key === tab)!
  const totalInTab = active.items.length

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="p-2 rounded-lg bg-amber-600/20">
              <ClipboardList size={18} className="text-amber-300" />
            </span>
            我的申请
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            查看带人、加人、升阶、改信息、黑点、请假的审批进度（已处理记录由管理端维护）
            {pendingTotal > 0 && (
              <span className="ml-2 text-amber-300/90">· 待审批 {pendingTotal} 条</span>
            )}
            {!loading && totalInTab > 0 && (
              <span className="text-gray-600">
                {' '}· 当前 {totalInTab} 条
                {filteredItems.length !== totalInTab && (
                  <span className="text-purple-400"> · 显示 {filteredItems.length}</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              className="student-glass-field student-glass-field--icon w-52 sm:w-64"
              placeholder="搜索当前标签页..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white z-10"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            <Filter size={16} />
            筛选
            {filters.status.length > 0 && (
              <span className="bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {filters.status.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="student-glass-panel student-glass-panel--static p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-semibold text-sm">筛选条件（当前标签页状态）</h3>
            {filters.status.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                清空筛选
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.length === 0 ? (
              <span className="text-gray-500 text-sm">暂无可筛状态</span>
            ) : (
              statusOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`student-glass-badge text-xs transition-opacity ${statusBadgeClass(s)} ${
                    filters.status.includes(s)
                      ? 'opacity-100 ring-1 ring-white/35'
                      : 'opacity-55 hover:opacity-90'
                  }`}
                >
                  {s}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="student-glass-panel student-glass-panel--static rounded-xl py-16 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-700 border-t-amber-500 mb-4" />
          <p className="text-gray-400 text-sm">加载中...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map(({ key, label, icon: Icon, items, pending }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm transition-colors border ${
                  tab === key
                    ? 'bg-purple-600/90 border-purple-400/40 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/[0.08]'
                }`}
              >
                <Icon size={15} />
                {label}
                <span
                  className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center ${
                    pending > 0
                      ? tab === key
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-500/90 text-white'
                      : 'bg-white/10 text-gray-500'
                  }`}
                >
                  {items.length}
                </span>
              </button>
            ))}
          </div>

          <div className="student-glass-panel student-glass-panel--static overflow-hidden rounded-xl">
            {filteredItems.length === 0 ? (
              <EmptyState text={totalInTab === 0 ? `暂无${active.label}记录` : '未找到匹配记录'} />
            ) : tab === 'assignments' ? (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortBtn field="student_name" label="学员" /></th>
                      <th><SortBtn field="student_qq" label="QQ" /></th>
                      <th><SortBtn field="created_at" label="申请时间" /></th>
                      <th><SortBtn field="status" label="状态" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((a) => (
                      <tr key={a.id}>
                        <td className="text-white font-medium">{a.student_name || '—'}</td>
                        <td className="text-gray-400">{a.student_qq || '—'}</td>
                        <td className="text-gray-400 text-sm">{formatDateTime(a.created_at)}</td>
                        <td>
                          <span className={`student-glass-badge ${statusBadgeClass(a.status)}`}>
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === 'creates' ? (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortBtn field="nickname" label="成员" /></th>
                      <th><SortBtn field="qq" label="QQ" /></th>
                      <th>类型</th>
                      <th><SortBtn field="stage_role" label="初始阶段" /></th>
                      <th><SortBtn field="created_at" label="申请时间" /></th>
                      <th><SortBtn field="status" label="状态" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((c) => (
                      <tr key={c.id}>
                        <td className="text-white font-medium">{c.nickname || '—'}</td>
                        <td className="text-gray-400">{c.qq || '—'}</td>
                        <td>
                          <span
                            className={`student-glass-badge ${
                              c.restore_member_id
                                ? 'bg-sky-500/25 text-sky-100'
                                : 'bg-violet-500/25 text-violet-100'
                            }`}
                          >
                            {c.restore_member_id ? '恢复' : '新建'}
                          </span>
                        </td>
                        <td>
                          {c.stage_role ? (
                            <span className={`student-glass-badge ${getRoleColor(c.stage_role)}`}>
                              {c.stage_role}
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="text-gray-400 text-sm">{formatDateTime(c.created_at)}</td>
                        <td>
                          <span className={`student-glass-badge ${statusBadgeClass(c.status)}`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === 'promotions' ? (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortBtn field="student_name" label="学员" /></th>
                      <th><SortBtn field="from_stage" label="原阶段" /></th>
                      <th><SortBtn field="to_stage" label="目标阶段" /></th>
                      <th>说明</th>
                      <th><SortBtn field="created_at" label="申请时间" /></th>
                      <th><SortBtn field="status" label="状态" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((p) => (
                      <tr key={p.id}>
                        <td className="text-white font-medium">{p.student_name || '—'}</td>
                        <td>
                          {p.from_stage ? (
                            <span className={`student-glass-badge ${getRoleColor(p.from_stage)}`}>
                              {p.from_stage}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {p.to_stage ? (
                            <span className={`student-glass-badge ${getRoleColor(p.to_stage)}`}>
                              {p.to_stage}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="text-gray-400 text-sm max-w-[12rem] truncate" title={p.reason || ''}>
                          {p.reason || '—'}
                        </td>
                        <td className="text-gray-400 text-sm">{formatDateTime(p.created_at)}</td>
                        <td>
                          <span className={`student-glass-badge ${statusBadgeClass(p.status)}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === 'edits' ? (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortBtn field="student_name" label="学员" /></th>
                      <th>变更概要</th>
                      <th><SortBtn field="created_at" label="申请时间" /></th>
                      <th><SortBtn field="status" label="状态" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((e) => {
                      const n = memberEditDiffCount(e.changes_json)
                      return (
                        <tr key={e.id}>
                          <td className="text-white font-medium">{e.student_name || '—'}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => setEditDetail(e)}
                              className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 transition-colors"
                            >
                              <Eye size={14} />
                              查看详情
                              <span className="text-gray-500">· {n > 0 ? `${n} 项` : '—'}</span>
                            </button>
                          </td>
                          <td className="text-gray-400 text-sm">{formatDateTime(e.created_at)}</td>
                          <td>
                            <span className={`student-glass-badge ${statusBadgeClass(e.status)}`}>
                              {e.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : tab === 'blackPoints' ? (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortBtn field="student_name" label="学员" /></th>
                      <th>原因</th>
                      <th><SortBtn field="register_date" label="登记日" /></th>
                      <th><SortBtn field="created_at" label="申请时间" /></th>
                      <th><SortBtn field="status" label="状态" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((b) => (
                      <tr key={b.id}>
                        <td className="text-white font-medium">{b.student_name || '—'}</td>
                        <td className="text-gray-400 text-sm max-w-[14rem] truncate" title={b.reason || ''}>
                          {b.reason || '—'}
                        </td>
                        <td className="text-gray-400 text-sm">{formatDate(b.register_date)}</td>
                        <td className="text-gray-400 text-sm">{formatDateTime(b.created_at)}</td>
                        <td>
                          <span className={`student-glass-badge ${statusBadgeClass(b.status)}`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortBtn field="student_name" label="学员" /></th>
                      <th><SortBtn field="start_date" label="起止" /></th>
                      <th>原因</th>
                      <th><SortBtn field="created_at" label="申请时间" /></th>
                      <th><SortBtn field="status" label="状态" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((l) => (
                      <tr key={l.id}>
                        <td className="text-white font-medium">{l.student_name || '—'}</td>
                        <td className="text-gray-400 text-sm">
                          {formatDate(l.start_date)} ~ {formatDate(l.end_date)}
                        </td>
                        <td className="text-gray-400 text-sm max-w-[12rem] truncate" title={l.reason || ''}>
                          {l.reason || '—'}
                        </td>
                        <td className="text-gray-400 text-sm">{formatDateTime(l.created_at)}</td>
                        <td>
                          <span className={`student-glass-badge ${statusBadgeClass(l.status)}`}>
                            {l.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {editDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={() => setEditDetail(null)} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 border-b border-white/10 px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">信息修改详情</h2>
                <p className="text-sm text-gray-400 mt-1">
                  学员 <span className="text-gray-200">{editDetail.student_name || '—'}</span>
                  {editDetail.student_qq ? (
                    <span className="text-gray-500">（QQ {editDetail.student_qq}）</span>
                  ) : null}
                  <span className="mx-1.5 text-gray-600">·</span>
                  <span className={`student-glass-badge ${statusBadgeClass(editDetail.status)}`}>
                    {editDetail.status}
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  申请时间 {formatDateTime(editDetail.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditDetail(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sidebar-scrollbar">
              {editDetailDiffs.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">没有可展示的变更</div>
              ) : (
                <>
                  {editDetailDiffs.some((d) => d.fromInferred) && (
                    <p className="text-xs text-amber-200/80 mb-3 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
                      部分原值为打开详情时从当前档案补全（旧申请未记录申请时原值）；若档案已变动，请以实际为准。
                    </p>
                  )}
                  <div className="overflow-hidden rounded-lg border border-white/10">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-[18%]" />
                        <col className="w-[32%]" />
                        <col className="w-10" />
                        <col />
                      </colgroup>
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">字段</th>
                          <th className="px-4 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">原值</th>
                          <th className="px-2 py-2.5 text-center text-gray-500 font-medium">→</th>
                          <th className="px-4 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">拟改为</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {editDetailDiffs.map((d) => (
                          <tr key={d.key} className="hover:bg-white/[0.03]">
                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap align-top">{d.label}</td>
                            <td className="px-4 py-3 align-top break-words">
                              <span className="text-rose-300/95 line-through decoration-rose-400/40">
                                {d.from || '（未记录）'}
                              </span>
                              {d.fromInferred && (
                                <span className="ml-1.5 text-[10px] text-amber-200/70 whitespace-nowrap">当前档案</span>
                              )}
                            </td>
                            <td className="px-2 py-3 text-center text-gray-600 align-top">→</td>
                            <td className="px-4 py-3 align-top break-words">
                              <span className="text-emerald-300 font-medium">{d.to}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 px-5 py-4 flex justify-end">
              <button
                type="button"
                onClick={() => setEditDetail(null)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-200 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
