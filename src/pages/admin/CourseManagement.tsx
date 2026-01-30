import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit, Trash2, Search, X, Filter, CheckSquare, Square, Settings, GripVertical, Users, Loader2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { courseAPI, progressAPI, memberAPI } from '../../utils/api'
import { toast } from '../../utils/toast'

interface Course {
  id: string
  code: string // 课程编号，如 1.1, 2.3
  name: string
  category: string // 类别名称
  difficulty: string // 难度名称  
  hours: number
  order: number // 排序序号
  description?: string
}

// 拖拽行组件
function CourseRow({ 
  course, 
  isSelected, 
  onToggleSelect, 
  onEdit, 
  onDelete,
  onAssign,
  getCategoryColor,
  getDifficultyColor
}: { 
  course: Course
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (course: Course) => void
  onDelete: (course: Course) => void
  onAssign: (course: Course) => void
  getCategoryColor: (category: string) => string
  getDifficultyColor: (difficulty: string) => string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: course.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <tr ref={setNodeRef} style={style}>
      <td>
        <button
          onClick={() => onToggleSelect(course.id)}
          className="flex items-center justify-center hover:text-purple-400 transition-colors"
        >
          {isSelected ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} className="text-gray-400" />}
        </button>
      </td>
      <td>
        <div>
          <div className="font-semibold text-white">{course.code} {course.name}</div>
          {course.description && (
            <div className="text-sm text-gray-400 mt-1">{course.description}</div>
          )}
        </div>
      </td>
      <td>
        <span className={`status-badge ${getCategoryColor(course.category)}`}>
          {course.category}
        </span>
      </td>
      <td>
        <span className={`status-badge ${getDifficultyColor(course.difficulty)}`}>
          {course.difficulty}
        </span>
      </td>
      <td>{course.hours} 课时</td>
      <td>
        <div className="flex gap-2">
          <button
            onClick={() => onAssign(course)}
            className="text-purple-400 hover:text-purple-300 transition-colors"
            title="分配进度"
          >
            <Users size={18} />
          </button>
          <button
            onClick={() => onEdit(course)}
            className="text-blue-400 hover:text-blue-300 transition-colors"
            title="编辑"
          >
            <Edit size={18} />
          </button>
          <button
            onClick={() => onDelete(course)}
            className="text-red-400 hover:text-red-300 transition-colors"
            title="删除"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </td>
      <td>
        <button
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-purple-400 transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </button>
      </td>
    </tr>
  )
}

