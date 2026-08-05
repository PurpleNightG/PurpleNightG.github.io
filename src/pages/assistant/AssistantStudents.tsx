import { useEffect, useMemo, useState } from 'react'
import { assistantAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDate } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import MemberNameCell from '../../components/MemberNameCell'
import StyledSelect from '../../components/StyledSelect'
import AssistantStudentDetail from './AssistantStudentDetail'
import {
  Loader2, ArrowRightLeft, UserMinus, X, Eye, CalendarCheck, Users, Search, Filter, ChevronUp, ChevronDown,
} from 'lucide-react'
import {
  readLocalJson, readLocalString, cycleSort, cmpBasic, type SortConfig,
} from '../../utils/persistedState'

const STAGE_OPTIONS = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考']
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGE_OPTIONS.map((s, i) => [s, i + 1]))

type Filters = {
  stage_role: string[]
  assignment_type: string[] // '长期' | '当日'
  inverseMode: boolean
}

const DEFAULT_FILTERS: Filters = { stage_role: [], assignment_type: [], inverseMode: false }

export default function AssistantStudents() {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [stage, setStage] = useState('未新训')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [quitTarget, setQuitTarget] = useState<any | null>(null)
  const [quitRemarks, setQuitRemarks] = useState('')
  const [quitSaving, setQuitSaving] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [trainingBusyId, setTrainingBusyId] = useState<number | null>(null)

  const [searchQuery, setSearchQuery] = useState(() => readLocalString('assistantStudentsSearch'))
  const [filters, setFilters] = useState<Filters>(() =>
    readLocalJson('assistantStudentsFilters', DEFAULT_FILTERS)
  )
  const [sortConfig, setSortConfig] = useState<SortConfig>(() =>
    readLocalJson('assistantStudentsSort', null)
  )
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    localStorage.setItem('assistantStudentsSearch', searchQuery)
  }, [searchQuery])
  useEffect(() => {
    localStorage.setItem('assistantStudentsFilters', JSON.stringify(filters))
  }, [filters])
  useEffect(() => {
    if (sortConfig) localStorage.setItem('assistantStudentsSort', JSON.stringify(sortConfig))
    else localStorage.removeItem('assistantStudentsSort')
  }, [sortConfig])

  const load = async () => {
    setLoading(true)
    try {
      const res = await assistantAPI.students()
      setList(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSort = (key: string) => setSortConfig((prev) => cycleSort(prev, key))

  const toggleStage = (role: string) => {
    setFilters((prev) => {
      const has = prev.stage_role.includes(role)
      return {
        ...prev,
        stage_role: has ? prev.stage_role.filter((r) => r !== role) : [...prev.stage_role, role],
      }
    })
  }

  const toggleType = (t: string) => {
    setFilters((prev) => {
      const has = prev.assignment_type.includes(t)
      return {
        ...prev,
        assignment_type: has
          ? prev.assignment_type.filter((x) => x !== t)
          : [...prev.assignment_type, t],
      }
    })
  }

  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  const activeFilterCount =
    filters.stage_role.length + filters.assignment_type.length + (filters.inverseMode ? 1 : 0)

  const filtered = useMemo(() => {
    let rows = [...list]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(
        (m) =>
          m.nickname?.toLowerCase().includes(q) ||
          m.qq?.includes(q) ||
          m.stage_role?.toLowerCase().includes(q)
      )
    }
    if (filters.stage_role.length > 0) {
      rows = rows.filter((m) =>
        filters.inverseMode
          ? !filters.stage_role.includes(m.stage_role)
          : filters.stage_role.includes(m.stage_role)
      )
    }
    if (filters.assignment_type.length > 0) {
      rows = rows.filter((m) => {
        const t = m.is_daily ? '当日' : '长期'
        return filters.assignment_type.includes(t)
      })
    }
    if (sortConfig) {
      const { key, direction } = sortConfig
      rows.sort((a, b) => {
        let cmp = 0
        if (key === 'stage_role') {
          cmp = (STAGE_ORDER[a.stage_role] || 99) - (STAGE_ORDER[b.stage_role] || 99)
        } else if (key === 'nickname') {
          cmp = cmpBasic(a.nickname, b.nickname)
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

  const setTodayTraining = async (m: any) => {
    setTrainingBusyId(m.id)
    try {
      const res = await assistantAPI.setLastTrainingDate(m.id)
      toast.success(res.message || '已更新最后新训日期')
      load()
    } catch (e: any) {
      toast.error(e.message || '更新失败')
    } finally {
      setTrainingBusyId(null)
    }
  }

  const submitStage = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      const res = await assistantAPI.setStudentStage(editingId, { stage_role: stage, reason })
      toast.success(res.message || '已提交')
      setEditingId(null)
      setReason('')
      load()
    } catch (e: any) {
      toast.error(e.message || '失败')
    } finally {
      setSaving(false)
    }
  }

  const submitQuit = async () => {
    if (!quitTarget) return
    if (!quitRemarks.trim()) {
      toast.error('请填写退队原因')
      return
    }
    setQuitSaving(true)
    try {
      await assistantAPI.proposeQuit(quitTarget.id, quitRemarks.trim())
      toast.success('退队申请已提交，等待管理审批')
      setQuitTarget(null)
      setQuitRemarks('')
    } catch (e: any) {
      toast.error(e.message || '提交失败')
    } finally {
      setQuitSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="p-2 rounded-lg bg-purple-600/20">
              <Users size={18} className="text-purple-300" />
            </span>
            我的学员
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            含长期归属与当日临时学员（临时过零点失效）；可改新训日、详情、阶段与退队
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white z-10"
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
        </div>
      </div>

      {showFilters && (
        <div className="student-glass-chip p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-white font-semibold text-sm">筛选条件</h3>
              <button
                type="button"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, inverseMode: !prev.inverseMode }))
                }
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  filters.inverseMode
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {filters.inverseMode ? '反选模式（排除所选阶段）' : '正选模式（仅显示所选阶段）'}
              </button>
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-purple-400 hover:text-purple-300"
            >
              清空筛选
            </button>
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
              <div className="text-xs text-gray-500 mb-2">归属类型</div>
              <div className="flex flex-wrap gap-2">
                {['长期', '当日'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                      filters.assignment_type.includes(t)
                        ? 'bg-purple-600/40 text-purple-100 ring-1 ring-purple-400/40'
                        : 'bg-gray-700/60 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {t}
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
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-gray-400">暂无已通过归属的学员</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">未找到匹配学员</div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th><SortBtn field="nickname" label="成员" /></th>
                  <th><SortBtn field="qq" label="QQ" /></th>
                  <th><SortBtn field="stage_role" label="阶段" /></th>
                  <th><SortBtn field="last_training_date" label="最后新训" /></th>
                  <th><SortBtn field="join_date" label="入队日" /></th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={`${m.is_daily ? 'd' : 'p'}-${m.id}`}>
                    <td>
                      <div className="flex items-center gap-2">
                        <MemberNameCell name={m.nickname} avatar={m.avatar} qq={m.qq} />
                        {!!m.is_daily && (
                          <span className="student-glass-badge bg-amber-500/25 text-amber-100 text-[10px]">当日</span>
                        )}
                      </div>
                    </td>
                    <td>{m.qq}</td>
                    <td>
                      <span className={`student-glass-badge ${getRoleColor(m.stage_role)}`}>
                        {m.stage_role}
                      </span>
                    </td>
                    <td className="text-gray-300 text-sm">
                      {m.last_training_date ? formatDate(m.last_training_date) : '-'}
                    </td>
                    <td>{m.join_date ? formatDate(m.join_date) : '-'}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className="text-sky-300 hover:text-sky-200 text-sm inline-flex items-center gap-1.5"
                          onClick={() => setDetailId(m.id)}
                        >
                          <Eye size={14} />
                          详情
                        </button>
                        <button
                          type="button"
                          disabled={trainingBusyId === m.id}
                          className="text-emerald-300 hover:text-emerald-200 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                          onClick={() => setTodayTraining(m)}
                          title="设为今日新训"
                        >
                          {trainingBusyId === m.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CalendarCheck size={14} />
                          )}
                          今日新训
                        </button>
                        <button
                          type="button"
                          className="text-purple-300 hover:text-purple-200 text-sm inline-flex items-center gap-1.5"
                          onClick={() => {
                            setEditingId(m.id)
                            setStage(m.stage_role)
                          }}
                        >
                          <ArrowRightLeft size={14} />
                          改阶段
                        </button>
                        <button
                          type="button"
                          className="text-red-300 hover:text-red-200 text-sm inline-flex items-center gap-1.5"
                          onClick={() => {
                            setQuitTarget(m)
                            setQuitRemarks('')
                          }}
                        >
                          <UserMinus size={14} />
                          退队
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailId != null && (
        <AssistantStudentDetail
          memberId={detailId}
          onClose={() => setDetailId(null)}
          onUpdate={load}
        />
      )}

      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={() => setEditingId(null)} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">调整阶段</h2>
              <button type="button" onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-amber-200/90 mb-3">一期及以下直接生效；二期及以上需管理审批。</p>
            <StyledSelect options={STAGE_OPTIONS} value={stage} onChange={setStage} searchable />
            <textarea
              className="student-glass-field h-20 mt-3"
              placeholder="升阶说明（可选）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                disabled={saving}
                onClick={submitStage}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                确认
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="flex-1 bg-gray-600 text-white py-2 rounded-lg">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {quitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={() => setQuitTarget(null)} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">发起退队</h2>
              <button type="button" onClick={() => setQuitTarget(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              学员：<span className="text-white">{quitTarget.nickname}</span>
              <span className="text-gray-500 ml-2">QQ {quitTarget.qq}</span>
            </p>
            <p className="text-xs text-amber-200/90 mb-3">提交后由管理审批，不会立即退队。</p>
            <textarea
              className="student-glass-field h-28"
              placeholder="退队原因 *"
              value={quitRemarks}
              onChange={(e) => setQuitRemarks(e.target.value)}
              required
            />
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                disabled={quitSaving}
                onClick={submitQuit}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg flex items-center justify-center gap-2"
              >
                {quitSaving && <Loader2 size={16} className="animate-spin" />}
                提交审批
              </button>
              <button type="button" onClick={() => setQuitTarget(null)} className="flex-1 bg-gray-600 text-white py-2 rounded-lg">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
