import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, User, LogIn, AlertCircle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export default function Login() {
  const navigate = useNavigate()
  const [userType, setUserType] = useState<'admin' | 'student'>('student')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          userType
        })
      })

      const data = await response.json()

      if (data.success) {
        // 根据"记住登录"选项保存到localStorage或sessionStorage
        const storage = rememberMe ? localStorage : sessionStorage
        storage.setItem('token', data.data.token)
        storage.setItem('user', JSON.stringify(data.data.user))
        
        // 跳转到对应后台
        if (userType === 'admin') {
          navigate('/admin')
        } else {
          navigate('/student')
        }
      } else {
        setError(data.message || '登录失败，请检查用户名和密码')
      }
    } catch (err) {
      console.error('登录错误:', err)
      setError('无法连接到服务器，请确保后端服务已启动')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <img 
            src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" 
            alt="紫夜队标" 
            className="w-20 h-20 mx-auto rounded-xl mb-4 animate-scale-in animate-delay-100"
          />
          <h1 className="text-3xl font-bold text-white mb-2 animate-slide-in-down animate-delay-200">紫夜战术公会</h1>
          <p className="text-gray-400 animate-slide-in-down animate-delay-300">管理系统登录</p>
        </div>

        {/* Login Form */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 shadow-2xl animate-slide-in-up animate-delay-200 hover-glow">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* User Type Selection */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                type="button"
                onClick={() => setUserType('student')}
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
                onClick={() => setUserType('admin')}
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

            {/* Username Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                placeholder="请输入用户名"
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

          {/* Demo Info */}
          <div className="mt-6 p-4 bg-blue-900/20 rounded-lg border border-blue-700/30">
            <p className="text-sm text-blue-300 text-center">
              <span className="font-semibold">测试账号：</span>
            </p>
            <div className="mt-2 space-y-1 text-xs text-blue-200">
              <p>管理员 - 用户名: admin / 密码: admin123</p>
              <p>学员 - 用户名: student / 密码: student123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
