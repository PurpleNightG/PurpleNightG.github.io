import { useState, useEffect } from 'react'
import { 
  Home, 
  BookOpen, 
  FileCheck, 
  FileText,
  Video,
  Smartphone,
  Users
} from 'lucide-react'
import { Link, useLocation, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import StudentProgress from './StudentProgress'
import PublicVideos from './PublicVideos'
import StudentApplyAssessment from './StudentApplyAssessment'
import StudentAssessmentReport from './StudentAssessmentReport'
import StudentHome from './StudentHome'
import StudentClassmates from './StudentClassmates'

interface MenuItem {
  name: string
  path: string
  icon: React.ReactNode
}

function StudentDashboardContent() {
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Mobile warning screen
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border-2 border-purple-600/50 shadow-2xl shadow-purple-500/20">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center animate-pulse">
              <Smartphone size={40} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              请使用电脑端打开
            </h1>
            <div className="space-y-3 text-gray-300">
              <p>
                请使用电脑端打开本网页，否则将出现布局错乱问题。
              </p>
              <p className="text-sm text-purple-400">
                因为鲶鱼懒懒的，所以没完善响应式页面哦~ 😴
              </p>
            </div>
            <div className="pt-4 border-t border-gray-700 w-full">
              <img 
                src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" 
                alt="紫夜队标" 
                className="w-16 h-16 mx-auto rounded-lg"
              />
              <p className="text-gray-500 text-sm mt-3">紫夜战术公会 - 学员端</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const menuItems: MenuItem[] = [
    { name: '首页', path: '/student', icon: <Home size={20} /> },
    { name: '课程进度', path: '/student/progress', icon: <BookOpen size={20} /> },
    { name: '同期学员', path: '/student/classmates', icon: <Users size={20} /> },
    { name: '申请考核', path: '/student/apply-assessment', icon: <FileCheck size={20} /> },
    { name: '新训考核报告', path: '/student/assessment-report', icon: <FileText size={20} /> },
    { name: '公开视频查看', path: '/student/videos', icon: <Video size={20} /> }
  ]

  const isActive = (path: string) => {
    return location.pathname === path
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900">
      {/* Left Sidebar */}
      <aside className="w-64 bg-gray-800/30 backdrop-blur-xl border-r border-gray-700/30 flex flex-col">
        {/* Logo */}
        <div className="relative h-16 flex items-center px-4 border-b border-gray-700/30 overflow-hidden">
          {/* 背景渐变装饰 */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-transparent to-transparent"></div>
          <div className="absolute -left-10 -top-10 w-32 h-32 bg-purple-600/5 rounded-full blur-2xl"></div>
          
          <div className="relative flex items-center gap-3 w-full">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
              <img 
                src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" 
                alt="紫夜队标" 
                className="relative w-9 h-9 rounded-lg shadow-lg"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-lg tracking-tight">学员中心</span>
              <span className="text-gray-500 text-xs">Student Center</span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menuItems.map((item) => (
            <div key={item.path} className="mb-1">
              <Link
                to={item.path}
                className="group block"
              >
                <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all ${
                  isActive(item.path)
                    ? 'bg-purple-600/20 text-purple-300'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/20'
                }`}>
                  <div className={`transition-colors ${
                    isActive(item.path)
                      ? 'text-purple-400'
                      : 'text-gray-500 group-hover:text-gray-400'
                  }`}>
                    {item.icon}
                  </div>
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
              </Link>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700/30">
          <div className="text-center">
            <p className="text-xs text-gray-500">
              紫夜战术公会 · 学员系统
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route index element={<StudentHome />} />
          <Route path="progress" element={<StudentProgress />} />
          <Route path="classmates" element={<StudentClassmates />} />
          <Route path="apply-assessment" element={<StudentApplyAssessment />} />
          <Route path="assessment-report" element={<StudentAssessmentReport />} />
          <Route path="videos" element={<PublicVideos />} />
        </Routes>
      </main>
    </div>
  )
}

// 导出带路由守卫的组件
export default function StudentDashboard() {
  return (
    <ProtectedRoute requiredUserType="student">
      <StudentDashboardContent />
    </ProtectedRoute>
  )
}
