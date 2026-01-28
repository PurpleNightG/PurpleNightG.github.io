import { useState, useEffect } from 'react'
import { retentionAPI, memberAPI } from '../../utils/api'
import { Plus, Trash2, Filter, ChevronUp, ChevronDown, Search, X, CheckSquare, Square, Loader2 } from 'lucide-react'
import { toast } from '../../utils/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import { formatDate } from '../../utils/dateFormat'

interface RetentionRecord {
  id: number
  member_id: number
  member_name: string
  qq: string
  stage_role: string
  last_training_date: string | null
  retention_reason: string
  approver_remarks: string
  approver_name: string
  approval_date: string
}

interface Member {
  id: number
  nickname: string
  qq: string
  stage_role: string
  last_training_date: string | null
}

export default function RetentionManagement() {
  const [records, setRecords] = useState<RetentionRecord[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    member_id: '',
    retention_reason: '',
    approver_remarks: ''
  })
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  const [showFilters, setShowFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('retentionSearch') || '')
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('retentionFilters')
    return saved ? JSON.parse(saved) : { stage_role: [] as string[], inverseMode: false }
  })
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('retentionSort')
    return saved ? JSON.parse(saved) : null
  })

  const stageRoles = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考', '紫夜', '紫夜尖兵', '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师']

  useEffect(() => { loadData() }, [])
  useEffect(() => { localStorage.setItem('retentionFilters', JSON.stringify(filters)) }, [filters])
  useEffect(() => { if (sortConfig) localStorage.setItem('retentionSort', JSON.stringify(sortConfig)) }, [sortConfig])
  useEffect(() => { localStorage.setItem('retentionSearch', searchQuery) }, [searchQuery])

  const loadData = async () => {
    await loadRecords()
    await loadMembers()
  }

  const loadRecords = async () => {
    try {
      const response = await retentionAPI.getAll()
      setRecords(response.data)
      return response.data
    } catch (error: any) {
      toast.error(error.message || '加载留队记录失败')
      return []
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    try {
      const [memberRes, retentionRes] = await Promise.all([memberAPI.getAll(), retentionAPI.getAll()])
      const retentionMemberIds = retentionRes.data.map((r: any) => r.member_id)
      setMembers(memberRes.data.filter((m: any) => m.status !== '已退队' && !retentionMemberIds.includes(m.id)))
    } catch (error: any) {
      toast.error(error.message || '加载成员列表失败')
    }
  }

  const toggleFilter = (type: 'stage_role', value: string) => {
    setFilters((prev: typeof filters) => {
      const current = prev[type]
      const updated = current.includes(value) ? current.filter((v: string) => v !== value) : [...current, value]
      return { ...prev, [type]: updated }
    })
  }

  const clearFilters = () => {
    setFilters({ stage_role: [], inverseMode: false })
  }

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
        r.stage_role.toLowerCase().includes(query)
      )
    }

    if (filters.stage_role.length > 0) {
      if (filters.inverseMode) {
        filtered = filtered.filter(r => !filters.stage_role.includes(r.stage_role))
      } else {
        filtered = filtered.filter(r => filters.stage_role.includes(r.stage_role))
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

  const batchDelete = async () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({show: true, type: 'batchDelete'})
  }

  const confirmBatchDelete = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const ids = Array.from(selectedIds)
      for (const id of ids) {
        await retentionAPI.delete(id)
      }
      toast.success(`已删除 ${ids.length} 条留队记录`)
      clearSelection()
      await loadRecords()
      await loadMembers()
    } catch (error: any) {
      toast.error(error.message || '批量删除失败')
    }
  }

  const getRoleColor = (role: string) => {
    if (role === '紫夜' || role === '紫夜尖兵') return 'bg-purple-600/20 text-purple-300'
    if (role === '会长' || role === '执行官') return 'bg-amber-600/20 text-amber-300'
    if (role === '总教' || role === '尖兵教官' || role === '教官') return 'bg-green-600/20 text-green-300'
    if (role === '人事') return 'bg-cyan-600/20 text-cyan-300'
    if (role === '工程师') return 'bg-sky-600/20 text-sky-300'
    if (role.includes('新训')) return 'bg-blue-600/20 text-blue-300'
    return 'bg-gray-600/20 text-gray-300'
  }

  const handleAdd = () => {
    setFormData({ member_id: '', retention_reason: '', approver_remarks: '' })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.member_id || !formData.retention_reason) {
      toast.error('请填写必填字段')
      return
    }
    
    setSubmitting(true)
    try {
      const adminId = localStorage.getItem('userId')
      const adminName = localStorage.getItem('userName') || '管理员'
      
      await retentionAPI.create({
        member_id: parseInt(formData.member_id),
        retention_reason: formData.retention_reason,
        approver_remarks: formData.approver_remarks,
        approver_id: adminId ? parseInt(adminId) : 1,
        approver_name: adminName
      })
      toast.success('留队记录添加成功')
      setShowModal(false)
      await loadRecords()
      await loadMembers()
    } catch (error: any) {
      toast.error(error.message || '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (record: RetentionRecord) => {
    setConfirmDialog({show: true, type: 'delete', data: record})
  }

  const confirmDelete = async () => {
    const record = confirmDialog.data
    setConfirmDialog({show: false, type: ''})
    if (!record) return
    try {
      await retentionAPI.delete(record.id)
      toast.success('留队记录删除成功')
      await loadRecords()
      await loadMembers()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  const activeFilterCount = filters.stage_role.length

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">留队管理</h1>
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
              placeholder="搜索成员、QQ、角色..."
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
          <button onClick={handleAdd} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
            <Plus size={20} />
            添加记录
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <button onClick={batchDelete} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors">
              批量删除
            </button>
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
            <label className="text-sm text-gray-400 mb-2 block">阶段&角色</label>
            <div className="flex flex-wrap gap-2">
              {stageRoles.map(role => (
                <button
                  key={role}
                  onClick={() => toggleFilter('stage_role', role)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${filters.stage_role.includes(role) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  {role}
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
                  <th>留队原因</th>
                  <th>批准者备注</th>
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
                    <td>
                      <span className={`status-badge ${getRoleColor(record.stage_role)}`}>
                        {record.stage_role}
                      </span>
                    </td>
                    <td>{record.last_training_date ? formatDate(record.last_training_date) : '-'}</td>
                    <td className="max-w-xs">
                      <div className="truncate" title={record.retention_reason}>{record.retention_reason}</div>
                    </td>
                    <td className="max-w-xs">
                      <div className="truncate" title={record.approver_remarks}>{record.approver_remarks || '-'}</div>
                      <div className="text-xs text-gray-400 mt-1">{record.approver_name} · {formatDate(record.approval_date)}</div>
                    </td>
                    <td>
                      <button onClick={() => handleDelete(record)} className="text-red-400 hover:text-red-300 transition-colors" title="删除">
                        <Trash2 size={18} />
                      </button>
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
            <h2 className="text-xl font-bold text-white mb-4">添加留队记录</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">成员 *</label>
                <select
                  value={formData.member_id}
                  onChange={(e) => setFormData({...formData, member_id: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-10 py-2 text-white"
                  required
                >
                  <option value="">请选择成员</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.nickname} ({member.qq}) - {member.stage_role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">留队原因 *</label>
                <textarea
                  value={formData.retention_reason}
                  onChange={(e) => setFormData({...formData, retention_reason: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="请详细说明留队原因"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">批准者备注</label>
                <textarea
                  value={formData.approver_remarks}
                  onChange={(e) => setFormData({...formData, approver_remarks: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="可填写批准意见或要求"
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
          title="删除留队记录"
          message={`确定要删除 ${confirmDialog.data?.member_name} 的留队记录吗？`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchDelete' && (
        <ConfirmDialog
          title="批量删除留队记录"
          message={`确定要删除选中的 ${selectedIds.size} 条留队记录吗？`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmBatchDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}
    </div>
  )
}
