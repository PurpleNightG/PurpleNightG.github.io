import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Inbox, Loader2, Plus, Search, Filter, ChevronUp, ChevronDown, X } from 'lucide-react'
import { assistantAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDate, formatDateTime, getTodayDateString } from '../../utils/dateFormat'
import DateInput from '../../components/DateInput'
import StyledSelect from '../../components/StyledSelect'
import MemberNameCell from '../../components/MemberNameCell'
import {
  readLocalJson, readLocalString, cycleSort, cmpBasic, type SortConfig,
} from '../../utils/persistedState'

const STATUS_OPTIONS = ['待审批', '已通过', '已驳回']
type Filters = { status: string[] }
const DEFAULT_FILTERS: Filters = { status: [] }

function statusBadgeClass(status: string) {
  if (status === '待审批') return 'bg-amber-500/25 text-amber-100'
  if (status === '已通过') return 'bg-emerald-500/25 text-emerald-100'
  if (status === '已驳回') return 'bg-rose-500/25 text-rose-100'
  return 'bg-white/10 text-gray-300'
}

export default function AssistantBlackPoints() {
  const [students, setStudents] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState(() => readLocalString('assistantBlackPointSearch'))
  const [filters, setFilters] = useState<Filters>(() =>
    readLocalJson('assistantBlackPointFilters', DEFAULT_FILTERS)
  )
  const [sortConfig, setSortConfig] = useState<SortConfig>(() =>
    readLocalJson('assistantBlackPointSort', null)
  )
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState({
    student_id: '',
    reason: '',
    register_date: getTodayDateString(),
  })

  useEffect(() => { localStorage.setItem('assistantBlackPointSearch', searchQuery) }, [searchQuery])
  useEffect(() => {
    localStorage.setItem('assistantBlackPointFilters', JSON.stringify(filters))
  }, [filters])
  useEffect(() => {
    if (sortConfig) localStorage.setItem('assistantBlackPointSort', JSON.stringify(sortConfig))
    else localStorage.removeItem('assistantBlackPointSort')
  }, [sortConfig])

  const load = async () => {
    setLoading(true)
    try {
      const [stu, req] = await Promise.all([
        assistantAPI.students(),
        assistantAPI.myRequests().catch(() => ({ data: { blackPoints: [] } })),
      ])
      setStudents(stu.data || [])
      setRecords(req.data?.blackPoints || [])
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

  const filtered = useMemo(() => {
    let rows = [...records]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.student_name?.toLowerCase().includes(q) ||
          r.reason?.toLowerCase().includes(q) ||
          r.status?.includes(q)
      )
    }
    if (filters.status.length > 0) {
      rows = rows.filter((r) => filters.status.includes(r.status))
    }
    if (sortConfig) {
      const { key, direction } = sortConfig
      rows.sort((a, b) => {
        let cmp = 0
        if (key === 'register_date') {
          cmp = cmpBasic(a.register_date, b.register_date)
        } else if (key === 'created_at') {
          cmp = cmpBasic(a.created_at, b.created_at)
        } else {
          cmp = cmpBasic(a[key], b[key])
        }
        return direction === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [records, searchQuery, filters, sortConfig])

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button type="button" onClick={() => handleSort(field)} className="flex items-center gap-1 hover:text-white">
      <span>{label}</span>
      {sortConfig?.key === field &&
        (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
    </button>
  )

  const openForm = () => {
    setForm({
      student_id: students[0] ? String(students[0].id) : '',
      reason: '',
      register_date: getTodayDateString(),
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
    if (!form.reason.trim()) {
      toast.error('请填写黑点原因')
      return
    }
    setSubmitting(true)
    try {
      const res = await assistantAPI.proposeBlackPoint(id, {
        reason: form.reason.trim(),
        register_date: form.register_date,
      })
      toast.success(res.message || '黑点申请已提交')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast.error(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="p-2 rounded-lg bg-red-600/20">
              <AlertCircle size={18} className="text-red-300" />
            </span>
            登记黑点
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            为自己的学员（含当日临时）登记黑点，提交后需管理审批
            {!loading && (
              <span className="text-gray-600">
                {' '}· 共 {records.length} 条
                {filtered.length !== records.length && (
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm bg-red-600/85 hover:bg-red-600 text-white disabled:opacity-40"
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
        <div className="student-glass-panel student-glass-panel--static rounded-xl py-16 text-center text-gray-400">
          加载中...
        </div>
      ) : (
        <div className="student-glass-panel student-glass-panel--static overflow-hidden rounded-xl">
          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-500">
              <Inbox size={28} />
              <p className="text-sm">
                {records.length === 0 ? '暂无黑点申请记录' : '未找到匹配记录'}
              </p>
            </div>
          ) : (
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
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="text-white font-medium">{r.student_name || '—'}</td>
                      <td className="text-gray-300 text-sm max-w-[16rem] truncate" title={r.reason || ''}>
                        {r.reason || '—'}
                      </td>
                      <td className="text-gray-400 text-sm">{formatDate(r.register_date)}</td>
                      <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                      <td>
                        <span className={`student-glass-badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={() => setShowForm(false)} />
          <form
            onSubmit={submit}
            className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-md space-y-4"
          >
            <h2 className="text-lg font-bold text-white">登记黑点（需审批）</h2>
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
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">登记日期</label>
                  <DateInput
                    value={form.register_date}
                    onChange={(v) => setForm({ ...form, register_date: v })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">原因 *</label>
                  <textarea
                    className="student-glass-field h-28"
                    placeholder="黑点原因"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    required
                  />
                </div>
              </>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || students.length === 0}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
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
    </div>
  )
}
