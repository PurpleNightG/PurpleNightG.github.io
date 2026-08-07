import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { memberAPI, progressAPI, reminderAPI } from '../utils/api'
import { Trophy, TrendingUp, CheckCircle, Target, BookOpen, Video, Lock, Clock, AlertTriangle, KeyRound, FileText, UserCheck, ClipboardList, ChevronRight, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import UserDropdown from '../components/UserDropdown'
import CongratsModal from '../components/CongratsModal'
import { toast } from '../utils/toast'
import { useSurveyPending } from '../contexts/SurveyPendingContext'
import { formatDate } from '../utils/dateFormat'
import { resolveCongratsToShow, acknowledgeCongrats, syncCongratsBaseline, type CongratsConfig } from '../utils/stageCongrats'
import PageSkeleton from '../components/Skeleton'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface Member {
  id: number
  nickname: string
  stage_role: string
  status: string
  join_date?: string
  last_training_date?: string | null
  is_ziye_assistant?: number | boolean
}

interface AttendanceInfo {
  reason_code: string
  reason_label: string
  remaining_days: number
  elapsed_days: number
  deadline_days: number
  paused: boolean
  ignored: boolean
  reasons: {
    reason_code: string
    reason_label: string
    remaining_days: number
    elapsed_days: number
    deadline_days: number
    paused: boolean
  }[]
}

interface TrainingReminderInfo {
  days_without_training: number
  days_until_timeout: number
  last_training_date: string | null
  custom_timeout_days?: number | null
  is_leave_buffer?: number | boolean
  is_custom_extended?: number | boolean
  buffer_remaining_days?: number | null
}

interface Course {
  id: number
  code: string
  name: string
  category: string
  difficulty: string
  hours: number
  progress: number
  updated_at?: string
}

interface CategoryProgress {
  category: string
  total: number
  completed: number
  percentage: number
}

// 阶段流程定义
const STAGE_FLOW = [
  '未新训',
  '新训初期',
  '新训一期',
  '新训二期',
  '新训三期',
  '新训准考',
  '紫夜',
  '紫夜尖兵'
]

/** 考勤原因文案：把「（总上限 N 天）」单独成行，避免窄悬浮窗里「天）」孤行 */
function renderAttendanceReasonLabel(label: string, compact = false) {
  const match = label.match(/^(.*?)([（(]总上限\s*\d+\s*天[）)])\s*$/)
  if (!match) {
    return <span className="break-keep">{label}</span>
  }
  return (
    <>
      <span className="break-keep">{match[1].trim()}</span>
      <span className={`block whitespace-nowrap ${compact ? 'mt-0.5 text-white/50' : 'mt-1 text-xs text-white/50'}`}>
        {match[2]}
      </span>
    </>
  )
}

// 特殊阶段（非线性流程）
const SPECIAL_ROLES = ['会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师']

export default function StudentHome() {
  const navigate = useNavigate()
  const { pending, count } = useSurveyPending()
  const [member, setMember] = useState<Member | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress[]>([])
  const [totalProgress, setTotalProgress] = useState(0)
  const [recentCourse, setRecentCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCongrats, setShowCongrats] = useState(false)
  const [congratsConfig, setCongratsConfig] = useState<CongratsConfig | null>(null)
  const [showPasswordWarning, setShowPasswordWarning] = useState(false)
  const [onDutyInstructors, setOnDutyInstructors] = useState<{ username: string; nickname: string; clocked_in_at: string }[]>([])
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfo | null>(null)
  const [trainingReminder, setTrainingReminder] = useState<TrainingReminderInfo | null>(null)
  const [trainingPos, setTrainingPos] = useState<{ x: number; y: number } | null>(null)
  const [attendancePos, setAttendancePos] = useState<{ x: number; y: number } | null>(null)
  const floatDragRef = useRef<{
    key: 'training' | 'attendance'
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  useEffect(() => {
    const placeFloats = () => {
      const cardW = 280
      const sidebarSpan = 17.25 * 16 // 与主区 md:ml-[17.25rem] 对齐
      const y = Math.max(88, Math.round(window.innerHeight / 2 - 140))
      setTrainingPos((prev) => prev ?? { x: sidebarSpan + 8, y })
      setAttendancePos((prev) => prev ?? { x: Math.max(sidebarSpan + 8, window.innerWidth - cardW - 24), y })
    }
    placeFloats()
    window.addEventListener('resize', placeFloats)
    return () => window.removeEventListener('resize', placeFloats)
  }, [])

  const startFloatDrag = useCallback((
    key: 'training' | 'attendance',
    e: React.MouseEvent,
    pos: { x: number; y: number }
  ) => {
    e.preventDefault()
    e.stopPropagation()
    floatDragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    }

    const onMove = (ev: MouseEvent) => {
      const drag = floatDragRef.current
      if (!drag) return
      const cardW = 280
      const cardH = 220
      const nextX = drag.originX + (ev.clientX - drag.startX)
      const nextY = drag.originY + (ev.clientY - drag.startY)
      const clamped = {
        x: Math.min(Math.max(8, nextX), Math.max(8, window.innerWidth - cardW - 8)),
        y: Math.min(Math.max(8, nextY), Math.max(8, window.innerHeight - cardH - 8)),
      }
      if (drag.key === 'training') setTrainingPos(clamped)
      else setAttendancePos(clamped)
    }

    const onUp = () => {
      floatDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    loadMemberInfo()
    loadCourseProgress()
    checkDefaultPassword()
    loadOnDutyInstructors()
    loadAttendanceInfo()
    loadTrainingReminder()
  }, [])

  const loadAttendanceInfo = async () => {
    try {
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) return
      const user = JSON.parse(userStr)
      if (!user.id) return
      const res = await reminderAPI.getAttendanceMe(user.id)
      setAttendanceInfo(res.data || null)
    } catch {
      // 无考勤倒计时或无权查看时静默
    }
  }

  const loadTrainingReminder = async () => {
    try {
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) return
      const user = JSON.parse(userStr)
      if (!user.id) return
      const res = await reminderAPI.getTrainingMe(user.id)
      setTrainingReminder(res.data || null)
    } catch {
      // 未进入训练催促时静默
    }
  }

  const loadOnDutyInstructors = async () => {
    try {
      const res = await fetch(`${API_URL}/duty/today`)
      const data = await res.json()
      if (data.success) setOnDutyInstructors(data.instructors || [])
    } catch {}
  }

  const loadMemberInfo = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // 学员登录时使用 studentUser 键名
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) {
        setError('未找到登录信息，请重新登录')
        setLoading(false)
        return
      }
      
      const user = JSON.parse(userStr)
      if (!user.id) {
        setError('用户信息不完整，请重新登录')
        setLoading(false)
        return
      }

      const response = await memberAPI.getMe()
      
      if (!response || !response.data) {
        setError('无法获取成员信息，请联系管理员')
        setLoading(false)
        return
      }

      setMember(response.data)

      // 检查是否需要显示恭喜弹窗
      checkCongratulations(response.data)
    } catch (error: any) {
      console.error('加载成员信息失败:', error)
      setError(error.message || '加载成员信息失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const loadCourseProgress = async () => {
    try {
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) return
      
      const user = JSON.parse(userStr)
      const response = await progressAPI.getMy()
      const coursesData = response.data
      
      setCourses(coursesData)

      // 计算总进度
      const completedCount = coursesData.filter((c: Course) => c.progress === 100).length
      const totalCount = coursesData.length
      setTotalProgress(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0)

      // 按类别计算进度
      const categoryMap = new Map<string, { total: number; completed: number }>()
      coursesData.forEach((course: Course) => {
        const cat = course.category
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { total: 0, completed: 0 })
        }
        const stats = categoryMap.get(cat)!
        stats.total++
        if (course.progress === 100) stats.completed++
      })

      const catProgress = Array.from(categoryMap.entries()).map(([category, stats]) => ({
        category,
        total: stats.total,
        completed: stats.completed,
        percentage: Math.round((stats.completed / stats.total) * 100)
      }))
      setCategoryProgress(catProgress)

      // 找出最近学习的课程（有进度且updated_at最新的）
      const coursesWithProgress = coursesData
        .filter((c: Course) => c.progress > 0 && c.updated_at)
        .sort((a: Course, b: Course) => 
          new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime()
        )
      if (coursesWithProgress.length > 0) {
        setRecentCourse(coursesWithProgress[0])
      }
    } catch (error: any) {
      console.error('加载课程进度失败:', error)
    }
  }

  const checkCongratulations = (memberData: Member) => {
    const config = resolveCongratsToShow(memberData)
    if (config) {
      setCongratsConfig(config)
      setShowCongrats(true)
    } else {
      syncCongratsBaseline(memberData)
    }
  }

  const closeCongrats = () => {
    if (member && congratsConfig) {
      acknowledgeCongrats(member, congratsConfig)
    }
    setShowCongrats(false)
  }

  const checkDefaultPassword = async () => {
    try {
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) return
      
      // 调用API检查是否使用默认密码
      const token = localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')
      
      const response = await fetch(`${API_URL}/student/check-default-password`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      // 检查响应类型
      const contentType = response.headers.get('content-type')
      const isJson = contentType && contentType.includes('application/json')
      
      if (!response.ok || !isJson) {
        // 开发环境：如果API不存在，显示警告用于测试
        if (import.meta.env.DEV) {
          setShowPasswordWarning(true)
        }
        return
      }
      
      const data = await response.json()
      
      if (data.success && data.data.isDefaultPassword) {
        // 使用默认密码，每次都显示警告（直到修改密码）
        setShowPasswordWarning(true)
      }
    } catch (error) {
      console.error('检查默认密码失败:', error)
    }
  }

  const handlePasswordChange = async () => {
    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('请填写所有字段')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('新密码长度至少为6位')
      return
    }

    try {
      setPasswordSubmitting(true)
      
      const token = localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')
      if (!token) return

      // 使用强制重置密码API（不需要旧密码）
      const response = await fetch(`${API_URL}/student/reset-default-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          newPassword: passwordForm.newPassword
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success('密码修改成功！正在跳转...')
        setTimeout(() => {
          // 清除登录信息
          localStorage.removeItem('studentToken')
          localStorage.removeItem('studentUser')
          sessionStorage.removeItem('studentToken')
          sessionStorage.removeItem('studentUser')
          // 跳转到登录页
          navigate('/login')
        }, 1500)
      } else {
        // 显示后端返回的具体错误消息
        toast.error(data.message || '密码修改失败')
      }
    } catch (error: any) {
      toast.error('请求失败：' + error.message)
    } finally {
      setPasswordSubmitting(false)
    }
  }

  const getNextStage = (currentStage: string): string | null => {
    // 如果是特殊角色，没有明确的下一阶段
    if (SPECIAL_ROLES.includes(currentStage)) {
      return null
    }
    // 助教晋升路径：下一阶段为紫夜尖兵
    if (currentStage === '紫夜助教') {
      return '紫夜尖兵'
    }

    const currentIndex = STAGE_FLOW.indexOf(currentStage)
    if (currentIndex === -1 || currentIndex === STAGE_FLOW.length - 1) {
      return null
    }

    return STAGE_FLOW[currentIndex + 1]
  }

  const getStageColor = (stage: string) => {
    if (stage === '紫夜' || stage === '紫夜尖兵' || stage === '紫夜助教') {
      return 'from-purple-600 to-purple-400'
    }
    if (stage === '新训准考') {
      return 'from-yellow-600 to-yellow-400'
    }
    if (stage.includes('新训')) {
      return 'from-blue-600 to-blue-400'
    }
    if (SPECIAL_ROLES.includes(stage)) {
      return 'from-sky-600 to-sky-400'
    }
    return 'from-gray-600 to-gray-400'
  }

  // 根据当前阶段映射对应的课程部分进度
  const calculateStageProgress = (currentStage: string, coursesData: Course[]): { progress: number; description: string } => {
    // 特殊角色没有晋升进度
    if (SPECIAL_ROLES.includes(currentStage)) {
      return { progress: 100, description: '特殊角色' }
    }

    // 获取所有课程编号，按code排序
    const allCourses = [...coursesData].sort((a, b) => {
      const aCode = parseFloat(a.code)
      const bCode = parseFloat(b.code)
      return aCode - bCode
    })

    // 根据当前阶段映射对应的课程部分
    let targetSection: number
    let nextStageName: string
    let progressDescription: string

    switch (currentStage) {
      case '未新训':
        // 未新训阶段没有课程进度
        return { progress: 0, description: '等待分配到新训初期开始学习' }

      case '新训初期':
        // 新训初期对应第1部分课程
        targetSection = 1
        nextStageName = '新训一期'
        progressDescription = `完成第${targetSection}部分所有课程即可晋升${nextStageName}`
        break

      case '新训一期':
        // 新训一期对应第2部分课程
        targetSection = 2
        nextStageName = '新训二期'
        progressDescription = `完成第${targetSection}部分所有课程即可晋升${nextStageName}`
        break

      case '新训二期':
        // 新训二期对应第3部分课程
        targetSection = 3
        nextStageName = '新训三期'
        progressDescription = `完成第${targetSection}部分所有课程即可晋升${nextStageName}`
        break

      case '新训三期':
        // 新训三期对应第4部分课程
        targetSection = 4
        nextStageName = '新训准考'
        progressDescription = `完成第${targetSection}部分所有课程即可晋升${nextStageName}`
        break

      case '新训准考':
        // 新训准考没有进度条，通过考核即可晋升
        return { progress: 0, description: '完成新训考核即可晋升紫夜' }

      case '紫夜':
        // 紫夜对应第5部分课程
        targetSection = 5
        nextStageName = '紫夜尖兵'
        progressDescription = `完成第${targetSection}部分所有课程即可晋升${nextStageName}`
        break

      case '紫夜助教':
        // 与紫夜相同：完成第5部分课程可晋升尖兵
        targetSection = 5
        nextStageName = '紫夜尖兵'
        progressDescription = `完成第${targetSection}部分所有课程即可晋升${nextStageName}`
        break

      case '紫夜尖兵':
        // 已经是最高阶段
        return { progress: 100, description: '已达最高阶段' }

      default:
        return { progress: 0, description: '未知阶段' }
    }

    // 获取目标部分的所有课程
    const sectionCourses = allCourses.filter(c => c.code.startsWith(`${targetSection}.`))
    if (sectionCourses.length === 0) {
      return { progress: 0, description: progressDescription }
    }

    // 计算该部分完成的课程数
    const completedCount = sectionCourses.filter(c => c.progress === 100).length
    const totalCount = sectionCourses.length
    const progress = Math.round((completedCount / totalCount) * 100)

    return {
      progress,
      description: `${progressDescription}（${completedCount}/${totalCount}）`
    }
  }

  const handleCongratsAction = () => {
    if (congratsConfig?.actionPath) {
      navigate(congratsConfig.actionPath)
    }
    closeCongrats()
  }

  if (loading) {
    return <PageSkeleton variant="cards" />
  }

  if (error || !member) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-300 mb-2">无法加载成员信息</h2>
            <p className="text-red-200/80 mb-6">
              {error || '未知错误，请稍后重试'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={loadMemberInfo}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                重试
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('studentToken')
                  localStorage.removeItem('studentUser')
                  sessionStorage.removeItem('studentToken')
                  sessionStorage.removeItem('studentUser')
                  navigate('/login')
                }}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                返回登录
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const nextStage = getNextStage(member.stage_role)

  // 如果需要修改密码，只显示弹窗，阻止访问系统
  if (showPasswordWarning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
        <div className="relative z-10 glass-modal-frame w-full max-w-md">
          <div className="glass-modal-tilt">
        <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full border border-red-500/40">
          <div className="p-8">
            {/* 警告图标 */}
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 rounded-full bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="text-red-400" size={48} />
              </div>
            </div>

            {/* 标题 */}
            <h2 className="text-2xl font-bold text-white mb-2 text-center">
              ⚠️ 必须修改密码
            </h2>
            <p className="text-gray-400 text-sm text-center mb-6">
              检测到您正在使用默认密码（QQ号），为了账号安全，请立即修改密码
            </p>

            {/* 密码修改表单 */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">新密码</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="请输入新密码（至少6位）"
                  className="student-glass-field py-3"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">确认新密码</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="请再次输入新密码"
                  className="student-glass-field py-3"
                />
              </div>
            </div>

            {/* 提示信息 */}
            <div className="mt-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-yellow-300 text-xs flex items-start gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>修改密码后需要重新登录，请牢记新密码</span>
              </p>
            </div>

            {/* 提交按钮 */}
            <button
              onClick={handlePasswordChange}
              disabled={passwordSubmitting}
              className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-all font-medium shadow-lg flex items-center justify-center gap-2"
            >
              {passwordSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  修改中...
                </>
              ) : (
                <>
                  <KeyRound size={18} />
                  立即修改密码
                </>
              )}
            </button>
          </div>
        </div>
          </div>
        </div>
      </div>
    )
  }

  const showTrainingFloat = !!trainingReminder
  const showAttendanceFloat = !!(attendanceInfo && !attendanceInfo.ignored)

  const renderTrainingFloatCard = () => {
    if (!trainingReminder) return null
    const tone = trainingReminder.is_leave_buffer
      ? 'student-float-panel--cyan'
      : trainingReminder.days_until_timeout < 0
        ? 'student-float-panel--red'
        : 'student-float-panel--amber'
    const iconTone = trainingReminder.is_leave_buffer ? 'text-cyan-300' : trainingReminder.days_until_timeout < 0 ? 'text-red-300' : 'text-amber-300'
    const iconBg = trainingReminder.is_leave_buffer ? 'bg-cyan-400/15 ring-cyan-300/20' : trainingReminder.days_until_timeout < 0 ? 'bg-red-400/15 ring-red-300/20' : 'bg-amber-400/15 ring-amber-300/20'

    return (
      <div className={`student-float-panel ${tone} p-5`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2.5 rounded-2xl ring-1 shrink-0 ${iconBg}`}>
            <Bell className={iconTone} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-0.5">Reminder</div>
            <h3 className="text-white font-semibold leading-tight">训练催促</h3>
          </div>
        </div>

        <div className="mb-3">
          {trainingReminder.is_leave_buffer ? (
            <span className="inline-flex items-center rounded-lg bg-cyan-500/15 text-cyan-200 text-xs px-2.5 py-1">请假缓冲</span>
          ) : trainingReminder.is_custom_extended ? (
            <span className="inline-flex items-center rounded-lg bg-blue-500/15 text-blue-200 text-xs px-2.5 py-1">已延期</span>
          ) : trainingReminder.days_until_timeout > 0 ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-amber-200">{trainingReminder.days_until_timeout}</span>
              <span className="text-sm text-amber-100/70">天剩余</span>
            </div>
          ) : trainingReminder.days_until_timeout === 0 ? (
            <span className="text-lg font-semibold text-orange-300">今天超时</span>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-red-300">{Math.abs(trainingReminder.days_until_timeout)}</span>
              <span className="text-sm text-red-200/70">天已超时</span>
            </div>
          )}
        </div>

        <p className="text-sm text-white/70 mb-4 break-keep leading-relaxed">
          {trainingReminder.is_leave_buffer
            ? `请假缓冲期内，请尽快恢复训练（缓冲还剩 ${trainingReminder.buffer_remaining_days ?? trainingReminder.days_until_timeout} 天）`
            : trainingReminder.is_custom_extended
              ? '你已进入训练催促名单并获延期，请在期限内参加新训。'
              : '你已进入训练催促名单，请尽快参加新训，避免超时处理。'}
        </p>

        <div className="flex flex-wrap gap-2 text-[11px] text-white/55 tabular-nums">
          <span className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">已未训 {trainingReminder.days_without_training} 天</span>
          <span className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">
            上次：{trainingReminder.last_training_date ? formatDate(trainingReminder.last_training_date) : '从未训练'}
          </span>
        </div>
      </div>
    )
  }

  const renderAttendanceFloatCard = () => {
    if (!attendanceInfo || attendanceInfo.ignored) return null
    const tone = attendanceInfo.paused
      ? 'student-float-panel--cyan'
      : attendanceInfo.remaining_days < 0
        ? 'student-float-panel--red'
        : attendanceInfo.remaining_days <= 7
          ? 'student-float-panel--orange'
          : 'student-float-panel--purple'
    const iconTone = attendanceInfo.paused
      ? 'text-cyan-300'
      : attendanceInfo.remaining_days < 0
        ? 'text-red-300'
        : attendanceInfo.remaining_days <= 7
          ? 'text-orange-300'
          : 'text-purple-300'
    const iconBg = attendanceInfo.paused
      ? 'bg-cyan-400/15 ring-cyan-300/20'
      : attendanceInfo.remaining_days < 0
        ? 'bg-red-400/15 ring-red-300/20'
        : attendanceInfo.remaining_days <= 7
          ? 'bg-orange-400/15 ring-orange-300/20'
          : 'bg-purple-400/15 ring-purple-300/20'

    return (
      <div className={`student-float-panel ${tone} p-5`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2.5 rounded-2xl ring-1 shrink-0 ${iconBg}`}>
            <Clock className={iconTone} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-0.5">Attendance</div>
            <h3 className="text-white font-semibold leading-tight">考勤进度</h3>
          </div>
        </div>

        <div className="mb-3">
          {attendanceInfo.paused ? (
            <span className="inline-flex items-center rounded-lg bg-cyan-500/15 text-cyan-200 text-xs px-2.5 py-1">请假中 · 计时暂停</span>
          ) : attendanceInfo.remaining_days > 0 ? (
            <div className="flex items-baseline gap-1.5">
              <span className={`text-3xl font-semibold tabular-nums tracking-tight ${
                attendanceInfo.remaining_days <= 7 ? 'text-orange-200' : 'text-purple-200'
              }`}>{attendanceInfo.remaining_days}</span>
              <span className={`text-sm ${attendanceInfo.remaining_days <= 7 ? 'text-orange-100/70' : 'text-purple-100/70'}`}>天剩余</span>
            </div>
          ) : attendanceInfo.remaining_days === 0 ? (
            <span className="text-lg font-semibold text-orange-300">今天到期</span>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-red-300">{Math.abs(attendanceInfo.remaining_days)}</span>
              <span className="text-sm text-red-200/70">天已超时</span>
            </div>
          )}
        </div>

        <p className="text-sm text-white/70 mb-4 leading-relaxed">
          {renderAttendanceReasonLabel(attendanceInfo.reason_label)}
        </p>

        {(() => {
          const deadline = Math.max(1, attendanceInfo.deadline_days || 1)
          const elapsed = attendanceInfo.elapsed_days
          const pct = Math.min(100, Math.round((elapsed / deadline) * 100))
          const over = elapsed >= deadline
          const barColor = over || pct >= 90
            ? 'bg-red-400'
            : pct >= 70
              ? 'bg-orange-400'
              : pct >= 40
                ? 'bg-yellow-400'
                : 'bg-purple-400'
          return (
            <div className="rounded-xl bg-black/25 border border-white/10 p-3">
              <div className="flex items-center justify-between gap-2 text-[11px] text-white/55 mb-2 tabular-nums">
                <span>已过 {elapsed}/{attendanceInfo.deadline_days} 天</span>
                <span className={over ? 'text-red-300' : 'text-white/70'}>{over ? '已满' : `${pct}%`}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${over ? 100 : Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          )
        })()}

        {attendanceInfo.reasons.length > 1 && (
          <ul className="space-y-2.5 mt-3 pt-3 border-t border-white/8 max-h-36 overflow-y-auto">
            {attendanceInfo.reasons.map(r => {
              const deadline = Math.max(1, r.deadline_days || 1)
              const pct = Math.min(100, Math.round((r.elapsed_days / deadline) * 100))
              const over = r.elapsed_days >= deadline
              const barColor = over || pct >= 90
                ? 'bg-red-400'
                : pct >= 70
                  ? 'bg-orange-400'
                  : pct >= 40
                    ? 'bg-yellow-400'
                    : 'bg-purple-400'
              return (
                <li key={r.reason_code} className="text-[11px] text-white/55">
                  <div className="mb-1 text-white/70">· {renderAttendanceReasonLabel(r.reason_label, true)}</div>
                  <div className="flex items-center justify-between gap-2 mb-1 tabular-nums">
                    <span>已过 {r.elapsed_days}/{r.deadline_days} · 剩余 {r.remaining_days}</span>
                    <span className={over ? 'text-red-300' : ''}>{over ? '已满' : `${pct}%`}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${over ? 100 : Math.max(pct, 2)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="student-main-center px-4 sm:px-6 lg:px-8 py-8 w-full">
      {createPortal(
        <>
          {showTrainingFloat && trainingPos && (
            <aside
              className="fixed z-50 w-[17.5rem] pointer-events-none"
              style={{ left: trainingPos.x, top: trainingPos.y }}
              aria-label="训练催促"
            >
              <div
                className="pointer-events-auto p-3 -m-3 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={(e) => startFloatDrag('training', e, trainingPos)}
              >
                {renderTrainingFloatCard()}
              </div>
            </aside>
          )}
          {showAttendanceFloat && attendancePos && (
            <aside
              className="fixed z-50 w-[17.5rem] pointer-events-none"
              style={{ left: attendancePos.x, top: attendancePos.y }}
              aria-label="考勤进度"
            >
              <div
                className="pointer-events-auto p-3 -m-3 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={(e) => startFloatDrag('attendance', e, attendancePos)}
              >
                {renderAttendanceFloatCard()}
              </div>
            </aside>
          )}
        </>,
        document.body
      )}

      <div className="w-full student-home-ambient">
        {/* 欢迎标题和用户菜单 */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              欢迎回来，<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{member.nickname}</span>
            </h1>
            <p className="text-gray-400">继续你的紫夜之旅</p>
          </div>
          <UserDropdown userType="student" />
        </div>

        {count > 0 && (
          <button
            type="button"
            onClick={() => navigate('/student/surveys')}
            className="w-full mb-6 text-left rounded-xl border-2 border-amber-400/60 bg-gradient-to-r from-amber-600/30 via-orange-500/25 to-rose-500/20 p-5 hover:border-amber-300 transition-colors group backdrop-blur-md"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/30 flex items-center justify-center shrink-0">
                <ClipboardList className="text-amber-300 animate-pulse" size={26} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-amber-200 font-bold text-lg">
                  有 {count} 份问卷待填写
                </div>
                <p className="text-amber-100/80 text-sm truncate mt-0.5">
                  {pending.map((s) => s.title).join('、')}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-amber-100 font-semibold text-sm group-hover:translate-x-0.5 transition-transform">
                立即填写 <ChevronRight size={18} />
              </span>
            </div>
          </button>
        )}

        {/* 今日值班教官 */}
        {onDutyInstructors.length > 0 && (
          <div className="student-glass-panel student-glass-panel--green p-4 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center flex-shrink-0">
              <UserCheck className="text-green-400" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-green-400 text-sm font-semibold">今日值班教官</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {onDutyInstructors.map((inst) => (
                  <span key={inst.username} className="inline-flex items-center gap-1.5 bg-green-600/15 border border-green-500/25 text-green-300 text-sm px-3 py-1 rounded-lg">
                    {inst.nickname}
                    <span className="text-green-500/60 text-xs">
                      {new Date(inst.clocked_in_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 上班
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 阶段信息容器 */}
        <div className="student-glass-panel p-8 mb-6">
          {/* 当前阶段和下一阶段 */}
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${nextStage ? 'mb-6' : ''}`}>
            {/* 当前阶段 */}
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getStageColor(member.stage_role)} flex items-center justify-center shadow-lg`}>
                  <CheckCircle className="text-white" size={28} />
                </div>
                <div>
                  <h2 className="text-sm text-gray-400 mb-1">当前阶段</h2>
                  <div className={`text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${getStageColor(member.stage_role)}`}>
                    {member.stage_role}
                  </div>
                </div>
              </div>
            </div>

            {/* 下一阶段 */}
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-14 h-14 rounded-xl ${nextStage ? `bg-gradient-to-br ${getStageColor(nextStage)}` : 'bg-gray-700'} flex items-center justify-center shadow-lg`}>
                  <TrendingUp className="text-white" size={28} />
                </div>
                <div>
                  <h2 className="text-sm text-gray-400 mb-1">下一阶段</h2>
                  {nextStage ? (
                    <div className={`text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${getStageColor(nextStage)}`}>
                      {nextStage}
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-gray-500">
                      {SPECIAL_ROLES.includes(member.stage_role) ? '特殊职位' : '已达最高'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 晋升进度条 */}
          {nextStage && (() => {
            const stageProgress = calculateStageProgress(member.stage_role, courses)
            const showProgressBar = member.stage_role !== '新训准考' && member.stage_role !== '未新训'
            
            return (
              <div className="pt-6 border-t border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Target className="text-purple-400" size={20} />
                    <span className="text-lg font-semibold text-white">晋升进度</span>
                  </div>
                  {showProgressBar && (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-purple-400">
                        {stageProgress.progress}%
                      </span>
                    </div>
                  )}
                </div>
                
                {showProgressBar ? (
                  <>
                    <div className="relative h-4 bg-gray-700 rounded-full overflow-hidden shadow-inner">
                      <div 
                        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${getStageColor(nextStage)} rounded-full transition-all duration-700 shadow-lg`}
                        style={{ width: `${stageProgress.progress}%` }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-400">
                      <span>{member.stage_role}</span>
                      <span>{nextStage}</span>
                    </div>
                  </>
                ) : null}
                
                <div className={`${showProgressBar ? 'mt-3' : ''} text-sm text-gray-400 text-center student-glass-chip p-3`}>
                  {stageProgress.description}
                </div>
              </div>
            )
          })()}
        </div>

        {/* 课程进度 - 一行横向显示 */}
        <div 
          onClick={() => navigate('/student/progress')}
          className="student-glass-panel student-glass-panel--interactive p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <BookOpen size={20} className="text-purple-400" />
              课程进度
            </h2>
            <span className="text-2xl font-bold text-purple-400">{totalProgress}%</span>
          </div>
          
          {/* 总进度条 */}
          <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden mb-4">
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-500 shadow-lg"
              style={{ width: `${totalProgress}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            </div>
          </div>

          {/* 类别进度 - 横向平铺 */}
          <div className="flex items-center gap-3">
            {categoryProgress.map((cat) => (
              <div key={cat.category} className="flex-1 student-glass-chip p-3 min-w-0">
                <div className="text-xs text-gray-400 mb-1 truncate">{cat.category}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-white">{cat.completed}</span>
                  <span className="text-sm text-gray-500">/ {cat.total}</span>
                </div>
                <div className="text-xs text-purple-400 mt-1">{cat.percentage}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* 下方左右结构 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：我的课程 (占2列) */}
          <div className="lg:col-span-2 student-glass-panel p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BookOpen size={20} className="text-blue-400" />
              我的课程
            </h2>

            {/* 最近学习 */}
            {recentCourse && (
              <div className="student-glass-chip student-glass-chip--blue p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={16} className="text-blue-400" />
                  <span className="text-sm text-blue-300 font-medium">最近学习</span>
                </div>
                <div className="text-white font-medium">{recentCourse.code} - {recentCourse.name}</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all"
                      style={{ width: `${recentCourse.progress}%` }}
                    />
                  </div>
                  <span className="text-sm text-blue-400 font-medium">{recentCourse.progress}%</span>
                </div>
              </div>
            )}

            {/* 待学习课程 */}
            <div className="space-y-2">
              <div className="text-sm text-gray-400 mb-3">待学习课程</div>
              {courses
                .filter(c => c.progress < 100)
                .sort((a, b) => a.code.localeCompare(b.code))
                .slice(0, 5)
                .map((course) => (
                  <div key={course.id} className="student-glass-chip p-3 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-white font-medium text-sm">{course.code} - {course.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{course.category} · {course.hours}小时</div>
                    </div>
                    <div className="text-sm text-purple-400 font-medium">{course.progress}%</div>
                  </div>
                ))}
              {courses.filter(c => c.progress < 100).length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  🎉 所有课程已完成！
                </div>
              )}
            </div>
          </div>

          {/* 右侧：考核相关 (占1列) */}
          <div className="student-glass-panel p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Trophy size={20} className="text-yellow-400" />
            考核相关
          </h2>
          
          <div className="space-y-3">
            {/* 查看公开视频 */}
            <button
              onClick={() => navigate('/student/videos')}
              className="student-glass-btn"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-400/20 flex items-center justify-center shrink-0">
                <Video className="text-violet-300" size={20} />
              </div>
              <div>
                <div className="text-white font-medium">查看公开报告</div>
                <div className="text-sm text-gray-400">学习优秀案例</div>
              </div>
            </button>

            {/* 申请新训考核 */}
            {member.stage_role === '新训准考' ? (
              <button
                onClick={() => navigate('/student/apply-assessment')}
                className="student-glass-btn"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-400/20 flex items-center justify-center shrink-0">
                  <Trophy className="text-violet-300" size={20} />
                </div>
                <div>
                  <div className="text-white font-medium">申请新训考核</div>
                  <div className="text-sm text-gray-400">点击申请考核</div>
                </div>
              </button>
            ) : (
              <div className="student-glass-btn student-glass-chip--muted pointer-events-none">
                <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Lock className="text-gray-500" size={20} />
                </div>
                <div>
                  <div className="text-gray-400 font-medium">申请新训考核</div>
                  <div className="text-sm text-gray-500">需达到新训准考阶段</div>
                </div>
              </div>
            )}

            {/* 查看考核报告 */}
            <button
              onClick={() => navigate('/student/assessment-report')}
              className="student-glass-btn"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-400/20 flex items-center justify-center shrink-0">
                <FileText className="text-violet-300" size={20} />
              </div>
              <div>
                <div className="text-white font-medium">新训考核报告</div>
                <div className="text-sm text-gray-400">查看考核详情</div>
              </div>
            </button>
          </div>
        </div>
        </div>

        {/* 文档快捷方式 */}
        <div className="student-glass-panel p-6 mt-6">
          <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600/20">
              <BookOpen size={22} className="text-blue-400" />
            </div>
            文档中心
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="#/docs/紫夜CQB战术公会"
              className="student-glass-chip group flex flex-col items-center gap-3 p-5"
            >
              <div className="p-3 rounded-lg bg-purple-500/15 border border-purple-400/20 group-hover:bg-purple-500/25 transition-colors">
                <FileText size={28} className="text-purple-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">紫夜简介</span>
            </a>
            
            <a
              href="#/docs/紫夜战术公会公告细则"
              className="student-glass-chip group flex flex-col items-center gap-3 p-5"
            >
              <div className="p-3 rounded-lg bg-blue-500/15 border border-blue-400/20 group-hover:bg-blue-500/25 transition-colors">
                <FileText size={28} className="text-blue-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">紫夜规章制度</span>
            </a>
            
            <a
              href="#/docs/紫夜新训须知"
              className="student-glass-chip group flex flex-col items-center gap-3 p-5"
            >
              <div className="p-3 rounded-lg bg-green-500/15 border border-green-400/20 group-hover:bg-green-500/25 transition-colors">
                <FileText size={28} className="text-green-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">加入我们</span>
            </a>
            
            <a
              href="#/docs/模组详细说明"
              className="student-glass-chip group flex flex-col items-center gap-3 p-5"
            >
              <div className="p-3 rounded-lg bg-orange-500/15 border border-orange-400/20 group-hover:bg-orange-500/25 transition-colors">
                <FileText size={28} className="text-orange-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">MOD说明</span>
            </a>
          </div>
        </div>
      </div>

      {showCongrats && congratsConfig && (
        <CongratsModal
          config={congratsConfig}
          onClose={closeCongrats}
          onAction={handleCongratsAction}
        />
      )}
    </div>
  )
}
