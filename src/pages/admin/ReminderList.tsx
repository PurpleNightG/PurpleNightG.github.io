import { useState, useEffect, useRef } from 'react'
import { reminderAPI, quitAPI, memberAPI } from '../../utils/api'
import { Settings, Edit, Filter, ChevronUp, ChevronDown, Search, X, CheckSquare, Square, UserMinus, Copy, Eye, EyeOff, BellOff, Bell, MoreHorizontal } from 'lucide-react'
import { toast } from '../../utils/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import { formatDate } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import { useBadges } from '../../contexts/BadgeContext'

interface ReminderItem {
  id: number
  member_id: number
  member_name: string
  qq?: string
  stage_role: string
  last_training_date: string | null
  days_without_training: number
  custom_timeout_days: number | null
  days_until_timeout: number
  is_leave_buffer?: number | boolean
  buffer_remaining_days?: number | null
  /** 有自定义超时且尚未进入有效超时预警窗（延期保留在名单） */
  is_custom_extended?: number | boolean
}

/** 与后端 TRAINING_WARN_DAYS 一致：还剩 ≤N 天进入训练催促 */
const TRAINING_WARN_DAYS = 3

interface AttendanceItem {
  member_id: number
  member_name: string
  qq?: string
  stage_role: string
  join_date?: string
  last_training_date?: string | null
  phase3_reached_at?: string | null
  status: string
  ignored: boolean
  paused: boolean
  reason_code: string
  reason_label: string
  remaining_days: number
  elapsed_days: number
  deadline_days: number
  has_custom_deadline?: boolean
  custom_deadline_days?: number | null
  reasons: {
    reason_code: string
    reason_label: string
    deadline_days: number
    elapsed_days: number
    remaining_days: number
    paused: boolean
    has_custom_deadline?: boolean
  }[]
}

type ReminderTab = 'training' | 'attendance'

type AttendanceFilters = {
  timeout_status: string[]
  reason_code: string[]
  stage_role: string[]
  ignored: string[]
  inverseMode: boolean
}

