import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Home, LogIn, Smartphone, Download, Monitor, User, Shield } from 'lucide-react'
import { useState, useEffect } from 'react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)
  const [loggedInUser, setLoggedInUser] = useState<{ name: string; type: 'admin' | 'student' } | null>(null)

  const detectLogin = () => {
    try {
      const adminStr = localStorage.getItem('user') || sessionStorage.getItem('user')
      const studentStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (adminStr) {
        const u = JSON.parse(adminStr)
        setLoggedInUser({ name: u.username || '管理员', type: 'admin' })
      } else if (studentStr) {
        const u = JSON.parse(studentStr)
        setLoggedInUser({ name: u.nickname || u.username || '学员', type: 'student' })
      } else {
        setLoggedInUser(null)
      }
    } catch {
      setLoggedInUser(null)
    }
  }

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    detectLogin()
    window.addEventListener('storage', detectLogin)
    return () => window.removeEventListener('storage', detectLogin)
  }, [])

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const isDocsPage = location.pathname.startsWith('/docs')
  const isFullWidthPage = isDocsPage || location.pathname.startsWith('/screen-share') || location.pathname.startsWith('/downloads')

  // Mobile warning screen
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border-2 border-purple-600/50 shadow-2xl shadow-purple-500/20 animate-scale-in">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center animate-pulse-slow">
              <Smartphone size={40} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white animate-slide-in-down animate-delay-200">
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
              <p className="text-gray-500 text-sm mt-3">紫夜战术公会</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900 flex flex-col">
      {/* Navigation */}
      <nav className="bg-gray-900/50 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-50 animate-slide-in-down">
        <div className="px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3">
              <img
                src="https://s21.ax1x.com/2024/12/08/pA72i5R.png"
                alt="紫夜公会"
                className="h-10 w-10 rounded-lg"
              />
              <div>
                <h1 className="text-xl font-bold text-white">紫夜公会</h1>
                <p className="text-xs text-gray-400">Ready Or Not</p>
              </div>
            </Link>

            {/* Navigation Links */}
            <div className="flex space-x-1">
              <Link
                to="/"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive('/')
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Home size={18} />
                <span>首页</span>
              </Link>
              <Link
                to="/docs"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive('/docs')
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <BookOpen size={18} />
                <span>紫夜文档</span>
              </Link>
              <Link
                to="/downloads"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive('/downloads')
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Download size={18} />
                <span>下载</span>
              </Link>
              <Link
                to="/screen-share"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive('/screen-share')
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Monitor size={18} />
                <span>屏幕共享</span>
              </Link>
              {loggedInUser ? (
                <Link
                  to={loggedInUser.type === 'admin' ? '/admin' : '/student'}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center">
                    {loggedInUser.type === 'admin'
                      ? <Shield size={14} className="text-white" />
                      : <User size={14} className="text-white" />}
                  </div>
                  <span className="text-white text-sm font-medium">{loggedInUser.name}</span>
                  <span className="text-gray-400 text-xs">{loggedInUser.type === 'admin' ? '管理员' : '学员'}</span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive('/login')
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <LogIn size={18} />
                  <span>登录</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      {isFullWidthPage ? (
        <>
          <main className="flex-1">
            {children}
          </main>
          {/* Footer */}
          <footer className="bg-gradient-to-b from-gray-900/50 to-gray-900 backdrop-blur-sm border-t border-purple-900/30 mt-12">
            <div className="px-6 py-8">
              <div className="max-w-4xl mx-auto">
                <div className="flex flex-col items-center space-y-4">
                  <div className="flex items-center space-x-3">
                    <img 
                      src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" 
                      alt="紫夜队标" 
                      className="w-10 h-10 rounded-lg object-contain"
                    />
                    <span className="text-white font-semibold text-lg">紫夜战术公会</span>
                  </div>
                  <p className="text-gray-400 text-sm text-center">
                    专注 Ready Or Not 的 CQB 战术研究与教学
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>© 2026 紫夜公会</span>
                    <span>•</span>
                    <span>保留所有权利</span>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </>
      ) : (
        <>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="bg-gray-900/50 backdrop-blur-sm border-t border-gray-800 mt-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="text-center text-gray-400 text-sm">
                <p>© 2026 紫夜公会. 专注于 Ready Or Not 游戏教学与交流</p>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
