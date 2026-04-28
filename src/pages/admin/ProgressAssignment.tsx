import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { progressAPI, memberAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { CheckSquare, Square, User, X, Search, Filter, ChevronUp, ChevronDown } from 'lucide-react'
import { formatDate } from '../../utils/dateFormat'

interface Member {
  id: number
  name: string
  status: string
  join_date: string
  last_training_date: string
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
  progress: number
}

const progressOptions = [0, 10, 20, 50, 75, 100]

export default function ProgressAssignment() {
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState(() => {
    return localStorage.getItem('progressAssignmentSearch') || ''
  })
  
  // 筛选条件
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('progressAssignmentFilters')
    return saved ? JSON.parse(saved) : { stage_role: [] as string[] }
  })
  
  // 排序状态
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('progressAssignmentSort')
    return saved ? JSON.parse(saved) : null
  })
  
  // 显示筛选面板
  const [showFilters, setShowFilters] = useState(false)
  
  // 单个成员进度模态框
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [memberCourses, setMemberCourses] = useState<Course[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // 临时存储进度变更，格式：{ courseId: newProgress }
  const [pendingChanges, setPendingChanges] = useState<Map<number, number>>(new Map())
  
  // 批量修改模态框
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchCourses, setBatchCourses] = useState<Course[]>([])
  const [loadingBatchCourses, setLoadingBatchCourses] = useState(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  
  // 批量修改的临时存储，格式：{ courseId: newProgress }
  const [batchPendingChanges, setBatchPendingChanges] = useState<Map<number, number>>(new Map())
  
  // 警告成员模态框
  const [warningModal, setWarningModal] = useState<{show: boolean, members: any[]}>({show: false, members: []})

  useEffect(() => {
    loadMembers()
  }, [])

  const loadMembers = async () => {
    setLoading(true)
    try {
      const response = await progressAPI.getMembers()
      setMembers(response.data)
    } catch (error: any) {
      console.error('加载成员列表失败:', error)
      toast.error('加载成员列表失败')
    } finally {
      setLoading(false)
    }
  }

  // 处理新训准考但课程进度不足的成员警告
  const handleWarningMembers = (warningMembers: any[]) => {
    setWarningModal({show: true, members: warningMembers})
  }
  
  // 确认跳转到成员列表
  const confirmJumpToMemberList = () => {
    const warningIds = warningModal.members.map((m: any) => m.id)
    localStorage.setItem('warningMemberIds', JSON.stringify(warningIds))
    navigate('/admin/members/list')
  }

  const loadMemberCourses = async (memberId: number) => {
    setLoadingCourses(true)
    try {
      const response = await progressAPI.getMemberProgress(String(memberId))
      setMemberCourses(response.data)
    } catch (error: any) {
      console.error('加载课程进度失败:', error)
      toast.error('加载课程进度失败')
    } finally {
      setLoadingCourses(false)
    }
  }

  const openProgressModal = async (member: Member) => {
    setSelectedMember(member)
    setShowProgressModal(true)
    setPendingChanges(new Map()) // 清空待提交的变更
    await loadMemberCourses(member.id)
  }

  const closeProgressModal = () => {
    setShowProgressModal(false)
    setSelectedMember(null)
    setMemberCourses([])
    setPendingChanges(new Map()) // 清空待提交的变更
  }

  const openBatchModal = async () => {
    if (selectedMemberIds.size === 0) {
      toast.error('请先选择成员')
      return
    }
    setShowBatchModal(true)
    setBatchPendingChanges(new Map()) // 清空待提交的变更
    await loadBatchCourses()
  }

  const closeBatchModal = () => {
    setShowBatchModal(false)
    setBatchCourses([])
    setBatchPendingChanges(new Map()) // 清空待提交的变更
  }

  const loadBatchCourses = async () => {
    setLoadingBatchCourses(true)
    try {
      const response = await progressAPI.getMemberProgress(String(Array.from(selectedMemberIds)[0]))
      setBatchCourses(response.data)
    } catch (error: any) {
      console.error('加载课程列表失败:', error)
      toast.error('加载课程列表失败')
    } finally {
      setLoadingBatchCourses(false)
    }
  }

  // 更新批量修改的临时进度（不提交）
  const updateBatchTempProgress = (courseId: number, progress: number) => {
    setBatchPendingChanges(prev => {
      const newMap = new Map(prev)
      newMap.set(courseId, progress)
      return newMap
    })
    
    // 更新显示的进度
    setBatchCourses(prev =>
      prev.map(c => (c.id === courseId ? { ...c, progress } : c))
    )
  }
  
  // 提交所有批量变更
  const submitBatchChanges = async () => {
    if (batchPendingChanges.size === 0) return
    
    setBatchSubmitting(true)
    try {
      // 批量提交所有变更
      const promises = Array.from(batchPendingChanges.entries()).map(([courseId, progress]) =>
        progressAPI.batchUpdateCourse(String(courseId), Array.from(selectedMemberIds).map(String), progress)
      )
      
      await Promise.all(promises)
      
      // 自动同步这些成员的阶段
      const syncResult = await memberAPI.syncStage(Array.from(selectedMemberIds))
      
      toast.success(`已为 ${selectedMemberIds.size} 名成员更新 ${batchPendingChanges.size} 门课程进度并同步阶段`)
      setBatchPendingChanges(new Map())
      
      // 重新加载成员列表
      await loadMembers()
      closeBatchModal()
      
      // 检查是否有新训准考但课程进度不足的成员
      if (syncResult.data?.warningMembers && syncResult.data.warningMembers.length > 0) {
        handleWarningMembers(syncResult.data.warningMembers)
      }
    } catch (error: any) {
      console.error('批量更新失败:', error)
      toast.error('批量更新失败')
    } finally {
      setBatchSubmitting(false)
    }
  }

  // 更新临时进度（不提交）
  const updateTempProgress = (courseId: number, progress: number) => {
    setPendingChanges(prev => {
      const newMap = new Map(prev)
      newMap.set(courseId, progress)
      return newMap
    })
    
    // 更新显示的进度
    setMemberCourses(prev =>
      prev.map(c => (c.id === courseId ? { ...c, progress } : c))
    )
  }
  
  // 提交所有进度变更
  const submitAllChanges = async () => {
    if (!selectedMember || pendingChanges.size === 0) return
    
    setSubmitting(true)
    try {
      // 批量提交所有变更
      const promises = Array.from(pendingChanges.entries()).map(([courseId, progress]) =>
        progressAPI.updateProgress(String(selectedMember.id), String(courseId), progress)
      )
      
      await Promise.all(promises)
      
      // 自动同步该成员的阶段
      const syncResult = await memberAPI.syncStage([selectedMember.id])
      
      toast.success(`已更新 ${pendingChanges.size} 门课程进度并同步阶段`)
      setPendingChanges(new Map())
      
      // 重新加载成员列表以更新完成课程数
      await loadMembers()
      closeProgressModal()
      
      // 检查是否有新训准考但课程进度不足的成员
      if (syncResult.data?.warningMembers && syncResult.data.warningMembers.length > 0) {
        handleWarningMembers(syncResult.data.warningMembers)
      }
    } catch (error: any) {
      console.error('更新进度失败:', error)
      toast.error('更新进度失败')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSelectMember = (memberId: number) => {
    setSelectedMemberIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(memberId)) {
        newSet.delete(memberId)
      } else {
        newSet.add(memberId)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMemberIds(new Set())
    } else {
      setSelectedMemberIds(new Set(filteredMembers.map(m => m.id)))
    }
  }

  const clearSelection = () => {
    setSelectedMemberIds(new Set())
  }

  // 阶段列表
  const stageRoles = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考', '紫夜', '紫夜尖兵', '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师']
  const stageOrder: { [key: string]: number } = {
    '未新训': 1, '新训初期': 2, '新训一期': 3, '新训二期': 4, '新训三期': 5,
    '新训准考': 6, '紫夜': 7, '紫夜尖兵': 8,
    '会长': 9, '执行官': 10, '人事': 11, '总教': 12, '尖兵教官': 13, '教官': 14, '工程师': 15
  }
  const specialRoles = ['会长', '执行官', '人事', '总教', '尖兵教官', '工程师', '教官']
  
  // 保存筛选条件到localStorage
  useEffect(() => {
    localStorage.setItem('progressAssignmentFilters', JSON.stringify(filters))
  }, [filters])

  // 保存排序配置到localStorage
  useEffect(() => {
    if (sortConfig) {
      localStorage.setItem('progressAssignmentSort', JSON.stringify(sortConfig))
    }
  }, [sortConfig])

  // 保存搜索关键词到localStorage
  useEffect(() => {
    localStorage.setItem('progressAssignmentSearch', searchQuery)
  }, [searchQuery])

  // 切换筛选项
  const toggleFilter = (value: string) => {
    setFilters((prev: typeof filters) => {
      const current = prev.stage_role
      const newFilter = current.includes(value)
        ? current.filter((v: string) => v !== value)
        : [...current, value]
      return { ...prev, stage_role: newFilter }
    })
  }

  // 清空筛选
  const clearFilters = () => {
    setFilters({ stage_role: [] })
  }

  // 排序处理
  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' }
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' }
      }
      return null
    })
  }

  // 应用搜索、筛选和排序
  const getFilteredAndSortedMembers = () => {
    let filtered = [...members]

    // 应用搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(query)
      )
    }

    // 应用筛选
    if (filters.stage_role.length > 0) {
      filtered = filtered.filter(m => filters.stage_role.includes(m.status))
    }

    // 应用排序
    if (sortConfig) {
      filtered.sort((a, b) => {
        let aVal: any
        let bVal: any
        
        if (sortConfig.key === 'progress') {
          aVal = a.completed_courses / a.total_courses
          bVal = b.completed_courses / b.total_courses
        } else if (sortConfig.key === 'status') {
          const aOrder = stageOrder[a.status] ?? 999
          const bOrder = stageOrder[b.status] ?? 999
          return sortConfig.direction === 'asc' ? aOrder - bOrder : bOrder - aOrder
        } else {
          aVal = a[sortConfig.key as keyof Member]
          bVal = b[sortConfig.key as keyof Member]
        }
        
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return sortConfig.direction === 'asc' ? comparison : -comparison
      })
    }

    return filtered
  }

  const filteredMembers = getFilteredAndSortedMembers()
  const isAllSelected = filteredMembers.length > 0 && selectedMemberIds.size === filteredMembers.length
  const activeFilterCount = filters.stage_role.length

  // 根据阶段角色返回对应的颜色类
  const getRoleColor = (role: string) => {
    // 紫夜相关 - 紫色
    if (role === '紫夜' || role === '紫夜尖兵') {
      return 'bg-purple-600/20 text-purple-300'
    }
    // 领导层 - 金色/琥珀色
    if (role === '会长' || role === '执行官') {
      return 'bg-amber-600/20 text-amber-300'
    }
    // 教官相关 - 绿色
    if (role === '总教' || role === '尖兵教官' || role === '教官') {
      return 'bg-green-600/20 text-green-300'
    }
    // 人事 - 青色
    if (role === '人事') {
      return 'bg-cyan-600/20 text-cyan-300'
    }
    // 工程师 - 天蓝色
    if (role === '工程师') {
      return 'bg-sky-600/20 text-sky-300'
    }
    // 新训阶段 - 蓝色
    if (role.includes('新训')) {
      return 'bg-blue-600/20 text-blue-300'
    }
    // 未新训 - 灰色
    if (role === '未新训') {
      return 'bg-gray-600/20 text-gray-300'
    }
    // 默认 - 灰色
    return 'bg-gray-600/20 text-gray-300'
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">进度分配</h1>
          <span className="text-sm text-gray-400">
            共 {members.length} 名成员
            {filteredMembers.length < members.length && (
              <span className="text-purple-400"> · 显示 {filteredMembers.length} 名</span>
            )}
          </span>
          {selectedMemberIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                已选中 <span className="text-purple-400 font-semibold">{selectedMemberIds.size}</span> 名成员
              </span>
              <button onClick={clearSelection} className="text-sm text-gray-400 hover:text-white transition-colors">
                清除
              </button>
              <button 
                onClick={openBatchModal}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
              >
                批量修改进度
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          {/* 搜索框 */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索昵称..."
              className="bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-gray-400 w-64 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Filter size={20} />
            筛选
            {activeFilterCount > 0 && (
              <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">筛选条件</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                清空筛选
              </button>
            )}
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-2 block">阶段&角色</label>
            <div className="flex flex-wrap gap-2">
              {stageRoles.map(role => (
                <button
                  key={role}
                  onClick={() => toggleFilter(role)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    filters.stage_role.includes(role)
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {role}
                </button>
              ))}
              <button
                onClick={() => {
                  const allSelected = specialRoles.every((r: string) => filters.stage_role.includes(r))
                  if (allSelected) {
                    setFilters((prev: any) => ({ ...prev, stage_role: prev.stage_role.filter((r: string) => !specialRoles.includes(r)) }))
                  } else {
                    setFilters((prev: any) => ({ ...prev, stage_role: [...new Set([...prev.stage_role, ...specialRoles])] }))
                  }
                }}
                className={`px-3 py-1 rounded text-sm transition-colors border border-dashed ${
                  specialRoles.every((r: string) => filters.stage_role.includes(r))
                    ? 'bg-green-600 text-white border-green-500'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-500'
                }`}
              >
                全部教官
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center justify-center w-full hover:text-purple-400 transition-colors"
                  >
                    {isAllSelected ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-white transition-colors">
                    昵称
                    {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-white transition-colors">
                    阶段
                    {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('last_training_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                    新训日期
                    {sortConfig?.key === 'last_training_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('progress')} className="flex items-center gap-1 hover:text-white transition-colors">
                    课程进度
                    {sortConfig?.key === 'progress' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="text-gray-400">
                      {searchQuery || filters.stage_role.length > 0 ? (
                        <div>
                          <p className="text-lg mb-2">未找到匹配的成员</p>
                          <p className="text-sm">尝试调整搜索或筛选条件</p>
                        </div>
                      ) : (
                        <p className="text-lg">暂无成员数据</p>
                      )}
                    </div>
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
                        onClick={() => toggleSelectMember(member.id)}
                        className="flex items-center justify-center hover:text-purple-400 transition-colors"
                      >
                        {selectedMemberIds.has(member.id) ? (
                          <CheckSquare size={18} className="text-purple-400" />
                        ) : (
                          <Square size={18} className="text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-purple-400" />
                        <span className="text-white">{member.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${getRoleColor(member.status)}`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="text-gray-300">
                      {formatDate(member.last_training_date)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all"
                            style={{
                              width: `${(member.completed_courses / member.total_courses) * 100}%`
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

      {/* 单个成员进度模态框 */}
      {showProgressModal && selectedMember && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeProgressModal}
        >
          <div 
            className="bg-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 modal-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">
                {selectedMember.name} - 课程进度
              </h2>
              <button onClick={closeProgressModal} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {loadingCourses ? (
                <div className="text-center text-gray-400 py-12">加载课程中...</div>
              ) : (
                <div className="space-y-4">
                  {['入门课程', '标准技能一阶课程', '标准技能二阶课程', '团队训练', '进阶课程'].map(category => {
                    const categoryCourses = memberCourses.filter(c => c.category === category)
                    if (categoryCourses.length === 0) return null

                    return (
                      <div key={category} className="space-y-2">
                        <h3 className="text-lg font-semibold text-purple-400 border-b border-gray-700 pb-2">
                          {category}
                        </h3>
                        <div className="grid gap-3">
                          {categoryCourses.map((course) => (
                            <div
                              key={course.id}
                              className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800/70 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-purple-400 font-mono text-sm">{course.code}</span>
                                  <span className="text-white">{course.name}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                                  <span className={`status-badge ${
                                    course.difficulty === '初级' ? 'bg-green-600/20 text-green-300' :
                                    course.difficulty === '中级' ? 'bg-yellow-600/20 text-yellow-300' :
                                    'bg-red-600/20 text-red-300'
                                  }`}>
                                    {course.difficulty}
                                  </span>
                                  <span>{course.hours} 课时</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {progressOptions.map((option) => (
                                  <button
                                    key={option}
                                    onClick={() => updateTempProgress(course.id, option)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                      course.progress === option
                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
                                    }`}
                                  >
                                    {option === 0 ? '未开始' : `${option}%`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 确认按钮区域 */}
            <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex justify-between items-center">
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
                <button
                  onClick={closeProgressModal}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={submitAllChanges}
                  disabled={submitting || pendingChanges.size === 0}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? '提交中...' : `确认提交 (${pendingChanges.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 批量修改进度模态框 */}
      {showBatchModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeBatchModal}
        >
          <div 
            className="bg-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 modal-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">
                批量修改进度 - 已选择 {selectedMemberIds.size} 名成员
              </h2>
              <button onClick={closeBatchModal} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {loadingBatchCourses ? (
                <div className="text-center text-gray-400 py-12">加载课程中...</div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 mb-4">
                    <p className="text-blue-300 text-sm">
                      💡 点击任意课程的进度按钮，将为所有选中的 <span className="font-bold">{selectedMemberIds.size}</span> 名成员设置该课程的进度
                    </p>
                  </div>
                  
                  {['入门课程', '标准技能一阶课程', '标准技能二阶课程', '团队训练', '进阶课程'].map(category => {
                    const categoryCourses = batchCourses.filter(c => c.category === category)
                    if (categoryCourses.length === 0) return null

                    return (
                      <div key={category} className="space-y-2">
                        <h3 className="text-lg font-semibold text-purple-400 border-b border-gray-700 pb-2">
                          {category}
                        </h3>
                        <div className="grid gap-3">
                          {categoryCourses.map((course) => (
                            <div
                              key={course.id}
                              className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800/70 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-purple-400 font-mono text-sm">{course.code}</span>
                                  <span className="text-white">{course.name}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                                  <span className={`status-badge ${
                                    course.difficulty === '初级' ? 'bg-green-600/20 text-green-300' :
                                    course.difficulty === '中级' ? 'bg-yellow-600/20 text-yellow-300' :
                                    'bg-red-600/20 text-red-300'
                                  }`}>
                                    {course.difficulty}
                                  </span>
                                  <span>{course.hours} 课时</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {progressOptions.map((option) => (
                                  <button
                                    key={option}
                                    onClick={() => updateBatchTempProgress(course.id, option)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                      course.progress === option
                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
                                    }`}
                                  >
                                    {option === 0 ? '未开始' : `${option}%`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 确认按钮区域 */}
            <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex justify-between items-center">
              <div className="text-sm text-gray-400">
                {batchPendingChanges.size > 0 ? (
                  <span className="text-yellow-400">
                    已修改 <span className="font-semibold">{batchPendingChanges.size}</span> 门课程，将为 <span className="font-semibold">{selectedMemberIds.size}</span> 名成员批量更新
                  </span>
                ) : (
                  <span>未修改</span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={closeBatchModal}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={submitBatchChanges}
                  disabled={batchSubmitting || batchPendingChanges.size === 0}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {batchSubmitting ? '提交中...' : `确认提交 (${batchPendingChanges.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 警告成员确认对话框 */}
      {warningModal.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">⚠️ 新训准考成员课程进度不足</h2>
            <p className="text-gray-400 text-sm mb-3">
              检测到以下成员阶段为"新训准考"，但未完成前四部分的所有课程：
            </p>
            <div className="bg-gray-700/50 rounded-lg p-3 mb-4 max-h-40 overflow-y-auto">
              {warningModal.members.map((m: any) => (
                <div key={m.id} className="text-yellow-300 text-sm py-1">
                  • {m.nickname}
                </div>
              ))}
            </div>
            <p className="text-orange-400 text-xs mb-4">
              💡 这些成员可能需要降级调整。是否跳转到成员列表并高亮标出这些人？
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={confirmJumpToMemberList}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg transition-colors"
              >
                确认
              </button>
              <button
                onClick={() => setWarningModal({show: false, members: []})}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
