import { useEffect, useMemo, useState } from 'react'
import { Calendar, Inbox, Loader2, Plus, Ban, ChevronDown, Search, Filter, ChevronUp, X } from 'lucide-react'
import { assistantAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDate, formatDateTime, getTodayDateString } from '../../utils/dateFormat'
import DateInput from '../../components/DateInput'
import StyledSelect from '../../components/StyledSelect'
import MemberNameCell from '../../components/MemberNameCell'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageSkeleton from '../../components/Skeleton'
import {
  readLocalJson, readLocalString, cycleSort, cmpBasic, type SortConfig,
} from '../../utils/persistedState'

const STATUS_OPTIONS = ['待审批', '已通过', '已驳回', '请假中', '待结束审批', '已结束']
type Filters = { status: string[] }
const DEFAULT_FILTERS: Filters = { status: [] }

function statusBadgeClass(status: string) {
  if (status === '待审批') return 'bg-amber-500/25 text-amber-100'
  if (status === '已通过' || status === '已结束') return 'bg-emerald-500/25 text-emerald-100'
  if (status === '已驳回') return 'bg-rose-500/25 text-rose-100'
  if (status === '请假中') return 'bg-yellow-500/25 text-yellow-100'
  if (status === '待结束审批') return 'bg-orange-500/25 text-orange-100'
  return 'bg-white/10 text-gray-300'
}

function matchesSearch(r: any, q: string): boolean {
  const name = (r.student_name || r.member_name || '').toLowerCase()
  return (
    name.includes(q) ||
    r.reason?.toLowerCase().includes(q) ||
    r.status?.includes(q)
  )
}

function sortRows(rows: any[], sortConfig: SortConfig): any[] {
  if (!sortConfig) return rows
  const { key, direction } = sortConfig
  return [...rows].sort((a, b) => {
    let cmp = 0
    if (key === 'student_name') {
      cmp = cmpBasic(a.student_name || a.member_name, b.student_name || b.member_name)
    } else if (key === 'start_date') {
      cmp = cmpBasic(a.start_date, b.start_date)
    } else if (key === 'created_at') {
      cmp = cmpBasic(a.created_at, b.created_at)
    } else {
      cmp = cmpBasic(a[key], b[key])
    }
    return direction === 'asc' ? cmp : -cmp
  })
}

