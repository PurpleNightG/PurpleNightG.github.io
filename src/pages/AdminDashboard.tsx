import { useState } from 'react'
import { 
  Home, 
  Users, 
  BookOpen, 
  FileCheck, 
  UserMinus,
  ChevronDown
} from 'lucide-react'
import { Link, useLocation, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import AdminHome from './admin/AdminHome'
import MemberList from './admin/MemberList'
import LeaveRecords from './admin/LeaveRecords'
import BlackPointRecords from './admin/BlackPointRecords'
import ReminderList from './admin/ReminderList'
import QuitApproval from './admin/QuitApproval'
import RetentionManagement from './admin/RetentionManagement'
import CourseManagement from './admin/CourseManagement'
import ProgressAssignment from './admin/ProgressAssignment'
import AssessmentRecords from './admin/AssessmentRecords'
import AssessmentApproval from './admin/AssessmentApproval'
import AssessmentGuidelines from './admin/AssessmentGuidelines'
import PublicVideosManagement from './admin/PublicVideosManagement'
import VideoUpload from './admin/VideoUpload'

interface MenuItem {
  name: string
  path: string
  icon: React.ReactNode
  subItems?: { name: string; path: string }[]
}

function AdminDashboardContent() {
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
        { name: '视频公开管理', path: '/admin/assessments/videos' },
        { name: '视频上传管理', path: '/admin/assessments/upload' }
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
              <span className="text-white font-bold text-lg tracking-tight">紫夜管理</span>
              <span className="text-gray-500 text-xs">Admin System</span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menuItems.map((item) => (
            <div key={item.name} className="mb-1">
              {item.subItems ? (
                <div>
                  <button
                    onClick={() => toggleMenu(item.name)}
                    className="w-full group"
                  >
                    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                      expandedMenus.includes(item.name)
                        ? 'bg-gray-700/40 text-white'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/20'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`transition-colors ${
                          expandedMenus.includes(item.name)
                            ? 'text-purple-400'
                            : 'text-gray-500 group-hover:text-gray-400'
                        }`}>
                          {item.icon}
                        </div>
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <ChevronDown 
                        size={14} 
                        className={`transition-transform duration-200 ${
                          expandedMenus.includes(item.name) ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>
                  {expandedMenus.includes(item.name) && (
                    <div className="mt-1 space-y-0.5 ml-2">
                      {item.subItems.map((subItem) => (
                        <Link
                          key={subItem.path}
                          to={subItem.path}
                          className="group block"
                        >
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                            isActive(subItem.path)
                              ? 'bg-purple-600/20 text-purple-300'
                              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/20'
                          }`}>
                            <div className={`w-1 h-1 rounded-full transition-colors ${
                              isActive(subItem.path)
                                ? 'bg-purple-400'
                                : 'bg-gray-600 group-hover:bg-gray-500'
                            }`}></div>
                            <span className="text-sm">{subItem.name}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
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
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700/30">
          <div className="text-center">
            <p className="text-xs text-gray-500">
              紫夜战术公会 · 管理系统
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          {/* 首页 */}
          <Route path="/" element={<AdminHome />} />
          
          {/* 成员管理 */}
          <Route path="/members/list" element={<MemberList />} />
          <Route path="/members/leave" element={<LeaveRecords />} />
          <Route path="/members/violations" element={<BlackPointRecords />} />
          
          {/* 课程管理 */}
          <Route path="/courses/list" element={<CourseManagement />} />
          <Route path="/courses/progress" element={<ProgressAssignment />} />
          
          {/* 考核管理 */}
          <Route path="/assessments/records" element={<AssessmentRecords />} />
          <Route path="/assessments/approval" element={<AssessmentApproval />} />
          <Route path="/assessments/guidelines" element={<AssessmentGuidelines />} />
          <Route path="/assessments/videos" element={<PublicVideosManagement />} />
          <Route path="/assessments/upload" element={<VideoUpload />} />
          
          {/* 退队管理 */}
          <Route path="/leave-team/reminders" element={<ReminderList />} />
          <Route path="/leave-team/approval" element={<QuitApproval />} />
          <Route path="/leave-team/retention" element={<RetentionManagement />} />
        </Routes>
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
