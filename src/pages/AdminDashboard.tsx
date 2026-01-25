import { useState } from 'react'
import { 
  Home, 
  Users, 
  BookOpen, 
  FileCheck, 
  UserMinus,
  ChevronDown,
  ChevronRight,
  Shield,
  LogOut
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'

interface MenuItem {
  name: string
  path: string
  icon: React.ReactNode
  subItems?: { name: string; path: string }[]
}

function AdminDashboardContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['成员管理'])

  const menuItems: MenuItem[] = [
    { name: '首页', path: '/admin', icon: <Home size={20} /> },
    { 
      name: '成员管理', 
      path: '/admin/members',
      icon: <Users size={20} />,
      subItems: [
        { name: '成员列表', path: '/admin/members/list' },
        { name: '请假记录', path: '/admin/members/leave' },
        { name: '黑点记录', path: '/admin/members/violations' }
      ]
    },
    { 
      name: '课程管理', 
      path: '/admin/courses',
      icon: <BookOpen size={20} />,
      subItems: [
        { name: '课程列表', path: '/admin/courses/list' },
        { name: '进度分配', path: '/admin/courses/progress' }
      ]
    },
    { 
      name: '考核管理', 
      path: '/admin/assessments',
      icon: <FileCheck size={20} />,
      subItems: [
        { name: '考核记录', path: '/admin/assessments/records' },
        { name: '考核审批', path: '/admin/assessments/approval' },
        { name: '考核须知管理', path: '/admin/assessments/guidelines' },
        { name: '视频公开管理', path: '/admin/assessments/videos' }
      ]
    },
    { 
      name: '退队管理', 
      path: '/admin/leave-team',
      icon: <UserMinus size={20} />,
      subItems: [
        { name: '催促名单', path: '/admin/leave-team/reminders' },
        { name: '退队审批', path: '/admin/leave-team/approval' },
        { name: '留队管理', path: '/admin/leave-team/retention' }
      ]
    }
  ]

  const toggleMenu = (menuName: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuName) 
        ? prev.filter(m => m !== menuName)
        : [...prev, menuName]
    )
  }

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
          <span className="ml-3 text-white font-bold text-lg">管理后台</span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <div key={item.name}>
              {item.subItems ? (
                <div>
                  <button
                    onClick={() => toggleMenu(item.name)}
                    className="w-full flex items-center justify-between px-6 py-3 text-gray-300 hover:bg-gray-800/50 hover:text-white transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {item.icon}
                      <span>{item.name}</span>
                    </div>
                    {expandedMenus.includes(item.name) ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                  {expandedMenus.includes(item.name) && (
                    <div className="bg-gray-800/30">
                      {item.subItems.map((subItem) => (
                        <Link
                          key={subItem.path}
                          to={subItem.path}
                          className={`block pl-14 pr-6 py-2.5 text-sm transition-colors ${
                            isActive(subItem.path)
                              ? 'bg-purple-600/20 text-purple-400 border-l-2 border-purple-500'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                          }`}
                        >
                          {subItem.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
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
              )}
            </div>
          ))}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-gray-800 space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold">管理员</p>
              <p className="text-gray-500 text-xs">紫夜管理后台</p>
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
          <h1 className="text-3xl font-bold text-white mb-6">欢迎使用紫夜管理后台</h1>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700">
            <p className="text-gray-400 text-center">
              请从左侧菜单选择功能模块进行管理
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

// 导出带路由守卫的组件
export default function AdminDashboard() {
  return (
    <ProtectedRoute requiredUserType="admin">
      <AdminDashboardContent />
    </ProtectedRoute>
  )
}