export default function AssistantLeaves() {
  const [students, setStudents] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [activeLeaves, setActiveLeaves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [endingId, setEndingId] = useState<number | null>(null)
  const [confirmEnd, setConfirmEnd] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState(() => readLocalString('assistantLeavesSearch'))
  const [filters, setFilters] = useState<Filters>(() =>
    readLocalJson('assistantLeavesFilters', DEFAULT_FILTERS)
  )
  const [sortConfig, setSortConfig] = useState<SortConfig>(() =>
    readLocalJson('assistantLeavesSort', null)
  )
  const [myRequestsOpen, setMyRequestsOpen] = useState(() =>
    readLocalJson('assistantLeavesMyOpen', false)
  )
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState({
    student_id: '',
    reason: '',
    start_date: getTodayDateString(),
    end_date: getTodayDateString(),
  })

  useEffect(() => { localStorage.setItem('assistantLeavesSearch', searchQuery) }, [searchQuery])
  useEffect(() => {
    localStorage.setItem('assistantLeavesFilters', JSON.stringify(filters))
  }, [filters])
  useEffect(() => {
    if (sortConfig) localStorage.setItem('assistantLeavesSort', JSON.stringify(sortConfig))
    else localStorage.removeItem('assistantLeavesSort')
  }, [sortConfig])
  useEffect(() => {
    localStorage.setItem('assistantLeavesMyOpen', JSON.stringify(myRequestsOpen))
  }, [myRequestsOpen])

  const load = async () => {
    setLoading(true)
    try {
      const [stu, req, active] = await Promise.all([
        assistantAPI.students(),
        assistantAPI.myRequests().catch(() => ({ data: { leaves: [] } })),
        assistantAPI.activeLeaves().catch(() => ({ data: [] })),
      ])
      setStudents(stu.data || [])
      setRecords(req.data?.leaves || [])
      setActiveLeaves(active.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const studentOptions = useMemo(
    () =>
      students.map((s) => ({
        value: String(s.id),
        label: s.nickname,
        description: `QQ ${s.qq}${s.is_daily ? ' · 当日' : ''}`,
      })),
    [students]
  )

  const handleSort = (key: string) => setSortConfig((prev) => cycleSort(prev, key))

  const toggleStatus = (s: string) => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status.includes(s)
        ? prev.status.filter((x) => x !== s)
        : [...prev.status, s],
    }))
  }

  const filteredActive = useMemo(() => {
    let rows = [...activeLeaves]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter((r) => matchesSearch(r, q))
    }
    if (filters.status.length > 0) {
      rows = rows.filter((r) => filters.status.includes(r.status))
    }
    return sortRows(rows, sortConfig)
  }, [activeLeaves, searchQuery, filters, sortConfig])

  const filteredRecords = useMemo(() => {
    let rows = [...records]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter((r) => matchesSearch(r, q))
    }
    if (filters.status.length > 0) {
      rows = rows.filter((r) => filters.status.includes(r.status))
    }
    return sortRows(rows, sortConfig)
  }, [records, searchQuery, filters, sortConfig])

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button type="button" onClick={() => handleSort(field)} className="flex items-center gap-1 hover:text-white">
      <span>{label}</span>
      {sortConfig?.key === field &&
        (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
    </button>
  )

  const openForm = () => {
    const today = getTodayDateString()
    setForm({
      student_id: students[0] ? String(students[0].id) : '',
      reason: '',
      start_date: today,
      end_date: today,
    })
    setShowForm(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = Number(form.student_id)
    if (!id) {
      toast.error('请选择学员')
      return
    }
    if (!form.start_date || !form.end_date) {
      toast.error('请填写请假起止日期')
      return
    }
    if (form.end_date < form.start_date) {
      toast.error('结束日期不能早于开始日期')
      return
    }
    setSubmitting(true)
    try {
      const res = await assistantAPI.proposeLeave(id, {
        reason: form.reason,
        start_date: form.start_date,
        end_date: form.end_date,
      })
      toast.success(res.message || '请假申请已提交')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast.error(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEndEarly = async () => {
    if (!confirmEnd) return
    setEndingId(confirmEnd.id)
    try {
      const res = await assistantAPI.endLeaveEarly(confirmEnd.id)
      toast.success(res.message || '已提前结束请假')
      setConfirmEnd(null)
      load()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setEndingId(null)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="p-2 rounded-lg bg-amber-600/20">
              <Calendar size={18} className="text-amber-300" />
            </span>
            请假管理
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            登记请假需管理审批；进行中的请假可由助教提前结束（直接生效并进入 7 天缓冲）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              className="student-glass-field student-glass-field--icon w-52 sm:w-64"
              placeholder="搜索学员、原因、状态..."
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
          <button
            type="button"
            onClick={openForm}
            disabled={students.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm bg-amber-600/85 hover:bg-amber-600 text-white disabled:opacity-40"
          >
            <Plus size={16} />
            新建申请
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="student-glass-panel student-glass-panel--static p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-semibold text-sm">筛选条件</h3>
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
          <div>
            <div className="text-xs text-gray-500 mb-2">状态</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
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
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : (
        <div className="space-y-5">
          <div className="student-glass-panel student-glass-panel--static overflow-hidden rounded-xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">进行中的请假</h2>
              <span className="text-xs text-gray-500">
                {filteredActive.length !== activeLeaves.length
                  ? `${filteredActive.length} / ${activeLeaves.length} 条`
                  : `${activeLeaves.length} 条`}
              </span>
            </div>
            {filteredActive.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2 text-gray-500">
                <Inbox size={24} />
                <p className="text-sm">
                  {activeLeaves.length === 0 ? '暂无进行中的请假' : '未找到匹配记录'}
                </p>
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortBtn field="student_name" label="学员" /></th>
                      <th><SortBtn field="start_date" label="起止" /></th>
                      <th>原因</th>
                      <th><SortBtn field="status" label="状态" /></th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActive.map((r) => (
                      <tr key={r.id}>
                        <td className="text-white font-medium">{r.student_name || r.member_name || '—'}</td>
                        <td className="text-gray-300 text-sm">
                          {formatDate(r.start_date)} ~ {formatDate(r.end_date)}
                        </td>
                        <td className="text-gray-400 text-sm max-w-[14rem] truncate" title={r.reason || ''}>
                          {r.reason || '—'}
                        </td>
                        <td>
                          <span className={`student-glass-badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            disabled={endingId === r.id}
                            onClick={() => setConfirmEnd(r)}
                            className="inline-flex items-center gap-1 text-sm text-rose-300 hover:text-rose-200 disabled:opacity-40"
                          >
                            {endingId === r.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Ban size={14} />
                            )}
                            提前结束
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="student-glass-panel student-glass-panel--static overflow-hidden rounded-xl">
            <button
              type="button"
              onClick={() => setMyRequestsOpen((v) => !v)}
              className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors ${
                myRequestsOpen ? 'border-b border-white/10' : ''
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <ChevronDown
                  size={16}
                  className={`text-gray-400 shrink-0 transition-transform ${myRequestsOpen ? '' : '-rotate-90'}`}
                />
                <h2 className="text-sm font-semibold text-white">我的请假申请</h2>
              </span>
              <span className="text-xs text-gray-500 shrink-0">
                {filteredRecords.length !== records.length
                  ? `${filteredRecords.length} / ${records.length} 条`
                  : `${records.length} 条`}
              </span>
            </button>
            {myRequestsOpen && (
              filteredRecords.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2 text-gray-500">
                  <Inbox size={24} />
                  <p className="text-sm">
                    {records.length === 0 ? '暂无请假申请记录' : '未找到匹配记录'}
                  </p>
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
                      {filteredRecords.map((r) => (
                        <tr key={r.id}>
                          <td className="text-white font-medium">{r.student_name || '—'}</td>
                          <td className="text-gray-300 text-sm">
                            {formatDate(r.start_date)} ~ {formatDate(r.end_date)}
                          </td>
                          <td className="text-gray-400 text-sm max-w-[14rem] truncate" title={r.reason || ''}>
                            {r.reason || '—'}
                          </td>
                          <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                          <td>
                            <span className={`student-glass-badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={() => setShowForm(false)} />
          <form
            onSubmit={submit}
            className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-md space-y-4"
          >
            <h2 className="text-lg font-bold text-white">登记请假（需审批）</h2>
            {students.length === 0 ? (
              <p className="text-sm text-gray-400">暂无可管理的学员</p>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">学员</label>
                  <StyledSelect
                    searchable
                    options={studentOptions}
                    value={form.student_id}
                    onChange={(v) => setForm({ ...form, student_id: v })}
                    placeholder="选择学员"
                  />
                </div>
                {form.student_id && (
                  <div className="text-xs text-gray-500">
                    {(() => {
                      const s = students.find((x) => String(x.id) === form.student_id)
                      return s ? (
                        <MemberNameCell name={s.nickname} avatar={s.avatar} qq={s.qq} />
                      ) : null
                    })()}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">开始</label>
                    <DateInput
                      value={form.start_date}
                      onChange={(v) => setForm({ ...form, start_date: v })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">结束</label>
                    <DateInput
                      value={form.end_date}
                      onChange={(v) => setForm({ ...form, end_date: v })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">原因（可选）</label>
                  <textarea
                    className="student-glass-field h-24"
                    placeholder="请假原因"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || students.length === 0}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                提交审批
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-600 text-white py-2 rounded-lg"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmEnd && (
        <ConfirmDialog
          title="提前结束请假"
          message={`确认提前结束「${confirmEnd.student_name || confirmEnd.member_name}」的请假？结束后学员状态恢复正常，并进入 7 天缓冲期。`}
          confirmText="提前结束"
          type="danger"
          onConfirm={handleEndEarly}
          onCancel={() => setConfirmEnd(null)}
        />
      )}
    </div>
  )
}
