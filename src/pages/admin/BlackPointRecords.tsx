import { useState, useEffect } from 'react'
import { blackPointAPI, memberAPI } from '../../utils/api'
import { Plus, Trash2, XCircle, Filter, ChevronUp, ChevronDown, Search, X, CheckSquare, Square } from 'lucide-react'
import { formatDate } from '../../utils/dateFormat'
import { toast } from '../../utils/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import SearchableSelect from '../../components/SearchableSelect'

interface BlackPointRecord {
  id: number
  member_id: number
  member_name: string
  qq: string
  reason: string
  register_date: string
  recorder_name: string
  status: string
}

interface Member {
  id: number
  nickname: string
  qq: string
}

export default function BlackPointRecords() {
  const [records, setRecords] = useState<BlackPointRecord[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  const [formData, setFormData] = useState({
    member_id: '',
    reason: '',
    register_date: new Date().toISOString().split('T')[0]
  })

  const [showFilters, setShowFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('blackPointSearch') || '')
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('blackPointFilters')
    return saved ? JSON.parse(saved) : { status: [] as string[], inverseMode: false }
  })
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('blackPointSort')
    return saved ? JSON.parse(saved) : null
  })

  const statuses = ['生效中', '已失效']

  useEffect(() => {
    const loadData = async () => {
      await loadRecords()
      await loadMembers()
    }
    loadData()
  }, [])
  useEffect(() => { localStorage.setItem('blackPointFilters', JSON.stringify(filters)) }, [filters])
  useEffect(() => { if (sortConfig) localStorage.setItem('blackPointSort', JSON.stringify(sortConfig)) }, [sortConfig])
  useEffect(() => { localStorage.setItem('blackPointSearch', searchQuery) }, [searchQuery])

  const loadRecords = async () => {
    try {
      const response = await blackPointAPI.getAll()
      setRecords(response.data)
    } catch (error: any) {
      toast.error(error.message || '加载黑点记录失败')
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    try {
      const response = await memberAPI.getAll()
      setMembers(response.data.filter((m: any) => m.status !== '已退队'))
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
        r.reason.toLowerCase().includes(query) ||
        r.recorder_name.toLowerCase().includes(query)
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

  const batchRevoke = async () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({show: true, type: 'batchRevoke'})
  }

  const confirmBatchRevoke = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const ids = Array.from(selectedIds)
      const effectiveRecords = records.filter(r => ids.includes(r.id) && r.status === '生效中')
      
      for (const record of effectiveRecords) {
        await blackPointAPI.update(record.id, {
          status: '已失效',
          invalid_date: new Date().toISOString().split('T')[0]
        })
      }
      
      toast.success(`已撤销 ${effectiveRecords.length} 条黑点记录`)
      clearSelection()
      loadRecords()
    } catch (error: any) {
      toast.error(error.message || '批量撤销失败')
    }
  }

  const batchDelete = async () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({show: true, type: 'batchDelete'})
  }

  const confirmBatchDelete = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const ids = Array.from(selectedIds)
      for (const id of ids) {
        await blackPointAPI.delete(id)
      }
      toast.success(`已删除 ${ids.length} 条黑点记录`)
      clearSelection()
      loadRecords()
    } catch (error: any) {
      toast.error(error.message || '批量删除失败')
    }
  }

  const handleAdd = () => {
    setFormData({
      member_id: '',
      reason: '',
      register_date: new Date().toISOString().split('T')[0]
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!formData.member_id || !formData.reason) {
        toast.error('请填写完整信息')
        return
      }
      const adminId = localStorage.getItem('userId')
      const adminName = localStorage.getItem('userName') || '管理员'
      await blackPointAPI.create({
        member_id: parseInt(formData.member_id),
        reason: formData.reason,
        register_date: formData.register_date,
        recorder_id: adminId ? parseInt(adminId) : 1,
        recorder_name: adminName
      })
      toast.success('黑点记录添加成功')
      setShowModal(false)
      loadRecords()
    } catch (error: any) {
      toast.error(error.message || '操作失败')
    }
  }

  const handleRevokeBlackPoint = (record: BlackPointRecord) => {
    setConfirmDialog({show: true, type: 'revoke', data: record})
  }

  const confirmRevoke = async () => {
    const record = confirmDialog.data
    setConfirmDialog({show: false, type: ''})
    if (!record) return
    try {
      await blackPointAPI.update(record.id, {
        status: '已失效',
        invalid_date: new Date().toISOString().split('T')[0]
      })
      toast.success('黑点已撤销')
      loadRecords()
    } catch (error: any) {
      toast.error(error.message || '操作失败')
    }
  }

  const handleDelete = (record: BlackPointRecord) => {
    setConfirmDialog({show: true, type: 'delete', data: record})
  }

  const confirmDelete = async () => {
    const record = confirmDialog.data
    setConfirmDialog({show: false, type: ''})
    if (!record) return
    try {
      await blackPointAPI.delete(record.id)
      toast.success('黑点记录删除成功')
      loadRecords()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  const activeFilterCount = filters.status.length

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">黑点记录</h1>
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
          <button onClick={handleAdd} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
            <Plus size={20} />
            添加黑点
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button onClick={batchRevoke} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors">
                批量撤销
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
            <label className="text-sm text-gray-400 mb-2 block">状态</label>
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
                  <th>黑点原因</th>
                  <th>
                    <button onClick={() => handleSort('register_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>登记日期</span>
                      {sortConfig?.key === 'register_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>记录人</th>
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
                    <td className="max-w-xs truncate" title={record.reason}>{record.reason}</td>
                    <td>{formatDate(record.register_date)}</td>
                    <td>{record.recorder_name}</td>
                    <td>
                      <span className={`status-badge ${record.status === '生效中' ? 'bg-red-600/20 text-red-300' : 'bg-gray-600/20 text-gray-300'}`}>
                        {record.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {record.status === '生效中' && (
                          <button onClick={() => handleRevokeBlackPoint(record)} className="text-orange-400 hover:text-orange-300 transition-colors" title="撤销黑点">
                            <XCircle size={18} />
                          </button>
                        )}
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
            <h2 className="text-xl font-bold text-white mb-4">添加黑点记录</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">成员 *</label>
                <SearchableSelect
                  options={members.map(member => ({
                    id: member.id,
                    label: member.nickname,
                    subLabel: `(${member.qq})`
                  }))}
                  value={formData.member_id}
                  onChange={(value) => setFormData({...formData, member_id: value.toString()})}
                  placeholder="请选择或搜索成员"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">黑点原因 *</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="请详细说明黑点原因"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">登记日期 *</label>
                <input
                  type="date"
                  value={formData.register_date}
                  onChange={(e) => setFormData({...formData, register_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors">
                  添加
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
          title="删除黑点记录"
          message={`确定要删除 ${confirmDialog.data?.member_name} 的黑点记录吗？`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'revoke' && (
        <ConfirmDialog
          title="撤销黑点"
          message={`确认撤销 ${confirmDialog.data?.member_name} 的黑点吗？撤销后黑点将失效。`}
          confirmText="撤销"
          cancelText="取消"
          type="warning"
          onConfirm={confirmRevoke}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchRevoke' && (
        <ConfirmDialog
          title="批量撤销黑点"
          message={`确定要撤销选中的黑点吗？只会撤销"生效中"的黑点。`}
          confirmText="撤销"
          cancelText="取消"
          type="warning"
          onConfirm={confirmBatchRevoke}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchDelete' && (
        <ConfirmDialog
          title="批量删除黑点记录"
          message={`确定要删除选中的 ${selectedIds.size} 条黑点记录吗？`}
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
