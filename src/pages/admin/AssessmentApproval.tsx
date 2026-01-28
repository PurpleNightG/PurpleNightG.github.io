import { useState, useEffect } from 'react'
import { assessmentApplicationAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { CheckCircle, XCircle, Clock, Search, Filter, X, Calendar, Users, Trash2, CheckSquare, Square, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { formatDate, formatDateTime } from '../../utils/dateFormat'

interface Application {
  id: number
  member_id: number
  member_name: string
  companion: string
  preferred_date: string
  preferred_time: string
  status: '待审批' | '已通过' | '已驳回'
  admission_ticket: string | null
  reject_reason: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export default function AssessmentApproval() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  
  // 从localStorage加载搜索关键词
  const [searchQuery, setSearchQuery] = useState(() => {
    return localStorage.getItem('assessmentApprovalSearch') || ''
  })
  
  const [showFilters, setShowFilters] = useState(false)
  
  // 从localStorage加载状态筛选
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    const saved = localStorage.getItem('assessmentApprovalFilters')
    return saved ? JSON.parse(saved) : []
  })
  
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectReasonModal, setShowRejectReasonModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)
  
  // 排序状态
  const [sortConfig, setSortConfig] = useState<{key: keyof Application, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('assessmentApprovalSort')
    return saved ? JSON.parse(saved) : null
  })

  // 保存排序到localStorage
  useEffect(() => {
    if (sortConfig) {
      localStorage.setItem('assessmentApprovalSort', JSON.stringify(sortConfig))
    }
  }, [sortConfig])

  useEffect(() => {
    loadApplications()
  }, [])

  // 保存搜索关键词到localStorage
  useEffect(() => {
    localStorage.setItem('assessmentApprovalSearch', searchQuery)
  }, [searchQuery])

  // 保存状态筛选到localStorage
  useEffect(() => {
    localStorage.setItem('assessmentApprovalFilters', JSON.stringify(statusFilter))
  }, [statusFilter])

  const loadApplications = async () => {
    try {
      setLoading(true)
      const response = await assessmentApplicationAPI.getAll()
      setApplications(response.data)
    } catch (error: any) {
      toast.error('加载申请列表失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleApproveClick = (application: Application) => {
    setSelectedApplication(application)
    setShowApproveModal(true)
  }

  const handleApproveConfirm = async () => {
    if (!selectedApplication) return

    try {
      setShowApproveModal(false)
      setProcessing(true)
      const adminUserStr = localStorage.getItem('adminUser') || sessionStorage.getItem('adminUser')
      const adminUser = adminUserStr ? JSON.parse(adminUserStr) : null
      const approved_by = adminUser?.username || '管理员'

      const response = await assessmentApplicationAPI.approve(selectedApplication.id, approved_by)
      
      toast.success(`审批通过！准考证号：${response.data.admission_ticket}`)
      setSelectedApplication(null)
      loadApplications()
    } catch (error: any) {
      toast.error('审批失败: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleRejectClick = (application: Application) => {
    setSelectedApplication(application)
    setRejectReason('')
    setShowRejectModal(true)
  }

  const handleRejectConfirm = async () => {
    if (!rejectReason || rejectReason.trim() === '') {
      toast.error('请填写驳回理由')
      return
    }

    if (!selectedApplication) return

    try {
      setProcessing(true)
      const adminUserStr = localStorage.getItem('adminUser') || sessionStorage.getItem('adminUser')
      const adminUser = adminUserStr ? JSON.parse(adminUserStr) : null
      const approved_by = adminUser?.username || '管理员'

      await assessmentApplicationAPI.reject(selectedApplication.id, rejectReason, approved_by)
      
      toast.success('已驳回申请')
      setShowRejectModal(false)
      setSelectedApplication(null)
      setRejectReason('')
      loadApplications()
    } catch (error: any) {
      toast.error('驳回失败: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleDeleteClick = (application: Application) => {
    setSelectedApplication(application)
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedApplication) return

    try {
      setShowDeleteModal(false)
      setProcessing(true)
      await assessmentApplicationAPI.delete(selectedApplication.id)
      toast.success('申请记录已删除')
      setSelectedApplication(null)
      loadApplications()
    } catch (error: any) {
      toast.error('删除失败: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === filteredApplications.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredApplications.map(app => app.id))
    }
  }

  const handleSelectOne = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error('请先选择要删除的记录')
      return
    }
    setShowBatchDeleteModal(true)
  }

  const handleBatchDeleteConfirm = async () => {
    if (selectedIds.length === 0) return

    try {
      setShowBatchDeleteModal(false)
      setProcessing(true)
      
      // 批量删除
      await Promise.all(selectedIds.map(id => assessmentApplicationAPI.delete(id)))
      
      toast.success(`已删除 ${selectedIds.length} 条记录`)
      setSelectedIds([])
      loadApplications()
    } catch (error: any) {
      toast.error('批量删除失败: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const getStatusIcon = (status: Application['status']) => {
    switch (status) {
      case '待审批':
        return <Clock className="text-yellow-400" size={20} />
      case '已通过':
        return <CheckCircle className="text-green-400" size={20} />
      case '已驳回':
        return <XCircle className="text-red-400" size={20} />
    }
  }

  const getStatusBadge = (status: Application['status']) => {
    const badges = {
      '待审批': 'bg-yellow-600/20 text-yellow-300',
      '已通过': 'bg-green-600/20 text-green-300',
      '已驳回': 'bg-red-600/20 text-red-300'
    }
    return badges[status]
  }

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const clearFilters = () => {
    setStatusFilter([])
  }

  // 排序处理
  const handleSort = (key: keyof Application) => {
    if (sortConfig?.key === key) {
      if (sortConfig.direction === 'asc') {
        setSortConfig({key, direction: 'desc'})
      } else {
        setSortConfig(null)
      }
    } else {
      setSortConfig({key, direction: 'asc'})
    }
  }

  // 筛选和搜索
  let filteredApplications = applications.filter(application => {
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchSearch = (
        application.member_name.toLowerCase().includes(query) ||
        application.companion.toLowerCase().includes(query)
      )
      if (!matchSearch) return false
    }

    // 状态过滤
    if (statusFilter.length > 0 && !statusFilter.includes(application.status)) {
      return false
    }

    return true
  })

  // 应用排序
  if (sortConfig) {
    filteredApplications.sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]
      
      if (aValue === null && bValue === null) return 0
      if (aValue === null) return 1
      if (bValue === null) return -1
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }

  const activeFilterCount = statusFilter.length
  const pendingCount = applications.filter(a => a.status === '待审批').length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* 工具栏 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">考核审批</h1>
            <p className="text-gray-400">
              审核学员考核申请
              {pendingCount > 0 && (
                <span className="ml-2 text-yellow-400 font-semibold">
                  （{pendingCount} 条待审批）
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {selectedIds.length > 0 && (
              <>
                <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg px-4 py-2 text-purple-300 text-sm">
                  已选择 <span className="font-semibold">{selectedIds.length}</span> 条
                </div>
                <button
                  onClick={handleBatchDelete}
                  disabled={processing}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={18} />
                  批量删除
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  取消选择
                </button>
              </>
            )}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索学员、陪考..."
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
          </div>
        </div>

        {showFilters && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-white font-semibold">筛选条件</h3>
              <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white transition-colors">
                清空筛选
              </button>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">状态</label>
              <div className="flex flex-wrap gap-2">
                {['待审批', '已通过', '已驳回'].map(status => (
                  <button
                    key={status}
                    onClick={() => toggleStatusFilter(status)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${statusFilter.includes(status) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 申请列表 */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
        {filteredApplications.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>暂无申请记录</p>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center justify-center w-full hover:text-purple-400 transition-colors"
                    >
                      {selectedIds.length === filteredApplications.length && filteredApplications.length > 0 ? 
                        <CheckSquare size={18} className="text-purple-400" /> : 
                        <Square size={18} className="text-gray-400" />}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('member_name')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>学员姓名</span>
                      {sortConfig?.key === 'member_name' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('companion')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>陪考人员</span>
                      {sortConfig?.key === 'companion' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('preferred_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>期望日期</span>
                      {sortConfig?.key === 'preferred_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('preferred_time')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>期望时间</span>
                      {sortConfig?.key === 'preferred_time' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('created_at')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>申请时间</span>
                      {sortConfig?.key === 'created_at' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>状态</span>
                      {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </button>
                  </th>
                  <th>准考证号</th>
                  <th>审批人</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplications.map(application => (
                  <tr key={application.id}>
                    <td>
                      <button
                        onClick={() => handleSelectOne(application.id)}
                        className="flex items-center justify-center hover:text-purple-400 transition-colors"
                      >
                        {selectedIds.includes(application.id) ? 
                          <CheckSquare size={18} className="text-purple-400" /> : 
                          <Square size={18} className="text-gray-400" />}
                      </button>
                    </td>
                    <td className="font-medium">{application.member_name}</td>
                    <td>{application.companion}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Calendar size={16} className="text-gray-400" />
                        {formatDate(application.preferred_date)}
                      </div>
                    </td>
                    <td>{application.preferred_time}</td>
                    <td className="text-gray-400 text-sm">
                      {formatDateTime(application.created_at)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(application.status)}
                        <span className={`status-badge ${getStatusBadge(application.status)}`}>
                          {application.status}
                        </span>
                      </div>
                    </td>
                    <td>
                      {application.admission_ticket ? (
                        <span className="text-purple-400 font-mono">
                          {application.admission_ticket}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="text-gray-400 text-sm">
                      {application.approved_by || '-'}
                    </td>
                    <td>
                      <div className="flex gap-2 items-center">
                        {application.status === '待审批' ? (
                          <>
                            <button
                              onClick={() => handleApproveClick(application)}
                              disabled={processing}
                              className="text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
                              title="通过"
                            >
                              <CheckCircle size={20} />
                            </button>
                            <button
                              onClick={() => handleRejectClick(application)}
                              disabled={processing}
                              className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                              title="驳回"
                            >
                              <XCircle size={20} />
                            </button>
                          </>
                        ) : application.status === '已驳回' && application.reject_reason ? (
                          <button
                            onClick={() => {
                              setSelectedApplication(application)
                              setShowRejectReasonModal(true)
                            }}
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            查看理由
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleDeleteClick(application)}
                          disabled={processing}
                          className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="删除"
                        >
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

      {/* 驳回理由模态框 */}
      {showRejectModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="border-b border-gray-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white">驳回申请</h2>
            </div>

            <div className="p-6">
              <div className="bg-gray-900/50 rounded-lg p-4 mb-4 text-sm">
                <div className="text-gray-400 mb-2">申请信息</div>
                <div className="text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={16} className="text-gray-400" />
                    学员：{selectedApplication.member_name}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    日期：{formatDate(selectedApplication.preferred_date)} {selectedApplication.preferred_time}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  驳回理由 *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white min-h-[120px] focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="请详细说明驳回原因..."
                  autoFocus
                />
              </div>
            </div>

            <div className="border-t border-gray-700 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setSelectedApplication(null)
                  setRejectReason('')
                }}
                disabled={processing}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={processing || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processing && <Loader2 size={16} className="animate-spin" />}
                {processing ? '处理中...' : '确认驳回'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 审批确认弹窗 */}
      {showApproveModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="border-b border-gray-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white">确认审批</h2>
            </div>

            <div className="p-6">
              <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                <div className="text-gray-400 text-sm mb-3">申请信息</div>
                <div className="text-white space-y-2">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-400" />
                    <span className="text-gray-400">学员：</span>
                    <span className="font-semibold">{selectedApplication.member_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-400" />
                    <span className="text-gray-400">陪考：</span>
                    <span>{selectedApplication.companion}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="text-gray-400">日期：</span>
                    <span>{formatDate(selectedApplication.preferred_date)} {selectedApplication.preferred_time}</span>
                  </div>
                </div>
              </div>

              <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <div className="text-green-300 font-semibold mb-1">确认通过此申请？</div>
                    <div className="text-green-200/70 text-sm">
                      系统将自动生成准考证号并通知学员
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowApproveModal(false)
                  setSelectedApplication(null)
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleApproveConfirm}
                disabled={processing}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {processing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                {processing ? '处理中...' : '确认通过'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查看驳回理由弹窗 */}
      {showRejectReasonModal && selectedApplication && selectedApplication.reject_reason && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="border-b border-gray-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white">驳回理由</h2>
            </div>

            <div className="p-6">
              <div className="bg-gray-900/50 rounded-lg p-4 mb-4 text-sm">
                <div className="text-gray-400 mb-2">申请信息</div>
                <div className="text-white space-y-1">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-400" />
                    学员：{selectedApplication.member_name}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    日期：{formatDate(selectedApplication.preferred_date)} {selectedApplication.preferred_time}
                  </div>
                </div>
              </div>

              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <div className="text-red-300 font-semibold mb-2">驳回理由</div>
                    <div className="text-red-200/80 text-sm whitespace-pre-wrap">
                      {selectedApplication.reject_reason}
                    </div>
                  </div>
                </div>
              </div>

              {selectedApplication.approved_by && (
                <div className="mt-4 text-gray-400 text-sm">
                  审批人：{selectedApplication.approved_by}
                  {selectedApplication.approved_at && (
                    <> · {formatDateTime(selectedApplication.approved_at)}</>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-gray-700 px-6 py-4 flex justify-end">
              <button
                onClick={() => {
                  setShowRejectReasonModal(false)
                  setSelectedApplication(null)
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="border-b border-gray-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white">确认删除</h2>
            </div>

            <div className="p-6">
              <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                <div className="text-gray-400 text-sm mb-3">申请信息</div>
                <div className="text-white space-y-2">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-400" />
                    <span className="text-gray-400">学员：</span>
                    <span className="font-semibold">{selectedApplication.member_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="text-gray-400">日期：</span>
                    <span>{formatDate(selectedApplication.preferred_date)} {selectedApplication.preferred_time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedApplication.status)}
                    <span className="text-gray-400">状态：</span>
                    <span className={`status-badge ${getStatusBadge(selectedApplication.status)}`}>
                      {selectedApplication.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <div className="text-red-300 font-semibold mb-1">确认删除此申请记录？</div>
                    <div className="text-red-200/70 text-sm">
                      删除后将无法恢复，请谨慎操作
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedApplication(null)
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Trash2 size={18} />
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量删除确认弹窗 */}
      {showBatchDeleteModal && selectedIds.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="border-b border-gray-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white">批量删除确认</h2>
            </div>

            <div className="p-6">
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="text-red-400 flex-shrink-0 mt-0.5" size={24} />
                  <div>
                    <div className="text-red-300 font-semibold mb-2">
                      确认删除选中的 {selectedIds.length} 条申请记录？
                    </div>
                    <div className="text-red-200/70 text-sm">
                      删除后将无法恢复，请谨慎操作
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">将要删除的记录：</div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {applications
                    .filter(app => selectedIds.includes(app.id))
                    .map(app => (
                      <div key={app.id} className="flex items-center gap-2 text-sm text-white bg-gray-800/50 rounded px-3 py-2">
                        <Users size={14} className="text-gray-400" />
                        <span>{app.member_name}</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-400">{formatDate(app.preferred_date)}</span>
                        <span className={`ml-auto status-badge ${getStatusBadge(app.status)}`}>
                          {app.status}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBatchDeleteModal(false)
                }}
                disabled={processing}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchDeleteConfirm}
                disabled={processing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 size={18} />
                {processing ? '删除中...' : `确认删除 ${selectedIds.length} 条`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
