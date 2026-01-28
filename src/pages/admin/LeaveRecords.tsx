import { useEffect, useState } from 'react'
import { leaveAPI, memberAPI } from '../../utils/api'
import { Plus, Edit, Trash2, Filter, ChevronUp, ChevronDown, Search, X, CheckSquare, Square, Loader2 } from 'lucide-react'
import { formatDate, toInputDate } from '../../utils/dateFormat'
import { toast } from '../../utils/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import SearchableSelect from '../../components/SearchableSelect'
import DateInput from '../../components/DateInput'

interface LeaveRecord {
  id: number
  member_id: number
  member_name: string
  qq: string
  reason: string
  start_date: string
  end_date: string
  total_days: number
  remaining_days?: number
  status: '请假中' | '已结束'
}

interface MemberOption {
  id: number
  nickname: string
  qq: string
}

interface LeaveForm {
  member_id: string
  reason: string
  start_date: string
  end_date: string
  status: '请假中' | '已结束'
}

const defaultForm = (): LeaveForm => ({
  member_id: '',
  reason: '',
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0],
  status: '请假中'
})

export default function LeaveRecords() {
  const [records, setRecords] = useState<LeaveRecord[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LeaveRecord | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  const [formData, setFormData] = useState<LeaveForm>(defaultForm())

  // 搜索、筛选、排序、多选
  const [showFilters, setShowFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('leaveSearch') || '')
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('leaveFilters')
    return saved ? JSON.parse(saved) : { status: [] as string[], inverseMode: false }
  })
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('leaveSort')
    return saved ? JSON.parse(saved) : null
  })

  const statuses = ['请假中', '已结束']

  useEffect(() => {
    const loadData = async () => {
      await loadRecords()
      await loadMembers()
    }
    loadData()
  }, [])

  useEffect(() => { localStorage.setItem('leaveFilters', JSON.stringify(filters)) }, [filters])
  useEffect(() => { if (sortConfig) localStorage.setItem('leaveSort', JSON.stringify(sortConfig)) }, [sortConfig])
  useEffect(() => { localStorage.setItem('leaveSearch', searchQuery) }, [searchQuery])

  const loadRecords = async () => {
    setLoading(true)
    try {
      // 先自动更新过期的请假记录
      await leaveAPI.autoUpdate()
      // 再获取所有记录
      const response = await leaveAPI.getAll()
      setRecords(response.data || [])
    } catch (error: any) {
      toast.error(error.message || '加载请假记录失败')
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    try {
      const response = await memberAPI.getAll()
      const data = (response.data || []) as any[]
      setMembers(data.filter((item) => item.status !== '已退队'))
    } catch (error: any) {
      toast.error(error.message || '加载成员列表失败')
    }
  }

  const toggleFilter = (type: 'status', value: string) => {
    setFilters((prev: typeof filters) => {
      const current = prev[type]
      const updated = current.includes(value) ? current.filter((v: string) => v !== value) : [...current, value]
      return { ...prev, [type]: updated }
    })
  }

  const clearFilters = () => setFilters({ status: [], inverseMode: false })

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }

  const getFilteredAndSortedRecords = () => {
    let filtered = [...records]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(r =>
        r.member_name.toLowerCase().includes(query) ||
        r.qq.includes(query) ||
        (r.reason && r.reason.toLowerCase().includes(query))
      )
    }

    if (filters.status.length > 0) {
      if (filters.inverseMode) {
        filtered = filtered.filter(r => !filters.status.includes(r.status))
      } else {
        filtered = filtered.filter(r => filters.status.includes(r.status))
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

  const filteredRecords = getFilteredAndSortedRecords()

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredRecords.map(r => r.id)))
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

  const isAllSelected = filteredRecords.length > 0 && selectedIds.size === filteredRecords.length && filteredRecords.every(r => selectedIds.has(r.id))

  const batchDelete = () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({show: true, type: 'batchDelete'})
  }

  const confirmBatchDelete = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const ids = Array.from(selectedIds)
      for (const id of ids) {
        await leaveAPI.delete(id)
      }
      toast.success(`已删除 ${ids.length} 条请假记录`)
      clearSelection()
      await loadRecords()
    } catch (error: any) {
      toast.error(error.message || '批量删除失败')
    }
  }

  const batchEndLeave = () => {
    if (selectedIds.size === 0) return
    const selectedRecords = records.filter(r => selectedIds.has(r.id))
    const ongoingLeaves = selectedRecords.filter(r => r.status === '请假中')
    if (ongoingLeaves.length === 0) {
      toast.error('选中的记录中没有进行中的请假')
      return
    }
    setConfirmDialog({show: true, type: 'batchEndLeave'})
  }

  const confirmBatchEndLeave = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const ids = Array.from(selectedIds)
      const selectedRecords = records.filter(r => ids.includes(r.id) && r.status === '请假中')
      
      for (const record of selectedRecords) {
        await leaveAPI.update(record.id, {
          reason: record.reason,
          start_date: record.start_date.split('T')[0],
          end_date: record.end_date.split('T')[0],
          status: '已结束'
        })
      }
      toast.success(`已结束 ${selectedRecords.length} 个请假记录`)
      clearSelection()
      await loadRecords()
    } catch (error: any) {
      toast.error(error.message || '批量结束请假失败')
    }
  }

  const getAvailableMembers = () => {
    const leavingMemberIds = records
      .filter(r => r.status === '请假中')
      .map(r => r.member_id)
    return members.filter(m => !leavingMemberIds.includes(m.id))
  }

  const openCreateModal = () => {
    setEditingRecord(null)
    setFormData(defaultForm())
    setShowModal(true)
  }

  const openEditModal = (record: LeaveRecord) => {
    setEditingRecord(record)
    setFormData({
      member_id: record.member_id.toString(),
      reason: record.reason || '',
      start_date: toInputDate(record.start_date),
      end_date: toInputDate(record.end_date),
      status: record.status
    })
    setShowModal(true)
  }

  const handleEndLeave = () => {
    setConfirmDialog({show: true, type: 'endLeave'})
  }

  const confirmEndLeave = async () => {
    setConfirmDialog({show: false, type: ''})
    if (!editingRecord) return
    try {
      await leaveAPI.update(editingRecord.id, {
        reason: formData.reason,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: '已结束'
      })
      setShowModal(false)
      await loadRecords()
      toast.success('请假已结束')
    } catch (error: any) {
      toast.error(error?.message || '操作失败')
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      if (editingRecord) {
        await leaveAPI.update(editingRecord.id, {
          reason: formData.reason,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: formData.status
        })
        toast.success('请假记录更新成功')
      } else {
        await leaveAPI.create(formData)
        toast.success('请假记录添加成功')
      }
      setShowModal(false)
      await loadRecords()
    } catch (error: any) {
      toast.error(error?.message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (record: LeaveRecord) => {
    setConfirmDialog({show: true, type: 'delete', data: record})
  }

  const confirmDelete = async () => {
    const record = confirmDialog.data
    setConfirmDialog({show: false, type: ''})
    if (!record) return
    try {
      await leaveAPI.delete(record.id)
      toast.success('请假记录删除成功')
      await loadRecords()
    } catch (error: any) {
      toast.error(error?.message || '删除失败')
    }
  }

  const activeFilterCount = filters.status.length

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">请假记录</h1>
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
              placeholder="搜索成员、QQ、原因..."
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
          <button onClick={openCreateModal} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
            <Plus size={20} />
            添加请假
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button onClick={batchEndLeave} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors">
                批量结束请假
              </button>
              <button onClick={batchDelete} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors">
                批量删除
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
          <div>
            <label className="text-sm text-gray-400 mb-2 block">请假状态</label>
            <div className="flex flex-wrap gap-2">
              {statuses.map(status => (
                <button
                  key={status}
                  onClick={() => toggleFilter('status', status)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${filters.status.includes(status) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  {status}
                </button>
              ))}
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
                    <button onClick={toggleSelectAll} className="flex items-center justify-center w-full hover:text-purple-400 transition-colors">
                      {isAllSelected ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('member_name')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>成员</span>
                      {sortConfig?.key === 'member_name' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('qq')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>QQ号</span>
                      {sortConfig?.key === 'qq' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('start_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>开始日期</span>
                      {sortConfig?.key === 'start_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('end_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>结束日期</span>
                      {sortConfig?.key === 'end_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th className="w-40">天数/进度</th>
                  <th>
                    <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>状态</span>
                      {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <button onClick={() => toggleSelectOne(record.id)} className="flex items-center justify-center hover:text-purple-400 transition-colors">
                        {selectedIds.has(record.id) ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
                      </button>
                    </td>
                    <td>{record.member_name}</td>
                    <td>{record.qq}</td>
                    <td>{formatDate(record.start_date)}</td>
                    <td>{formatDate(record.end_date)}</td>
                    <td>
                      {record.status === '请假中' ? (
                        <div className="space-y-1 min-w-[140px]">
                          <div className="flex items-center gap-2 text-gray-300 text-xs">
                            <span>剩余 {record.remaining_days ?? 0} 天</span>
                            <span className="text-gray-500">/</span>
                            <span>共 {record.total_days} 天</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                ((record.remaining_days ?? 0) / record.total_days) > 0.5
                                  ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                                  : ((record.remaining_days ?? 0) / record.total_days) > 0.2
                                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                                  : 'bg-gradient-to-r from-orange-500 to-red-500'
                              }`}
                              style={{
                                width: `${Math.max(0, Math.min(100 - ((record.remaining_days ?? 0) / record.total_days) * 100, 100))}%`
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">已结束（共 {record.total_days} 天）</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          record.status === '请假中'
                            ? 'bg-yellow-600/20 text-yellow-300'
                            : 'bg-gray-600/20 text-gray-300'
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(record)} className="text-blue-400 hover:text-blue-300 transition-colors" title="编辑">
                          <Edit size={18} />
                        </button>
                        <button onClick={() => handleDelete(record)} className="text-red-400 hover:text-red-300 transition-colors" title="删除">
                          <Trash2 size={18} />
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingRecord ? '编辑请假记录' : '添加请假记录'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingRecord && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">成员 *</label>
                  <SearchableSelect
                    options={getAvailableMembers().map(member => ({
                      id: member.id,
                      label: member.nickname,
                      subLabel: `(${member.qq})`
                    }))}
                    value={formData.member_id}
                    onChange={(value) => setFormData({ ...formData, member_id: value.toString() })}
                    placeholder="请选择或搜索成员"
                    required
                    disabled={getAvailableMembers().length === 0}
                  />
                  {getAvailableMembers().length === 0 && (
                    <p className="text-yellow-400 text-xs mt-1">所有成员均在请假中</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">请假原因</label>
                <textarea
                  value={formData.reason}
                  onChange={(event) => setFormData({ ...formData, reason: event.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="可选填写"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DateInput
                  label="开始日期"
                  value={formData.start_date}
                  onChange={(value) => setFormData({ ...formData, start_date: value })}
                  required
                />
                <DateInput
                  label="结束日期"
                  value={formData.end_date}
                  onChange={(value) => setFormData({ ...formData, end_date: value })}
                  min={formData.start_date}
                  required
                />
              </div>

              {editingRecord && editingRecord.status === '请假中' && (
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
                  <p className="text-yellow-300 text-sm mb-3">
                    当前请假状态：<span className="font-semibold">请假中</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleEndLeave}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg transition-colors"
                  >
                    提前结束请假
                  </button>
                </div>
              )}

              {editingRecord && editingRecord.status === '已结束' && (
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                  <p className="text-gray-400 text-sm text-center">
                    该请假已结束
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {editingRecord 
                    ? (submitting ? '保存中...' : '保存修改')
                    : (submitting ? '添加中...' : '添加')
                  }
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors">
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog.show && confirmDialog.type === 'delete' && (
        <ConfirmDialog
          title="删除请假记录"
          message={`确定要删除 ${confirmDialog.data?.member_name} 的请假记录吗？`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'endLeave' && editingRecord && (
        <ConfirmDialog
          title="提前结束请假"
          message={`确认提前结束 ${editingRecord.member_name} 的请假吗？`}
          confirmText="结束请假"
          cancelText="取消"
          type="warning"
          onConfirm={confirmEndLeave}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchDelete' && (
        <ConfirmDialog
          title="批量删除请假记录"
          message={`确定要删除选中的 ${selectedIds.size} 条请假记录吗？`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmBatchDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchEndLeave' && (
        <ConfirmDialog
          title="批量结束请假"
          message={`确定要结束选中的请假记录吗？`}
          confirmText="结束请假"
          cancelText="取消"
          type="warning"
          onConfirm={confirmBatchEndLeave}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}
    </div>
  )
}
