import { useEffect, useMemo, useState } from 'react'
import { assistantAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDate } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import MemberNameCell from '../../components/MemberNameCell'
import DateInput from '../../components/DateInput'
import StyledSelect from '../../components/StyledSelect'
import { Loader2, UserPlus, X, HelpingHand, GraduationCap, Search, Filter, ChevronUp, ChevronDown } from 'lucide-react'
import MemberAvatar from '../../components/MemberAvatar'
import {
  readLocalJson, readLocalString, cycleSort, cmpBasic, type SortConfig,
} from '../../utils/persistedState'

const STAGE_OPTIONS = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考']
const ADD_STAGE_OPTIONS = ['未新训', '新训初期', '新训一期']
const OWNERSHIP_OPTIONS = ['已归属', '待审批', '未归属']
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGE_OPTIONS.map((s, i) => [s, i + 1]))

type Filters = { stage_role: string[]; ownership: string[] }
const DEFAULT_FILTERS: Filters = { stage_role: [], ownership: [] }

type ArchivedMember = {
  id: number
  nickname: string
  qq: string
  game_id?: string | null
  join_date?: string | null
  stage_role?: string
  status?: string
  phase3_reached_at?: string | null
  avatar?: string | null
}

const emptyForm = () => ({
  nickname: '',
  qq: '',
  game_id: '',
  join_date: new Date().toISOString().split('T')[0],
  stage_role: '未新训',
})

function getOwnershipCategory(m: {
  owners?: unknown[]
  assignment_status?: string | null
  pending_owners?: unknown[]
}): string {
  if (m.owners?.length) return '已归属'
  if (m.assignment_status === '待审批' || m.pending_owners?.length) return '待审批'
  return '未归属'
}

function getOwnerSortName(m: {
  owners?: Array<{ nickname?: string }>
  assignment_status?: string | null
  pending_owners?: Array<{ nickname?: string }>
}): string {
  if (m.owners?.length) {
    return m.owners.map((o) => o.nickname || '').filter(Boolean).join('、') || '已归属'
  }
  if (m.assignment_status === '待审批' || m.pending_owners?.length) {
    const names = m.pending_owners?.map((o) => o.nickname || '').filter(Boolean).join('、')
    return names ? `待审批:${names}` : '待审批'
  }
  return '未归属'
}

function OwnershipCell({
  owners,
  assignmentStatus,
  pendingOwners,
}: {
  owners?: Array<{ id?: number; nickname?: string; avatar?: string | null; qq?: string | null }>
  assignmentStatus?: string | null
  pendingOwners?: Array<{ id?: number; nickname?: string; avatar?: string | null; qq?: string | null }>
}) {
  const list = owners?.length ? owners : null
  if (list) {
    const isOnlyMe = assignmentStatus === '已通过' && list.length === 1
    const title = isOnlyMe ? '已归属：我' : `已归属：${list.map((o) => o.nickname).filter(Boolean).join('、')}`
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5" title={title}>
        {list.map((o, i) => (
          <div key={o.id ?? `${o.nickname}-${i}`} className="flex items-center gap-1.5 min-w-0">
            <MemberAvatar avatar={o.avatar} qq={o.qq} name={o.nickname || '?'} size="sm" />
            <span className="text-teal-300/90 truncate max-w-[5.5rem]">
              {isOnlyMe ? '我' : o.nickname || '—'}
            </span>
          </div>
        ))}
      </div>
    )
  }
  if (assignmentStatus === '待审批') {
    return <span className="text-amber-300/90">待审批</span>
  }
  if (pendingOwners?.length) {
    return (
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
        title={`待审批：${pendingOwners.map((o) => o.nickname).filter(Boolean).join('、')}`}
      >
        <span className="text-amber-300/90 shrink-0">待审批</span>
        {pendingOwners.map((o, i) => (
          <div key={o.id ?? `${o.nickname}-${i}`} className="flex items-center gap-1.5 min-w-0">
            <MemberAvatar avatar={o.avatar} qq={o.qq} name={o.nickname || '?'} size="sm" />
            <span className="text-amber-300/90 truncate max-w-[5.5rem]">{o.nickname || '—'}</span>
          </div>
        ))}
      </div>
    )
  }
  return <span className="text-gray-500">—</span>
}

