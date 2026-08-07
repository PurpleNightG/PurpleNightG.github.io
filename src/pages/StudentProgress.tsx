import { useState, useEffect } from 'react'
import { progressAPI, courseAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { BookOpen, Award, Clock, TrendingUp, ChevronDown } from 'lucide-react'
import PageSkeleton from '../components/Skeleton'
import {
  parseMetaOptions,
  tagBadgeClass,
  type MetaOption,
} from '../utils/tagColors'

interface Course {
  id: number
  code: string
  name: string
  category: string
  difficulty: string
  hours: number
  progress: number
}

const PREFERRED_CATEGORY_ORDER = [
  '入门课程',
  '标准技能一阶课程',
  '标准技能二阶课程',
  '团队训练',
  '进阶课程',
]

function orderedCategories(courses: { category?: string | null }[]): string[] {
  const present = [
    ...new Set(
      courses.map((c) => (c.category && String(c.category).trim()) || '未分类')
    ),
  ]
  return [
    ...PREFERRED_CATEGORY_ORDER.filter((c) => present.includes(c)),
    ...present
      .filter((c) => !PREFERRED_CATEGORY_ORDER.includes(c))
      .sort((a, b) => a.localeCompare(b, 'zh-CN')),
  ]
}

export default function StudentProgress() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [difficulties, setDifficulties] = useState<MetaOption[]>(
    parseMetaOptions(
      [
        { name: '初级', color: 'green' },
        { name: '中级', color: 'blue' },
        { name: '高级', color: 'red' },
      ],
      ['初级', '中级', '高级']
    )
  )
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [stats, setStats] = useState({
    totalCourses: 0,
    completedCourses: 0,
    inProgressCourses: 0,
    totalHours: 0,
    completedHours: 0
  })

  useEffect(() => {
    loadProgress()
    loadDifficulties()
  }, [])

  const loadDifficulties = async () => {
    try {
      const res = await courseAPI.getDifficulties()
      setDifficulties(parseMetaOptions(res.data, ['初级', '中级', '高级']))
    } catch (e) {
      console.error('加载难度配置失败:', e)
    }
  }

  const loadProgress = async () => {
    setLoading(true)
    try {
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) {
        setLoading(false)
        return
      }

      JSON.parse(userStr) // 确认已登录
      const response = await progressAPI.getMy()
      const coursesData = response.data as Course[]

      setCourses(coursesData)

      const completed = coursesData.filter((c) => c.progress === 100).length
      const inProgress = coursesData.filter((c) => c.progress > 0 && c.progress < 100).length
      const totalHours = coursesData.reduce((sum, c) => sum + c.hours, 0)
      const completedHours = coursesData
        .filter((c) => c.progress === 100)
        .reduce((sum, c) => sum + c.hours, 0)

      setStats({
        totalCourses: coursesData.length,
        completedCourses: completed,
        inProgressCourses: inProgress,
        totalHours,
        completedHours
      })

      // 已全部完成的分类默认收起，其余展开
      const nextCollapsed: Record<string, boolean> = {}
      for (const category of orderedCategories(coursesData)) {
        const list = coursesData.filter(
          (c) => ((c.category && String(c.category).trim()) || '未分类') === category
        )
        if (list.length > 0 && list.every((c) => c.progress === 100)) {
          nextCollapsed[category] = true
        }
      }
      setCollapsed(nextCollapsed)
    } catch (error: any) {
      console.error('加载课程进度失败:', error)
      toast.error('加载课程进度失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (category: string) => {
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  const getProgressColor = (progress: number) => {
    if (progress === 0) return 'from-gray-600 to-gray-700'
    if (progress < 50) return 'from-red-600 to-orange-600'
    if (progress < 100) return 'from-yellow-600 to-blue-600'
    return 'from-green-600 to-emerald-600'
  }

  const getDifficultyColor = (difficulty: string) => {
    const found = difficulties.find((d) => d.name === difficulty)
    return tagBadgeClass(
      found?.color ||
        (difficulty === '初级' ? 'green' : difficulty === '高级' ? 'red' : 'blue')
    )
  }

  const groupedCourses = courses.reduce((acc, course) => {
    const cat = (course.category && String(course.category).trim()) || '未分类'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(course)
    return acc
  }, {} as Record<string, Course[]>)

  if (loading) {
    return <PageSkeleton variant="cards" />
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">我的课程进度</h1>
        <p className="text-gray-400">查看你的学习进度和课程完成情况</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="student-glass-panel p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 rounded-lg bg-purple-500/15 border border-purple-400/20 flex items-center justify-center">
              <BookOpen size={24} className="text-purple-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.totalCourses}</span>
          </div>
          <p className="text-purple-300 font-medium">总课程数</p>
          <p className="text-gray-400 text-sm mt-1">需要学习的课程</p>
        </div>

        <div className="student-glass-panel student-glass-panel--green p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 rounded-lg bg-green-500/15 border border-green-400/20 flex items-center justify-center">
              <Award size={24} className="text-green-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.completedCourses}</span>
          </div>
          <p className="text-green-300 font-medium">已完成</p>
          <p className="text-gray-400 text-sm mt-1">
            完成率 {stats.totalCourses > 0 ? Math.round((stats.completedCourses / stats.totalCourses) * 100) : 0}%
          </p>
        </div>

        <div className="student-glass-panel p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 rounded-lg bg-blue-500/15 border border-blue-400/20 flex items-center justify-center">
              <TrendingUp size={24} className="text-blue-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.inProgressCourses}</span>
          </div>
          <p className="text-blue-300 font-medium">学习中</p>
          <p className="text-gray-400 text-sm mt-1">正在进行的课程</p>
        </div>

        <div className="student-glass-panel p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 rounded-lg bg-amber-500/15 border border-amber-400/20 flex items-center justify-center">
              <Clock size={24} className="text-amber-400" />
            </div>
            <span className="text-3xl font-bold text-white">{stats.completedHours}</span>
          </div>
          <p className="text-amber-300 font-medium">已完成课时</p>
          <p className="text-gray-400 text-sm mt-1">共 {stats.totalHours} 课时</p>
        </div>
      </div>

      <div className="space-y-4">
        {orderedCategories(courses).map((category) => {
          const categoryCourses = groupedCourses[category] || []
          if (categoryCourses.length === 0) return null

          const doneCount = categoryCourses.filter((c) => c.progress === 100).length
          const isCollapsed = !!collapsed[category]

          return (
            <div key={category} className="student-glass-panel overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left bg-white/[0.03] hover:bg-white/[0.05] transition-colors border-b border-white/10"
              >
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white">{category}</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {doneCount} / {categoryCourses.length} 已完成
                  </p>
                </div>
                <ChevronDown
                  size={22}
                  className={`text-gray-400 shrink-0 transition-transform duration-200 ${
                    isCollapsed ? '' : 'rotate-180'
                  }`}
                />
              </button>

              {!isCollapsed && (
                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {categoryCourses.map((course) => (
                      <div key={course.id} className="student-glass-chip p-4">
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="text-purple-400 font-mono text-sm font-semibold">
                                {course.code}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDifficultyColor(course.difficulty)}`}>
                                {course.difficulty}
                              </span>
                              <span className="text-gray-500 text-xs">{course.hours} 课时</span>
                            </div>
                            <h3 className="text-white font-semibold truncate" title={course.name}>
                              {course.name}
                            </h3>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`text-xl font-bold tabular-nums ${
                                course.progress === 100
                                  ? 'text-green-400'
                                  : course.progress > 0
                                    ? 'text-blue-400'
                                    : 'text-gray-500'
                              }`}
                            >
                              {course.progress}%
                            </div>
                            {course.progress === 100 && (
                              <span className="text-[11px] text-green-400 inline-flex items-center gap-0.5 mt-0.5">
                                <Award size={12} />
                                已完成
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${getProgressColor(course.progress)} transition-all duration-500 relative overflow-hidden`}
                            style={{ width: `${course.progress}%` }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {courses.length === 0 && (
        <div className="student-glass-panel p-12 text-center">
          <BookOpen size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 text-lg">暂无课程数据</p>
          <p className="text-gray-500 text-sm mt-2">请联系教官为你分配课程</p>
        </div>
      )}
    </div>
  )
}
