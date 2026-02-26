import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Shield, User, LogIn, AlertCircle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname
  const [userType, setUserType] = useState<'admin' | 'student'>('student')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true) // 默认勾选记住登录
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 检查是否已登录
  useEffect(() => {
    // 检查管理员登录
    const adminToken = localStorage.getItem('token') || sessionStorage.getItem('token')
    const adminUser = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (adminToken && adminUser) {
      navigate('/admin')
      return
    }

    // 检查学员登录
    const studentToken = localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentToken && studentUser) {
      navigate('/student')
      return
    }
  }, [navigate])

  // 切换用户类型时清空输入
  const handleUserTypeChange = (type: 'admin' | 'student') => {
    setUserType(type)
    setUsername('')
    setPassword('')
    setError('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 根据用户类型选择不同的API端点
      const endpoint = userType === 'admin' ? '/auth/login' : '/student/login'
      
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          userType: userType // 添加userType参数
        })
      })

      const data = await response.json()

      if (data.success) {
        // 根据"记住登录"选项保存到localStorage或sessionStorage
        const storage = rememberMe ? localStorage : sessionStorage
        
        if (userType === 'admin') {
          storage.setItem('token', data.data.token)
          storage.setItem('user', JSON.stringify(data.data.user))
          navigate(from || '/admin')
        } else {
          // 学员登录
          storage.setItem('studentToken', data.data.token)
          storage.setItem('studentUser', JSON.stringify(data.data.member))
          navigate(from || '/student')
        }
      } else {
        console.warn('登录失败:', data.message)
        setError(data.message || '登录失败，请检查用户名和密码')
      }
    } catch (err: any) {
      console.error('登录错误:', err)
      // 区分网络错误和其他错误
      if (err.name === 'TypeError' || err.message.includes('Failed to fetch')) {
        setError('无法连接到服务器，请确保后端服务已启动')
      } else {
        setError(err.message || '登录失败，请重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-purple-600/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-purple-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-md w-full relative z-10">
        {/* Logo */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl blur-xl opacity-50"></div>
            <img 
              src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" 
              alt="紫夜队标" 
              className="relative w-24 h-24 mx-auto rounded-2xl mb-6 shadow-2xl animate-scale-in animate-delay-100"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 animate-slide-in-down animate-delay-200 bg-gradient-to-r from-white via-purple-200 to-white bg-clip-text text-transparent">紫夜战术公会</h1>
          <p className="text-gray-400 text-lg animate-slide-in-down animate-delay-300">PURPLE NIGHT GAME</p>
        </div>

        {/* Login Form */}
        <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 shadow-2xl animate-slide-in-up animate-delay-200 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent rounded-2xl"></div>
          <div className="relative">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* User Type Selection */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                type="button"
                onClick={() => handleUserTypeChange('student')}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  userType === 'student'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                    : 'border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                <User size={32} className="mb-2" />
                <span className="font-semibold">学员登录</span>
              </button>
              <button
                type="button"
                onClick={() => handleUserTypeChange('admin')}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  userType === 'admin'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                    : 'border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                <Shield size={32} className="mb-2" />
                <span className="font-semibold">管理员登录</span>
              </button>
            </div>

            {/* Student Login Notice */}
            {userType === 'student' && (
              <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg flex items-start space-x-3">
                <AlertCircle size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-300">
                  <p className="font-semibold mb-1">温馨提示</p>
                  <p>学员至少要参加一次新训才会有账号，如无法登录请联系管理员</p>
                </div>
              </div>
            )}

            {/* Username Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {userType === 'admin' ? '用户名' : '昵称'}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                placeholder={userType === 'admin' ? '请输入管理员用户名' : '请输入成员昵称'}
                required
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                placeholder="请输入密码"
                required
              />
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                <span className="ms-3 text-sm text-gray-300">
                  记住登录（7天内自动登录）
                </span>
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg flex items-start space-x-3">
                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-3 rounded-lg transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-600/40 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>登录中...</span>
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  <span>登录</span>
                </>
              )}
            </button>
          </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">© 2026 紫夜战术公会 · 管理系统</p>
        </div>
      </div>
    </div>
  )
}
