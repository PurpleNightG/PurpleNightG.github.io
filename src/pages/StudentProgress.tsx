import { useState, useEffect } from 'react'
import { progressAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { BookOpen, Award, Clock, TrendingUp } from 'lucide-react'

interface Course {
  id: number
  code: string
  name: string
  category: string
  difficulty: string
  hours: number
  progress: number
}

export default function StudentProgress() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalCourses: 0,
    completedCourses: 0,
    inProgressCourses: 0,
    totalHours: 0,
    completedHours: 0
  })

  useEffect(() => {
    loadProgress()
  }, [])

  const loadProgress = async () => {
    setLoading(true)
    try {
      // 从 localStorage 获取当前登录学员信息（注意：学员使用 studentUser 键）
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) {
        // 如果没有用户信息，静默返回，让页面显示空状态
        setLoading(false)
        return
      }

      const user = JSON.parse(userStr)
      
      const response = await progressAPI.getMemberProgress(String(user.id))
      
      const coursesData = response.data

      setCourses(coursesData)

      // 计算统计数据
      const completed = coursesData.filter((c: Course) => c.progress === 100).length
      const inProgress = coursesData.filter((c: Course) => c.progress > 0 && c.progress < 100).length
      const totalHours = coursesData.reduce((sum: number, c: Course) => sum + c.hours, 0)
      const completedHours = coursesData
        .filter((c: Course) => c.progress === 100)
        .reduce((sum: number, c: Course) => sum + c.hours, 0)

      setStats({
        totalCourses: coursesData.length,
        completedCourses: completed,
        inProgressCourses: inProgress,
        totalHours,
        completedHours
      })
    } catch (error: any) {
      console.error('加载课程进度失败:', error)
      toast.error('加载课程进度失败')
    } finally {
      setLoading(false)
    }
  }

  const getProgressColor = (progress: number) => {
    if (progress === 0) return 'from-gray-600 to-gray-700'
    if (progress < 50) return 'from-red-600 to-orange-600'
    if (progress < 100) return 'from-yellow-600 to-blue-600'
    return 'from-green-600 to-emerald-600'
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case '初级': return 'bg-green-600/20 text-green-300 border-green-600/30'
      case '中级': return 'bg-blue-600/20 text-blue-300 border-blue-600/30'
      case '高级': return 'bg-red-600/20 text-red-300 border-red-600/30'
      default: return 'bg-gray-600/20 text-gray-300 border-gray-600/30'
    }
  }

  const groupedCourses = courses.reduce((acc, course) => {
    if (!acc[course.category]) {
      acc[course.category] = []
    }
    acc[course.category].push(course)
    return acc
  }, {} as Record<string, Course[]>)

  const categories = ['入门课程', '标准技能一阶课程', '标准技能二阶课程', '团队训练', '进阶课程']

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">我的课程进度</h1>
        <p className="text-gray-400">查看你的学习进度和课程完成情况</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 backdrop-blur-sm rounded-xl p-6 border border-purple-600/30">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-purple-600/30 rounded-lg flex items-center justify-center">
              <BookOpen size={24} className="text-purple-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.totalCourses}</span>
          </div>
          <p className="text-purple-300 font-medium">总课程数</p>
          <p className="text-gray-400 text-sm mt-1">需要学习的课程</p>
        </div>

        <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 backdrop-blur-sm rounded-xl p-6 border border-green-600/30">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-green-600/30 rounded-lg flex items-center justify-center">
              <Award size={24} className="text-green-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.completedCourses}</span>
          </div>
          <p className="text-green-300 font-medium">已完成</p>
          <p className="text-gray-400 text-sm mt-1">
            完成率 {stats.totalCourses > 0 ? Math.round((stats.completedCourses / stats.totalCourses) * 100) : 0}%
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 backdrop-blur-sm rounded-xl p-6 border border-blue-600/30">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-blue-600/30 rounded-lg flex items-center justify-center">
              <TrendingUp size={24} className="text-blue-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.inProgressCourses}</span>
          </div>
          <p className="text-blue-300 font-medium">学习中</p>
          <p className="text-gray-400 text-sm mt-1">正在进行的课程</p>
        </div>

        <div className="bg-gradient-to-br from-amber-600/20 to-amber-800/20 backdrop-blur-sm rounded-xl p-6 border border-amber-600/30">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-amber-600/30 rounded-lg flex items-center justify-center">
              <Clock size={24} className="text-amber-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.completedHours}</span>
          </div>
          <p className="text-amber-300 font-medium">已完成课时</p>
          <p className="text-gray-400 text-sm mt-1">共 {stats.totalHours} 课时</p>
        </div>
      </div>

      {/* 课程列表 */}
      <div className="space-y-6">
        {categories.map(category => {
          const categoryCourses = groupedCourses[category] || []
          if (categoryCourses.length === 0) return null

          return (
            <div key={category} className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-600/20 to-purple-800/20 px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">{category}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {categoryCourses.filter(c => c.progress === 100).length} / {categoryCourses.length} 已完成
                </p>
              </div>

              <div className="p-6">
                <div className="grid gap-4">
                  {categoryCourses.map(course => (
                    <div
                      key={course.id}
                      className="bg-gray-700/30 rounded-lg p-5 border border-gray-700/50 hover:border-purple-600/50 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-purple-400 font-mono text-sm font-semibold">{course.code}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getDifficultyColor(course.difficulty)}`}>
                              {course.difficulty}
                            </span>
                            <span className="text-gray-500 text-sm">{course.hours} 课时</span>
                          </div>
                          <h3 className="text-white font-semibold text-lg">{course.name}</h3>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${
                            course.progress === 100 ? 'text-green-400' :
                            course.progress > 0 ? 'text-blue-400' :
                            'text-gray-500'
                          }`}>
                            {course.progress}%
                          </div>
                          {course.progress === 100 && (
                            <span className="text-xs text-green-400 flex items-center gap-1 mt-1">
                              <Award size={14} />
                              已完成
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 进度条 */}
                      <div className="relative">
                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${getProgressColor(course.progress)} transition-all duration-500 relative overflow-hidden`}
                            style={{ width: `${course.progress}%` }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {courses.length === 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-12 border border-gray-700 text-center">
          <BookOpen size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 text-lg">暂无课程数据</p>
          <p className="text-gray-500 text-sm mt-2">请联系教官为你分配课程</p>
        </div>
      )}
    </div>
  )
}