const ATTENDANCE_REASON_OPTIONS = [
  { code: 'to_phase3', label: '达三期' },
  { code: 'to_formal', label: '转正' },
  { code: 'formal_idle', label: '半年新训' },
]

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export default function ReminderList() {
  const { refreshBadges } = useBadges()
  const [activeTab, setActiveTab] = useState<ReminderTab>(() => {
    const saved = localStorage.getItem('reminderActiveTab')
    return saved === 'attendance' ? 'attendance' : 'training'
  })
  const [items, setItems] = useState<ReminderItem[]>([])
  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([])
  const [attendanceWarnCount, setAttendanceWarnCount] = useState(0)
  const [showAllAttendance, setShowAllAttendance] = useState(() => localStorage.getItem('reminderShowAllAttendance') === '1')
  /** 显示因「自定义还剩天数」而延期、尚未回到预警窗的成员；默认开，避免改完就消失 */
  const [showCustomExtended, setShowCustomExtended] = useState(() => localStorage.getItem('reminderShowCustomExtended') !== '0')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [displayMode, setDisplayMode] = useState<'remaining' | 'kick_cycle'>(() =>
    localStorage.getItem('reminderDisplayMode') === 'kick_cycle' ? 'kick_cycle' : 'remaining'
  )
  const [kickWeekday, setKickWeekday] = useState(1)
  const [kickLeadDays, setKickLeadDays] = useState(3)
  const [kickMeta, setKickMeta] = useState<{
    inWindow: boolean
    daysUntilKick: number
    kickDate: string
    windowStart: string
    kickWeekdayLabel: string
    leadDays: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [timeoutDays, setTimeoutDays] = useState(7)
  const [confirmDialog, setConfirmDialog] = useState<{show: boolean, type: string, data?: any}>({show: false, type: ''})
  const [editingItem, setEditingItem] = useState<ReminderItem | null>(null)

  // 搜索、筛选、排序、多选
  const [showFilters, setShowFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('reminderSearch') || '')
  const [attendanceSearch, setAttendanceSearch] = useState(() => localStorage.getItem('reminderAttendanceSearch') || '')
  const [filters, setFilters] = useState(() => {
    const defaultFilters = {
      timeout_status: [] as string[],
      has_custom_timeout: [] as string[],
      stage_role: [] as string[],
      inverseMode: false,
    }
    const parsed = readJson<any>('reminderFilters', defaultFilters)
    return {
      ...defaultFilters,
      ...parsed,
      stage_role: parsed.stage_role || [],
    }
  })
  const [attendanceFilters, setAttendanceFilters] = useState<AttendanceFilters>(() => {
    const defaultFilters: AttendanceFilters = {
      timeout_status: [],
      reason_code: [],
      stage_role: [],
      ignored: [],
      inverseMode: false,
    }
    const parsed = readJson<Partial<AttendanceFilters>>('reminderAttendanceFilters', defaultFilters)
    return {
      ...defaultFilters,
      ...parsed,
      timeout_status: parsed.timeout_status || [],
      reason_code: parsed.reason_code || [],
      stage_role: parsed.stage_role || [],
      ignored: parsed.ignored || [],
      inverseMode: !!parsed.inverseMode,
    }
  })
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() =>
    readJson('reminderSort', null)
  )
  const [attendanceSortConfig, setAttendanceSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(() =>
    readJson('reminderAttendanceSort', null)
  )

  useEffect(() => {
    const load = async () => {
      await loadTimeoutDays()
      void loadAttendance()
      void refreshBadges()
    }
    load()
  }, [])

  useEffect(() => {
    void loadAttendance()
  }, [showAllAttendance])

  useEffect(() => { localStorage.setItem('reminderActiveTab', activeTab) }, [activeTab])
  useEffect(() => { localStorage.setItem('reminderShowAllAttendance', showAllAttendance ? '1' : '0') }, [showAllAttendance])
  useEffect(() => { localStorage.setItem('reminderShowCustomExtended', showCustomExtended ? '1' : '0') }, [showCustomExtended])
  useEffect(() => { localStorage.setItem('reminderDisplayMode', displayMode) }, [displayMode])

  useEffect(() => {
    if (!showMoreMenu) return
    const onPointerDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showMoreMenu])

  useEffect(() => {
    void loadItems()
  }, [displayMode])

  useEffect(() => { localStorage.setItem('reminderFilters', JSON.stringify(filters)) }, [filters])
  useEffect(() => { localStorage.setItem('reminderAttendanceFilters', JSON.stringify(attendanceFilters)) }, [attendanceFilters])
  useEffect(() => { if (sortConfig) localStorage.setItem('reminderSort', JSON.stringify(sortConfig)); else localStorage.removeItem('reminderSort') }, [sortConfig])
  useEffect(() => { if (attendanceSortConfig) localStorage.setItem('reminderAttendanceSort', JSON.stringify(attendanceSortConfig)); else localStorage.removeItem('reminderAttendanceSort') }, [attendanceSortConfig])
  useEffect(() => { localStorage.setItem('reminderSearch', searchQuery) }, [searchQuery])
  useEffect(() => { localStorage.setItem('reminderAttendanceSearch', attendanceSearch) }, [attendanceSearch])

  const loadTimeoutDays = async () => {
    try {
      const [timeoutRes, kick] = await Promise.all([
        reminderAPI.getTimeoutDays(),
        reminderAPI.getKickSettings(),
      ])
      setTimeoutDays(parseInt(timeoutRes.data.setting_value))
      setKickWeekday(kick.kickWeekday)
      setKickLeadDays(kick.leadDays)
      // 以服务端保存的模式为准（多管理员共享）；本地仅作瞬时切换缓存
      if (kick.displayMode === 'kick_cycle' || kick.displayMode === 'remaining') {
        setDisplayMode(kick.displayMode)
      }
    } catch (error: any) {
      console.error('获取催促设置失败:', error)
    }
  }

  const loadItems = async () => {
    try {
      const response = await reminderAPI.getAll(displayMode)
      setItems(response.data || [])
      setKickMeta(response.meta?.kick || null)
      void refreshBadges()
    } catch (error: any) {
      toast.error(error.message || '加载催促名单失败')
    } finally {
      setLoading(false)
    }
  }

  const switchDisplayMode = async (mode: 'remaining' | 'kick_cycle') => {
    if (mode === displayMode) return
    setDisplayMode(mode)
    setLoading(true)
    try {
      await reminderAPI.updateKickSettings({ displayMode: mode })
      void refreshBadges()
    } catch (error: any) {
      toast.error(error.message || '切换显示模式失败')
    }
  }

  const loadAttendance = async () => {
    setAttendanceLoading(true)
    try {
      const [listRes, warnRes] = await Promise.all([
        reminderAPI.getAttendance(showAllAttendance),
        showAllAttendance ? reminderAPI.getAttendance(false) : Promise.resolve(null),
      ])
      setAttendanceItems(listRes.data || [])
      setAttendanceWarnCount(
        showAllAttendance
          ? (warnRes?.data?.length ?? 0)
          : (listRes.data?.length ?? 0)
      )
      void refreshBadges()
    } catch (error: any) {
      toast.error(error.message || '加载考勤催促失败')
    } finally {
      setAttendanceLoading(false)
    }
  }

  const copyUrgeMentions = async (list: { qq?: string; member_name?: string }[]) => {
    const parts = list
      .map(i => (i.qq || '').trim())
      .filter(Boolean)
      .map(qq => `@${qq}`)
    if (parts.length === 0) {
      toast.warning('没有可复制的 QQ 号')
      return
    }
    const text = parts.join(' ')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已复制 ${parts.length} 人催促：${text.length > 40 ? text.slice(0, 40) + '…' : text}`)
    } catch {
      toast.error('复制失败，请检查浏览器权限')
    }
  }

  const handleOneClickUrgeTraining = () => {
    const targets = selectedIds.size > 0
      ? filteredItems.filter(item => selectedIds.has(item.id))
      // 一键催促默认不含「自定义延期」（尚未回到预警窗）
      : filteredItems.filter(item => !item.is_custom_extended)
    copyUrgeMentions(targets)
  }

  const handleOneClickUrgeAttendance = () => {
    const targets = selectedAttendanceIds.size > 0
      ? filteredAttendance.filter(item => selectedAttendanceIds.has(item.member_id))
      : filteredAttendance
    copyUrgeMentions(targets)
  }

  const toggleFilter = (type: 'timeout_status' | 'has_custom_timeout' | 'stage_role', value: string) => {
    setFilters((prev: typeof filters) => {
      const current = prev[type]
      const updated = current.includes(value) ? current.filter((v: string) => v !== value) : [...current, value]
      return { ...prev, [type]: updated }
    })
  }

  const stageOrder: { [key: string]: number } = {
    '未新训': 1, '新训初期': 2, '新训一期': 3, '新训二期': 4, '新训三期': 5,
    '新训准考': 6, '紫夜': 7, '紫夜尖兵': 8,
    '会长': 9, '执行官': 10, '人事': 11, '总教': 12, '尖兵教官': 13, '教官': 14, '工程师': 15
  }
  const specialRoles = ['会长', '执行官', '人事', '总教', '尖兵教官', '工程师', '教官']

  const clearFilters = () => setFilters({ timeout_status: [], has_custom_timeout: [], stage_role: [], inverseMode: false })

  const clearAttendanceFilters = () => setAttendanceFilters({
    timeout_status: [],
    reason_code: [],
    stage_role: [],
    ignored: [],
    inverseMode: false,
  })

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }

  const handleAttendanceSort = (key: string) => {
    setAttendanceSortConfig(prev => {
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

  const getAttendanceTimeoutStatus = (item: AttendanceItem) => {
    if (item.remaining_days > 0) return '未超时'
    if (item.remaining_days === 0) return '今天到期'
    return '已超时'
  }

  const toggleAttendanceFilter = (
    type: 'timeout_status' | 'reason_code' | 'stage_role' | 'ignored',
    value: string,
  ) => {
    setAttendanceFilters(prev => {
      const current = prev[type]
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
      return { ...prev, [type]: updated }
    })
  }

  const getFilteredAndSortedItems = () => {
    let filtered = [...items]

    if (!showCustomExtended) {
      filtered = filtered.filter(item => !item.is_custom_extended)
    }

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
        if (sortConfig.key === 'stage_role') {
          const aOrder = stageOrder[(a as any).stage_role] ?? 999
          const bOrder = stageOrder[(b as any).stage_role] ?? 999
          const comparison = aOrder - bOrder
          return sortConfig.direction === 'asc' ? comparison : -comparison
        }
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

  const filteredAttendance = (() => {
    let filtered = [...attendanceItems]

    if (attendanceSearch) {
      const q = attendanceSearch.toLowerCase()
      filtered = filtered.filter(item =>
        item.member_name.toLowerCase().includes(q) ||
        (item.qq || '').includes(q) ||
        item.reason_label.toLowerCase().includes(q) ||
        item.stage_role.toLowerCase().includes(q)
      )
    }

    if (attendanceFilters.timeout_status.length > 0) {
      filtered = filtered.filter(item => {
        const status = getAttendanceTimeoutStatus(item)
        return attendanceFilters.inverseMode
          ? !attendanceFilters.timeout_status.includes(status)
          : attendanceFilters.timeout_status.includes(status)
      })
    }

    if (attendanceFilters.reason_code.length > 0) {
      filtered = filtered.filter(item => {
        const hit = item.reasons.some(r => attendanceFilters.reason_code.includes(r.reason_code))
          || attendanceFilters.reason_code.includes(item.reason_code)
        return attendanceFilters.inverseMode ? !hit : hit
      })
    }

    if (attendanceFilters.stage_role.length > 0) {
      filtered = filtered.filter(item => {
        const hit = attendanceFilters.stage_role.includes(item.stage_role)
        return attendanceFilters.inverseMode ? !hit : hit
      })
    }

    if (attendanceFilters.ignored.length > 0) {
      filtered = filtered.filter(item => {
        const label = item.ignored ? '已忽略' : '未忽略'
        return attendanceFilters.inverseMode
          ? !attendanceFilters.ignored.includes(label)
          : attendanceFilters.ignored.includes(label)
      })
    }

    if (attendanceSortConfig) {
      filtered.sort((a, b) => {
        if (attendanceSortConfig.key === 'stage_role') {
          const aOrder = stageOrder[a.stage_role] ?? 999
          const bOrder = stageOrder[b.stage_role] ?? 999
          const comparison = aOrder - bOrder
          return attendanceSortConfig.direction === 'asc' ? comparison : -comparison
        }
        const aVal = (a as any)[attendanceSortConfig.key]
        const bVal = (b as any)[attendanceSortConfig.key]
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const comparison = aVal.localeCompare(bVal, 'zh-CN')
          return attendanceSortConfig.direction === 'asc' ? comparison : -comparison
        }
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return attendanceSortConfig.direction === 'asc' ? comparison : -comparison
      })
    }

    return filtered
  })()

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
  /** 批量：希望每人还剩几天；null = 恢复全局 */
  const [batchRemainingDays, setBatchRemainingDays] = useState<number | null>(null)
  /** 单个：希望还剩几天；null = 恢复全局 */
  const [remainingDaysInput, setRemainingDaysInput] = useState<number | null>(null)
  const [batchAttendanceTimeoutModal, setBatchAttendanceTimeoutModal] = useState(false)
  const [batchAttendanceRemainingDays, setBatchAttendanceRemainingDays] = useState<number | null>(null)
  const [editingAttendanceItem, setEditingAttendanceItem] = useState<AttendanceItem | null>(null)
  const [attendanceRemainingDaysInput, setAttendanceRemainingDaysInput] = useState<number | null>(null)

  const handleBatchUpdateTimeout = () => {
    if (selectedIds.size === 0) return
    // 默认填入选中项中「距离超时」的中位数，方便一键统一还剩天数
    const selected = items.filter(item => selectedIds.has(item.id))
    const remainings = selected.map(i => i.days_until_timeout).sort((a, b) => a - b)
    const mid = remainings.length ? remainings[Math.floor(remainings.length / 2)] : 3
    setBatchRemainingDays(Math.max(0, mid))
    setBatchTimeoutModal(true)
  }

  const confirmBatchUpdateTimeout = async () => {
    setBatchTimeoutModal(false)
    try {
      const selected = items.filter(item => selectedIds.has(item.id))
      if (batchRemainingDays === null) {
        await reminderAPI.batchUpdateTimeout(selected.map(i => i.id), null)
        toast.success(`已为 ${selected.length} 个成员恢复使用全局超时天数设置`)
      } else {
        for (const item of selected) {
          const customDays = Math.max(1, item.days_without_training + batchRemainingDays)
          await reminderAPI.updateTimeout(item.id, customDays)
        }
        toast.success(`已为 ${selected.length} 人设置还剩 ${batchRemainingDays} 天（按各自未训天数自动换算）`)
      }
      clearSelection()
      await loadItems()
      void refreshBadges()
    } catch (error: any) {
      toast.error(error.message || '批量修改失败')
    }
  }

  const handleBatchUpdateAttendanceTimeout = () => {
    if (selectedAttendanceIds.size === 0) return
    const selected = attendanceItems.filter(item => selectedAttendanceIds.has(item.member_id))
    const remainings = selected.map(i => i.remaining_days).sort((a, b) => a - b)
    const mid = remainings.length ? remainings[Math.floor(remainings.length / 2)] : 7
    setBatchAttendanceRemainingDays(Math.max(0, mid))
    setBatchAttendanceTimeoutModal(true)
  }

  const confirmBatchUpdateAttendanceTimeout = async () => {
    setBatchAttendanceTimeoutModal(false)
    try {
      const ids = [...selectedAttendanceIds]
      await reminderAPI.batchUpdateAttendanceTimeout(ids, batchAttendanceRemainingDays)
      toast.success(
        batchAttendanceRemainingDays === null
          ? `已为 ${ids.length} 人恢复默认考勤期限`
          : `已为 ${ids.length} 人设置还剩 ${batchAttendanceRemainingDays} 天`
      )
      setSelectedAttendanceIds(new Set())
      await loadAttendance()
      void refreshBadges()
    } catch (error: any) {
      toast.error(error.message || '批量修改失败')
    }
  }

  const handleEditAttendanceTimeout = (item: AttendanceItem) => {
    setEditingAttendanceItem(item)
    setAttendanceRemainingDaysInput(Math.max(0, item.remaining_days))
  }

  const handleSaveAttendanceTimeout = async () => {
    if (!editingAttendanceItem) return
    try {
      await reminderAPI.updateAttendanceTimeout(
        editingAttendanceItem.member_id,
        attendanceRemainingDaysInput,
        editingAttendanceItem.reason_code
      )
      toast.success(
        attendanceRemainingDaysInput === null || Number.isNaN(attendanceRemainingDaysInput)
          ? '已恢复默认考勤期限'
          : `已设置还剩 ${attendanceRemainingDaysInput} 天`
      )
      setEditingAttendanceItem(null)
      await loadAttendance()
      void refreshBadges()
    } catch (error: any) {
      toast.error(error.message || '保存失败')
    }
  }

  // 批量添加到退队审批
  const handleBatchAddToQuit = async () => {
    if (selectedIds.size === 0) return
    
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
    const userObj = userStr ? JSON.parse(userStr) : null
    const adminId = userObj?.id
    const adminName = userObj?.name || userObj?.username || '管理员'

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
    
    const userStr2 = localStorage.getItem('user') || sessionStorage.getItem('user')
    const userObj2 = userStr2 ? JSON.parse(userStr2) : null
    const adminId = userObj2?.id
    const adminName = userObj2?.name || userObj2?.username || '管理员'
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
    // 用当前「距离超时」作为还剩天数初值，方便直接改剩余
    setRemainingDaysInput(item.days_until_timeout)
  }

  const handleSaveTimeout = async () => {
    if (!editingItem) return

    try {
      if (remainingDaysInput === null || Number.isNaN(remainingDaysInput)) {
        await reminderAPI.updateTimeout(editingItem.id, null)
        toast.success('已恢复使用全局超时天数设置')
      } else {
        const customDays = Math.max(1, editingItem.days_without_training + remainingDaysInput)
        await reminderAPI.updateTimeout(editingItem.id, customDays)
        toast.success(
          `已设置还剩 ${remainingDaysInput} 天（超时标准 ${customDays} 天 = 未训 ${editingItem.days_without_training} + 剩余 ${remainingDaysInput}）`
        )
      }
      setEditingItem(null)
      await loadItems()
      void refreshBadges()
    } catch (error: any) {
      toast.error(error.message || '设置失败')
    }
  }

  const activeFilterCount = filters.timeout_status.length + filters.has_custom_timeout.length + filters.stage_role.length
  const activeAttendanceFilterCount =
    attendanceFilters.timeout_status.length +
    attendanceFilters.reason_code.length +
    attendanceFilters.stage_role.length +
    attendanceFilters.ignored.length

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-2xl font-bold text-white shrink-0">催促名单</h1>
            {activeTab === 'training' && selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">
                  已选中 <span className="text-purple-400 font-semibold">{selectedIds.size}</span> 项
                </span>
                <button onClick={clearSelection} className="text-sm text-gray-400 hover:text-white transition-colors">
                  清空选择
                </button>
              </div>
            )}
            {activeTab === 'attendance' && selectedAttendanceIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">
                  已选中 <span className="text-purple-400 font-semibold">{selectedAttendanceIds.size}</span> 项
                </span>
                <button onClick={() => setSelectedAttendanceIds(new Set())} className="text-sm text-gray-400 hover:text-white transition-colors">
                  清空选择
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="relative">
              <input
                type="text"
                value={activeTab === 'training' ? searchQuery : attendanceSearch}
                onChange={(e) => activeTab === 'training' ? setSearchQuery(e.target.value) : setAttendanceSearch(e.target.value)}
                placeholder={activeTab === 'training' ? '搜索成员...' : '搜索成员 / 原因...'}
                className="bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-9 py-2 text-white placeholder-gray-400 w-52 sm:w-64 focus:outline-none focus:border-purple-500 transition-colors text-sm"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              {(activeTab === 'training' ? searchQuery : attendanceSearch) && (
                <button
                  onClick={() => activeTab === 'training' ? setSearchQuery('') : setAttendanceSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm transition-colors ${showFilters ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              <Filter size={16} />
              筛选{(activeTab === 'training' ? activeFilterCount : activeAttendanceFilterCount) > 0 &&
                ` (${activeTab === 'training' ? activeFilterCount : activeAttendanceFilterCount})`}
            </button>

            <button
              onClick={activeTab === 'training' ? handleOneClickUrgeTraining : handleOneClickUrgeAttendance}
              className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm transition-colors"
              title="复制 @QQ号（空格分隔）；有勾选则复制勾选，否则复制当前列表"
            >
              <Copy size={16} />
              一键催促
            </button>

            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(v => !v)}
                className={`px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm transition-colors ${
                  showMoreMenu ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                title="更多操作"
              >
                <MoreHorizontal size={16} />
                更多
              </button>
              {showMoreMenu && (
                <div className="!absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-xl py-1 overflow-hidden">
                  {activeTab === 'training' ? (
                    <>
                      <button
                        onClick={() => { setShowCustomExtended(v => !v); setShowMoreMenu(false) }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        {showCustomExtended ? <Eye size={16} className="text-purple-400 shrink-0" /> : <EyeOff size={16} className="text-gray-400 shrink-0" />}
                        <span className="flex-1">{showCustomExtended ? '含自定义延期' : '仅显示预警'}</span>
                        <span className={`text-xs ${showCustomExtended ? 'text-purple-300' : 'text-gray-500'}`}>
                          {showCustomExtended ? '开' : '关'}
                        </span>
                      </button>
                      <button
                        onClick={() => { setShowSettings(true); setShowMoreMenu(false) }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Settings size={16} className="text-gray-400 shrink-0" />
                        催促设置
                      </button>
                      <div className="border-t border-gray-700 my-1" />
                      <button
                        onClick={() => { setShowMoreMenu(false); void handleAutoAddTimeoutToQuit() }}
                        className="w-full px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-900/30 flex items-center gap-2"
                      >
                        <UserMinus size={16} className="shrink-0" />
                        处理超时成员
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setShowAllAttendance(v => !v); setShowMoreMenu(false) }}
                      className="w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                    >
                      {showAllAttendance ? <Eye size={16} className="text-purple-400 shrink-0" /> : <EyeOff size={16} className="text-gray-400 shrink-0" />}
                      <span className="flex-1">{showAllAttendance ? '显示全部进度' : '仅预警(≤7天)'}</span>
                      <span className={`text-xs ${showAllAttendance ? 'text-purple-300' : 'text-gray-500'}`}>
                        {showAllAttendance ? '开' : '关'}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex student-glass-chip student-glass-seg w-fit">
            <button
              onClick={() => setActiveTab('training')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors relative ${
                activeTab === 'training' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              训练催促
              {items.length > 0 && (
                <span className={`ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full text-xs items-center justify-center ${
                  activeTab === 'training' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                }`}>
                  {items.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors relative ${
                activeTab === 'attendance' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              考勤催促
              {attendanceWarnCount > 0 && (
                <span className={`ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full text-xs items-center justify-center ${
                  activeTab === 'attendance' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                }`}>
                  {attendanceWarnCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'training' && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex student-glass-chip student-glass-seg">
                <button
                  onClick={() => void switchDisplayMode('remaining')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    displayMode === 'remaining' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="还剩不超过 3 天即显示"
                >
                  倒计时预警
                </button>
                <button
                  onClick={() => void switchDisplayMode('kick_cycle')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    displayMode === 'kick_cycle' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="按踢人日周期：只显示本轮踢人日会超期的人，并仅在踢人前 N 天提醒"
                >
                  踢人周期
                </button>
              </div>
              {displayMode === 'kick_cycle' && kickMeta && (
                <span className="text-xs text-gray-400 break-keep">
                  {kickMeta.inWindow
                    ? `提醒中 · ${kickMeta.kickWeekdayLabel}踢人（${kickMeta.kickDate}）· 本轮踢人日或之前超期的人`
                    : `非提醒日 · 下次 ${kickMeta.kickWeekdayLabel} ${kickMeta.kickDate} 踢人 · ${kickMeta.windowStart} 起提醒`
                  }
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {activeTab === 'attendance' ? (
        <>
          {showFilters && (
            <div className="student-glass-chip p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-semibold">筛选条件</h3>
                  <button
                    onClick={() => setAttendanceFilters(prev => ({ ...prev, inverseMode: !prev.inverseMode }))}
                    className={`px-3 py-1 rounded text-xs transition-colors ${attendanceFilters.inverseMode ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {attendanceFilters.inverseMode ? '反选模式' : '正选模式'}
                  </button>
                </div>
                <button onClick={clearAttendanceFilters} className="text-sm text-gray-400 hover:text-white transition-colors">
                  清空筛选
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">倒计时状态</label>
                  <div className="flex flex-wrap gap-2">
                    {['未超时', '今天到期', '已超时'].map(status => (
                      <button
                        key={status}
                        onClick={() => toggleAttendanceFilter('timeout_status', status)}
                        className={`px-3 py-1 rounded text-sm transition-colors ${attendanceFilters.timeout_status.includes(status) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">催促原因</label>
                  <div className="flex flex-wrap gap-2">
                    {ATTENDANCE_REASON_OPTIONS.map(opt => (
                      <button
                        key={opt.code}
                        onClick={() => toggleAttendanceFilter('reason_code', opt.code)}
                        className={`px-3 py-1 rounded text-sm transition-colors ${attendanceFilters.reason_code.includes(opt.code) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">忽略状态</label>
                  <div className="flex flex-wrap gap-2">
                    {['未忽略', '已忽略'].map(status => (
                      <button
                        key={status}
                        onClick={() => toggleAttendanceFilter('ignored', status)}
                        className={`px-3 py-1 rounded text-sm transition-colors ${attendanceFilters.ignored.includes(status) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">阶段&角色</label>
                  <div className="flex flex-wrap gap-2">
                    {['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考', '紫夜', '紫夜尖兵', '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师'].map(stage => (
                      <button
                        key={stage}
                        onClick={() => toggleAttendanceFilter('stage_role', stage)}
                        className={`px-3 py-1 rounded text-sm transition-colors ${attendanceFilters.stage_role.includes(stage) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >
                        {stage}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        {selectedAttendanceIds.size > 0 && (
          <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-white font-semibold">批量操作</span>
              <button
                onClick={handleBatchUpdateAttendanceTimeout}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
              >
                批量设置还剩天数
              </button>
            </div>
          </div>
        )}

        <div className="student-glass-panel student-glass-panel--static overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 text-xs text-gray-500">
            加入后 60 天内达新训三期 → 再 45 天内转正（正式队员及以上，总上限 105 天）→ 正式队员半年需参加新训。请假暂停计时；留队 / 其他不计。剩余 ≤7 天进入名单。
          </div>
          {attendanceLoading ? (
            <div className="p-8 text-center text-gray-400">加载中...</div>
          ) : filteredAttendance.length === 0 ? (
            <div className="p-8 text-center text-gray-500">当前没有考勤催促对象</div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <button
                        onClick={() => {
                          if (selectedAttendanceIds.size === filteredAttendance.length) {
                            setSelectedAttendanceIds(new Set())
                          } else {
                            setSelectedAttendanceIds(new Set(filteredAttendance.map(i => i.member_id)))
                          }
                        }}
                        className="flex items-center justify-center w-full hover:text-purple-400"
                      >
                        {selectedAttendanceIds.size === filteredAttendance.length && filteredAttendance.length > 0
                          ? <CheckSquare size={18} className="text-purple-400" />
                          : <Square size={18} className="text-gray-400" />}
                      </button>
                    </th>
                    <th>
                      <button onClick={() => handleAttendanceSort('member_name')} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span>成员</span>
                        {attendanceSortConfig?.key === 'member_name' && (attendanceSortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                      </button>
                    </th>
                    <th>
                      <button onClick={() => handleAttendanceSort('stage_role')} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span>阶段</span>
                        {attendanceSortConfig?.key === 'stage_role' && (attendanceSortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                      </button>
                    </th>
                    <th>
                      <button onClick={() => handleAttendanceSort('reason_code')} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span>催促原因</span>
                        {attendanceSortConfig?.key === 'reason_code' && (attendanceSortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                      </button>
                    </th>
                    <th>
                      <button onClick={() => handleAttendanceSort('remaining_days')} className="flex items-center gap-1 hover:text-white transition-colors">
                        <span>剩余天数</span>
                        {attendanceSortConfig?.key === 'remaining_days' && (attendanceSortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                      </button>
                    </th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map(item => (
                    <tr key={item.member_id} className={item.ignored ? 'opacity-60' : ''}>
                      <td>
                        <button
                          onClick={() => {
                            const next = new Set(selectedAttendanceIds)
                            if (next.has(item.member_id)) next.delete(item.member_id)
                            else next.add(item.member_id)
                            setSelectedAttendanceIds(next)
                          }}
                          className="flex items-center justify-center hover:text-purple-400"
                        >
                          {selectedAttendanceIds.has(item.member_id)
                            ? <CheckSquare size={18} className="text-purple-400" />
                            : <Square size={18} className="text-gray-400" />}
                        </button>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{item.member_name}</span>
                            {item.paused && <span className="status-badge bg-cyan-600/20 text-cyan-300">请假暂停</span>}
                            {item.ignored && <span className="status-badge bg-gray-600/30 text-gray-400">已忽略</span>}
                            {item.has_custom_deadline && (
                              <span className="status-badge bg-blue-600/20 text-blue-300" title="已自定义还剩天数">自定义期限</span>
                            )}
                          </div>
                          {item.qq && <span className="text-xs text-gray-500">QQ {item.qq}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${getRoleColor(item.stage_role)}`}>{item.stage_role}</span>
                      </td>
                      <td>
                        <div className="space-y-1.5 max-w-md">
                          {item.reasons.map(r => {
                            const deadline = Math.max(1, r.deadline_days || 1)
                            const pct = Math.min(100, Math.round((r.elapsed_days / deadline) * 100))
                            const over = r.elapsed_days >= deadline
                            const barColor = over || pct >= 90
                              ? 'bg-red-500'
                              : pct >= 70
                                ? 'bg-orange-500'
                                : pct >= 40
                                  ? 'bg-yellow-500'
                                  : 'bg-purple-500'
                            return (
                              <div key={r.reason_code} className="text-sm text-gray-300">
                                <div className="leading-relaxed">
                                  <span className={`inline-block align-middle text-xs px-1.5 py-0.5 rounded mr-1.5 ${
                                    r.reason_code === 'to_phase3' ? 'bg-yellow-600/20 text-yellow-300'
                                      : r.reason_code === 'to_formal' ? 'bg-orange-600/20 text-orange-300'
                                      : 'bg-purple-600/20 text-purple-300'
                                  }`}>
                                    {r.reason_code === 'to_phase3' ? '达三期'
                                      : r.reason_code === 'to_formal' ? '转正'
                                      : '半年新训'}
                                  </span>
                                  <span className="align-middle">{r.reason_label}</span>
                                </div>
                                <div className="mt-1.5 pl-0.5">
                                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-1 tabular-nums">
                                    <span>已过 {r.elapsed_days}/{r.deadline_days} 天</span>
                                    <span className={over ? 'text-red-400' : ''}>
                                      {over ? '已满' : `${pct}%`}
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-gray-700/80 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${barColor}`}
                                      style={{ width: `${over ? 100 : Math.max(pct, 2)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </td>
                      <td>
                        {item.paused ? (
                          <span className="status-badge bg-cyan-600/20 text-cyan-300">计时暂停</span>
                        ) : item.remaining_days > 0 ? (
                          <span className={`status-badge ${
                            item.remaining_days > 7 ? 'bg-green-600/20 text-green-300'
                              : item.remaining_days >= 3 ? 'bg-yellow-600/20 text-yellow-300'
                              : 'bg-orange-600/20 text-orange-300'
                          }`}>
                            还剩 {item.remaining_days} 天
                          </span>
                        ) : item.remaining_days === 0 ? (
                          <span className="status-badge bg-orange-600/20 text-orange-300">今天到期</span>
                        ) : (
                          <span className="status-badge bg-red-600/20 text-red-300">
                            已超时 {Math.abs(item.remaining_days)} 天
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditAttendanceTimeout(item)}
                            className="text-purple-400 hover:text-purple-300 transition-colors"
                            title="设置还剩天数"
                          >
                            <Edit size={18} />
                          </button>
                          {item.ignored ? (
                            <button
                              onClick={async () => {
                                try {
                                  await reminderAPI.unignoreAttendance(item.member_id)
                                  toast.success('已恢复倒计时')
                                  await loadAttendance()
                                  void refreshBadges()
                                } catch (e: any) {
                                  toast.error(e.message || '操作失败')
                                }
                              }}
                              className="text-green-400 hover:text-green-300 transition-colors"
                              title="取消忽略"
                            >
                              <Bell size={18} />
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                try {
                                  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
                                  const userObj = userStr ? JSON.parse(userStr) : null
                                  await reminderAPI.ignoreAttendance(item.member_id, userObj?.name || userObj?.username)
                                  toast.success('已忽略该成员考勤倒计时')
                                  await loadAttendance()
                                  void refreshBadges()
                                } catch (e: any) {
                                  toast.error(e.message || '操作失败')
                                }
                              }}
                              className="text-gray-400 hover:text-orange-300 transition-colors"
                              title="忽略倒计时"
                            >
                              <BellOff size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
      ) : (
      <>
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
                批量设置还剩天数
              </button>
            </div>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="student-glass-chip p-4 mb-4">
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
                {['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考', '紫夜', '紫夜尖兵', '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师'].map(stage => (
                  <button
                    key={stage}
                    onClick={() => toggleFilter('stage_role', stage)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${filters.stage_role.includes(stage) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {stage}
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
        </div>
      )}

      <div className="student-glass-panel student-glass-panel--static overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>暂无需要催促的成员</p>
            {displayMode === 'kick_cycle' ? (
              kickMeta && !kickMeta.inWindow ? (
                <div className="text-sm mt-3 space-y-1.5 text-gray-500 break-keep">
                  <p>当前不在踢人提醒窗口</p>
                  <p>
                    下次踢人：
                    <span className="text-gray-300 whitespace-nowrap">
                      {kickMeta.kickWeekdayLabel} {kickMeta.kickDate}
                    </span>
                  </p>
                  <p>
                    提醒开始：
                    <span className="text-gray-300 whitespace-nowrap">{kickMeta.windowStart}</span>
                    <span className="text-gray-500">（提前 {kickMeta.leadDays} 天）</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm mt-2 text-gray-500 break-keep max-w-md mx-auto">
                  踢人周期模式下，只显示将在
                  <span className="whitespace-nowrap">
                    本轮踢人日（{kickMeta?.kickWeekdayLabel || '设定日'}）
                  </span>
                  或之前超期的成员。
                </p>
              )
            ) : (
              <p className="text-sm mt-2 break-keep">
                当有成员距离超时还剩不超过 {TRAINING_WARN_DAYS} 天时会自动显示在此列表
                {!showCustomExtended && '（当前已隐藏自定义延期成员）'}
              </p>
            )}
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
                    <td>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{item.member_name}</span>
                        {!!item.is_leave_buffer && (
                          <span className="status-badge bg-cyan-600/20 text-cyan-300">请假缓冲</span>
                        )}
                        {!!item.is_custom_extended && (
                          <span className="status-badge bg-blue-600/20 text-blue-300" title="已自定义还剩天数，尚未回到预警窗">自定义延期</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${getRoleColor(item.stage_role)}`}>
                        {item.stage_role}
                      </span>
                    </td>
                    <td>
                      {item.last_training_date ? formatDate(item.last_training_date) : '从未训练'}
                    </td>
                    <td>
                      {!!item.is_leave_buffer ? (
                        <span className="status-badge bg-cyan-600/20 text-cyan-300">缓冲期</span>
                      ) : (
                        <span className={`status-badge ${
                          item.days_without_training >= 30 
                            ? 'bg-red-600/20 text-red-300'
                            : item.days_without_training >= 14
                            ? 'bg-orange-600/20 text-orange-300'
                            : 'bg-yellow-600/20 text-yellow-300'
                        }`}>
                          {item.days_without_training} 天
                        </span>
                      )}
                    </td>
                    <td>
                      {!!item.is_leave_buffer ? (
                        <span className="status-badge bg-cyan-600/20 text-cyan-300">
                          剩余 {item.buffer_remaining_days ?? 0} 天
                        </span>
                      ) : item.days_until_timeout > 0 ? (
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
                        title="设置还剩天数"
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
      </>
      )}

      {/* 设置超时 / 踢人周期 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-md">
            <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full">
            <h2 className="text-xl font-bold text-white mb-4">催促设置</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  全局超时标准（未训满多少天算超时）
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={timeoutDays}
                  onChange={(e) => setTimeoutDays(parseInt(e.target.value) || 7)}
                  className="student-glass-field"
                />
                <p className="text-xs text-gray-400 mt-1">
                  按「累计未训天数」计。例如填 7 = 未训满 7 天即超时。
                </p>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">踢人日</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {([
                    [1, '一'], [2, '二'], [3, '三'], [4, '四'],
                    [5, '五'], [6, '六'], [7, '日'],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setKickWeekday(v)}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                        kickWeekday === v
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  当前：周{['', '一', '二', '三', '四', '五', '六', '日'][kickWeekday]}。用于「踢人周期」模式，只含本轮踢人日会超期（或已超期）的人。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  提前几天开始提醒
                </label>
                <input
                  type="number"
                  min="0"
                  max="14"
                  value={kickLeadDays}
                  onChange={(e) => setKickLeadDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="student-glass-field"
                />
                <p className="text-xs text-gray-400 mt-1">
                  例如踢人日为周一、提前 3 天 → 周五起进入提醒窗。例：周二才超期的人本周一不会踢，本周五名单不显示。
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={async () => {
                    try {
                      await Promise.all([
                        reminderAPI.updateTimeoutDays(timeoutDays),
                        reminderAPI.updateKickSettings({
                          kickWeekday,
                          leadDays: kickLeadDays,
                        }),
                      ])
                      setShowSettings(false)
                      toast.success('催促设置已保存')
                      await loadItems()
                      void refreshBadges()
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
          </div>
        </div>
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

      {/* 考勤催促：批量设置还剩天数 */}
      {batchAttendanceTimeoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-md">
            <div className="glass-modal-tilt">
              <div className="student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full">
                <h2 className="text-xl font-bold text-white mb-4">批量设置还剩天数</h2>
                <p className="text-gray-400 text-sm mb-4">
                  为选中的 <span className="text-purple-400 font-semibold">{selectedAttendanceIds.size}</span> 个成员统一设置考勤「希望还剩几天」
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">希望还剩几天</label>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={batchAttendanceRemainingDays ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setBatchAttendanceRemainingDays(v === '' ? null : Math.max(0, parseInt(v) || 0))
                      }}
                      className="student-glass-field"
                      placeholder="留空则恢复默认期限"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {batchAttendanceRemainingDays === null
                        ? '将清除自定义期限，恢复规则默认天数'
                        : `期限将设为「已过天数 + ${batchAttendanceRemainingDays}」`}
                    </p>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                    <p className="text-blue-300 text-xs">
                      例：某人已过 50 天，填还剩 10 天 → 其考勤期限变为 60 天。
                    </p>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={confirmBatchUpdateAttendanceTimeout}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                    >
                      确定
                    </button>
                    <button
                      onClick={() => setBatchAttendanceTimeoutModal(false)}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 考勤催促：单个设置还剩天数 */}
      {editingAttendanceItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-md">
            <div className="glass-modal-tilt">
              <div className="student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full">
                <h2 className="text-xl font-bold text-white mb-4">设置还剩天数</h2>
                <p className="text-gray-400 text-sm mb-4">
                  为 <span className="text-purple-400 font-semibold">{editingAttendanceItem.member_name}</span> 设置希望还剩几天
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="student-glass-chip px-3 py-2">
                      <div className="text-gray-500 text-xs mb-0.5">已过</div>
                      <div className="text-white font-mono">{editingAttendanceItem.elapsed_days} 天</div>
                    </div>
                    <div className="student-glass-chip px-3 py-2">
                      <div className="text-gray-500 text-xs mb-0.5">当前还剩</div>
                      <div className="text-white font-mono">{editingAttendanceItem.remaining_days} 天</div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">希望还剩几天</label>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={attendanceRemainingDaysInput ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setAttendanceRemainingDaysInput(v === '' ? null : parseInt(v))
                      }}
                      className="student-glass-field"
                      placeholder="留空则恢复默认期限"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {attendanceRemainingDaysInput === null || Number.isNaN(attendanceRemainingDaysInput)
                        ? '将清除自定义期限，恢复规则默认天数'
                        : `期限将设为 ${Math.max(1, editingAttendanceItem.elapsed_days + attendanceRemainingDaysInput)} 天（已过 ${editingAttendanceItem.elapsed_days} + 还剩 ${attendanceRemainingDaysInput}）`}
                    </p>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleSaveAttendanceTimeout}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingAttendanceItem(null)}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 批量：按「还剩几天」换算每人超时标准 */}
      {batchTimeoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-md">
            <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full">
            <h2 className="text-xl font-bold text-white mb-4">批量设置还剩天数</h2>
            <p className="text-gray-400 text-sm mb-4">
              为选中的 <span className="text-purple-400 font-semibold">{selectedIds.size}</span> 个成员统一设置「希望还剩几天」
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  希望还剩几天
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={batchRemainingDays ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setBatchRemainingDays(v === '' ? null : Math.max(0, parseInt(v) || 0))
                  }}
                  className="student-glass-field"
                  placeholder="留空则恢复全局超时设置"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {batchRemainingDays === null
                    ? `将恢复使用全局超时天数（${timeoutDays} 天）`
                    : `系统会按「未训天数 + ${batchRemainingDays}」为每人自动换算超时标准`
                  }
                </p>
              </div>

              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                <p className="text-blue-300 text-xs">
                  例：某人已未训 10 天，填还剩 5 天 → 其超时标准变为 15 天。
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={confirmBatchUpdateTimeout}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                >
                  确定
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
          </div>
        </div>
      )}

      {/* 单个成员：按「还剩几天」换算超时标准 */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-md">
            <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full">
            <h2 className="text-xl font-bold text-white mb-4">设置还剩天数</h2>
            <p className="text-gray-400 text-sm mb-4">
              为 <span className="text-purple-400 font-semibold">{editingItem.member_name}</span> 设置希望还剩几天
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="student-glass-chip px-3 py-2">
                  <div className="text-gray-500 text-xs mb-0.5">已未训</div>
                  <div className="text-white font-mono">{editingItem.days_without_training} 天</div>
                </div>
                <div className="student-glass-chip px-3 py-2">
                  <div className="text-gray-500 text-xs mb-0.5">当前还剩</div>
                  <div className="text-white font-mono">{editingItem.days_until_timeout} 天</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  希望还剩几天
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={remainingDaysInput ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setRemainingDaysInput(v === '' ? null : parseInt(v))
                  }}
                  className="student-glass-field"
                  placeholder="留空则恢复全局超时设置"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {remainingDaysInput === null || Number.isNaN(remainingDaysInput)
                    ? `将恢复使用全局超时天数（${timeoutDays} 天）`
                    : `超时标准将设为 ${Math.max(1, editingItem.days_without_training + remainingDaysInput)} 天（未训 ${editingItem.days_without_training} + 还剩 ${remainingDaysInput}）`
                  }
                </p>
              </div>

              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                <p className="text-blue-300 text-xs">
                  直接填「还剩几天」即可，系统自动换算自定义超时标准。清空输入框可恢复全局设置。
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
          </div>
        </div>
      )}
    </div>
  )
}
