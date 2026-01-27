import { useState, useEffect } from 'react'
import { reminderAPI, quitAPI, memberAPI } from '../../utils/api'
import { RefreshCw, Settings, Edit, Filter, ChevronUp, ChevronDown, Search, X, CheckSquare, Square, UserMinus } from 'lucide-react'
import { toast } from '../../utils/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import { formatDate } from '../../utils/dateFormat'

interface ReminderItem {
  id: number
  member_id: number
  member_name: string
  stage_role: string
  last_training_date: string | null
  days_without_training: number
  custom_timeout_days: number | null
  days_until_timeout: number
}

export default function ReminderList() {
  const [items, setItems] = useState<ReminderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [timeoutDays, setTimeoutDays] = useState(7)
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  const [editingItem, setEditingItem] = useState<ReminderItem | null>(null)
  const [customTimeout, setCustomTimeout] = useState<number | null>(null)

  // 搜索、筛选、排序、多选
  const [showFilters, setShowFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('reminderSearch') || '')
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('reminderFilters')
    const defaultFilters = { 
      timeout_status: [] as string[],
      has_custom_timeout: [] as string[],
      stage_role: [] as string[],
      inverseMode: false 
    }
    if (saved) {
      const parsed = JSON.parse(saved)
      // 确保旧数据也有新字段
      return {
        ...defaultFilters,
        ...parsed,
        stage_role: parsed.stage_role || []
      }
    }
    return defaultFilters
  })
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('reminderSort')
    return saved ? JSON.parse(saved) : null
  })

  useEffect(() => {
    const load = async () => {
      await loadTimeoutDays()
      await loadItems()
    }
    load()
  }, [])

  useEffect(() => { localStorage.setItem('reminderFilters', JSON.stringify(filters)) }, [filters])
  useEffect(() => { if (sortConfig) localStorage.setItem('reminderSort', JSON.stringify(sortConfig)) }, [sortConfig])
  useEffect(() => { localStorage.setItem('reminderSearch', searchQuery) }, [searchQuery])

  const loadTimeoutDays = async () => {
    try {
      const response = await reminderAPI.getTimeoutDays()
      setTimeoutDays(parseInt(response.data.setting_value))
    } catch (error: any) {
      console.error('获取超时天数设置失败:', error)
      // 如果获取失败，使用默认值7
    }
  }

  const loadItems = async () => {
    try {
      const response = await reminderAPI.getAll()
      setItems(response.data)
    } catch (error: any) {
      toast.error(error.message || '加载催促名单失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleFilter = (type: 'timeout_status' | 'has_custom_timeout' | 'stage_role', value: string) => {
    setFilters((prev: typeof filters) => {
      const current = prev[type]
      const updated = current.includes(value) ? current.filter((v: string) => v !== value) : [...current, value]
      return { ...prev, [type]: updated }
    })
  }

  const clearFilters = () => setFilters({ timeout_status: [], has_custom_timeout: [], stage_role: [], inverseMode: false })

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }

  const getTimeoutStatus = (item: ReminderItem) => {
    if (item.days_until_timeout > 0) return '未超时'
    if (item.days_until_timeout === 0) return '今天超时'
    return '已超时'
  }

  const getFilteredAndSortedItems = () => {
    let filtered = [...items]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item =>
        item.member_name.toLowerCase().includes(query)
      )
    }

    if (filters.timeout_status.length > 0) {
      if (filters.inverseMode) {
        filtered = filtered.filter(item => !filters.timeout_status.includes(getTimeoutStatus(item)))
      } else {
        filtered = filtered.filter(item => filters.timeout_status.includes(getTimeoutStatus(item)))
      }
    }

    if (filters.has_custom_timeout.length > 0) {
      if (filters.inverseMode) {
        filtered = filtered.filter(item => {
          const hasCustom = item.custom_timeout_days ? '有自定义' : '无自定义'
          return !filters.has_custom_timeout.includes(hasCustom)
        })
      } else {
        filtered = filtered.filter(item => {
          const hasCustom = item.custom_timeout_days ? '有自定义' : '无自定义'
          return filters.has_custom_timeout.includes(hasCustom)
        })
      }
    }

    if (filters.stage_role.length > 0) {
      if (filters.inverseMode) {
        filtered = filtered.filter(item => !filters.stage_role.includes(item.stage_role))
      } else {
        filtered = filtered.filter(item => filters.stage_role.includes(item.stage_role))
      }
    }

    if (sortConfig) {
      filtered.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key]
        const bVal = (b as any)[sortConfig.key]
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return sortConfig.direction === 'asc' ? comparison : -comparison
      })
    }

    return filtered
  }

  const filteredItems = getFilteredAndSortedItems()

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map(item => item.id)))
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

  const clearSelection = () => setSelectedIds(new Set())

  const isAllSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length && filteredItems.every(item => selectedIds.has(item.id))

  const [batchTimeoutModal, setBatchTimeoutModal] = useState(false)
  const [batchTimeoutValue, setBatchTimeoutValue] = useState<number | null>(null)

  const handleBatchUpdateTimeout = () => {
    if (selectedIds.size === 0) return
    setBatchTimeoutValue(timeoutDays)
    setBatchTimeoutModal(true)
  }

  const confirmBatchUpdateTimeout = async () => {
    setBatchTimeoutModal(false)
    try {
      const ids = Array.from(selectedIds)
      await reminderAPI.batchUpdateTimeout(ids, batchTimeoutValue)
      toast.success(batchTimeoutValue ? `已为 ${ids.length} 个成员设置自定义超时天数为 ${batchTimeoutValue} 天` : `已为 ${ids.length} 个成员恢复使用全局超时天数设置`)
      clearSelection()
      await loadItems()
    } catch (error: any) {
      toast.error(error.message || '批量修改失败')
    }
  }

  const handleAutoUpdate = () => {
    setConfirmDialog({show: true, type: 'update'})
  }

  const confirmUpdate = async () => {
    setConfirmDialog({show: false, type: ''})
    setUpdating(true)
    try {
      await reminderAPI.autoUpdate(timeoutDays)
      toast.success('催促名单更新成功')
      await loadItems()
    } catch (error: any) {
      toast.error(error.message || '更新失败')
    } finally {
      setUpdating(false)
    }
  }

  // 批量添加到退队审批
  const handleBatchAddToQuit = async () => {
    if (selectedIds.size === 0) return
    
    const adminId = localStorage.getItem('userId')
    const adminName = localStorage.getItem('userName') || '管理员'
    
    try {
      const selectedItems = items.filter(item => selectedIds.has(item.id))
      const timeoutItems = selectedItems.filter(item => item.days_until_timeout < 0)
      
      if (timeoutItems.length === 0) {
        toast.warning('所选成员中没有已超时的成员')
        return
      }
      
      let successCount = 0
      let skipCount = 0
      
      for (const item of timeoutItems) {
        try {
          await quitAPI.create({
            member_id: item.member_id,
            source_admin_id: adminId ? parseInt(adminId) : 1,
            source_admin_name: adminName,
            remarks: `长期未训练（${item.days_without_training}天，超时${Math.abs(item.days_until_timeout)}天）`
          })
          
          // 更新成员状态为已退队
          try {
            const memberRes = await memberAPI.getById(item.member_id)
            const m = memberRes.data
            
            await memberAPI.update(item.member_id, {
              nickname: m.nickname,
              qq: m.qq,
              game_id: m.game_id || '',
              join_date: m.join_date ? m.join_date.split('T')[0] : new Date().toISOString().split('T')[0],
              stage_role: m.stage_role,
              status: '已退队',
              last_training_date: m.last_training_date ? m.last_training_date.split('T')[0] : null,
              remarks: m.remarks || ''
            })
          } catch (updateError: any) {
            console.error('更新成员状态失败:', updateError)
          }
          
          // 添加成功后，从催促名单删除
          await reminderAPI.delete(item.id)
          successCount++
        } catch (error: any) {
          // 已经存在退队审批的成员，直接从催促名单删除
          if (error.message?.includes('已有待审批')) {
            await reminderAPI.delete(item.id)
          }
          skipCount++
        }
      }
      
      if (successCount > 0) {
        toast.success(`已将 ${successCount} 名超时成员添加到退队审批并更新状态`)
      }
      if (skipCount > 0) {
        toast.info(`${skipCount} 名成员已存在退队审批，已跳过`)
      }
      
      clearSelection()
      // 刷新催促名单
      await loadItems()
    } catch (error: any) {
      toast.error(error.message || '添加退队审批失败')
    }
  }

  // 自动添加所有超时成员到退队审批
  const handleAutoAddTimeoutToQuit = async () => {
    const timeoutItems = items.filter(item => item.days_until_timeout < 0)
    
    if (timeoutItems.length === 0) {
      toast.info('当前没有已超时的成员')
      return
    }
    
    setConfirmDialog({
      show: true, 
      type: 'auto-quit',
      data: { count: timeoutItems.length }
    })
  }

  const confirmAutoAddToQuit = async () => {
    setConfirmDialog({show: false, type: ''})
    
    const adminId = localStorage.getItem('userId')
    const adminName = localStorage.getItem('userName') || '管理员'
    const timeoutItems = items.filter(item => item.days_until_timeout < 0)
    
    try {
      let successCount = 0
      let skipCount = 0
      
      for (const item of timeoutItems) {
        try {
          await quitAPI.create({
            member_id: item.member_id,
            source_admin_id: adminId ? parseInt(adminId) : 1,
            source_admin_name: adminName,
            remarks: `长期未训练（${item.days_without_training}天，超时${Math.abs(item.days_until_timeout)}天）`
          })
          
          // 更新成员状态为已退队
          try {
            const memberRes = await memberAPI.getById(item.member_id)
            const m = memberRes.data
            
            await memberAPI.update(item.member_id, {
              nickname: m.nickname,
              qq: m.qq,
              game_id: m.game_id || '',
              join_date: m.join_date ? m.join_date.split('T')[0] : new Date().toISOString().split('T')[0],
              stage_role: m.stage_role,
              status: '已退队',
              last_training_date: m.last_training_date ? m.last_training_date.split('T')[0] : null,
              remarks: m.remarks || ''
            })
          } catch (updateError: any) {
            console.error('更新成员状态失败:', updateError)
          }
          
          // 添加成功后，从催促名单删除
          await reminderAPI.delete(item.id)
          successCount++
        } catch (error: any) {
          // 已经存在退队审批的成员，直接从催促名单删除
          if (error.message?.includes('已有待审批')) {
            await reminderAPI.delete(item.id)
          }
          skipCount++
        }
      }
      
      if (successCount > 0) {
        toast.success(`已将 ${successCount} 名超时成员添加到退队审批并更新状态`)
      }
      if (skipCount > 0) {
        toast.info(`${skipCount} 名成员已存在退队审批，已跳过`)
      }
      
      // 刷新催促名单
      await loadItems()
    } catch (error: any) {
      toast.error(error.message || '添加退队审批失败')
    }
  }


  const handleEditTimeout = (item: ReminderItem) => {
    setEditingItem(item)
    setCustomTimeout(item.custom_timeout_days || timeoutDays)
  }

  const handleSaveTimeout = async () => {
    if (!editingItem) return
    
    try {
      await reminderAPI.updateTimeout(editingItem.id, customTimeout)
      toast.success(customTimeout ? `已设置自定义超时天数为 ${customTimeout} 天` : '已恢复使用全局超时天数设置')
      setEditingItem(null)
      await loadItems()
    } catch (error: any) {
      toast.error(error.message || '设置失败')
    }
  }

  const activeFilterCount = filters.timeout_status.length + filters.has_custom_timeout.length + filters.stage_role.length

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">催促名单</h1>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                已选中 <span className="text-purple-400 font-semibold">{selectedIds.size}</span> 项
              </span>
              <button onClick={clearSelection} className="text-sm text-gray-400 hover:text-white transition-colors">
                清空选择
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
              placeholder="搜索成员..."
              className="bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-gray-400 w-64 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${showFilters ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            <Filter size={20} />
            筛选{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Settings size={20} />
            设置超时天数
          </button>
          <button
            onClick={handleAutoAddTimeoutToQuit}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <UserMinus size={20} />
            处理超时成员
          </button>
          <button
            onClick={handleAutoUpdate}
            disabled={updating}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={20} className={updating ? 'animate-spin' : ''} />
            {updating ? '更新中...' : '更新名单'}
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button onClick={handleBatchAddToQuit} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors flex items-center gap-1">
                <UserMinus size={16} />
                添加到退队审批
              </button>
              <button onClick={handleBatchUpdateTimeout} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors">
                批量修改超时天数
              </button>
            </div>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-white font-semibold">筛选条件</h3>
              <button
                onClick={() => setFilters((prev: typeof filters) => ({ ...prev, inverseMode: !prev.inverseMode }))}
                className={`px-3 py-1 rounded text-xs transition-colors ${filters.inverseMode ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {filters.inverseMode ? '反选模式' : '正选模式'}
              </button>
            </div>
            <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white transition-colors">
              清空筛选
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">超时状态</label>
              <div className="flex flex-wrap gap-2">
                {['未超时', '今天超时', '已超时'].map(status => (
                  <button
                    key={status}
                    onClick={() => toggleFilter('timeout_status', status)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${filters.timeout_status.includes(status) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">自定义超时设置</label>
              <div className="flex flex-wrap gap-2">
                {['有自定义', '无自定义'].map(type => (
                  <button
                    key={type}
                    onClick={() => toggleFilter('has_custom_timeout', type)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${filters.has_custom_timeout.includes(type) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">阶段&角色</label>
              <div className="flex flex-wrap gap-2">
                {['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考'].map(stage => (
                  <button
                    key={stage}
                    onClick={() => toggleFilter('stage_role', stage)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${filters.stage_role.includes(stage) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {stage}
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
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>暂无需要催促的成员</p>
            <p className="text-sm mt-2">点击"更新名单"自动检测超过{timeoutDays}天未训练的成员</p>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <button onClick={toggleSelectAll} className="flex items-center justify-center w-full hover:text-purple-400 transition-colors">
                      {isAllSelected ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('member_name')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>昵称</span>
                      {sortConfig?.key === 'member_name' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('stage_role')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>阶段&角色</span>
                      {sortConfig?.key === 'stage_role' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('last_training_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>最后新训日期</span>
                      {sortConfig?.key === 'last_training_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('days_without_training')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>未训天数</span>
                      {sortConfig?.key === 'days_without_training' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('days_until_timeout')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>距离超时</span>
                      {sortConfig?.key === 'days_until_timeout' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>超时天数设置</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button onClick={() => toggleSelectOne(item.id)} className="flex items-center justify-center hover:text-purple-400 transition-colors">
                        {selectedIds.has(item.id) ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
                      </button>
                    </td>
                    <td>{item.member_name}</td>
                    <td>
                      <span className="status-badge bg-blue-600/20 text-blue-300">
                        {item.stage_role}
                      </span>
                    </td>
                    <td>
                      {item.last_training_date ? formatDate(item.last_training_date) : '从未训练'}
                    </td>
                    <td>
                      <span className={`status-badge ${
                        item.days_without_training >= 30 
                          ? 'bg-red-600/20 text-red-300'
                          : item.days_without_training >= 14
                          ? 'bg-orange-600/20 text-orange-300'
                          : 'bg-yellow-600/20 text-yellow-300'
                      }`}>
                        {item.days_without_training} 天
                      </span>
                    </td>
                    <td>
                      {item.days_until_timeout > 0 ? (
                        <span className={`status-badge ${
                          item.days_until_timeout >= 3
                            ? 'bg-green-600/20 text-green-300'
                            : item.days_until_timeout >= 1
                            ? 'bg-yellow-600/20 text-yellow-300'
                            : 'bg-orange-600/20 text-orange-300'
                        }`}>
                          还剩 {item.days_until_timeout} 天
                        </span>
                      ) : item.days_until_timeout === 0 ? (
                        <span className="status-badge bg-orange-600/20 text-orange-300">
                          今天超时
                        </span>
                      ) : (
                        <span className="status-badge bg-red-600/20 text-red-300">
                          已超时 {Math.abs(item.days_until_timeout)} 天
                        </span>
                      )}
                    </td>
                    <td>
                      {item.custom_timeout_days ? (
                        <span className="text-purple-400 text-sm">
                          自定义：{item.custom_timeout_days} 天
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">
                          全局：{timeoutDays} 天
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleEditTimeout(item)}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        title="设置超时天数"
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 设置超时天数模态框 */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">设置超时天数</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  全局超时天数设置
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={timeoutDays}
                  onChange={(e) => setTimeoutDays(parseInt(e.target.value) || 7)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
                <p className="text-xs text-gray-400 mt-1">
                  这是全局设置，所有管理员看到的超时标准都将统一为该天数
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={async () => {
                    try {
                      await reminderAPI.updateTimeoutDays(timeoutDays)
                      setShowSettings(false)
                      toast.success(`已设置全局超时天数为 ${timeoutDays} 天`)
                      await loadItems()  // 重新加载数据以更新距离超时时间
                    } catch (error: any) {
                      toast.error('设置失败: ' + error.message)
                    }
                  }}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                >
                  确定
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 更新确认对话框 */}
      {confirmDialog.show && confirmDialog.type === 'update' && (
        <ConfirmDialog
          title="更新催促名单"
          message={`确定要更新催促名单吗？系统将自动计算超过 ${timeoutDays} 天未训练的成员。`}
          confirmText="更新"
          cancelText="取消"
          type="info"
          onConfirm={confirmUpdate}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {/* 自动处理超时成员确认对话框 */}
      {confirmDialog.show && confirmDialog.type === 'auto-quit' && (
        <ConfirmDialog
          title="自动添加超时成员到退队审批"
          message={`检测到 ${confirmDialog.data?.count || 0} 名已超时的成员。确定要将这些成员添加到退队审批吗？`}
          confirmText="确定添加"
          cancelText="取消"
          type="warning"
          onConfirm={confirmAutoAddToQuit}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {/* 批量修改超时天数模态框 */}
      {batchTimeoutModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">批量修改超时天数</h2>
            <p className="text-gray-400 text-sm mb-4">
              为选中的 <span className="text-purple-400 font-semibold">{selectedIds.size}</span> 个成员设置自定义超时天数
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  超时天数（天）
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={batchTimeoutValue || ''}
                  onChange={(e) => setBatchTimeoutValue(parseInt(e.target.value) || null)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  placeholder={`留空则使用全局设置（${timeoutDays}天）`}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {batchTimeoutValue 
                    ? `将为这些成员单独使用 ${batchTimeoutValue} 天作为超时标准`
                    : `将使用全局超时天数设置（${timeoutDays} 天）`
                  }
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={confirmBatchUpdateTimeout}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                >
                  保存
                </button>
                <button
                  onClick={() => setBatchTimeoutModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑自定义超时天数模态框 */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">设置超时天数</h2>
            <p className="text-gray-400 text-sm mb-4">
              为 <span className="text-purple-400 font-semibold">{editingItem.member_name}</span> 设置自定义超时天数
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  超时天数（天）
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={customTimeout || ''}
                  onChange={(e) => setCustomTimeout(parseInt(e.target.value) || null)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  placeholder={`留空则使用全局设置（${timeoutDays}天）`}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {customTimeout 
                    ? `将为该成员单独使用 ${customTimeout} 天作为超时标准`
                    : `将使用全局超时天数设置（${timeoutDays} 天）`
                  }
                </p>
              </div>

              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                <p className="text-blue-300 text-xs">
                  💡 提示：设置自定义超时天数后，该成员不受全局超时天数变更影响。清空该字段可恢复使用全局设置。
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSaveTimeout}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                >
                  保存
                </button>
                <button
                  onClick={() => setEditingItem(null)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
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
