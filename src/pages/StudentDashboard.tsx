import { 
  Home, 
  BookOpen, 
  FileCheck, 
  FileText,
  Video,
  User,
  LogOut
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'

interface MenuItem {
  name: string
  path: string
  icon: React.ReactNode
}

function StudentDashboardContent() {
  const location = useLocation()
  const navigate = useNavigate()

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
      <aside className="w-64 bg-gray-900/50 backdrop-blur-sm border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-800">
          <img 
            src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" 
            alt="紫夜队标" 
            className="w-8 h-8 rounded-lg"
          />
          <span className="ml-3 text-white font-bold text-lg">学员中心</span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-6 py-3 transition-colors ${
                isActive(item.path)
                  ? 'bg-purple-600/20 text-purple-400 border-l-2 border-purple-500'
                  : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-gray-800 space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center">
              <User size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold">学员</p>
              <p className="text-gray-500 text-xs">紫夜学员中心</p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('token')
              localStorage.removeItem('user')
              sessionStorage.removeItem('token')
              sessionStorage.removeItem('user')
              navigate('/login')
            }}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            <LogOut size={16} />
            <span className="text-sm">退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-white mb-6">欢迎来到紫夜学员中心</h1>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700">
            <p className="text-gray-400 text-center">
              请从左侧菜单查看课程进度和相关信息
            </p>
          </div>
        </div>
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
