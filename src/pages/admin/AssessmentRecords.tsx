import { useState, useEffect } from 'react'
import { assessmentAPI, memberAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import { Plus, Trash2, Edit, CheckCircle, XCircle, ChevronDown, ChevronUp, X, Search, Filter, CheckSquare, Square, Loader2 } from 'lucide-react'
import ConfirmDialog from '../../components/ConfirmDialog'
import SearchableSelect from '../../components/SearchableSelect'
import DateInput from '../../components/DateInput'

interface Assessment {
  id: number
  member_id: number
  member_name: string
  assessment_date: string
  status: '待处理' | '已通过' | '未通过' | '未完成' | '模拟考'
  map: string
  custom_map: string | null
  evaluation: string | null
  deduction_records: DeductionRecord[]
  total_score: number
  rating: string
  has_evaluation: boolean
  has_deduction_records: boolean
  video_url: string | null
  video_iframe: string | null
  has_video: boolean
  created_at: string
}

interface DeductionRecord {
  time: string // HH:MM:SS
  code: string
  description: string
  score: number
}

interface Member {
  id: number
  nickname: string
}

// 扣分项配置
const DEDUCTION_CATEGORIES = {
  'OODA和基本地形处理': [
    { code: 'A01', name: '指挥/信号', scoreRange: '1~4' },
    { code: 'A02', name: '非法动作', scoreRange: '2~5' },
    { code: 'A03', name: '非法的模型处理', scoreRange: '5~8' },
  ],
  '危险点处理方式与枪线管理': [
    { code: 'B01', name: '忽略危险', scoreRange: '3~8' },
    { code: 'B02', name: '非法经过/越过死亡漏洞', scoreRange: '5~10' },
    { code: 'B03', name: '暴露在死亡漏斗', scoreRange: '5~10' },
    { code: 'B04', name: '非法ROE/丧失突然性', scoreRange: '2~6' },
  ],
  '协同': [
    { code: 'C01', name: '非法的责任区间', scoreRange: '2~8' },
    { code: 'C02', name: '滞留/脱节', scoreRange: '2~8' },
    { code: 'C03', name: '呆滞/无效指令/无效信号', scoreRange: '1~3' },
  ],
}

const MAP_OPTIONS = ['加油站', '蜘蛛', '213公寓', '海滨公寓', '大学', '医院', '自定义']

export default function AssessmentRecords() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  
  // 从localStorage加载排序配置
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() => {
    const saved = localStorage.getItem('assessmentRecordsSort')
    return saved ? JSON.parse(saved) : null
  })
  
  // 从localStorage加载搜索关键词
  const [searchQuery, setSearchQuery] = useState(() => {
    return localStorage.getItem('assessmentRecordsSearch') || ''
  })
  
  const [showFilters, setShowFilters] = useState(false)
  
  // 从localStorage加载状态筛选
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    const saved = localStorage.getItem('assessmentRecordsFilters')
    return saved ? JSON.parse(saved) : []
  })

  // 表单数据
  const [formData, setFormData] = useState({
    member_id: 0,
    member_name: '',
    assessment_date: new Date().toISOString().split('T')[0],
    status: '待处理' as Assessment['status'],
    map: '',
    custom_map: '',
    evaluation: '',
    deduction_records: [] as DeductionRecord[],
    video_url: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  // 保存搜索关键词到localStorage
  useEffect(() => {
    localStorage.setItem('assessmentRecordsSearch', searchQuery)
  }, [searchQuery])

  // 保存状态筛选到localStorage
  useEffect(() => {
    localStorage.setItem('assessmentRecordsFilters', JSON.stringify(statusFilter))
  }, [statusFilter])

  // 保存排序配置到localStorage
  useEffect(() => {
    if (sortConfig) {
      localStorage.setItem('assessmentRecordsSort', JSON.stringify(sortConfig))
    }
  }, [sortConfig])

  const loadData = async () => {
    try {
      const [assessmentsRes, membersRes] = await Promise.all([
        assessmentAPI.getAll(),
        memberAPI.getAll()
      ])
      // 确保total_score是数字类型
      const assessments = assessmentsRes.data.map((a: Assessment) => ({
        ...a,
        total_score: parseFloat(a.total_score as any) || 0
      }))
      setAssessments(assessments)
      setMembers(membersRes.data)
    } catch (error: any) {
      toast.error('加载数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!formData.member_id || !formData.map) {
      toast.error('请填写必填字段')
      return
    }

    setSubmitting(true)
    try {
      // 过滤掉空的扣分记录（没有code或score为0的）
      const validDeductionRecords = formData.deduction_records.filter(
        record => record.code && record.code.trim() !== ''
      )

      const data = {
        ...formData,
        custom_map: formData.map === '自定义' ? formData.custom_map : null,
        deduction_records: validDeductionRecords
      }

      if (editingAssessment) {
        await assessmentAPI.update(editingAssessment.id, data)
        toast.success('考核记录更新成功')
      } else {
        await assessmentAPI.create(data)
        toast.success('考核记录创建成功')
      }

      setShowModal(false)
      resetForm()
      await loadData()
    } catch (error: any) {
      toast.error('操作失败: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (assessment: Assessment) => {
    setEditingAssessment(assessment)
    setFormData({
      member_id: assessment.member_id,
      member_name: assessment.member_name,
      assessment_date: assessment.assessment_date,
      status: assessment.status,
      map: assessment.custom_map ? '自定义' : assessment.map,
      custom_map: assessment.custom_map || '',
      evaluation: assessment.evaluation || '',
      deduction_records: assessment.deduction_records || [],
      video_url: assessment.video_url || ''
    })
    setShowModal(true)
  }

  const handleDelete = (id: number) => {
    setConfirmDialog({
      show: true,
      type: 'delete',
      data: { id }
    })
  }

  const confirmDelete = async () => {
    try {
      const { id } = confirmDialog.data
      await assessmentAPI.delete(id)
      toast.success('删除成功')
      await loadData()
    } catch (error: any) {
      toast.error('删除失败: ' + error.message)
    } finally {
      setConfirmDialog({show: false, type: ''})
    }
  }

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({
      show: true,
      type: 'batchDelete'
    })
  }

  const confirmBatchDelete = async () => {
    try {
      await assessmentAPI.batchDelete(Array.from(selectedIds))
      toast.success(`已删除 ${selectedIds.size} 条记录`)
      clearSelection()
      await loadData()
    } catch (error: any) {
      toast.error('批量删除失败: ' + error.message)
    } finally {
      setConfirmDialog({show: false, type: ''})
    }
  }

  const resetForm = () => {
    setEditingAssessment(null)
    setFormData({
      member_id: 0,
      member_name: '',
      assessment_date: new Date().toISOString().split('T')[0],
      status: '待处理',
      map: '',
      custom_map: '',
      evaluation: '',
      deduction_records: [],
      video_url: ''
    })
  }

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const selectAll = () => {
    if (selectedIds.size === filteredAssessments.length) {
      clearSelection()
    } else {
      setSelectedIds(new Set(filteredAssessments.map(a => a.id)))
    }
  }

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null
      }
      return { key, direction: 'asc' }
    })
  }

  const addDeductionRecord = () => {
    setFormData(prev => ({
      ...prev,
      deduction_records: [...prev.deduction_records, { time: '00:00:00', code: '', description: '', score: 0 }]
    }))
  }

  const updateDeductionRecord = (index: number, field: keyof DeductionRecord, value: any) => {
    setFormData(prev => ({
      ...prev,
      deduction_records: prev.deduction_records.map((record, i) => 
        i === index ? { ...record, [field]: value } : record
      )
    }))
  }

  const removeDeductionRecord = (index: number) => {
    setFormData(prev => ({
      ...prev,
      deduction_records: prev.deduction_records.filter((_, i) => i !== index)
    }))
  }

  const calculateTotalScore = () => {
    const totalDeduction = formData.deduction_records.reduce((sum, record) => sum + record.score, 0)
    return Math.max(0, 100 - totalDeduction)
  }

  const getRating = (score: number) => {
    if (score >= 100) return { text: '完美', color: 'text-purple-400' }
    if (score >= 90) return { text: '优秀', color: 'text-green-400' }
    if (score >= 70) return { text: '良好', color: 'text-blue-400' }
    if (score >= 60) return { text: '合格', color: 'text-yellow-400' }
    return { text: '不合格', color: 'text-red-400' }
  }

  const getStatusBadge = (status: Assessment['status']) => {
    const badges = {
      '待处理': 'bg-gray-600/20 text-gray-300',
      '已通过': 'bg-green-600/20 text-green-300',
      '未通过': 'bg-red-600/20 text-red-300',
      '未完成': 'bg-yellow-600/20 text-yellow-300',
      '模拟考': 'bg-blue-600/20 text-blue-300'
    }
    return badges[status] || badges['待处理']
  }

  const activeFilterCount = statusFilter.length

  const clearFilters = () => {
    setStatusFilter([])
  }

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  // 筛选和排序
  let filteredAssessments = assessments.filter(assessment => {
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchSearch = (
        assessment.member_name.toLowerCase().includes(query) ||
        assessment.map.toLowerCase().includes(query) ||
        assessment.status.toLowerCase().includes(query)
      )
      if (!matchSearch) return false
    }
    
    // 状态过滤
    if (statusFilter.length > 0 && !statusFilter.includes(assessment.status)) {
      return false
    }
    
    return true
  })

  if (sortConfig) {
    filteredAssessments.sort((a, b) => {
      const aValue = a[sortConfig.key as keyof Assessment]
      const bValue = b[sortConfig.key as keyof Assessment]
      
      // 处理null值
      if (aValue === null && bValue === null) return 0
      if (aValue === null) return 1
      if (bValue === null) return -1
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }

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
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">考核记录</h1>
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
              placeholder="搜索学员、地图..."
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
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            添加考核记录
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button onClick={handleBatchDelete} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors">
                批量删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-semibold">筛选条件</h3>
            <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white transition-colors">
              清空筛选
            </button>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-2 block">状态</label>
            <div className="flex flex-wrap gap-2">
              {['待处理', '已通过', '未通过', '未完成', '模拟考'].map(status => (
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

      {/* 筛选结果提示 */}
      {(searchQuery || statusFilter.length > 0) && filteredAssessments.length > 0 && (
        <div className="mb-4 text-sm text-gray-400">
          显示 <span className="text-purple-400 font-semibold">{filteredAssessments.length}</span> 条记录
          {searchQuery && <span>，包含关键词 "<span className="text-white">{searchQuery}</span>"</span>}
          {statusFilter.length > 0 && <span>，状态: {statusFilter.map(s => <span key={s} className="text-white">{s}</span>).reduce((a, b) => <>{a}、{b}</>)}</span>}
        </div>
      )}

      {/* 表格 */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
        {filteredAssessments.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>暂无考核记录</p>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <button onClick={selectAll} className="flex items-center justify-center w-full hover:text-purple-400 transition-colors">
                    {selectedIds.size === filteredAssessments.length && filteredAssessments.length > 0 ? 
                      <CheckSquare size={18} className="text-purple-400" /> : 
                      <Square size={18} className="text-gray-400" />
                    }
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('member_name')} className="flex items-center gap-1 hover:text-white transition-colors">
                    <span>学员</span>
                    {sortConfig?.key === 'member_name' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('assessment_date')} className="flex items-center gap-1 hover:text-white transition-colors">
                    <span>考核日期</span>
                    {sortConfig?.key === 'assessment_date' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-white transition-colors">
                    <span>考核结果</span>
                    {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>地图</th>
                <th>评价</th>
                <th>考核记录</th>
                <th>考核视频</th>
                <th>
                  <button onClick={() => handleSort('total_score')} className="flex items-center gap-1 hover:text-white transition-colors">
                    <span>总分/评级</span>
                    {sortConfig?.key === 'total_score' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('created_at')} className="flex items-center gap-1 hover:text-white transition-colors">
                    <span>创建时间</span>
                    {sortConfig?.key === 'created_at' && (sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </button>
                </th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssessments.map(assessment => {
                const rating = getRating(assessment.total_score)
                return (
                  <tr key={assessment.id}>
                    <td className="checkbox-col">
                      <button onClick={() => toggleSelection(assessment.id)} className="flex items-center justify-center w-full hover:text-purple-400 transition-colors">
                        {selectedIds.has(assessment.id) ? 
                          <CheckSquare size={18} className="text-purple-400" /> : 
                          <Square size={18} className="text-gray-400" />
                        }
                      </button>
                    </td>
                    <td className="font-medium">{assessment.member_name}</td>
                    <td>{new Date(assessment.assessment_date).toLocaleDateString('zh-CN')}</td>
                    <td>
                      <span className={`status-badge ${getStatusBadge(assessment.status)}`}>
                        {assessment.status}
                      </span>
                    </td>
                    <td>{assessment.custom_map || assessment.map}</td>
                    <td>
                      {assessment.has_evaluation ? (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle size={16} />
                          已填写
                        </span>
                      ) : (
                        <span className="text-gray-500 flex items-center gap-1">
                          <XCircle size={16} />
                          未填写
                        </span>
                      )}
                    </td>
                    <td>
                      {assessment.has_deduction_records ? (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle size={16} />
                          已填写 ({assessment.deduction_records?.length || 0}条)
                        </span>
                      ) : (
                        <span className="text-gray-500 flex items-center gap-1">
                          <XCircle size={16} />
                          未填写
                        </span>
                      )}
                    </td>
                    <td>
                      {assessment.has_video && assessment.video_url ? (
                        <a 
                          href={assessment.video_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <CheckCircle size={16} />
                          已上传
                        </a>
                      ) : (
                        <span className="text-gray-500 flex items-center gap-1">
                          <XCircle size={16} />
                          未上传
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <span className="text-white font-bold">{assessment.total_score.toFixed(2)}分</span>
                        <span className={`text-sm ${rating.color}`}>{assessment.rating}</span>
                      </div>
                    </td>
                    <td className="text-gray-400 text-sm">
                      {new Date(assessment.created_at).toLocaleString('zh-CN')}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(assessment)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="编辑"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(assessment.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* 添加/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 modal-scrollbar">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {editingAssessment ? '编辑考核记录' : '添加考核记录'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    学员 *
                  </label>
                  <SearchableSelect
                    options={members.map(member => ({
                      id: member.id,
                      label: member.nickname,
                      subLabel: ''
                    }))}
                    value={formData.member_id}
                    onChange={(value) => {
                      const memberId = typeof value === 'string' ? parseInt(value) : value
                      const member = members.find(m => m.id === memberId)
                      setFormData({
                        ...formData,
                        member_id: memberId,
                        member_name: member?.nickname || ''
                      })
                    }}
                    placeholder="请选择或搜索学员"
                    required
                  />
                </div>

                <DateInput
                  label="考核日期"
                  value={formData.assessment_date}
                  onChange={(value) => setFormData({ ...formData, assessment_date: value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    考核结果 *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Assessment['status'] })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    required
                  >
                    <option value="待处理">待处理</option>
                    <option value="已通过">已通过</option>
                    <option value="未通过">未通过</option>
                    <option value="未完成">未完成</option>
                    <option value="模拟考">模拟考</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    地图 *
                  </label>
                  <select
                    value={formData.map}
                    onChange={(e) => setFormData({ ...formData, map: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    required
                  >
                    <option value="">选择地图</option>
                    {MAP_OPTIONS.map(map => (
                      <option key={map} value={map}>{map}</option>
                    ))}
                  </select>
                </div>

                {formData.map === '自定义' && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      自定义地图名称
                    </label>
                    <input
                      type="text"
                      value={formData.custom_map}
                      onChange={(e) => setFormData({ ...formData, custom_map: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                      placeholder="请输入地图名称"
                    />
                  </div>
                )}
              </div>

              {/* 评价 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  评价
                </label>
                <textarea
                  value={formData.evaluation}
                  onChange={(e) => setFormData({ ...formData, evaluation: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white min-h-[100px]"
                  placeholder="输入对学员的评价..."
                />
              </div>

              {/* 考核视频 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  考核视频 (Abyss外链)
                </label>
                <input
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  placeholder="https://short.icu/..."
                />
                <p className="mt-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1.5">
                  ⚠️ 提示：首次播放Abyss短链视频会<strong>弹出两次</strong>新标签页，请关闭这两个新页面后返回，第三次点击播放即可正常观看。新页面与紫夜无关，提醒学员谨防上当受骗！
                </p>
              </div>

              {/* 扣分记录 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-300">
                    考核记录（扣分项）
                  </label>
                  <button
                    type="button"
                    onClick={addDeductionRecord}
                    className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded transition-colors"
                  >
                    + 添加扣分项
                  </button>
                </div>

                {/* 扣分项说明 */}
                <div className="bg-gray-900/50 rounded-lg p-4 mb-4 text-sm">
                  <div className="text-gray-400 mb-2">扣分项参考：</div>
                  {Object.entries(DEDUCTION_CATEGORIES).map(([category, items]) => (
                    <div key={category} className="mb-2">
                      <div className="text-purple-400 font-medium mb-1">{category}</div>
                      <div className="grid grid-cols-2 gap-2 text-gray-400">
                        {items.map(item => (
                          <div key={item.code}>
                            <span className="text-white">{item.code}</span> - {item.name} ({item.scoreRange}分)
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 扣分记录列表 */}
                <div className="space-y-3">
                  {formData.deduction_records.map((record, index) => (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-4 relative">
                      <button
                        type="button"
                        onClick={() => removeDeductionRecord(index)}
                        className="absolute top-2 right-2 text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={16} />
                      </button>
                      
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">时间</label>
                          <input
                            type="time"
                            step="1"
                            value={record.time}
                            onChange={(e) => updateDeductionRecord(index, 'time', e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">违规代码</label>
                          <select
                            value={record.code}
                            onChange={(e) => updateDeductionRecord(index, 'code', e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                          >
                            <option value="">选择代码</option>
                            {Object.entries(DEDUCTION_CATEGORIES).map(([category, codes]) => (
                              <optgroup key={category} label={category}>
                                {(codes as Array<{code: string, name: string, scoreRange: string}>).map((item: any) => (
                                  <option key={item.code} value={item.code}>
                                    {item.code} - {item.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-1">
                          <label className="block text-xs text-gray-400 mb-1">扣分</label>
                          <input
                            type="number"
                            min="0"
                            value={record.score}
                            onChange={(e) => updateDeductionRecord(index, 'score', parseFloat(e.target.value) || 0)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="block text-xs text-gray-400 mb-1">描述</label>
                          <input
                            type="text"
                            value={record.description}
                            onChange={(e) => updateDeductionRecord(index, 'description', e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                            placeholder="扣分原因描述..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {formData.deduction_records.length === 0 && (
                    <div className="text-center text-gray-500 py-4">
                      暂无扣分记录
                    </div>
                  )}
                </div>

                {/* 总分显示 */}
                {formData.deduction_records.length > 0 && (
                  <div className="mt-4 bg-purple-900/20 rounded-lg p-4 border border-purple-700/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-gray-400 text-sm mb-1">总扣分</div>
                        <div className="text-red-400 text-xl font-bold">
                          -{formData.deduction_records.reduce((sum, r) => sum + r.score, 0)} 分
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-sm mb-1">最终得分</div>
                        <div className="text-white text-2xl font-bold">
                          {calculateTotalScore()} 分
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-sm mb-1">评级</div>
                        <div className={`text-xl font-bold ${getRating(calculateTotalScore()).color}`}>
                          {getRating(calculateTotalScore()).text}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {editingAssessment ? (submitting ? '保存中...' : '保存') : (submitting ? '创建中...' : '创建')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      {confirmDialog.show && confirmDialog.type === 'delete' && (
        <ConfirmDialog
          title="删除考核记录"
          message="确定要删除这条考核记录吗？此操作不可撤销。"
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDialog({show: false, type: ''})}
        />
      )}

      {confirmDialog.show && confirmDialog.type === 'batchDelete' && (
        <ConfirmDialog
          title="批量删除考核记录"
          message={`确定要删除选中的 ${selectedIds.size} 条考核记录吗？此操作不可撤销。`}
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