export default function CourseManagement() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([])
  const [categories, setCategories] = useState<string[]>(['入门课程', '标准技能一阶课程', '标准技能二阶课程', '团队训练', '进阶课程'])
  const [difficulties, setDifficulties] = useState<string[]>(['初级', '中级', '高级'])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  // 从localStorage加载搜索关键词
  const [searchQuery, setSearchQuery] = useState(() => {
    return localStorage.getItem('courseListSearch') || ''
  })
  
  const [showFilters, setShowFilters] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showAddConfigModal, setShowAddConfigModal] = useState(false)
  const [configType, setConfigType] = useState<'category' | 'difficulty'>('category')
  const [newConfigName, setNewConfigName] = useState('')
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchModal, setShowBatchModal] = useState(false)
  
  // 从localStorage加载筛选条件
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('courseListFilters')
    return saved ? JSON.parse(saved) : {
      categories: [] as string[],
      difficulties: [] as string[]
    }
  })

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '入门课程',
    difficulty: '初级',
    hours: 1,
    description: ''
  })

  const [batchFormData, setBatchFormData] = useState({
    category: '',
    difficulty: '',
    hours: ''
  })
  
  // 课程进度分配
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assigningCourse, setAssigningCourse] = useState<Course | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set())
  const [assignProgress, setAssignProgress] = useState(0)
  const [loadingMembers, setLoadingMembers] = useState(false)
  
  // 删除确认对话框
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{type: 'single' | 'batch', course?: Course}>(null as any)
  
  // 警告成员模态框
  const [warningModal, setWarningModal] = useState<{show: boolean, members: any[]}>({show: false, members: []})

  useEffect(() => {
    loadCourses()
  }, [])

  // 保存搜索关键词到localStorage
  useEffect(() => {
    localStorage.setItem('courseListSearch', searchQuery)
  }, [searchQuery])

  // 保存筛选条件到localStorage
  useEffect(() => {
    localStorage.setItem('courseListFilters', JSON.stringify(filters))
  }, [filters])

  useEffect(() => {
    filterCourses()
  }, [courses, searchQuery, filters])

  const loadCourses = async () => {
    setLoading(true)
    try {
      const response = await courseAPI.getAll()
      const coursesData = response.data.map((c: any) => ({
        ...c,
        id: String(c.id) // 确保id是字符串
      }))
      setCourses(coursesData)
    } catch (error: any) {
      console.error('加载课程失败:', error)
      toast.error('加载课程失败，请检查后端服务是否启动')
    } finally {
      setLoading(false)
    }
  }

  const filterCourses = () => {
    let filtered = [...courses]

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        course =>
          course.code.toLowerCase().includes(query) ||
          course.name.toLowerCase().includes(query) ||
          course.description?.toLowerCase().includes(query)
      )
    }

    // 类别过滤
    if (filters.categories.length > 0) {
      filtered = filtered.filter(course => filters.categories.includes(course.category))
    }

    // 难度过滤
    if (filters.difficulties.length > 0) {
      filtered = filtered.filter(course => filters.difficulties.includes(course.difficulty))
    }

    setFilteredCourses(filtered)
  }

  const toggleFilter = (type: 'categories' | 'difficulties', value: string) => {
    setFilters((prev: { categories: string[], difficulties: string[] }) => ({
      ...prev,
      [type]: prev[type].includes(value)
        ? prev[type].filter((v: string) => v !== value)
        : [...prev[type], value]
    }))
  }

  const clearFilters = () => {
    setFilters({ categories: [], difficulties: [] })
  }

  // 选择功能
  const toggleSelectOne = (id: string) => {
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

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredCourses.map(c => c.id)))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())
  const isAllSelected = filteredCourses.length > 0 && filteredCourses.every(c => selectedIds.has(c.id))

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  // 拖拽结束处理
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = courses.findIndex(item => item.id === active.id)
      const newIndex = courses.findIndex(item => item.id === over.id)
      const newItems = arrayMove(courses, oldIndex, newIndex)
      
      // 更新order和code
      const updatedItems = newItems.map((item, index) => {
        // 获取类别前缀（如 "1", "2", "3"）
        const categoryPrefix = item.code.split('.')[0]
        
        // 计算该类别中的序号
        const sameCategoryItems = newItems.filter(c => c.code.startsWith(categoryPrefix + '.'))
        const indexInCategory = sameCategoryItems.findIndex(c => c.id === item.id) + 1
        
        return {
          ...item,
          code: `${categoryPrefix}.${indexInCategory}`,
          order: index + 1
        }
      })

      // 立即更新UI
      setCourses(updatedItems)
      
      // 调用API保存到数据库
      try {
        await courseAPI.updateOrder(updatedItems)
        toast.success('课程顺序更新成功')
      } catch (error: any) {
        console.error('更新顺序失败:', error)
        toast.error('更新顺序失败: ' + error.message)
        // 失败时重新加载
        await loadCourses()
      }
    }
  }

  // 批量操作
  const openBatchModal = () => {
    setBatchFormData({ category: '', difficulty: '', hours: '' })
    setShowBatchModal(true)
  }

  const handleBatchUpdate = async () => {
    try {
      const updates: any = {}
      if (batchFormData.category) updates.category = batchFormData.category
      if (batchFormData.difficulty) updates.difficulty = batchFormData.difficulty
      if (batchFormData.hours) updates.hours = parseInt(batchFormData.hours)

      await courseAPI.batchUpdate(Array.from(selectedIds), updates)
      await loadCourses()
      
      setShowBatchModal(false)
      clearSelection()
      toast.success(`已成功更新 ${selectedIds.size} 门课程`)
    } catch (error: any) {
      console.error('批量更新失败:', error)
      toast.error('批量更新失败: ' + error.message)
    }
  }

  const batchDelete = () => {
    openBatchDeleteModal()
  }

  // CRUD操作
  const openCreateModal = () => {
    setEditingCourse(null)
    setFormData({
      code: '',
      name: '',
      category: categories[0],
      difficulty: difficulties[0],
      hours: 1,
      description: ''
    })
    setShowModal(true)
  }

  const openEditModal = (course: Course) => {
    setEditingCourse(course)
    setFormData({
      code: course.code,
      name: course.name,
      category: course.category,
      difficulty: course.difficulty,
      hours: course.hours,
      description: course.description || ''
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingCourse) {
        // 编辑模式：检查是否与其他课程编号重复
        const duplicate = courses.find(c => c.code === formData.code && c.id !== editingCourse.id)
        if (duplicate) {
          toast.error(`课程编号 ${formData.code} 已存在，请使用其他编号`)
          return
        }
        await courseAPI.update(editingCourse.id, formData)
        await loadCourses()
        toast.success('课程更新成功')
      } else {
        // 创建模式：检查课程编号是否已存在
        const duplicate = courses.find(c => c.code === formData.code)
        if (duplicate) {
          toast.error(`课程编号 ${formData.code} 已存在，请使用其他编号`)
          return
        }

        // 根据课程编号计算插入位置
        const insertPosition = calculateInsertPosition(formData.code, courses)
        
        await courseAPI.create({
          ...formData,
          order: insertPosition
        })
        await loadCourses()
        toast.success('课程创建成功')
      }
      setShowModal(false)
    } catch (error: any) {
      console.error('操作失败:', error)
      toast.error('操作失败: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  // 根据课程编号计算插入位置
  const calculateInsertPosition = (code: string, courseList: Course[]): number => {
    // 如果没有课程，插入到第一位
    if (courseList.length === 0) return 1

    // 解析课程编号（如 "1.1" -> [1, 1]，"2.10" -> [2, 10]）
    const parseCode = (c: string) => {
      const parts = c.split('.')
      return parts.map(p => parseInt(p) || 0)
    }

    const newCodeParts = parseCode(code)

    // 找到应该插入的位置
    let insertIndex = 0
    for (let i = 0; i < courseList.length; i++) {
      const currentCodeParts = parseCode(courseList[i].code)
      
      // 比较编号大小
      let shouldInsertHere = false
      for (let j = 0; j < Math.max(newCodeParts.length, currentCodeParts.length); j++) {
        const newPart = newCodeParts[j] || 0
        const currentPart = currentCodeParts[j] || 0
        
        if (newPart < currentPart) {
          shouldInsertHere = true
          break
        } else if (newPart > currentPart) {
          break
        }
      }
      
      if (shouldInsertHere) {
        insertIndex = i
        break
      } else {
        insertIndex = i + 1
      }
    }

    // 返回 order 值（从1开始）
    return insertIndex + 1
  }

  const openDeleteModal = (course: Course) => {
    setDeleteTarget({ type: 'single', course })
    setShowDeleteModal(true)
  }

  const openBatchDeleteModal = () => {
    setDeleteTarget({ type: 'batch' })
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    try {
      if (deleteTarget.type === 'single' && deleteTarget.course) {
        await courseAPI.delete(deleteTarget.course.id)
        toast.success(`已删除课程 ${deleteTarget.course.code} ${deleteTarget.course.name}`)
      } else if (deleteTarget.type === 'batch') {
        await courseAPI.batchDelete(Array.from(selectedIds))
        toast.success(`已删除 ${selectedIds.size} 门课程`)
        clearSelection()
      }
      await loadCourses()
      setShowDeleteModal(false)
    } catch (error: any) {
      console.error('删除失败:', error)
      toast.error('删除失败: ' + error.message)
    }
  }

  const handleDelete = (course: Course) => {
    openDeleteModal(course)
  }

  // 配置类别和难度
  const openConfigModal = (type: 'category' | 'difficulty') => {
    setConfigType(type)
    setShowConfigModal(true)
  }

  const openAddConfigModal = () => {
    setNewConfigName('')
    setShowAddConfigModal(true)
  }

  const addConfig = () => {
    if (newConfigName && newConfigName.trim()) {
      if (configType === 'category') {
        if (!categories.includes(newConfigName.trim())) {
          setCategories([...categories, newConfigName.trim()])
          toast.success(`类别 "${newConfigName.trim()}" 添加成功`)
        } else {
          toast.error('该类别已存在')
        }
      } else {
        if (!difficulties.includes(newConfigName.trim())) {
          setDifficulties([...difficulties, newConfigName.trim()])
          toast.success(`难度 "${newConfigName.trim()}" 添加成功`)
        } else {
          toast.error('该难度已存在')
        }
      }
      setShowAddConfigModal(false)
      setNewConfigName('')
    } else {
      toast.error('请输入名称')
    }
  }

  const removeConfig = (name: string) => {
    if (configType === 'category') {
      setCategories(categories.filter(c => c !== name))
    } else {
      setDifficulties(difficulties.filter(d => d !== name))
    }
  }

  // 课程进度分配
  const openAssignModal = async (course: Course) => {
    setAssigningCourse(course)
    setShowAssignModal(true)
    setSelectedMemberIds(new Set())
    setAssignProgress(0)
    await loadMembers()
  }

  const closeAssignModal = () => {
    setShowAssignModal(false)
    setAssigningCourse(null)
    setSelectedMemberIds(new Set())
    setAssignProgress(0)
    setMembers([])
    setMemberSearchQuery('')
  }

  const loadMembers = async () => {
    setLoadingMembers(true)
    try {
      const response = await progressAPI.getMembers()
      setMembers(response.data)
    } catch (error: any) {
      console.error('加载成员列表失败:', error)
      toast.error('加载成员列表失败')
    } finally {
      setLoadingMembers(false)
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

  const toggleMemberSelect = (memberId: number) => {
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

  const toggleSelectAllMembers = () => {
    const filteredMembers = getFilteredMembers()
    if (selectedMemberIds.size === filteredMembers.length && filteredMembers.length > 0) {
      setSelectedMemberIds(new Set())
    } else {
      setSelectedMemberIds(new Set(filteredMembers.map(m => m.id)))
    }
  }

  const getFilteredMembers = () => {
    if (!memberSearchQuery.trim()) return members
    const query = memberSearchQuery.toLowerCase()
    return members.filter(m => 
      m.name.toLowerCase().includes(query) ||
      m.id.toString().includes(query)
    )
  }

  const handleAssignProgress = async () => {
    if (selectedMemberIds.size === 0) {
      toast.error('请至少选择一个成员')
      return
    }
    if (!assigningCourse) return

    try {
      await progressAPI.batchUpdateCourse(
        assigningCourse.id,
        Array.from(selectedMemberIds).map(String),
        assignProgress
      )
      
      // 自动同步这些成员的阶段
      const memberIds = Array.from(selectedMemberIds)
      const syncResult = await memberAPI.syncStage(memberIds)
      
      toast.success(`已为 ${selectedMemberIds.size} 名成员设置课程进度为 ${assignProgress}%，并同步阶段`)
      closeAssignModal()
      
      // 检查是否有新训准考但课程进度不足的成员
      if (syncResult.data?.warningMembers && syncResult.data.warningMembers.length > 0) {
        handleWarningMembers(syncResult.data.warningMembers)
      }
    } catch (error: any) {
      console.error('设置进度失败:', error)
      toast.error('设置进度失败')
    }
  }

  // 批量分配课程
  const openBatchAssignModal = async () => {
    if (selectedIds.size === 0) {
      toast.error('请先选择要分配的课程')
      return
    }
    setShowAssignModal(true)
    setSelectedMemberIds(new Set())
    setAssignProgress(0)
    await loadMembers()
  }

  const handleBatchAssignProgress = async () => {
    if (selectedMemberIds.size === 0) {
      toast.error('请至少选择一个成员')
      return
    }
    if (selectedIds.size === 0) {
      toast.error('请至少选择一个课程')
      return
    }

    try {
      const courseIds = Array.from(selectedIds)
      const memberIds = Array.from(selectedMemberIds).map(String)
      
      // 批量为每个课程设置进度
      for (const courseId of courseIds) {
        await progressAPI.batchUpdateCourse(
          courseId,
          memberIds,
          assignProgress
        )
      }
      
      // 自动同步这些成员的阶段
      const memberIdsNum = Array.from(selectedMemberIds)
      const syncResult = await memberAPI.syncStage(memberIdsNum)
      
      toast.success(`已为 ${selectedMemberIds.size} 名成员分配 ${selectedIds.size} 门课程，进度设置为 ${assignProgress}%，并同步阶段`)
      closeAssignModal()
      
      // 检查是否有新训准考但课程进度不足的成员
      if (syncResult.data?.warningMembers && syncResult.data.warningMembers.length > 0) {
        handleWarningMembers(syncResult.data.warningMembers)
      }
      setSelectedIds(new Set()) // 清空课程选择
    } catch (error: any) {
      console.error('批量设置进度失败:', error)
      toast.error('批量设置进度失败')
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case '初级': return 'bg-green-600/20 text-green-300'
      case '中级': return 'bg-blue-600/20 text-blue-300'
      case '高级': return 'bg-red-600/20 text-red-300'
      default: return 'bg-gray-600/20 text-gray-300'
    }
  }

  const getCategoryColor = (category: string) => {
    const index = categories.indexOf(category)
    const colors = [
      'bg-purple-600/20 text-purple-300',
      'bg-blue-600/20 text-blue-300',
      'bg-cyan-600/20 text-cyan-300',
      'bg-yellow-600/20 text-yellow-300',
      'bg-orange-600/20 text-orange-300'
    ]
    return colors[index % colors.length] || 'bg-gray-600/20 text-gray-300'
  }

  const activeFilterCount = filters.categories.length + filters.difficulties.length

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">课程管理</h1>
          <span className="text-sm text-gray-400">共 {courses.length} 门课程</span>
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
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索课程编号、名称..."
              className="bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-gray-400 w-64 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              showFilters ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Filter size={20} />
            筛选{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
          <button
            onClick={() => openConfigModal('category')}
            className="px-4 py-2 rounded-lg flex items-center gap-2 bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            title="管理类别和难度"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={openCreateModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            添加课程
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">批量操作</span>
            <div className="flex gap-2">
              <button onClick={openBatchAssignModal} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors">
                批量分配
              </button>
              <button onClick={openBatchModal} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors">
                批量修改
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
            <h3 className="text-white font-semibold">筛选条件</h3>
            <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white transition-colors">
              清空筛选
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">课程类别</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleFilter('categories', cat)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      filters.categories.includes(cat)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">课程难度</label>
              <div className="flex flex-wrap gap-2">
                {difficulties.map(diff => (
                  <button
                    key={diff}
                    onClick={() => toggleFilter('difficulties', diff)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      filters.difficulties.includes(diff)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {diff}
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                    <th>课程信息</th>
                    <th>类别</th>
                    <th>难度</th>
                    <th>课时</th>
                    <th className="action-col">操作</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={filteredCourses.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {filteredCourses.map((course) => (
                      <CourseRow
                        key={course.id}
                        course={course}
                        isSelected={selectedIds.has(course.id)}
                        onToggleSelect={toggleSelectOne}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onAssign={openAssignModal}
                        getCategoryColor={getCategoryColor}
                        getDifficultyColor={getDifficultyColor}
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
            </DndContext>
          </div>
        )}
      </div>

      {/* 添加/编辑课程模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-2xl border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingCourse ? '编辑课程' : '添加课程'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">课程编号 *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    className={`w-full bg-gray-700 border rounded-lg px-3 py-2 text-white ${
                      formData.code && courses.find(c => c.code === formData.code && (!editingCourse || c.id !== editingCourse.id))
                        ? 'border-red-500'
                        : 'border-gray-600'
                    }`}
                    placeholder="如: 1.1"
                    required
                  />
                  {formData.code && courses.find(c => c.code === formData.code && (!editingCourse || c.id !== editingCourse.id)) && (
                    <p className="text-red-400 text-xs mt-1">❌ 课程编号已存在</p>
                  )}
                  {formData.code && !courses.find(c => c.code === formData.code && (!editingCourse || c.id !== editingCourse.id)) && !editingCourse && (
                    <p className="text-green-400 text-xs mt-1">✓ 课程编号可用</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">课时 *</label>
                  <input
                    type="number"
                    value={formData.hours}
                    onChange={e => setFormData({ ...formData, hours: parseInt(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">课程名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  placeholder="如: CQB基础理论知识"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">课程类别 *</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    required
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">课程难度 *</label>
                  <select
                    value={formData.difficulty}
                    onChange={e => setFormData({ ...formData, difficulty: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    required
                  >
                    {difficulties.map(diff => (
                      <option key={diff} value={diff}>{diff}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">课程描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="可选填写课程详细描述..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {editingCourse ? (submitting ? '保存中...' : '保存修改') : (submitting ? '添加中...' : '添加课程')}
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

      {/* 批量修改模态框 */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">批量修改课程</h2>
            <p className="text-sm text-gray-400 mb-4">已选中 {selectedIds.size} 门课程，填写需要修改的字段：</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">类别（留空不修改）</label>
                <select
                  value={batchFormData.category}
                  onChange={e => setBatchFormData({ ...batchFormData, category: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">不修改</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">难度（留空不修改）</label>
                <select
                  value={batchFormData.difficulty}
                  onChange={e => setBatchFormData({ ...batchFormData, difficulty: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">不修改</option>
                  {difficulties.map(diff => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">课时（留空不修改）</label>
                <input
                  type="number"
                  value={batchFormData.hours}
                  onChange={e => setBatchFormData({ ...batchFormData, hours: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  placeholder="不修改"
                  min="1"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleBatchUpdate}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                >
                  确认修改
                </button>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 配置类别/难度模态框 */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">配置管理</h2>
              <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setConfigType('category')}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  configType === 'category' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
              >
                课程类别
              </button>
              <button
                onClick={() => setConfigType('difficulty')}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  configType === 'difficulty' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
              >
                难度等级
              </button>
            </div>

            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {(configType === 'category' ? categories : difficulties).map(item => (
                <div key={item} className="flex justify-between items-center bg-gray-700/50 px-3 py-2 rounded">
                  <span className="text-white">{item}</span>
                  <button
                    onClick={() => removeConfig(item)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={openAddConfigModal}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              添加新{configType === 'category' ? '类别' : '难度'}
            </button>
          </div>
        </div>
      )}

      {/* 添加配置项模态框 */}
      {showAddConfigModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddConfigModal(false)}
        >
          <div 
            className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">
                添加新{configType === 'category' ? '类别' : '难度'}
              </h2>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {configType === 'category' ? '类别' : '难度'}名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addConfig()
                  }
                }}
                placeholder={`请输入${configType === 'category' ? '类别' : '难度'}名称`}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 transition-colors"
                autoFocus
              />
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => setShowAddConfigModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={addConfig}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 课程进度分配模态框 */}
      {showAssignModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeAssignModal}
        >
          <div 
            className="bg-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 modal-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">
                {assigningCourse 
                  ? `为课程"${assigningCourse.code} ${assigningCourse.name}"分配进度`
                  : `批量分配课程进度（已选 ${selectedIds.size} 门课程）`
                }
              </h2>
              <button onClick={closeAssignModal} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {/* 进度选择 */}
              <div className="mb-6 bg-purple-900/20 border border-purple-700 rounded-lg p-4">
                <label className="block text-sm text-gray-400 mb-3">选择进度</label>
                <div className="flex gap-2">
                  {[0, 10, 20, 50, 75, 100].map((progress) => (
                    <button
                      key={progress}
                      onClick={() => setAssignProgress(progress)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        assignProgress === progress
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                          : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {progress === 0 ? '未开始' : `${progress}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* 成员列表 */}
              {loadingMembers ? (
                <div className="text-center text-gray-400 py-12">加载成员中...</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <h3 className="text-white font-semibold">选择成员</h3>
                      <span className="text-sm text-gray-400">
                        {selectedMemberIds.size > 0 && (
                          <span className="text-purple-400">已选中 {selectedMemberIds.size} 名成员</span>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={toggleSelectAllMembers}
                      className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {selectedMemberIds.size === getFilteredMembers().length && getFilteredMembers().length > 0 ? '取消全选' : '全选'}
                    </button>
                  </div>

                  {/* 成员搜索框 */}
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="搜索成员ID或昵称..."
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    {memberSearchQuery && (
                      <button
                        onClick={() => setMemberSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 max-h-[400px] overflow-y-auto modal-scrollbar">
                    {getFilteredMembers().map((member) => (
                      <button
                        key={member.id}
                        onClick={() => toggleMemberSelect(member.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                          selectedMemberIds.has(member.id)
                            ? 'bg-purple-600/20 border-purple-600 text-purple-300'
                            : 'bg-gray-700/50 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600'
                        }`}
                      >
                        {selectedMemberIds.has(member.id) ? (
                          <CheckSquare size={18} className="text-purple-400" />
                        ) : (
                          <Square size={18} className="text-gray-500" />
                        )}
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium">{member.name}</div>
                          <div className="text-xs text-gray-500">{member.status}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={closeAssignModal}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={assigningCourse ? handleAssignProgress : handleBatchAssignProgress}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={selectedMemberIds.size === 0}
                    >
                      {assigningCourse ? '设置进度' : `为 ${selectedIds.size} 门课程设置进度`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 删除确认模态框 */}
      {showDeleteModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div 
            className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">确认删除</h2>
            </div>

            <div className="p-6">
              <p className="text-gray-300 mb-6">
                {deleteTarget?.type === 'single' && deleteTarget.course ? (
                  <>
                    确定要删除课程 <span className="text-purple-400 font-semibold">"{deleteTarget.course.code} {deleteTarget.course.name}"</span> 吗？
                  </>
                ) : (
                  <>
                    确定要删除选中的 <span className="text-purple-400 font-semibold">{selectedIds.size}</span> 门课程吗？
                  </>
                )}
              </p>
              <p className="text-red-400 text-sm mb-6">
                ⚠️ 此操作无法撤销，请谨慎操作！
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition-colors"
                >
                  确认删除
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
