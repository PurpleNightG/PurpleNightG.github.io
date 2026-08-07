import { useEffect, useMemo, useState } from 'react'
import { assistantAPI, courseAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { CheckSquare, Square, X, Search, Filter, ChevronUp, ChevronDown, BookOpen } from 'lucide-react'
import { formatDate } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import MemberNameCell from '../../components/MemberNameCell'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageSkeleton from '../../components/Skeleton'
import {
  readLocalJson, readLocalString, cycleSort, cmpBasic, type SortConfig,
} from '../../utils/persistedState'
import {
  parseMetaOptions,
  tagBadgeClass,
  type MetaOption,
} from '../../utils/tagColors'

interface Member {
  id: number
  name: string
  nickname?: string
  avatar?: string | null
  qq?: string | null
  status: string
  join_date?: string
  last_training_date?: string | null
  completed_courses: number
  total_courses: number
}

interface Course {
  id: number
  code: string
  name: string
  category: string
  difficulty: string
  hours: number
  progress: number | null
  mixed?: boolean
}

interface NeedsApprovalItem {
  id: number
  nickname: string
  from: string
  to: string
  alreadyPending?: boolean
  pendingTo?: string | null
}

const progressOptions = [0, 10, 20, 50, 75, 100]
const PREFERRED_CATEGORY_ORDER = [
  '入门课程',
  '标准技能一阶课程',
  '标准技能二阶课程',
  '团队训练',
  '进阶课程',
]
const STAGE_ROLES = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考']
const STAGE_ORDER: Record<string, number> = {
  未新训: 1, 新训初期: 2, 新训一期: 3, 新训二期: 4, 新训三期: 5, 新训准考: 6,
}
const DEFAULT_FILTERS = { stage_role: [] as string[] }

function displayName(m: Member) {
  return m.name || m.nickname || '—'
}

export default function AssistantProgress() {
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [difficulties, setDifficulties] = useState<MetaOption[]>(
    parseMetaOptions(
      [
        { name: '初级', color: 'green' },
        { name: '中级', color: 'blue' },
        { name: '高级', color: 'red' },
      ],
      ['初级', '中级', '高级']
    )
  )
  const [searchQuery, setSearchQuery] = useState(() => readLocalString('assistantProgressSearch'))
  const [filters, setFilters] = useState<{ stage_role: string[] }>(() =>
    readLocalJson('assistantProgressFilters', DEFAULT_FILTERS)
  )
  const [sortConfig, setSortConfig] = useState<SortConfig>(() =>
    readLocalJson('assistantProgressSort', null)
  )
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    localStorage.setItem('assistantProgressSearch', searchQuery)
  }, [searchQuery])
  useEffect(() => {
    localStorage.setItem('assistantProgressFilters', JSON.stringify(filters))
  }, [filters])
  useEffect(() => {
    if (sortConfig) localStorage.setItem('assistantProgressSort', JSON.stringify(sortConfig))
    else localStorage.removeItem('assistantProgressSort')
  }, [sortConfig])

  const [showProgressModal, setShowProgressModal] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [memberCourses, setMemberCourses] = useState<Course[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<Map<number, number>>(new Map())

  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchCourses, setBatchCourses] = useState<Course[]>([])
  const [loadingBatchCourses, setLoadingBatchCourses] = useState(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchPendingChanges, setBatchPendingChanges] = useState<Map<number, number>>(new Map())
  const [approvalPrompt, setApprovalPrompt] = useState<NeedsApprovalItem[] | null>(null)
  const [proposingApproval, setProposingApproval] = useState(false)

  const loadMembers = async () => {
    setLoading(true)
    try {
      const res = await assistantAPI.progressMembers()
      setMembers(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载成员列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
    loadDifficulties()
  }, [])

  const loadDifficulties = async () => {
    try {
      const res = await courseAPI.getDifficulties()
      setDifficulties(parseMetaOptions(res.data, ['初级', '中级', '高级']))
    } catch (e) {
      console.error('加载难度配置失败:', e)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    const found = difficulties.find((d) => d.name === difficulty)
    return tagBadgeClass(
      found?.color ||
        (difficulty === '初级' ? 'green' : difficulty === '高级' ? 'red' : 'blue')
    )
  }

  const openProgressModal = async (member: Member) => {
    setSelectedMember(member)
    setShowProgressModal(true)
    setPendingChanges(new Map())
    setLoadingCourses(true)
    try {
      const res = await assistantAPI.progressMember(member.id)
      setMemberCourses(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载课程进度失败')
    } finally {
      setLoadingCourses(false)
    }
  }

  const closeProgressModal = () => {
    setShowProgressModal(false)
    setSelectedMember(null)
    setMemberCourses([])
    setPendingChanges(new Map())
  }

  const updateTempProgress = (courseId: number, progress: number) => {
    setPendingChanges((prev) => {
      const next = new Map(prev)
      next.set(courseId, progress)
      return next
    })
    setMemberCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, progress } : c)))
  }

  const handleSyncAfterProgress = async (memberIds: number[], progressCount: number, batchSize?: number) => {
    const syncRes = await assistantAPI.syncStageAfterProgress(memberIds)
    const needsApproval: NeedsApprovalItem[] = syncRes.data?.needsApproval || []
    const direct = syncRes.data?.directUpdated?.length || 0
    const blocked = syncRes.data?.blocked || []

    if (batchSize != null) {
      const bits = [`已为 ${batchSize} 名学员更新 ${progressCount} 门课程进度`]
      if (direct > 0) bits.push(`${direct} 人阶段已直接同步`)
      toast.success(bits.join('；'))
    } else if (direct > 0) {
      const row = syncRes.data.directUpdated[0]
      toast.success(`已更新 ${progressCount} 门课程进度，阶段已同步为「${row.to}」`)
    } else {
      toast.success(`已更新 ${progressCount} 门课程进度`)
    }

    if (blocked.length > 0) {
      toast.error(`${blocked.length} 人目标为二期及以上，但无升阶申请权限`)
    }

    if (needsApproval.length > 0) {
      setApprovalPrompt(needsApproval)
    }
  }

  const confirmProposeApproval = async () => {
    if (!approvalPrompt?.length) return
    setProposingApproval(true)
    try {
      let ok = 0
      for (const item of approvalPrompt) {
        await assistantAPI.setStudentStage(item.id, {
          stage_role: item.to,
          reason: '进度分配后申请同步阶段',
        })
        ok++
      }
      toast.success(`已为 ${ok} 人提交升阶审批`)
      setApprovalPrompt(null)
      await loadMembers()
    } catch (e: any) {
      toast.error(e.message || '提交升阶申请失败')
    } finally {
      setProposingApproval(false)
    }
  }

  const submitAllChanges = async () => {
    if (!selectedMember || pendingChanges.size === 0) return
    setSubmitting(true)
    try {
      const changedCount = pendingChanges.size
      await Promise.all(
        Array.from(pendingChanges.entries()).map(([courseId, progress]) =>
          assistantAPI.setProgress(selectedMember.id, courseId, progress)
        )
      )
      setPendingChanges(new Map())
      await loadMembers()
      closeProgressModal()
      await handleSyncAfterProgress([selectedMember.id], changedCount)
    } catch (e: any) {
      toast.error(e.message || '更新进度失败')
    } finally {
      setSubmitting(false)
    }
  }

  const loadBatchCourses = async (ids: number[]) => {
    setLoadingBatchCourses(true)
    try {
      const results = await Promise.all(ids.map((id) => assistantAPI.progressMember(id)))
      const lists = results.map((r) => (r.data || []) as Course[])
      const byId = new Map<number, Course & { values: number[] }>()
      for (const list of lists) {
        for (const c of list) {
          const cur = byId.get(c.id)
          if (!cur) {
            byId.set(c.id, { ...c, values: [Number(c.progress ?? 0)] })
          } else {
            cur.values.push(Number(c.progress ?? 0))
          }
        }
      }
      setBatchCourses(
        Array.from(byId.values()).map(({ values, ...c }) => {
          const unique = [...new Set(values)]
          return {
            ...c,
            mixed: unique.length > 1,
            progress: unique.length === 1 ? unique[0] : null,
          }
        })
      )
    } catch (e: any) {
      toast.error(e.message || '加载课程列表失败')
    } finally {
      setLoadingBatchCourses(false)
    }
  }

  const openBatchModal = async () => {
    if (selectedMemberIds.size === 0) {
      toast.error('请先选择成员')
      return
    }
    setShowBatchModal(true)
    setBatchPendingChanges(new Map())
    await loadBatchCourses(Array.from(selectedMemberIds))
  }

  const closeBatchModal = () => {
    setShowBatchModal(false)
    setBatchCourses([])
    setBatchPendingChanges(new Map())
  }

  const updateBatchTempProgress = (courseId: number, progress: number) => {
    setBatchPendingChanges((prev) => {
      const next = new Map(prev)
      next.set(courseId, progress)
      return next
    })
    setBatchCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, progress, mixed: false } : c))
    )
  }

  const submitBatchChanges = async () => {
    if (batchPendingChanges.size === 0) return
    setBatchSubmitting(true)
    try {
      const memberIds = Array.from(selectedMemberIds)
      const changedCount = batchPendingChanges.size
      const tasks: Promise<any>[] = []
      for (const [courseId, progress] of batchPendingChanges.entries()) {
        for (const memberId of memberIds) {
          tasks.push(assistantAPI.setProgress(memberId, courseId, progress))
        }
      }
      await Promise.all(tasks)
      setBatchPendingChanges(new Map())
      setSelectedMemberIds(new Set())
      await loadMembers()
      closeBatchModal()
      await handleSyncAfterProgress(memberIds, changedCount, memberIds.length)
    } catch (e: any) {
      toast.error(e.message || '批量更新失败')
    } finally {
      setBatchSubmitting(false)
    }
  }

  const toggleSelectMember = (memberId: number) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  const clearSelection = () => setSelectedMemberIds(new Set())

  const toggleFilter = (value: string) => {
    setFilters((prev) => {
      const current = prev.stage_role
      return {
        stage_role: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      }
    })
  }

  const handleSort = (key: string) => setSortConfig((prev) => cycleSort(prev, key))

  const filteredMembers = useMemo(() => {
    let filtered = [...members]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (m) =>
          displayName(m).toLowerCase().includes(q) ||
          String(m.qq || '').includes(q)
      )
    }
    if (filters.stage_role.length > 0) {
      filtered = filtered.filter((m) => filters.stage_role.includes(m.status))
    }
    if (sortConfig) {
      filtered.sort((a, b) => {
        if (sortConfig.key === 'progress') {
          const aVal = a.total_courses ? a.completed_courses / a.total_courses : 0
          const bVal = b.total_courses ? b.completed_courses / b.total_courses : 0
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
        }
        if (sortConfig.key === 'status') {
          const aOrder = STAGE_ORDER[a.status] ?? 999
          const bOrder = STAGE_ORDER[b.status] ?? 999
          return sortConfig.direction === 'asc' ? aOrder - bOrder : bOrder - aOrder
        }
        const cmp = cmpBasic((a as any)[sortConfig.key], (b as any)[sortConfig.key])
        return sortConfig.direction === 'asc' ? cmp : -cmp
      })
    }
    return filtered
  }, [members, searchQuery, filters, sortConfig])

  const isAllSelected =
    filteredMembers.length > 0 && filteredMembers.every((m) => selectedMemberIds.has(m.id))

  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedMemberIds(new Set())
    else setSelectedMemberIds(new Set(filteredMembers.map((m) => m.id)))
  }

  const renderCourseEditor = (
    courses: Course[],
    onPick: (courseId: number, progress: number) => void,
    opts?: { showMixed?: boolean; pending?: Map<number, number> }
  ) => {
    const present = [
      ...new Set(
        courses.map((c) => (c.category && String(c.category).trim()) || '未分类')
      ),
    ]
    const categories = [
      ...PREFERRED_CATEGORY_ORDER.filter((c) => present.includes(c)),
      ...present
        .filter((c) => !PREFERRED_CATEGORY_ORDER.includes(c))
        .sort((a, b) => a.localeCompare(b, 'zh-CN')),
    ]

    return (
    <div className="space-y-4">
      {categories.map((category) => {
        const categoryCourses = courses.filter(
          (c) => ((c.category && String(c.category).trim()) || '未分类') === category
        )
        if (categoryCourses.length === 0) return null
        return (
          <div key={category} className="space-y-2">
            <h3 className="text-lg font-semibold text-purple-400 border-b border-gray-700 pb-2">
              {category}
            </h3>
            <div className="grid gap-3">
              {categoryCourses.map((course) => {
                const isMixed = !!opts?.showMixed && !!course.mixed
                const isPending = opts?.pending?.has(course.id)
                return (
                  <div
                    key={course.id}
                    className={`flex items-center justify-between gap-3 p-3 student-glass-chip transition-colors ${
                      isMixed ? 'ring-1 ring-amber-400/35' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-purple-400 font-mono text-sm">{course.code}</span>
                        <span className="text-white">{course.name}</span>
                        {isMixed && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                            进度不一致
                          </span>
                        )}
                        {isPending && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-400/30">
                            将统一
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                        <span className={`status-badge ${getDifficultyColor(course.difficulty)}`}>
                          {course.difficulty}
                        </span>
                        <span>{course.hours} 课时</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {progressOptions.map((option) => {
                        const selected = !isMixed && course.progress === option
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => onPick(course.id, option)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                              selected
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                : isMixed
                                  ? 'bg-gray-700/40 text-gray-300 hover:bg-amber-500/20 hover:text-amber-100 border border-dashed border-white/15'
                                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
                            }`}
                          >
                            {option === 0 ? '未开始' : `${option}%`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {courses.length === 0 && (
        <div className="text-center text-gray-400 py-8">暂无课程</div>
      )}
    </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="p-2 rounded-lg bg-cyan-600/20">
              <BookOpen size={18} className="text-cyan-400" />
            </span>
            进度分配
          </h1>
          <span className="text-sm text-gray-400">
            共 {members.length} 名学员
            {filteredMembers.length < members.length && (
              <span className="text-purple-400"> · 显示 {filteredMembers.length} 名</span>
            )}
          </span>
          {selectedMemberIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                已选中 <span className="text-purple-400 font-semibold">{selectedMemberIds.size}</span> 名学员
              </span>
              <button type="button" onClick={clearSelection} className="text-sm text-gray-400 hover:text-white transition-colors">
                清除
              </button>
              <button
                type="button"
                onClick={openBatchModal}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
              >
                批量修改进度
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索昵称、QQ..."
              className="student-glass-field student-glass-field--icon py-2 w-64"
            />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white z-10"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Filter size={20} />
            筛选
            {filters.stage_role.length > 0 && (
              <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
                {filters.stage_role.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="student-glass-panel student-glass-panel--static p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">筛选条件</h3>
            {filters.stage_role.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters({ stage_role: [] })}
                className="text-sm text-gray-400 hover:text-white"
              >
                清空筛选
              </button>
            )}
          </div>
          <label className="text-sm text-gray-400 mb-2 block">阶段</label>
          <div className="flex flex-wrap gap-2">
            {STAGE_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleFilter(role)}
                className={`student-glass-badge transition-opacity ${getRoleColor(role)} ${
                  filters.stage_role.includes(role) ? 'opacity-100 ring-1 ring-white/35' : 'opacity-55 hover:opacity-90'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="student-glass-panel student-glass-panel--static overflow-hidden">
        {loading ? (
          <PageSkeleton variant="table" padded={false} />
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center justify-center w-full hover:text-purple-400 transition-colors"
                    >
                      {isAllSelected ? (
                        <CheckSquare size={18} className="text-purple-400" />
                      ) : (
                        <Square size={18} className="text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-white">
                      昵称
                      {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-white">
                      阶段
                      {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('last_training_date')} className="flex items-center gap-1 hover:text-white">
                      新训日期
                      {sortConfig?.key === 'last_training_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('progress')} className="flex items-center gap-1 hover:text-white">
                      课程进度
                      {sortConfig?.key === 'progress' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      {searchQuery || filters.stage_role.length > 0 ? '未找到匹配的学员' : '暂无已归属学员'}
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      onClick={() => openProgressModal(member)}
                      className="cursor-pointer hover:bg-gray-800/30"
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleSelectMember(member.id)}
                          className="flex items-center justify-center hover:text-purple-400"
                        >
                          {selectedMemberIds.has(member.id) ? (
                            <CheckSquare size={18} className="text-purple-400" />
                          ) : (
                            <Square size={18} className="text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td>
                        <MemberNameCell name={displayName(member)} avatar={member.avatar} qq={member.qq} />
                      </td>
                      <td>
                        <span className={`student-glass-badge ${getRoleColor(member.status)}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="text-gray-300">{formatDate(member.last_training_date)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden min-w-[5rem]">
                            <div
                              className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all"
                              style={{
                                width: `${member.total_courses ? (member.completed_courses / member.total_courses) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm text-gray-400 min-w-[80px]">
                            {member.completed_courses} / {member.total_courses}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showProgressModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeProgressModal}>
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="glass-modal-tilt max-h-[90vh]">
              <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div className="shrink-0 bg-white/5 border-b border-white/10 px-6 py-4 flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">{displayName(selectedMember)} - 课程进度</h2>
                  <button type="button" onClick={closeProgressModal} className="text-gray-400 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none p-6">
                  {loadingCourses ? (
                    <div className="text-center text-gray-400 py-12">加载课程中...</div>
                  ) : (
                    renderCourseEditor(memberCourses, updateTempProgress)
                  )}
                </div>
                <div className="shrink-0 bg-white/5 border-t border-white/10 px-6 py-4 flex justify-between items-center">
                  <div className="text-sm text-gray-400">
                    {pendingChanges.size > 0 ? (
                      <span className="text-yellow-400">
                        已修改 <span className="font-semibold">{pendingChanges.size}</span> 门课程，请点击确认提交
                      </span>
                    ) : (
                      <span>未修改</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={closeProgressModal} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg">
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={submitAllChanges}
                      disabled={submitting || pendingChanges.size === 0}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg disabled:opacity-50"
                    >
                      {submitting ? '提交中...' : `确认提交 (${pendingChanges.size})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeBatchModal}>
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="glass-modal-tilt max-h-[90vh]">
              <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div className="shrink-0 bg-white/5 border-b border-white/10 px-6 py-4 flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">
                    批量修改进度 - 已选择 {selectedMemberIds.size} 名学员
                  </h2>
                  <button type="button" onClick={closeBatchModal} className="text-gray-400 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none p-6">
                  {loadingBatchCourses ? (
                    <div className="text-center text-gray-400 py-12">加载课程中...</div>
                  ) : (
                    <>
                      <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 mb-4">
                        <p className="text-blue-300 text-sm">
                          💡 点击进度按钮，将为所有选中的{' '}
                          <span className="font-bold">{selectedMemberIds.size}</span> 名学员统一设置该课进度。
                          若显示「进度不一致」，说明这些人当前进度不同，需点选后才会写入。
                        </p>
                      </div>
                      {renderCourseEditor(batchCourses, updateBatchTempProgress, {
                        showMixed: true,
                        pending: batchPendingChanges,
                      })}
                    </>
                  )}
                </div>
                <div className="shrink-0 bg-white/5 border-t border-white/10 px-6 py-4 flex justify-between items-center">
                  <div className="text-sm text-gray-400">
                    {batchPendingChanges.size > 0 ? (
                      <span className="text-yellow-400">
                        已修改 <span className="font-semibold">{batchPendingChanges.size}</span> 门课程，将为{' '}
                        <span className="font-semibold">{selectedMemberIds.size}</span> 名学员批量更新
                      </span>
                    ) : (
                      <span>未修改</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={closeBatchModal} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg">
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={submitBatchChanges}
                      disabled={batchSubmitting || batchPendingChanges.size === 0}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg disabled:opacity-50"
                    >
                      {batchSubmitting ? '提交中...' : `确认提交 (${batchPendingChanges.size})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {approvalPrompt && approvalPrompt.length > 0 && (
        <ConfirmDialog
          type="warning"
          title="是否申请升阶审批？"
          message={
            `以下学员按课程进度应升至二期及以上，需管理审批后才会改阶段。\n是否提交升阶申请？\n\n` +
            approvalPrompt
              .map((i) => {
                const note =
                  i.alreadyPending && i.pendingTo === i.to
                    ? '（已有相同待审）'
                    : i.alreadyPending
                      ? '（将更新已有待审）'
                      : ''
                return `· ${i.nickname}：${i.from} → ${i.to}${note}`
              })
              .join('\n')
          }
          confirmText={proposingApproval ? '提交中...' : '申请审批'}
          cancelText="暂不申请"
          onConfirm={() => {
            if (!proposingApproval) void confirmProposeApproval()
          }}
          onCancel={() => {
            if (!proposingApproval) setApprovalPrompt(null)
          }}
        />
      )}
    </div>
  )
}
