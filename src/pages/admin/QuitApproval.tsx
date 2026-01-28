import { useState, useEffect } from 'react'
import { quitAPI, memberAPI } from '../../utils/api'
import { Plus, Check, X, Trash2, Filter, ChevronUp, ChevronDown, Search, X as XIcon, CheckSquare, Square, Loader2 } from 'lucide-react'
import { formatDate } from '../../utils/dateFormat'
import { toast } from '../../utils/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import SearchableSelect from '../../components/SearchableSelect'

interface QuitApproval {
  id: number
  member_id: number
  member_name: string
  qq: string
  apply_date: string
  source_type: string
  source_admin_name: string | null
  status: string
  approver_name: string | null
  approval_date: string | null
  remarks: string
}

interface Member {
  id: number
  nickname: string
  qq: string
}

const formatDateForDB = (dateStr: string | null | undefined) => {
  if (!dateStr) return null
  return dateStr.split('T')[0]
}

const updateMemberStatus = async (memberId: number, newStatus: string) => {
  const memberRes = await memberAPI.getById(memberId)
  const memberData = memberRes.data
  
  await memberAPI.update(memberId, {
    nickname: memberData.nickname,
    qq: memberData.qq,
    game_id: memberData.game_id || null,
    join_date: formatDateForDB(memberData.join_date),
    stage_role: memberData.stage_role,
    status: newStatus,
    last_training_date: formatDateForDB(memberData.last_training_date),
    remarks: memberData.remarks || null
  })
}

