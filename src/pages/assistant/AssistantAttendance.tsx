import { useEffect, useMemo, useState } from 'react'
import { assistantAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { formatDate } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import MemberNameCell from '../../components/MemberNameCell'
import PageSkeleton from '../../components/Skeleton'
import {
  Search, X, CheckSquare, Square, Copy, Eye, EyeOff, Filter, ChevronUp, ChevronDown, Calendar,
} from 'lucide-react'
import {
  readLocalJson, readLocalString, cycleSort, cmpBasic, type SortConfig,
} from '../../utils/persistedState'

const TRAINING_WARN_DAYS = 3

type TabKey = 'training' | 'attendance'

interface TrainingItem {
  id: number
  member_id: number
  member_name: string
  avatar?: string | null
  qq?: string
  stage_role: string
  last_training_date: string | null
  days_without_training: number
  days_until_timeout: number
  is_leave_buffer?: number | boolean
  buffer_remaining_days?: number | null
  is_custom_extended?: number | boolean
  custom_timeout_days?: number | null
}

interface AttendanceItem {
  member_id: number
  member_name: string
  avatar?: string | null
  qq?: string
  stage_role: string
  ignored: boolean
  paused: boolean
  reason_code: string
  reason_label: string
  remaining_days: number
  elapsed_days: number
  deadline_days: number
  has_custom_deadline?: boolean
  reasons: {
    reason_code: string
    reason_label: string
    deadline_days: number
    elapsed_days: number
    remaining_days: number
    paused: boolean
  }[]
}

export default function AssistantAttendance() {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const saved = readLocalString('assistantAttendanceTab', 'training')
    return saved === 'attendance' ? 'attendance' : 'training'
  })
  const [training, setTraining] = useState<TrainingItem[]>([])
  const [attendance, setAttendance] = useState<AttendanceItem[]>([])
  const [attendanceWarnCount, setAttendanceWarnCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState(() => readLocalString('assistantAttendanceSearch'))
  const [showAllAttendance, setShowAllAttendance] = useState(() =>
    readLocalJson('assistantAttendanceShowAll', false)
  )
  const [showCustomExtended, setShowCustomExtended] = useState(() =>
    readLocalJson('assistantAttendanceShowCustom', true)
  )
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<Set<number>>(new Set())
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<Set<number>>(new Set())
  const [displayMode, setDisplayMode] = useState<'remaining' | 'kick_cycle'>(() => {
    const saved = readLocalString('assistantAttendanceDisplayMode', 'remaining')
    return saved === 'kick_cycle' ? 'kick_cycle' : 'remaining'
  })
  const [kickMeta, setKickMeta] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [stageFilter, setStageFilter] = useState<string[]>(() =>
    readLocalJson('assistantAttendanceStageFilter', [] as string[])
  )
  const [sortConfig, setSortConfig] = useState<SortConfig>(() =>
    readLocalJson('assistantAttendanceSort', null)
  )

  useEffect(() => { localStorage.setItem('assistantAttendanceTab', activeTab) }, [activeTab])
  useEffect(() => { localStorage.setItem('assistantAttendanceSearch', searchQuery) }, [searchQuery])
  useEffect(() => {
    localStorage.setItem('assistantAttendanceStageFilter', JSON.stringify(stageFilter))
  }, [stageFilter])
  useEffect(() => {
    if (sortConfig) localStorage.setItem('assistantAttendanceSort', JSON.stringify(sortConfig))
    else localStorage.removeItem('assistantAttendanceSort')
  }, [sortConfig])
  useEffect(() => {
    localStorage.setItem('assistantAttendanceShowAll', JSON.stringify(showAllAttendance))
  }, [showAllAttendance])
  useEffect(() => {
    localStorage.setItem('assistantAttendanceShowCustom', JSON.stringify(showCustomExtended))
  }, [showCustomExtended])
  useEffect(() => {
    localStorage.setItem('assistantAttendanceDisplayMode', displayMode)
  }, [displayMode])

  const loadTraining = async (mode = displayMode) => {
    setLoading(true)
    try {
      const res = await assistantAPI.trainingReminders(mode)
      setTraining(res.data || [])
      setKickMeta(res.meta?.kick || null)
      if (res.meta?.mode === 'kick_cycle' || res.meta?.mode === 'remaining') {
        setDisplayMode(res.meta.mode)
      }
    } catch (e: any) {
      toast.error(e.message || '加载新训催促失败')
    } finally {
      setLoading(false)
    }
  }

  const loadAttendance = async (showAll = showAllAttendance) => {
    setAttendanceLoading(true)
    try {
      const res = await assistantAPI.attendance(showAll)
      setAttendance(res.data || [])
      setAttendanceWarnCount(res.meta?.warnCount ?? (res.data || []).length)
    } catch (e: any) {
      toast.error(e.message || '加载考勤进度失败')
    } finally {
      setAttendanceLoading(false)
    }
  }

  useEffect(() => {
    void loadTraining(displayMode)
    void loadAttendance(showAllAttendance)
  }, [])

  const switchDisplayMode = (mode: 'remaining' | 'kick_cycle') => {
    if (mode === displayMode) return
    setDisplayMode(mode)
    void loadTraining(mode)
  }

  const copyUrgeMentions = async (list: { qq?: string }[]) => {
    const parts = list.map((i) => (i.qq || '').trim()).filter(Boolean).map((qq) => `@${qq}`)
    if (parts.length === 0) {
      toast.warning('没有可复制的 QQ 号')
      return
    }
    const text = parts.join(' ')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已复制 ${parts.length} 人催促`)
    } catch {
      toast.error('复制失败，请检查浏览器权限')
    }
  }

  const filteredTraining = useMemo(() => {
    let list = [...training]
    if (!showCustomExtended) list = list.filter((i) => !i.is_custom_extended)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) =>
          i.member_name?.toLowerCase().includes(q) ||
          String(i.qq || '').includes(q) ||
          i.stage_role?.includes(q)
      )
    }
    if (stageFilter.length > 0) {
      list = list.filter((i) => stageFilter.includes(i.stage_role))
    }
    if (sortConfig) {
      list.sort((a, b) => {
        const cmp = cmpBasic((a as any)[sortConfig.key], (b as any)[sortConfig.key])
        return sortConfig.direction === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [training, searchQuery, stageFilter, sortConfig, showCustomExtended])

  const filteredAttendance = useMemo(() => {
    let list = [...attendance]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) =>
          i.member_name?.toLowerCase().includes(q) ||
          String(i.qq || '').includes(q) ||
          i.reason_label?.toLowerCase().includes(q) ||
          i.stage_role?.includes(q)
      )
    }
    if (stageFilter.length > 0) {
      list = list.filter((i) => stageFilter.includes(i.stage_role))
    }
    if (sortConfig) {
      list.sort((a, b) => {
        const cmp = cmpBasic((a as any)[sortConfig.key], (b as any)[sortConfig.key])
        return sortConfig.direction === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [attendance, searchQuery, stageFilter, sortConfig])

  const handleSort = (key: string) => setSortConfig((prev) => cycleSort(prev, key))

  const stageOptions = useMemo(() => {
    const set = new Set<string>()
    training.forEach((i) => i.stage_role && set.add(i.stage_role))
    attendance.forEach((i) => i.stage_role && set.add(i.stage_role))
    return Array.from(set)
  }, [training, attendance])

  const SortBtn = ({ label, field }: { label: string; field: string }) => (
    <button type="button" onClick={() => handleSort(field)} className="flex items-center gap-1 hover:text-white">
      <span>{label}</span>
      {sortConfig?.key === field && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
    </button>
  )

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="p-2 rounded-lg bg-orange-600/20">
              <Calendar size={18} className="text-orange-300" />
            </span>
            催促名单
          </h1>
          <p className="text-gray-500 text-sm mt-1">仅显示归属给你的学员</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              type="text"
              className="student-glass-field student-glass-field--icon py-2 w-52 sm:w-64"
              placeholder={activeTab === 'training' ? '搜索成员...' : '搜索成员 / 原因...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white z-10">
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            <Filter size={16} />
            筛选
            {stageFilter.length > 0 && (
              <span className="bg-purple-600 text-white text-xs px-1.5 rounded-full">{stageFilter.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'training') {
                const targets = selectedTrainingIds.size > 0
                  ? filteredTraining.filter((i) => selectedTrainingIds.has(i.id))
                  : filteredTraining.filter((i) => !i.is_custom_extended)
                void copyUrgeMentions(targets)
              } else {
                const targets = selectedAttendanceIds.size > 0
                  ? filteredAttendance.filter((i) => selectedAttendanceIds.has(i.member_id))
                  : filteredAttendance
                void copyUrgeMentions(targets)
              }
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            <Copy size={16} />
            一键催促
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex student-glass-chip student-glass-seg w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('training')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'training' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            新训催促
            {training.length > 0 && (
              <span className={`ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full text-xs items-center justify-center ${
                activeTab === 'training' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
              }`}>
                {training.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'attendance' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            考勤进度
            {attendanceWarnCount > 0 && (
              <span className={`ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full text-xs items-center justify-center ${
                activeTab === 'attendance' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
              }`}>
                {attendanceWarnCount}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'training' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex student-glass-chip student-glass-seg">
              <button
                type="button"
                onClick={() => switchDisplayMode('remaining')}
                className={`px-3 py-1.5 text-xs font-medium ${displayMode === 'remaining' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                倒计时预警
              </button>
              <button
                type="button"
                onClick={() => switchDisplayMode('kick_cycle')}
                className={`px-3 py-1.5 text-xs font-medium ${displayMode === 'kick_cycle' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                踢人周期
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomExtended((v) => !v)}
              className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1"
            >
              {showCustomExtended ? <Eye size={14} /> : <EyeOff size={14} />}
              自定义延期
            </button>
            {displayMode === 'kick_cycle' && kickMeta && (
              <span className="text-xs text-gray-400">
                {kickMeta.inWindow
                  ? `提醒中 · ${kickMeta.kickWeekdayLabel}踢人（${kickMeta.kickDate}）`
                  : `非提醒日 · 下次 ${kickMeta.kickWeekdayLabel} ${kickMeta.kickDate}`}
              </span>
            )}
          </div>
        )}

        {activeTab === 'attendance' && (
          <button
            type="button"
            onClick={() => {
              const next = !showAllAttendance
              setShowAllAttendance(next)
              void loadAttendance(next)
            }}
            className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1.5"
          >
            {showAllAttendance ? <Eye size={14} className="text-purple-400" /> : <EyeOff size={14} />}
            {showAllAttendance ? '显示全部进度' : '仅预警(≤7天)'}
          </button>
        )}
      </div>

      {showFilters && (
        <div className="student-glass-panel student-glass-panel--static p-4 mb-4">
          <div className="flex justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">按阶段筛选</h3>
            {stageFilter.length > 0 && (
              <button type="button" onClick={() => setStageFilter([])} className="text-sm text-gray-400 hover:text-white">
                清空
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {stageOptions.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() =>
                  setStageFilter((prev) =>
                    prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
                  )
                }
                className={`student-glass-badge transition-opacity ${getRoleColor(stage)} ${
                  stageFilter.includes(stage) ? 'opacity-100 ring-1 ring-white/35' : 'opacity-55 hover:opacity-90'
                }`}
              >
                {stage}
              </button>
            ))}
            {stageOptions.length === 0 && <span className="text-gray-500 text-sm">暂无可筛阶段</span>}
          </div>
        </div>
      )}

      {activeTab === 'training' ? (
        <div className="student-glass-panel student-glass-panel--static overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs text-gray-500">
            距离超时还剩不超过 {TRAINING_WARN_DAYS} 天时出现在名单
            {!showCustomExtended && '（已隐藏自定义延期）'}
          </div>
          {loading ? (
            <PageSkeleton variant="table" padded={false} />
          ) : filteredTraining.length === 0 ? (
            <div className="p-10 text-center text-gray-500">当前没有新训催促对象</div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedTrainingIds.size === filteredTraining.length) setSelectedTrainingIds(new Set())
                          else setSelectedTrainingIds(new Set(filteredTraining.map((i) => i.id)))
                        }}
                        className="flex items-center justify-center w-full hover:text-purple-400"
                      >
                        {selectedTrainingIds.size === filteredTraining.length && filteredTraining.length > 0
                          ? <CheckSquare size={18} className="text-purple-400" />
                          : <Square size={18} className="text-gray-400" />}
                      </button>
                    </th>
                    <th><SortBtn label="昵称" field="member_name" /></th>
                    <th><SortBtn label="阶段" field="stage_role" /></th>
                    <th><SortBtn label="最后新训" field="last_training_date" /></th>
                    <th><SortBtn label="未训天数" field="days_without_training" /></th>
                    <th><SortBtn label="距离超时" field="days_until_timeout" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTraining.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedTrainingIds)
                            if (next.has(item.id)) next.delete(item.id)
                            else next.add(item.id)
                            setSelectedTrainingIds(next)
                          }}
                          className="flex items-center justify-center hover:text-purple-400"
                        >
                          {selectedTrainingIds.has(item.id)
                            ? <CheckSquare size={18} className="text-purple-400" />
                            : <Square size={18} className="text-gray-400" />}
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center gap-2 flex-wrap">
                          <MemberNameCell name={item.member_name} avatar={item.avatar} qq={item.qq} />
                          {!!item.is_leave_buffer && (
                            <span className="student-glass-badge bg-cyan-600/20 text-cyan-300">请假缓冲</span>
                          )}
                          {!!item.is_custom_extended && (
                            <span className="student-glass-badge bg-blue-600/20 text-blue-300">自定义延期</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`student-glass-badge ${getRoleColor(item.stage_role)}`}>{item.stage_role}</span>
                      </td>
                      <td className="text-gray-300">
                        {item.last_training_date ? formatDate(item.last_training_date) : '从未训练'}
                      </td>
                      <td>
                        {!!item.is_leave_buffer ? (
                          <span className="student-glass-badge bg-cyan-600/20 text-cyan-300">缓冲期</span>
                        ) : (
                          <span className={`font-medium ${
                            item.days_without_training >= 30 ? 'text-red-400'
                              : item.days_without_training >= 14 ? 'text-orange-300'
                              : 'text-gray-300'
                          }`}>
                            {item.days_without_training} 天
                          </span>
                        )}
                      </td>
                      <td>
                        {!!item.is_leave_buffer ? (
                          <span className="student-glass-badge bg-cyan-600/20 text-cyan-300">
                            缓冲剩 {item.buffer_remaining_days ?? item.days_until_timeout} 天
                          </span>
                        ) : item.days_until_timeout > 0 ? (
                          <span className={`student-glass-badge ${
                            item.days_until_timeout > 3 ? 'bg-yellow-600/20 text-yellow-300' : 'bg-orange-600/20 text-orange-300'
                          }`}>
                            还剩 {item.days_until_timeout} 天
                          </span>
                        ) : item.days_until_timeout === 0 ? (
                          <span className="student-glass-badge bg-orange-600/20 text-orange-300">今天超时</span>
                        ) : (
                          <span className="student-glass-badge bg-red-600/20 text-red-300">
                            已超时 {Math.abs(item.days_until_timeout)} 天
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="student-glass-panel student-glass-panel--static overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs text-gray-500">
            加入后 60 天内达新训三期 → 再 45 天内达准考及以上（总上限 105 天）→ 准考/紫夜半年需新训。请假暂停计时。剩余 ≤7 天进入预警。
          </div>
          {attendanceLoading ? (
            <PageSkeleton variant="table" padded={false} />
          ) : filteredAttendance.length === 0 ? (
            <div className="p-10 text-center text-gray-500">当前没有考勤进度对象</div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedAttendanceIds.size === filteredAttendance.length) setSelectedAttendanceIds(new Set())
                          else setSelectedAttendanceIds(new Set(filteredAttendance.map((i) => i.member_id)))
                        }}
                        className="flex items-center justify-center w-full hover:text-purple-400"
                      >
                        {selectedAttendanceIds.size === filteredAttendance.length && filteredAttendance.length > 0
                          ? <CheckSquare size={18} className="text-purple-400" />
                          : <Square size={18} className="text-gray-400" />}
                      </button>
                    </th>
                    <th><SortBtn label="成员" field="member_name" /></th>
                    <th><SortBtn label="阶段" field="stage_role" /></th>
                    <th>催促原因 / 进度</th>
                    <th><SortBtn label="剩余天数" field="remaining_days" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((item) => (
                    <tr key={item.member_id} className={item.ignored ? 'opacity-60' : ''}>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedAttendanceIds)
                            if (next.has(item.member_id)) next.delete(item.member_id)
                            else next.add(item.member_id)
                            setSelectedAttendanceIds(next)
                          }}
                          className="flex items-center justify-center hover:text-purple-400"
                        >
                          {selectedAttendanceIds.has(item.member_id)
                            ? <CheckSquare size={18} className="text-purple-400" />
                            : <Square size={18} className="text-gray-400" />}
                        </button>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <MemberNameCell name={item.member_name} avatar={item.avatar} qq={item.qq} />
                            {item.paused && <span className="student-glass-badge bg-cyan-600/20 text-cyan-300">请假暂停</span>}
                            {item.ignored && <span className="student-glass-badge bg-gray-600/30 text-gray-400">已忽略</span>}
                            {item.has_custom_deadline && (
                              <span className="student-glass-badge bg-blue-600/20 text-blue-300">自定义期限</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`student-glass-badge ${getRoleColor(item.stage_role)}`}>{item.stage_role}</span>
                      </td>
                      <td>
                        <div className="space-y-1.5 max-w-md">
                          {(item.reasons || []).map((r) => {
                            const deadline = Math.max(1, r.deadline_days || 1)
                            const pct = Math.min(100, Math.round((r.elapsed_days / deadline) * 100))
                            const over = r.elapsed_days >= deadline
                            const barColor = over || pct >= 90
                              ? 'bg-red-500'
                              : pct >= 70
                                ? 'bg-orange-500'
                                : pct >= 40
                                  ? 'bg-yellow-500'
                                  : 'bg-purple-500'
                            return (
                              <div key={r.reason_code} className="text-sm text-gray-300">
                                <div className="leading-relaxed">
                                  <span className={`inline-block align-middle text-xs px-1.5 py-0.5 rounded mr-1.5 ${
                                    r.reason_code === 'to_phase3' ? 'bg-yellow-600/20 text-yellow-300'
                                      : (r.reason_code === 'to_exam' || r.reason_code === 'to_formal') ? 'bg-orange-600/20 text-orange-300'
                                      : 'bg-purple-600/20 text-purple-300'
                                  }`}>
                                    {r.reason_code === 'to_phase3' ? '达三期'
                                      : (r.reason_code === 'to_exam' || r.reason_code === 'to_formal') ? '准考'
                                      : '半年新训'}
                                  </span>
                                  <span className="align-middle">{r.reason_label}</span>
                                </div>
                                <div className="mt-1.5">
                                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-1 tabular-nums">
                                    <span>已过 {r.elapsed_days}/{r.deadline_days} 天</span>
                                    <span className={over ? 'text-red-400' : ''}>{over ? '已满' : `${pct}%`}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-gray-700/80 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${barColor}`}
                                      style={{ width: `${over ? 100 : Math.max(pct, 2)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </td>
                      <td>
                        {item.paused ? (
                          <span className="student-glass-badge bg-cyan-600/20 text-cyan-300">计时暂停</span>
                        ) : item.remaining_days > 0 ? (
                          <span className={`student-glass-badge ${
                            item.remaining_days > 7 ? 'bg-green-600/20 text-green-300'
                              : item.remaining_days >= 3 ? 'bg-yellow-600/20 text-yellow-300'
                              : 'bg-orange-600/20 text-orange-300'
                          }`}>
                            还剩 {item.remaining_days} 天
                          </span>
                        ) : item.remaining_days === 0 ? (
                          <span className="student-glass-badge bg-orange-600/20 text-orange-300">今天到期</span>
                        ) : (
                          <span className="student-glass-badge bg-red-600/20 text-red-300">
                            已超时 {Math.abs(item.remaining_days)} 天
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
