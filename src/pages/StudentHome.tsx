import { useState, useEffect } from 'react'
import { memberAPI, progressAPI } from '../utils/api'
import { Trophy, TrendingUp, CheckCircle, Star, Sparkles, Award, Target, BookOpen, Video, Lock, Clock, AlertTriangle, KeyRound, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import UserDropdown from '../components/UserDropdown'
import { toast } from '../utils/toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface Member {
  id: number
  nickname: string
  stage_role: string
  status: string
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

// 特殊阶段（非线性流程）
const SPECIAL_ROLES = ['会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师']

// 阶段恭喜配置
const STAGE_CONGRATULATIONS = {
  '新训初期': {
    title: '🎉 恭喜晋升！',
    message: '恭喜你成功晋升为新训初期！继续努力，向着更高的目标前进！',
    icon: <Sparkles className="text-blue-400" size={48} />
  },
  '新训一期': {
    title: '🎊 恭喜晋升！',
    message: '恭喜你晋升为新训一期！你已经掌握了基础技能，继续加油！',
    icon: <TrendingUp className="text-blue-400" size={48} />
  },
  '新训二期': {
    title: '🌟 恭喜晋升！',
    message: '恭喜你晋升为新训二期！你的实力正在不断提升！',
    icon: <Star className="text-blue-400" size={48} />
  },
  '新训三期': {
    title: '✨ 恭喜晋升！',
    message: '恭喜你晋升为新训三期！距离准考只有一步之遥了！',
    icon: <Target className="text-blue-400" size={48} />
  },
  '新训准考': {
    title: '🎯 恭喜达到准考阶段！',
    message: '恭喜你达到新训准考阶段！现在可以前往考核申请页面申请新训考核了！',
    icon: <Trophy className="text-yellow-400" size={48} />,
    actionText: '去申请考核',
    actionPath: '/student/apply-assessment'
  },
  '紫夜': {
    title: '👑 恭喜成为正式队员！',
    message: '恭喜你成功晋升为紫夜！你已经是紫夜战队的正式队员了！',
    icon: <Award className="text-purple-400" size={48} />
  },
  '紫夜尖兵': {
    title: '⚔️ 恭喜晋升尖兵！',
    message: '恭喜你晋升为紫夜尖兵！你已经成为战队的精英力量！',
    icon: <Award className="text-purple-500" size={48} />
  }
}

export default function StudentHome() {
  const navigate = useNavigate()
  const [member, setMember] = useState<Member | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress[]>([])
  const [totalProgress, setTotalProgress] = useState(0)
  const [recentCourse, setRecentCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCongrats, setShowCongrats] = useState(false)
  const [congratsConfig, setCongratsConfig] = useState<any>(null)
  const [showPasswordWarning, setShowPasswordWarning] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  useEffect(() => {
    loadMemberInfo()
    loadCourseProgress()
    checkDefaultPassword()
  }, [])

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

      const response = await memberAPI.getById(user.id)
      
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
      const response = await progressAPI.getMemberProgress(String(user.id))
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
    const currentStage = memberData.stage_role
    const lastStageKey = `last_stage_${memberData.id}`
    const lastStage = localStorage.getItem(lastStageKey)
    
    // 获取当前阶段和上次阶段的索引
    const currentIndex = STAGE_FLOW.indexOf(currentStage)
    const lastIndex = lastStage ? STAGE_FLOW.indexOf(lastStage) : -1
    
    // 检查是否发生阶段变化
    if (lastStage && lastStage !== currentStage) {
      // 判断是晋升还是降级
      if (currentIndex !== -1 && lastIndex !== -1) {
        if (currentIndex < lastIndex) {
          // 降级：显示鼓励弹窗
          const storageKey = `demotion_shown_${memberData.id}_${currentStage}_${Date.now()}`
          setCongratsConfig({
            title: '💪 不要气馁！',
            message: `阶段从 ${lastStage} 调整为 ${currentStage}，这只是暂时的挫折。继续努力学习和训练，你一定能重新晋升！`,
            icon: <Trophy className="text-blue-500" size={48} />,
            actionText: '查看课程进度',
            actionPath: '/student/progress',
            isDemotion: true  // 标记为降级弹窗
          })
          setShowCongrats(true)
          localStorage.setItem(storageKey, 'true')
        } else if (currentIndex > lastIndex) {
          // 晋升：检查是否已显示过恭喜弹窗
          const storageKey = `congrats_shown_${memberData.id}_${currentStage}`
          const hasShown = localStorage.getItem(storageKey)
          
          if (!hasShown && STAGE_CONGRATULATIONS[currentStage as keyof typeof STAGE_CONGRATULATIONS]) {
            setCongratsConfig(STAGE_CONGRATULATIONS[currentStage as keyof typeof STAGE_CONGRATULATIONS])
            setShowCongrats(true)
            localStorage.setItem(storageKey, 'true')
          }
        }
      }
    } else if (!lastStage) {
      // 首次加载，检查是否需要显示当前阶段的恭喜弹窗
      const storageKey = `congrats_shown_${memberData.id}_${currentStage}`
      const hasShown = localStorage.getItem(storageKey)
      
      if (!hasShown && STAGE_CONGRATULATIONS[currentStage as keyof typeof STAGE_CONGRATULATIONS]) {
        setCongratsConfig(STAGE_CONGRATULATIONS[currentStage as keyof typeof STAGE_CONGRATULATIONS])
        setShowCongrats(true)
        localStorage.setItem(storageKey, 'true')
      }
    }
    
    // 更新存储的阶段
    localStorage.setItem(lastStageKey, currentStage)
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

    const currentIndex = STAGE_FLOW.indexOf(currentStage)
    if (currentIndex === -1 || currentIndex === STAGE_FLOW.length - 1) {
      return null
    }

    return STAGE_FLOW[currentIndex + 1]
  }

  const getStageColor = (stage: string) => {
    if (stage === '紫夜' || stage === '紫夜尖兵') {
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
    setShowCongrats(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="text-gray-400">加载中...</div>
        </div>
      </div>
    )
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
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-red-700 shadow-2xl">
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
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">确认新密码</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="请再次输入新密码"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500 transition-colors"
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
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
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

        {/* 阶段信息容器 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-8 mb-6">
          {/* 当前阶段和下一阶段 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
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
                
                <div className={`${showProgressBar ? 'mt-3' : ''} text-sm text-gray-400 text-center bg-gray-700/30 rounded-lg p-3`}>
                  {stageProgress.description}
                </div>
              </div>
            )
          })()}
        </div>

        {/* 课程进度 - 一行横向显示 */}
        <div 
          onClick={() => navigate('/student/progress')}
          className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6 mb-6 cursor-pointer hover:border-purple-500/50 transition-all hover:bg-gray-800/70"
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
              <div key={cat.category} className="flex-1 bg-gray-700/30 rounded-lg p-3 min-w-0">
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
          <div className="lg:col-span-2 bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BookOpen size={20} className="text-blue-400" />
              我的课程
            </h2>

            {/* 最近学习 */}
            {recentCourse && (
              <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={16} className="text-blue-400" />
                  <span className="text-sm text-blue-300 font-medium">最近学习</span>
                </div>
                <div className="text-white font-medium">{recentCourse.code} - {recentCourse.name}</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
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
                  <div key={course.id} className="bg-gray-700/30 rounded-lg p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors">
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
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Trophy size={20} className="text-yellow-400" />
            考核相关
          </h2>
          
          <div className="space-y-4">
            {/* 查看公开视频 */}
            <button
              onClick={() => navigate('/student/videos')}
              className="w-full flex items-center gap-3 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-pink-600/20 flex items-center justify-center">
                <Video className="text-pink-400" size={20} />
              </div>
              <div>
                <div className="text-white font-medium">查看公开视频</div>
                <div className="text-sm text-gray-400">学习优秀案例</div>
              </div>
            </button>

            {/* 申请新训考核 */}
            {member.stage_role === '新训准考' ? (
              <button
                onClick={() => navigate('/student/apply-assessment')}
                className="w-full flex items-center gap-3 p-4 bg-yellow-600/20 hover:bg-yellow-600/30 rounded-lg transition-colors text-left border border-yellow-600/30"
              >
                <div className="w-10 h-10 rounded-lg bg-yellow-600/30 flex items-center justify-center">
                  <Trophy className="text-yellow-400" size={20} />
                </div>
                <div>
                  <div className="text-white font-medium">申请新训考核</div>
                  <div className="text-sm text-yellow-300">点击申请考核</div>
                </div>
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 p-4 bg-gray-700/30 rounded-lg text-left opacity-60 cursor-not-allowed">
                <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
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
              className="w-full flex items-center gap-3 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                <FileText className="text-green-400" size={20} />
              </div>
              <div>
                <div className="text-white font-medium">新训考核报告</div>
                <div className="text-sm text-gray-400">查看考核详情</div>
              </div>
            </button>
          </div>
        </div>

        {/* 文档快捷方式 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mt-6">
          <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600/20">
              <BookOpen size={22} className="text-blue-400" />
            </div>
            文档中心
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="#/docs/PNG"
              className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-purple-500/50"
            >
              <div className="p-3 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                <FileText size={28} className="text-purple-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">紫夜简介</span>
            </a>
            
            <a
              href="#/docs/PNGrule"
              className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-blue-500/50"
            >
              <div className="p-3 bg-blue-600/20 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                <FileText size={28} className="text-blue-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">紫夜规章制度</span>
            </a>
            
            <a
              href="#/docs/HTJ"
              className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-green-500/50"
            >
              <div className="p-3 bg-green-600/20 rounded-lg group-hover:bg-green-600/30 transition-colors">
                <FileText size={28} className="text-green-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">加入我们</span>
            </a>
            
            <a
              href="#/docs/mod-explan"
              className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-orange-500/50"
            >
              <div className="p-3 bg-orange-600/20 rounded-lg group-hover:bg-orange-600/30 transition-colors">
                <FileText size={28} className="text-orange-400" />
              </div>
              <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">MOD说明</span>
            </a>
          </div>
        </div>
      </div>
      </div>

      {/* 恭喜弹窗 */}
      {showCongrats && congratsConfig && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl animate-scaleIn">
            <div className="p-8 text-center">
              {/* 图标 */}
              <div className="mb-6 flex justify-center animate-bounce">
                {congratsConfig.icon}
              </div>

              {/* 标题 */}
              <h2 className="text-3xl font-bold text-white mb-4">
                {congratsConfig.title}
              </h2>

              {/* 消息 */}
              <p className="text-gray-300 text-lg mb-8 leading-relaxed">
                {congratsConfig.message}
              </p>

              {/* 按钮 */}
              <div className="flex gap-3">
                {congratsConfig.actionText && congratsConfig.actionPath ? (
                  <>
                    <button
                      onClick={() => setShowCongrats(false)}
                      className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
                    >
                      稍后再说
                    </button>
                    <button
                      onClick={handleCongratsAction}
                      className={`flex-1 px-6 py-3 bg-gradient-to-r ${
                        congratsConfig.isDemotion
                          ? 'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
                          : 'from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600'
                      } text-white rounded-lg transition-all font-medium shadow-lg`}
                    >
                      {congratsConfig.actionText}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowCongrats(false)}
                    className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white rounded-lg transition-all font-medium shadow-lg"
                  >
                    太棒了！
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