export default function QuitApproval() {
  const [approvals, setApprovals] = useState<QuitApproval[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  const [approvalData, setApprovalData] = useState({
    status: '已批准',
    remarks: ''
  })
  const [formData, setFormData] = useState({
    member_id: '',
    remarks: ''
  })

  // 搜索、筛选、排序、多选
  const [showFilters, setShowFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('quitSearch') || '')
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('quitFilters')
    return saved ? JSON.parse(saved) : { 
      status: [] as string[], 
      inverseMode: false 
    }
  })
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('quitSort')
    return saved ? JSON.parse(saved) : null
  })

  const statuses = ['待审批', '已批准', '已拒绝']

  useEffect(() => {
    const loadData = async () => {
      await loadApprovals()
      await loadMembers()
    }
    loadData()
  }, [])

  useEffect(() => { localStorage.setItem('quitFilters', JSON.stringify(filters)) }, [filters])
  useEffect(() => { if (sortConfig) localStorage.setItem('quitSort', JSON.stringify(sortConfig)) }, [sortConfig])
  useEffect(() => { localStorage.setItem('quitSearch', searchQuery) }, [searchQuery])

  const loadApprovals = async () => {
    try {
      const response = await quitAPI.getAll()
      setApprovals(response.data)
    } catch (error: any) {
      toast.error(error.message || '加载退队审批失败')
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

  const getFilteredAndSortedApprovals = () => {
    let filtered = [...approvals]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(a =>
        a.member_name.toLowerCase().includes(query) ||
        a.qq.includes(query) ||
        (a.remarks && a.remarks.toLowerCase().includes(query))
      )
    }

    if (filters.status.length > 0) {
      if (filters.inverseMode) {
        filtered = filtered.filter(a => !filters.status.includes(a.status))
      } else {
        filtered = filtered.filter(a => filters.status.includes(a.status))
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

  const filteredApprovals = getFilteredAndSortedApprovals()

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredApprovals.length && filteredApprovals.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredApprovals.map(a => a.id)))
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

  const isAllSelected = filteredApprovals.length > 0 && selectedIds.size === filteredApprovals.length && filteredApprovals.every(a => selectedIds.has(a.id))

  const batchDelete = () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({show: true, type: 'batchDelete'})
  }

  const confirmBatchDelete = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const ids = Array.from(selectedIds)
      const selectedApprovals = approvals.filter(a => ids.includes(a.id))
      
      for (const approval of selectedApprovals) {
        await quitAPI.delete(approval.id)
        if (approval.status === '待审批') {
          try {
            await updateMemberStatus(approval.member_id, '正常')
          } catch (e) {
            console.error('恢复成员状态失败:', e)
          }
        }
      }
      toast.success(`已删除 ${ids.length} 条退队审批`)
      clearSelection()
      await loadApprovals()
      await loadMembers()
    } catch (error: any) {
      toast.error(error.message || '批量删除失败')
    }
  }

  const batchApprove = () => {
    if (selectedIds.size === 0) return
    const selectedApprovals = approvals.filter(a => selectedIds.has(a.id))
    const pendingApprovals = selectedApprovals.filter(a => a.status === '待审批')
    if (pendingApprovals.length === 0) {
      toast.error('选中的审批中没有待审批的记录')
      return
    }
    setConfirmDialog({show: true, type: 'batchApprove'})
  }

  const confirmBatchApprove = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const adminId = localStorage.getItem('userId')
      const adminName = localStorage.getItem('userName') || '管理员'
      const ids = Array.from(selectedIds)
      const selectedApprovals = approvals.filter(a => ids.includes(a.id) && a.status === '待审批')
      
      for (const approval of selectedApprovals) {
        await quitAPI.approve(approval.id, {
          approver_id: adminId ? parseInt(adminId) : 1,
          approver_name: adminName,
          status: '已批准',
          remarks: approval.remarks
        })
        try {
          await memberAPI.delete(approval.member_id)
        } catch (e) {
          console.error('删除成员数据失败:', e)
        }
      }
      toast.success(`已批准 ${selectedApprovals.length} 条退队申请`)
      clearSelection()
      await loadApprovals()
      await loadMembers()
    } catch (error: any) {
      toast.error(error.message || '批量批准失败')
    }
  }

  const batchReject = () => {
    if (selectedIds.size === 0) return
    const selectedApprovals = approvals.filter(a => selectedIds.has(a.id))
    const pendingApprovals = selectedApprovals.filter(a => a.status === '待审批')
    if (pendingApprovals.length === 0) {
      toast.error('选中的审批中没有待审批的记录')
      return
    }
    setConfirmDialog({show: true, type: 'batchReject'})
  }

  const confirmBatchReject = async () => {
    setConfirmDialog({show: false, type: ''})
    try {
      const adminId = localStorage.getItem('userId')
      const adminName = localStorage.getItem('userName') || '管理员'
      const ids = Array.from(selectedIds)
      const selectedApprovals = approvals.filter(a => ids.includes(a.id) && a.status === '待审批')
      
      for (const approval of selectedApprovals) {
        await quitAPI.approve(approval.id, {
          approver_id: adminId ? parseInt(adminId) : 1,
          approver_name: adminName,
          status: '已拒绝',
          remarks: approval.remarks
        })
        try {
          await updateMemberStatus(approval.member_id, '正常')
        } catch (e) {
          console.error('恢复成员状态失败:', e)
        }
      }
      toast.success(`已拒绝 ${selectedApprovals.length} 条退队申请`)
      clearSelection()
      await loadApprovals()
      await loadMembers()
    } catch (error: any) {
      toast.error(error.message || '批量拒绝失败')
    }
  }

  const handleAdd = () => {
    setFormData({ member_id: '', remarks: '' })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.member_id) {
      toast.error('请选择成员')
      return
    }
    
    setSubmitting(true)
    const adminId = localStorage.getItem('userId')
    const adminName = localStorage.getItem('userName') || '管理员'
    let approvalCreated = false
    
    try {
      await quitAPI.create({
        member_id: formData.member_id,
        source_admin_id: adminId ? parseInt(adminId) : 1,
        source_admin_name: adminName,
        remarks: formData.remarks
      })
      approvalCreated = true
      toast.success('退队审批添加成功')
      
      const memberId = parseInt(formData.member_id)
      
      try {
        await updateMemberStatus(memberId, '已退队')
        toast.success('退队审批添加成功，成员状态已更新')
      } catch (updateError: any) {
        toast.warning('退队审批已添加，但成员状态更新失败')
      }
      
      setShowModal(false)
      loadApprovals()
      loadMembers()
    } catch (error: any) {
      if (approvalCreated) {
        toast.warning('退队审批已添加，但后续操作失败')
        setShowModal(false)
        loadApprovals()
        loadMembers()
      } else {
        toast.error(error.message || '添加退队审批失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = (id: number, currentRemarks: string) => {
    setApprovingId(id)
    setApprovalData({ status: '已批准', remarks: currentRemarks || '' })
  }

  const handleReject = (id: number, currentRemarks: string) => {
    setApprovingId(id)
    setApprovalData({ status: '已拒绝', remarks: currentRemarks || '' })
  }

  const confirmApproval = async () => {
    if (!approvingId) return
    
    const adminId = localStorage.getItem('userId')
    const adminName = localStorage.getItem('userName') || '管理员'
    const approval = approvals.find(a => a.id === approvingId)
    if (!approval) return
    
    let approvalCompleted = false
    
    try {
      await quitAPI.approve(approvingId, {
        approver_id: adminId ? parseInt(adminId) : 1,
        approver_name: adminName,
        status: approvalData.status,
        remarks: approvalData.remarks
      })
      approvalCompleted = true
      
      if (approvalData.status === '已批准') {
        try {
          await memberAPI.delete(approval.member_id)
          toast.success('审批完成，成员数据已删除')
        } catch (deleteError: any) {
          toast.warning('审批已完成，但删除成员数据失败')
        }
      } else {
        try {
          await updateMemberStatus(approval.member_id, '正常')
          toast.success('审批完成，成员状态已恢复')
        } catch (updateError: any) {
          toast.warning('审批已完成，但恢复成员状态失败')
        }
      }
      
      setApprovingId(null)
      loadApprovals()
      loadMembers()
    } catch (error: any) {
      if (approvalCompleted) {
        toast.warning('审批已完成，但后续操作失败')
        setApprovingId(null)
        loadApprovals()
        loadMembers()
      } else {
        toast.error(error.message || '审批失败')
      }
    }
  }

  const handleDelete = (approval: QuitApproval) => {
    setConfirmDialog({show: true, type: 'delete', data: approval})
  }

  const confirmDelete = async () => {
    const approval = confirmDialog.data
    setConfirmDialog({show: false, type: ''})
    if (!approval) return
    
    let deleteCompleted = false
    
    try {
      await quitAPI.delete(approval.id)
      deleteCompleted = true
      
      if (approval.status === '待审批') {
        try {
          await updateMemberStatus(approval.member_id, '正常')
          toast.success('退队审批删除成功，成员状态已恢复')
        } catch (updateError: any) {
          toast.warning('退队审批已删除，但恢复成员状态失败')
        }
      } else {
        toast.success('退队审批删除成功')
      }
      
      loadApprovals()
      loadMembers()
    } catch (error: any) {
      if (deleteCompleted) {
        toast.warning('退队审批已删除，但后续操作失败')
        loadApprovals()
        loadMembers()
      } else {
        toast.error(error.message || '删除失败')
      }
    }
  }

  const activeFilterCount = filters.status.length

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">退队审批</h1>
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
              placeholder="搜索成员、QQ、备注..."
              className="bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-gray-400 w-64 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                <XIcon size={18} />
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
            添加审批
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button onClick={batchApprove} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors">
                批量批准
              </button>
              <button onClick={batchReject} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors">
                批量拒绝
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
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">审批状态</label>
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
                    <button onClick={() => handleSort('apply_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>申请日期</span>
                      {sortConfig?.key === 'apply_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('source_admin_name')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>操作人</span>
                      {sortConfig?.key === 'source_admin_name' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('remarks')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>原因</span>
                      {sortConfig?.key === 'remarks' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
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
                {filteredApprovals.map((approval) => (
                  <tr key={approval.id}>
                    <td>
                      <button onClick={() => toggleSelectOne(approval.id)} className="flex items-center justify-center hover:text-purple-400 transition-colors">
                        {selectedIds.has(approval.id) ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
                      </button>
                    </td>
                    <td>{approval.member_name}</td>
                    <td>{approval.qq}</td>
                    <td>{formatDate(approval.apply_date)}</td>
                    <td>
                      <span className="text-gray-300">{approval.source_admin_name || '未知'}</span>
                    </td>
                    <td>
                      <span className="text-gray-400 text-sm" title={approval.remarks}>
                        {approval.remarks || '-'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${
                        approval.status === '待审批' ? 'bg-yellow-600/20 text-yellow-300' :
                        approval.status === '已批准' ? 'bg-green-600/20 text-green-300' :
                        'bg-red-600/20 text-red-300'
                      }`}>
                        {approval.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {approval.status === '待审批' && (
                          <>
                            <button onClick={() => handleApprove(approval.id, approval.remarks)} className="text-green-400 hover:text-green-300 transition-colors" title="批准">
                              <Check size={18} />
                            </button>
                            <button onClick={() => handleReject(approval.id, approval.remarks)} className="text-red-400 hover:text-red-300 transition-colors" title="拒绝">
                              <X size={18} />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(approval)} className="text-red-400 hover:text-red-300 transition-colors" title="删除">
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
            <h2 className="text-xl font-bold text-white mb-4">添加退队审批</h2>
            
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
                <label className="block text-sm font-medium text-gray-300 mb-1">备注</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="可选填写退队原因等"
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

      {approvingId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">
              确认{approvalData.status === '已批准' ? '批准' : '拒绝'}
            </h2>
            
            {approvalData.status === '已批准' && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-300 text-sm">
                  ⚠️ <strong>警告：</strong>批准退队后，将删除该成员的所有相关数据（包括黑点记录、请假记录等），此操作不可恢复！
                </p>
              </div>
            )}
            
            {approvalData.status === '已拒绝' && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
                <p className="text-blue-300 text-sm">
                  ℹ️ 拒绝退队后，该成员状态将恢复为"正常"。
                </p>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">备注</label>
                <textarea
                  value={approvalData.remarks}
                  onChange={(e) => setApprovalData({...approvalData, remarks: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="可选填写审批意见"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={confirmApproval}
                  className={`flex-1 py-2 rounded-lg transition-colors text-white ${
                    approvalData.status === '已批准'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  确认{approvalData.status === '已批准' ? '批准' : '拒绝'}
                </button>
                <button onClick={() => setApprovingId(null)} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.show && confirmDialog.type === 'delete' && (
        <ConfirmDialog
          title="删除退队审批"
          message={`确定要删除 ${confirmDialog.data?.member_name} 的退队审批吗？${confirmDialog.data?.status === '待审批' ? '删除后将恢复该成员的正常状态。' : ''}`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchDelete' && (
        <ConfirmDialog
          title="批量删除退队审批"
          message={`确定要删除选中的 ${selectedIds.size} 条退队审批吗？`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmBatchDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchApprove' && (
        <ConfirmDialog
          title="批量批准退队"
          message="确定要批准选中的退队申请吗？⚠️ 批准后将删除所有相关成员数据，此操作不可恢复！"
          confirmText="批准"
          cancelText="取消"
          type="danger"
          onConfirm={confirmBatchApprove}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchReject' && (
        <ConfirmDialog
          title="批量拒绝退队"
          message={`确定要拒绝选中的退队申请吗？成员状态将恢复为"正常"。`}
          confirmText="拒绝"
          cancelText="取消"
          type="warning"
          onConfirm={confirmBatchReject}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}
    </div>
  )
}
