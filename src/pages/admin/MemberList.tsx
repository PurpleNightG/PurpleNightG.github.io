import { useState, useEffect } from 'react'
import { memberAPI, quitAPI } from '../../utils/api'
import { Plus, Eye, Filter, ChevronUp, ChevronDown, Search, X, CheckSquare, Square, Loader2, RefreshCw } from 'lucide-react'
import { formatDate } from '../../utils/dateFormat'
import { toast } from '../../utils/toast'
import MemberDetail from './MemberDetail'

interface Member {
  id: number
  nickname: string
  qq: string
  game_id: string
  join_date: string
  stage_role: string
  status: string
  last_training_date: string
}

export default function MemberList() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [viewingMemberId, setViewingMemberId] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  
  // 多选状态 - 使用Set存储选中的成员ID
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  
  // 批量操作模态框
  const [batchActionModal, setBatchActionModal] = useState<{show: boolean, type: string}>({show: false, type: ''})
  
  // 高亮的成员ID列表（同步阶段后被更新的成员）
  const [highlightedMemberIds, setHighlightedMemberIds] = useState<Set<number>>(new Set())
  
  // 警告成员模态框
  const [warningModal, setWarningModal] = useState<{show: boolean, members: any[]}>({show: false, members: []})
  
  // 设置新训日期
  const [trainingDate, setTrainingDate] = useState<string>(new Date().toISOString().split('T')[0])
  
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState(() => {
    return localStorage.getItem('memberListSearch') || ''
  })
  
  // 从localStorage加载筛选条件
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('memberListFilters')
    return saved ? JSON.parse(saved) : {
      stage_role: [] as string[],
      status: [] as string[],
      inverseMode: false  // 反选模式：true=排除所选项，false=仅显示所选项
    }
  })
  
  // 排序状态
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('memberListSort')
    return saved ? JSON.parse(saved) : null
  })
  const [formData, setFormData] = useState({
    nickname: '',
    qq: '',
    game_id: '',
    join_date: new Date().toISOString().split('T')[0],
    stage_role: '未新训',
    status: '正常',
    last_training_date: ''
  })

  useEffect(() => {
    const load = async () => {
      await loadMembers()
    }
    load()
  }, [])

  // 检查是否有从其他页面跳转过来的警告成员
  useEffect(() => {
    const warningIdsStr = localStorage.getItem('warningMemberIds')
    if (warningIdsStr) {
      try {
        const warningIds = JSON.parse(warningIdsStr)
        if (warningIds && warningIds.length > 0) {
          // 高亮并选中这些成员
          setHighlightedMemberIds(new Set(warningIds))
          setSelectedIds(new Set(warningIds))
          
          // 5秒后清除高亮
          setTimeout(() => {
            setHighlightedMemberIds(new Set())
          }, 5000)
          
          // 清除localStorage
          localStorage.removeItem('warningMemberIds')
          
          toast.info(`已高亮 ${warningIds.length} 个新训准考但课程进度不足的成员`)
        }
      } catch (error) {
        console.error('解析警告成员ID失败:', error)
      }
    }
  }, [members])

  const loadMembers = async () => {
    try {
      const response = await memberAPI.getAll()
      setMembers(response.data)
    } catch (error: any) {
      console.error('加载成员列表失败:', error)
      toast.error(error.message || '加载成员列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    // 确保成员详情已关闭
    setViewingMemberId(null)
    
    setFormData({
      nickname: '',
      qq: '',
      game_id: '',
      join_date: new Date().toISOString().split('T')[0],
      stage_role: '未新训',
      status: '正常',
      last_training_date: ''
    })
    setShowModal(true)
  }

  const handleViewDetail = (memberId: number) => {
    setViewingMemberId(memberId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.nickname || !formData.qq) {
      toast.error('昵称和QQ号为必填项')
      return
    }
    
    setSubmitting(true)
    try {
      // 添加新成员（用户名和密码由系统自动设置）
      await memberAPI.create(formData)
      toast.success('成员添加成功')
      
      setShowModal(false)
      loadMembers()
    } catch (error: any) {
      toast.error(error.message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const stageRoles = [
    '未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考',
    '紫夜', '紫夜尖兵', '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师'
  ]
  const specialRoles = ['会长', '执行官', '人事', '总教', '尖兵教官', '工程师', '教官']
  const statusOrder: { [key: string]: number } = { '正常': 1, '请假中': 2, '其他': 3, '已退队': 4 }

  // 阶段排序权重（数字越小越靠前）
  const stageOrder: { [key: string]: number } = {
    '未新训': 1,
    '新训初期': 2,
    '新训一期': 3,
    '新训二期': 4,
    '新训三期': 5,
    '新训准考': 6,
    '紫夜': 7,
    '紫夜尖兵': 8,
    '会长': 9,
    '执行官': 10,
    '人事': 11,
    '总教': 12,
    '尖兵教官': 13,
    '教官': 14,
    '工程师': 15
  }

  const statuses = ['正常', '请假中', '已退队', '其他']
  
  // 可用于修改的状态（只包含正常和其他）
  const editableStatuses = ['正常', '其他']

  // 保存筛选条件到localStorage
  useEffect(() => {
    localStorage.setItem('memberListFilters', JSON.stringify(filters))
  }, [filters])

  // 保存排序配置到localStorage
  useEffect(() => {
    if (sortConfig) {
      localStorage.setItem('memberListSort', JSON.stringify(sortConfig))
    }
  }, [sortConfig])

  // 保存搜索关键词到localStorage
  useEffect(() => {
    localStorage.setItem('memberListSearch', searchQuery)
  }, [searchQuery])

  // 切换筛选项
  const toggleFilter = (filterType: 'stage_role' | 'status', value: string) => {
    setFilters((prev: typeof filters) => {
      const current = prev[filterType]
      const newFilter = current.includes(value)
        ? current.filter((v: string) => v !== value)
        : [...current, value]
      return { ...prev, [filterType]: newFilter }
    })
  }

  // 清空筛选
  const clearFilters = () => {
    setFilters({ stage_role: [], status: [], inverseMode: false })
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
        m.nickname.toLowerCase().includes(query) ||
        m.qq.includes(query) ||
        (m.game_id && m.game_id.toLowerCase().includes(query))
      )
    }

    // 应用筛选（支持正选和反选）
    if (filters.stage_role.length > 0) {
      if (filters.inverseMode) {
        // 反选模式：排除所选项
        filtered = filtered.filter(m => !filters.stage_role.includes(m.stage_role))
      } else {
        // 正选模式：仅显示所选项
        filtered = filtered.filter(m => filters.stage_role.includes(m.stage_role))
      }
    }
    if (filters.status.length > 0) {
      if (filters.inverseMode) {
        // 反选模式：排除所选项
        filtered = filtered.filter(m => !filters.status.includes(m.status))
      } else {
        // 正选模式：仅显示所选项
        filtered = filtered.filter(m => filters.status.includes(m.status))
      }
    }

    // 应用排序
    if (sortConfig) {
      filtered.sort((a, b) => {
        // 如果按阶段排序，使用自定义顺序
        if (sortConfig.key === 'stage_role') {
          const aOrder = stageOrder[a.stage_role] || 999
          const bOrder = stageOrder[b.stage_role] || 999
          const comparison = aOrder - bOrder
          return sortConfig.direction === 'asc' ? comparison : -comparison
        }
        if (sortConfig.key === 'status') {
          const aOrder = statusOrder[a.status] || 999
          const bOrder = statusOrder[b.status] || 999
          const comparison = aOrder - bOrder
          return sortConfig.direction === 'asc' ? comparison : -comparison
        }
        
        // 其他字段使用默认排序
        const aVal = a[sortConfig.key as keyof Member]
        const bVal = b[sortConfig.key as keyof Member]
        
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return sortConfig.direction === 'asc' ? comparison : -comparison
      })
    }

    return filtered
  }

  const filteredMembers = getFilteredAndSortedMembers()

  // 多选处理函数
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMembers.length && filteredMembers.length > 0) {
      // 全部已选中，清空选择
      setSelectedIds(new Set())
    } else {
      // 选中当前页面所有成员
      setSelectedIds(new Set(filteredMembers.map(m => m.id)))
    }
  }

  const toggleSelectOne = (id: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // 当前页面是否全选
  const isAllSelected = filteredMembers.length > 0 && selectedIds.size === filteredMembers.length && 
    filteredMembers.every(m => selectedIds.has(m.id))

  // 批量修改状态
  const batchUpdateStatus = async (newStatus: string) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const memberIds = Array.from(selectedIds)
      for (const id of memberIds) {
        const memberRes = await memberAPI.getById(id)
        const m = memberRes.data
        
        const updateData = {
          nickname: m.nickname,
          qq: m.qq,
          game_id: m.game_id || '',
          join_date: m.join_date ? m.join_date.split('T')[0] : new Date().toISOString().split('T')[0],
          stage_role: m.stage_role,
          status: newStatus,
          last_training_date: m.last_training_date ? m.last_training_date.split('T')[0] : null,
          remarks: m.remarks || ''
        }
        
        await memberAPI.update(id, updateData)
      }
      toast.success(`已将 ${selectedIds.size} 个成员状态改为"${newStatus}"`)
      setBatchActionModal({show: false, type: ''})
      clearSelection()
      loadMembers()
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message || '批量修改状态失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 批量修改角色
  const batchUpdateRole = async (newRole: string) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const memberIds = Array.from(selectedIds)
      for (const id of memberIds) {
        const memberRes = await memberAPI.getById(id)
        const m = memberRes.data
        
        const updateData = {
          nickname: m.nickname,
          qq: m.qq,
          game_id: m.game_id || '',
          join_date: m.join_date ? m.join_date.split('T')[0] : new Date().toISOString().split('T')[0],
          stage_role: newRole,
          status: m.status,
          last_training_date: m.last_training_date ? m.last_training_date.split('T')[0] : null,
          remarks: m.remarks || ''
        }
        
        await memberAPI.update(id, updateData)
      }
      toast.success(`已将 ${selectedIds.size} 个成员角色改为"${newRole}"`)
      setBatchActionModal({show: false, type: ''})
      clearSelection()
      loadMembers()
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message || '批量修改角色失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 同步阶段
  const handleSyncStage = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const memberIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined
      const result = await memberAPI.syncStage(memberIds)
      toast.success(result.message)
      setBatchActionModal({show: false, type: ''})
      if (selectedIds.size > 0) {
        clearSelection()
      }
      await loadMembers()
      
      // 高亮被更新的成员
      if (result.data?.updatedMemberIds && result.data.updatedMemberIds.length > 0) {
        setHighlightedMemberIds(new Set(result.data.updatedMemberIds))
        
        // 3秒后清除高亮
        setTimeout(() => {
          setHighlightedMemberIds(new Set())
        }, 3000)
      }
      
      // 检查是否有新训准考但课程进度不足的成员
      if (result.data?.warningMembers && result.data.warningMembers.length > 0) {
        setWarningModal({show: true, members: result.data.warningMembers})
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || '同步阶段失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 确认高亮警告成员
  const confirmHighlightWarningMembers = () => {
    const warningIds = warningModal.members.map((m: any) => m.id)
    setHighlightedMemberIds(new Set(warningIds))
    setSelectedIds(new Set(warningIds))
    
    // 5秒后清除高亮
    setTimeout(() => {
      setHighlightedMemberIds(new Set())
    }, 5000)
    
    setWarningModal({show: false, members: []})
    toast.info(`已选中 ${warningIds.length} 个需要注意的成员`)
  }

  // 批量重置密码
  const confirmBatchResetPassword = async () => {
    if (submitting) return
    setSubmitting(true)
    setBatchActionModal({show: false, type: ''})
    try {
      const ids = Array.from(selectedIds)
      await memberAPI.batchResetPassword(ids)
      toast.success(`已为 ${ids.length} 个成员重置密码为QQ号`)
      clearSelection()
    } catch (error: any) {
      toast.error(error.message || '批量重置密码失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 批量设置新训日期
  const batchSetTrainingDate = async (date: string) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const memberIds = Array.from(selectedIds)
      for (const id of memberIds) {
        const memberRes = await memberAPI.getById(id)
        const m = memberRes.data
        
        const updateData = {
          nickname: m.nickname,
          qq: m.qq,
          game_id: m.game_id || '',
          join_date: m.join_date ? m.join_date.split('T')[0] : new Date().toISOString().split('T')[0],
          stage_role: m.stage_role,
          status: m.status,
          last_training_date: date,  // 使用传入的date参数
          remarks: m.remarks || ''
        }
        
        await memberAPI.update(id, updateData)
      }
      toast.success(`已为 ${selectedIds.size} 个成员设置新训日期为 ${date}`)
      setBatchActionModal({show: false, type: ''})
      clearSelection()
      loadMembers()
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message || '批量设置新训日期失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 批量退队（添加到退队审批）
  const batchQuit = async () => {
    if (submitting) return
    setSubmitting(true)
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
    const userObj = userStr ? JSON.parse(userStr) : null
    const adminId = userObj?.id
    const adminName = userObj?.name || userObj?.username || '管理员'
    const memberIds = Array.from(selectedIds)
    
    let successCount = 0
    let skipCount = 0
    
    for (const id of memberIds) {
      try {
        // 创建退队审批记录
        await quitAPI.create({
          member_id: id,
          source_admin_id: adminId ? parseInt(adminId) : 1,
          source_admin_name: adminName,
          remarks: '批量退队操作'
        })
        
        // 更新成员状态为已退队
        const memberRes = await memberAPI.getById(id)
        const m = memberRes.data
        
        const updateData = {
          nickname: m.nickname,
          qq: m.qq,
          game_id: m.game_id || '',
          join_date: m.join_date ? m.join_date.split('T')[0] : new Date().toISOString().split('T')[0],
          stage_role: m.stage_role,
          status: '已退队',  // 更新状态为已退队
          last_training_date: m.last_training_date ? m.last_training_date.split('T')[0] : null,
          remarks: m.remarks || ''
        }
        
        await memberAPI.update(id, updateData)
        successCount++
      } catch (error: any) {
        // 如果是重复添加，跳过
        if (error.message?.includes('已有待审批')) {
          skipCount++
        } else {
          toast.error(`处理成员 ID ${id} 时失败: ${error.message}`)
        }
      }
    }
    
    if (successCount > 0) {
      toast.success(`已将 ${successCount} 个成员添加到退队审批并更新状态`)
    }
    if (skipCount > 0) {
      toast.info(`${skipCount} 个成员已存在退队审批，已跳过`)
    }
    
    setBatchActionModal({show: false, type: ''})
    clearSelection()
    loadMembers()
    setSubmitting(false)
  }

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

  const activeFilterCount = filters.stage_role.length + filters.status.length

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">成员列表</h1>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                已选中 <span className="text-purple-400 font-semibold">{selectedIds.size}</span> 项
              </span>
              <button
                onClick={clearSelection}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                清空选择
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
              placeholder="搜索昵称、QQ、游戏ID..."
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
          <button
            onClick={() => {
              clearSelection()
              setBatchActionModal({show: true, type: 'syncStage'})
            }}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            title="同步所有成员阶段"
          >
            <RefreshCw size={20} />
            同步阶段
          </button>
          <button
            onClick={handleAdd}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            添加成员
          </button>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button
                onClick={() => setBatchActionModal({show: true, type: 'quit'})}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
              >
                批量退队
              </button>
              <button
                onClick={() => setBatchActionModal({show: true, type: 'status'})}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
              >
                修改状态
              </button>
              <button
                onClick={() => setBatchActionModal({show: true, type: 'role'})}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
              >
                修改角色
              </button>
              <button
                onClick={() => {
                  setTrainingDate(new Date().toISOString().split('T')[0])
                  setBatchActionModal({show: true, type: 'training'})
                }}
                className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm transition-colors"
              >
                设置新训日期
              </button>
              <button
                onClick={() => setBatchActionModal({show: true, type: 'syncStage'})}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm transition-colors"
              >
                同步阶段
              </button>
              <button
                onClick={() => setBatchActionModal({show: true, type: 'resetPassword'})}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors"
              >
                批量重置密码
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 筛选面板 */}
      {showFilters && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-white font-semibold">筛选条件</h3>
              <button
                onClick={() => setFilters((prev: typeof filters) => ({ ...prev, inverseMode: !prev.inverseMode }))}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  filters.inverseMode
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {filters.inverseMode ? '反选模式（排除所选）' : '正选模式（仅显示所选）'}
              </button>
            </div>
            <button onClick={clearFilters} className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
              清空筛选
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">阶段&角色</label>
              <div className="flex flex-wrap gap-2">
                {stageRoles.map(role => (
                  <button
                    key={role}
                    onClick={() => toggleFilter('stage_role', role)}
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
                    const allSelected = specialRoles.every(r => filters.stage_role.includes(r))
                    if (allSelected) {
                      setFilters((prev: any) => ({ ...prev, stage_role: prev.stage_role.filter((r: string) => !specialRoles.includes(r)) }))
                    } else {
                      setFilters((prev: any) => ({ ...prev, stage_role: [...new Set([...prev.stage_role, ...specialRoles])] }))
                    }
                  }}
                  className={`px-3 py-1 rounded text-sm transition-colors border border-dashed ${
                    specialRoles.every(r => filters.stage_role.includes(r))
                      ? 'bg-green-600 text-white border-green-500'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-500'
                  }`}
                >
                  全部教官
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">状态</label>
              <div className="flex flex-wrap gap-2">
                {statuses.map(status => (
                  <button
                    key={status}
                    onClick={() => toggleFilter('status', status)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      filters.status.includes(status)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
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
                    <button onClick={() => handleSort('nickname')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>昵称</span>
                      {sortConfig?.key === 'nickname' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>QQ号</th>
                  <th>游戏ID</th>
                  <th>
                    <button onClick={() => handleSort('join_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>加入时间</span>
                      {sortConfig?.key === 'join_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('stage_role')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>阶段&角色</span>
                      {sortConfig?.key === 'stage_role' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>状态</span>
                      {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('last_training_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>最后新训日期</span>
                      {sortConfig?.key === 'last_training_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr 
                    key={member.id}
                    className={highlightedMemberIds.has(member.id) ? 'highlighted-row' : ''}
                  >
                    <td>
                      <button
                        onClick={() => toggleSelectOne(member.id)}
                        className="flex items-center justify-center hover:text-purple-400 transition-colors"
                      >
                        {selectedIds.has(member.id) ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
                      </button>
                    </td>
                    <td>{member.nickname}</td>
                    <td>{member.qq}</td>
                    <td>{member.game_id || '-'}</td>
                    <td>{formatDate(member.join_date)}</td>
                    <td>
                      <span className={`status-badge ${getRoleColor(member.stage_role)}`}>
                        {member.stage_role}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${
                        member.status === '正常' ? 'bg-green-600/20 text-green-300' :
                        member.status === '请假中' ? 'bg-yellow-600/20 text-yellow-300' :
                        member.status === '已退队' ? 'bg-red-600/20 text-red-300' :
                        'bg-gray-600/20 text-gray-300'
                      }`}>
                        {member.status}
                      </span>
                    </td>
                    <td>{formatDate(member.last_training_date)}</td>
                    <td>
                      <button
                        onClick={() => handleViewDetail(member.id)}
                        className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                        title="查看详情"
                      >
                        <Eye size={18} />
                        <span className="text-sm">查看详情</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 添加/编辑模态框 */}
      {showModal && !viewingMemberId && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false)
          }}
        >
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">
              添加成员
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
                <p className="text-blue-300 text-xs">
                  💡 <strong>登录信息自动设置：</strong>用户名=昵称，密码=QQ号。成员可使用昵称和QQ号登录学员端。
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">昵称 *</label>
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({...formData, nickname: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  required
                  placeholder="成员昵称（将作为登录用户名）"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">QQ号 *</label>
                <input
                  type="text"
                  value={formData.qq}
                  onChange={(e) => setFormData({...formData, qq: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  required
                  placeholder="QQ号（将作为默认密码）"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">游戏ID</label>
                <input
                  type="text"
                  value={formData.game_id}
                  onChange={(e) => setFormData({...formData, game_id: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">加入时间</label>
                <input
                  type="date"
                  value={formData.join_date}
                  onChange={(e) => setFormData({...formData, join_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">阶段&角色</label>
                <select
                  value={formData.stage_role}
                  onChange={(e) => setFormData({...formData, stage_role: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-10 py-2 text-white"
                >
                  {stageRoles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-10 py-2 text-white"
                >
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">最后新训日期</label>
                <input
                  type="date"
                  value={formData.last_training_date}
                  onChange={(e) => setFormData({...formData, last_training_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? '添加中...' : '添加'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 批量退队确认模态框 */}
      {batchActionModal.show && batchActionModal.type === 'quit' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">批量退队确认</h2>
            <p className="text-gray-400 text-sm mb-4">
              即将为 <span className="text-red-400 font-bold">{selectedIds.size}</span> 个成员添加退队审批记录，并将状态改为"已退队"
            </p>
            <p className="text-yellow-400 text-xs mb-4">
              ⚠️ 此操作会立即更改成员状态，请谨慎操作！
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={batchQuit}
                disabled={submitting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? '处理中...' : '确认退队'}
              </button>
              <button
                onClick={() => setBatchActionModal({show: false, type: ''})}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量修改状态模态框 */}
      {batchActionModal.show && batchActionModal.type === 'status' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">批量修改状态</h2>
            <p className="text-gray-400 text-sm mb-4">将为 {selectedIds.size} 个成员修改状态</p>
            <p className="text-yellow-400 text-xs mb-4">
              ⚠️ 只能修改为"正常"或"其他"状态
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">选择新状态</label>
                <div className="grid grid-cols-2 gap-2">
                  {editableStatuses.map(status => (
                    <button
                      key={status}
                      onClick={() => batchUpdateStatus(status)}
                      disabled={submitting}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center justify-center gap-1"
                    >
                      {submitting && <Loader2 size={14} className="animate-spin" />}
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={() => setBatchActionModal({show: false, type: ''})}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量修改角色模态框 */}
      {batchActionModal.show && batchActionModal.type === 'role' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">批量修改阶段&角色</h2>
            <p className="text-gray-400 text-sm mb-4">将为 {selectedIds.size} 个成员修改阶段&角色</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">选择新角色</label>
                <div className="grid grid-cols-2 gap-2">
                  {stageRoles.map(role => (
                    <button
                      key={role}
                      onClick={() => batchUpdateRole(role)}
                      disabled={submitting}
                      className={`px-3 py-2 rounded text-sm transition-colors ${getRoleColor(role)} hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1`}
                    >
                      {submitting && <Loader2 size={12} className="animate-spin" />}
                      {role}
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={() => setBatchActionModal({show: false, type: ''})}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量设置新训日期模态框 */}
      {batchActionModal.show && batchActionModal.type === 'training' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">批量设置新训日期</h2>
            <p className="text-gray-400 text-sm mb-4">将为 {selectedIds.size} 个成员设置新训日期</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">选择新训日期</label>
                <input
                  type="date"
                  value={trainingDate}
                  onChange={(e) => setTrainingDate(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
                <p className="text-xs text-gray-400 mt-1">
                  选择的日期将作为这些成员的最后新训日期
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => batchSetTrainingDate(trainingDate)}
                  disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? '设置中...' : '确认设置'}
                </button>
                <button
                  onClick={() => setBatchActionModal({show: false, type: ''})}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 同步阶段确认对话框 */}
      {batchActionModal.show && batchActionModal.type === 'syncStage' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">同步阶段</h2>
            <p className="text-gray-400 text-sm mb-4">
              {selectedIds.size > 0 ? (
                <>即将为 <span className="text-cyan-400 font-bold">{selectedIds.size}</span> 个成员同步阶段</>
              ) : (
                <>即将为所有成员同步阶段</>
              )}
            </p>
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
              <p className="text-blue-300 text-xs leading-relaxed">
                💡 <strong>同步规则：</strong><br/>
                • 至少上过一节课 → 新训初期<br/>
                • 第一部分(1.X)全部完成 → 新训一期<br/>
                • 第二部分(2.X)全部完成 → 新训二期<br/>
                • 第三部分(3.X)全部完成 → 新训三期<br/>
                • 按最前面未完成的部分判断阶段<br/>
                • 特殊职位(新训准考、紫夜及以上)不会被调整<br/>
                • 新训准考但未完成前四部分的会提示降级
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleSyncStage}
                disabled={submitting}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? '同步中...' : '确认同步'}
              </button>
              <button
                onClick={() => setBatchActionModal({show: false, type: ''})}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量重置密码确认对话框 */}
      {batchActionModal.show && batchActionModal.type === 'resetPassword' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">批量重置密码</h2>
            <p className="text-gray-400 text-sm mb-4">
              即将为 <span className="text-orange-400 font-bold">{selectedIds.size}</span> 个成员重置密码
            </p>
            <p className="text-blue-400 text-xs mb-4">
              💡 密码将被重置为该成员的QQ号，成员可使用昵称和QQ号登录学员端
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={confirmBatchResetPassword}
                disabled={submitting}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? '重置中...' : '确认重置'}
              </button>
              <button
                onClick={() => setBatchActionModal({show: false, type: ''})}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
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
              💡 这些成员可能需要降级调整。是否在成员列表中高亮标出这些人？
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={confirmHighlightWarningMembers}
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

      {/* 成员详情模态框 */}
      {viewingMemberId && (
        <MemberDetail
          memberId={viewingMemberId}
          onClose={() => setViewingMemberId(null)}
          onUpdate={loadMembers}
        />
      )}
    </div>
  )
}