export default function AssistantRoster() {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(() => readLocalString('assistantRosterSearch'))
  const [filters, setFilters] = useState<Filters>(() =>
    readLocalJson('assistantRosterFilters', DEFAULT_FILTERS)
  )
  const [sortConfig, setSortConfig] = useState<SortConfig>(() =>
    readLocalJson('assistantRosterSort', null)
  )
  const [showFilters, setShowFilters] = useState(false)
  const [requestingId, setRequestingId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreDialog, setRestoreDialog] = useState<{
    show: boolean
    member: ArchivedMember | null
    join_date: string
    nickname: string
    stage_role: string
    game_id: string
  }>({
    show: false,
    member: null,
    join_date: new Date().toISOString().split('T')[0],
    nickname: '',
    stage_role: '未新训',
    game_id: '',
  })

  useEffect(() => { localStorage.setItem('assistantRosterSearch', searchQuery) }, [searchQuery])
  useEffect(() => {
    localStorage.setItem('assistantRosterFilters', JSON.stringify(filters))
  }, [filters])
  useEffect(() => {
    if (sortConfig) localStorage.setItem('assistantRosterSort', JSON.stringify(sortConfig))
    else localStorage.removeItem('assistantRosterSort')
  }, [sortConfig])

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await assistantAPI.roster()
      setList(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const request = async (id: number) => {
    setRequestingId(id)
    try {
      await assistantAPI.requestStudent(id)
      toast.success('已提交带人申请')
      // 乐观更新：立刻反映待审批，避免缓存/刷新延迟
      setList((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                assignment_status: '待审批',
                pending_owners: m.pending_owners?.length
                  ? m.pending_owners
                  : [{ nickname: '我' }],
              }
            : m
        )
      )
      await load(true)
    } catch (e: any) {
      toast.error(e.message || '失败')
    } finally {
      setRequestingId(null)
    }
  }

  const closeAdd = () => {
    setShowAdd(false)
    setForm(emptyForm())
  }

  const closeRestore = () => {
    setRestoreDialog({
      show: false,
      member: null,
      join_date: new Date().toISOString().split('T')[0],
      nickname: '',
      stage_role: '未新训',
      game_id: '',
    })
  }

  const openRestoreDialog = (archived: ArchivedMember, nicknameHint?: string) => {
    const stage = ADD_STAGE_OPTIONS.includes(archived.stage_role || '')
      ? (archived.stage_role as string)
      : '未新训'
    setRestoreDialog({
      show: true,
      member: archived,
      join_date: new Date().toISOString().split('T')[0],
      nickname: (nicknameHint && nicknameHint.trim()) || archived.nickname || '',
      stage_role: stage,
      game_id: archived.game_id || form.game_id || '',
    })
  }

  const checkQqForRestore = async (qq: string) => {
    const trimmed = qq.trim()
    if (!trimmed) return
    try {
      const res = await assistantAPI.lookupMemberByQq(trimmed)
      const data = res.data
      if (data?.exists && data.status === '已退队') {
        openRestoreDialog(data, form.nickname)
      }
    } catch {
      /* 失焦查询失败不打断填写 */
    }
  }

  const submitPropose = async (payload: {
    nickname: string
    qq: string
    game_id?: string
    join_date: string
    stage_role: string
  }) => {
    const res = await assistantAPI.proposeMember(payload)
    toast.success(res.message || '已提交，等待管理审批')
    closeRestore()
    closeAdd()
  }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nickname.trim() || !form.qq.trim()) {
      toast.error('昵称和QQ必填')
      return
    }
    setSubmitting(true)
    try {
      const lookup = await assistantAPI.lookupMemberByQq(form.qq.trim())
      if (lookup.data?.exists && lookup.data.status === '已退队') {
        openRestoreDialog(lookup.data, form.nickname)
        return
      }
      if (lookup.data?.exists) {
        toast.error('QQ号已存在')
        return
      }
      await submitPropose(form)
    } catch (err: any) {
      toast.error(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRestore = async () => {
    if (!restoreDialog.member) return
    if (!restoreDialog.join_date) {
      toast.error('请填写新入队日期')
      return
    }
    setRestoring(true)
    try {
      await submitPropose({
        nickname: restoreDialog.nickname.trim() || restoreDialog.member.nickname,
        qq: restoreDialog.member.qq,
        game_id: restoreDialog.game_id || undefined,
        join_date: restoreDialog.join_date,
        stage_role: restoreDialog.stage_role,
      })
    } catch (err: any) {
      toast.error(err.message || '提交恢复申请失败')
    } finally {
      setRestoring(false)
    }
  }

  const handleSort = (key: string) => setSortConfig((prev) => cycleSort(prev, key))

  const toggleStage = (role: string) => {
    setFilters((prev) => ({
      ...prev,
      stage_role: prev.stage_role.includes(role)
        ? prev.stage_role.filter((r) => r !== role)
        : [...prev.stage_role, role],
    }))
  }

  const toggleOwnership = (o: string) => {
    setFilters((prev) => ({
      ...prev,
      ownership: prev.ownership.includes(o)
        ? prev.ownership.filter((x) => x !== o)
        : [...prev.ownership, o],
    }))
  }

  const activeFilterCount = filters.stage_role.length + filters.ownership.length

  const filtered = useMemo(() => {
    let rows = [...list]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(
        (m) =>
          m.nickname?.toLowerCase().includes(q) ||
          m.qq?.includes(q) ||
          m.stage_role?.includes(q)
      )
    }
    if (filters.stage_role.length > 0) {
      rows = rows.filter((m) => filters.stage_role.includes(m.stage_role))
    }
    if (filters.ownership.length > 0) {
      rows = rows.filter((m) => filters.ownership.includes(getOwnershipCategory(m)))
    }
    if (sortConfig) {
      const { key, direction } = sortConfig
      rows.sort((a, b) => {
        let cmp = 0
        if (key === 'stage_role') {
          cmp = (STAGE_ORDER[a.stage_role] || 99) - (STAGE_ORDER[b.stage_role] || 99)
        } else if (key === 'ownership') {
          cmp = cmpBasic(getOwnerSortName(a), getOwnerSortName(b))
        } else {
          cmp = cmpBasic(a[key], b[key])
        }
        return direction === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [list, searchQuery, filters, sortConfig])

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button type="button" onClick={() => handleSort(field)} className="flex items-center gap-1 hover:text-white">
      <span>{label}</span>
      {sortConfig?.key === field &&
        (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
    </button>
  )

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="p-2 rounded-lg bg-teal-600/20">
              <GraduationCap size={18} className="text-teal-300" />
            </span>
            新训花名册
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            浏览新训阶段成员；添加新人或恢复已退队档案均需管理审批
            {!loading && (
              <span className="text-gray-600">
                {' '}· 共 {list.length} 人
                {filtered.length !== list.length && (
                  <span className="text-purple-400"> · 显示 {filtered.length}</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              className="student-glass-field student-glass-field--icon w-52 sm:w-64"
              placeholder="搜索昵称、QQ、阶段..."
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
            {activeFilterCount > 0 && (
              <span className="bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors"
          >
            <UserPlus size={16} />
            添加成员
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="student-glass-panel student-glass-panel--static p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-semibold text-sm">筛选条件</h3>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                清空筛选
              </button>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-2">阶段</div>
              <div className="flex flex-wrap gap-2">
                {STAGE_OPTIONS.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleStage(role)}
                    className={`student-glass-badge text-xs transition-opacity ${getRoleColor(role)} ${
                      filters.stage_role.includes(role)
                        ? 'opacity-100 ring-1 ring-white/35'
                        : 'opacity-55 hover:opacity-90'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2">归属</div>
              <div className="flex flex-wrap gap-2">
                {OWNERSHIP_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggleOwnership(o)}
                    className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                      filters.ownership.includes(o)
                        ? o === '已归属'
                          ? 'bg-teal-600/40 text-teal-100 ring-1 ring-teal-400/40'
                          : o === '待审批'
                            ? 'bg-amber-600/40 text-amber-100 ring-1 ring-amber-400/40'
                            : 'bg-gray-600/40 text-gray-200 ring-1 ring-gray-400/40'
                        : 'bg-gray-700/60 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="student-glass-panel student-glass-panel--static overflow-hidden rounded-xl">
        {loading ? (
          <div className="p-10 text-center text-gray-400">加载中...</div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th><SortBtn field="nickname" label="成员" /></th>
                  <th><SortBtn field="qq" label="QQ" /></th>
                  <th><SortBtn field="stage_role" label="阶段" /></th>
                  <th><SortBtn field="join_date" label="入队日" /></th>
                  <th><SortBtn field="ownership" label="归属" /></th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td><MemberNameCell name={m.nickname} avatar={m.avatar} qq={m.qq} /></td>
                    <td>{m.qq}</td>
                    <td>
                      <span className={`student-glass-badge ${getRoleColor(m.stage_role)}`}>
                        {m.stage_role}
                      </span>
                    </td>
                    <td>{m.join_date ? formatDate(m.join_date) : '-'}</td>
                    <td className="text-sm max-w-[12rem]">
                      <OwnershipCell
                        owners={m.owners}
                        assignmentStatus={m.assignment_status}
                        pendingOwners={m.pending_owners}
                      />
                    </td>
                    <td>
                      {m.assignment_status === '已通过' || m.assignment_status === '待审批' ? (
                        <span className="text-gray-500 text-sm">—</span>
                      ) : (
                        <button
                          type="button"
                          disabled={requestingId === m.id}
                          onClick={() => request(m.id)}
                          className="text-purple-300 hover:text-purple-200 text-sm inline-flex items-center gap-1.5"
                        >
                          {requestingId === m.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <HelpingHand size={14} />
                          )}
                          申请带人
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-8">暂无匹配成员</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={closeAdd} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">添加成员</h2>
              <button type="button" onClick={closeAdd} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
              <p className="text-blue-300 text-xs">
                💡 <strong>登录信息自动设置：</strong>用户名=昵称，密码=QQ号。成员可使用昵称和QQ号登录学员端。
              </p>
            </div>
            <form onSubmit={submitAdd} className="space-y-3">
              <div>
                <label className="text-sm text-gray-300 mb-1 block">昵称 *</label>
                <input
                  className="student-glass-field"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1 block">QQ *</label>
                <input
                  className="student-glass-field"
                  value={form.qq}
                  onChange={(e) => setForm({ ...form, qq: e.target.value })}
                  onBlur={() => checkQqForRestore(form.qq)}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1 block">游戏ID</label>
                <input
                  className="student-glass-field"
                  value={form.game_id}
                  onChange={(e) => setForm({ ...form, game_id: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1 block">入队日期</label>
                <DateInput value={form.join_date} onChange={(v) => setForm({ ...form, join_date: v })} />
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1 block">初始阶段</label>
                <StyledSelect
                  options={ADD_STAGE_OPTIONS}
                  value={form.stage_role}
                  onChange={(v) => setForm({ ...form, stage_role: v })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  提交审批
                </button>
                <button type="button" onClick={closeAdd} className="flex-1 bg-gray-600 text-white py-2 rounded-lg">
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {restoreDialog.show && restoreDialog.member && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={closeRestore} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">已从紫夜数据库调取</h2>
            <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-3 mb-4 space-y-1 text-sm text-amber-100">
              <p>我们发现了此成员似乎是我们以前的队员，这是他当时的信息，请过目。</p>
              <p className="text-amber-200/80 text-xs">确认后将提交恢复申请，由管理审批通过后调取原有档案。</p>
            </div>
            <div className="space-y-3 text-sm text-gray-300 mb-4">
              <p>
                原昵称：<span className="text-white">{restoreDialog.member.nickname}</span>
              </p>
              <p>
                QQ：<span className="text-white">{restoreDialog.member.qq}</span>
              </p>
              <p>
                原阶段：
                <span className={`ml-1 px-2 py-0.5 rounded ${getRoleColor(restoreDialog.member.stage_role || '')}`}>
                  {restoreDialog.member.stage_role || '-'}
                </span>
              </p>
              <p>
                原入队日：
                <span className="text-white">
                  {restoreDialog.member.join_date ? formatDate(restoreDialog.member.join_date) : '-'}
                </span>
              </p>
              <p>
                首次达三期：
                <span className="text-white">
                  {restoreDialog.member.phase3_reached_at
                    ? formatDate(restoreDialog.member.phase3_reached_at)
                    : '-'}
                </span>
                <span className="text-amber-300 ml-1">（恢复后清空）</span>
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">恢复后昵称</label>
                <input
                  type="text"
                  className="student-glass-field"
                  value={restoreDialog.nickname}
                  onChange={(e) => setRestoreDialog({ ...restoreDialog, nickname: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">阶段（一期及以下可申请）</label>
                <StyledSelect
                  options={ADD_STAGE_OPTIONS}
                  value={restoreDialog.stage_role}
                  onChange={(v) => setRestoreDialog({ ...restoreDialog, stage_role: v })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">新入队日期 *</label>
                <DateInput
                  value={restoreDialog.join_date}
                  onChange={(v) => setRestoreDialog({ ...restoreDialog, join_date: v })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={confirmRestore}
                  disabled={restoring || !restoreDialog.join_date}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  {restoring && <Loader2 size={16} className="animate-spin" />}
                  {restoring ? '提交中...' : '确认恢复并提交审批'}
                </button>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={closeRestore}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
