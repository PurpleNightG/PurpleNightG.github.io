import { 
  Home, 
  BookOpen, 
  FileCheck, 
  FileText,
  Video
} from 'lucide-react'
import { Link, useLocation, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import StudentProgress from './StudentProgress'
import PublicVideos from './PublicVideos'
import StudentApplyAssessment from './StudentApplyAssessment'
import StudentAssessmentReport from './StudentAssessmentReport'
import StudentHome from './StudentHome'

interface MenuItem {
  name: string
  path: string
  icon: React.ReactNode
}

function StudentDashboardContent() {
  const location = useLocation()

  const menuItems: MenuItem[] = [
    { name: '首页', path: '/student', icon: <Home size={20} /> },
    { name: '课程进度', path: '/student/progress', icon: <BookOpen size={20} /> },
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
