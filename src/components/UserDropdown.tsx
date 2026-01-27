import { useState, useEffect, useRef } from 'react'
import { User, LogOut, KeyRound, Edit, Shield, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'

// API基础URL配置
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api'

interface UserDropdownProps {
  userType: 'student' | 'admin'
}

export default function UserDropdown({ userType }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showUsernameModal, setShowUsernameModal] = useState(false)
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [newUsername, setNewUsername] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadUserInfo()
  }, [userType])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadUserInfo = () => {
    if (userType === 'student') {
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (userStr) {
        const user = JSON.parse(userStr)
        setUsername(user.username || '')
        setNickname(user.nickname || user.username || '学员')
      }
    } else {
      const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        setUsername(user.username || '')
        setNickname(user.username || '管理员')
      }
    }
  }

  const handleLogout = () => {
    if (userType === 'student') {
      localStorage.removeItem('studentToken')
      localStorage.removeItem('studentUser')
      sessionStorage.removeItem('studentToken')
      sessionStorage.removeItem('studentUser')
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
    }
    navigate('/login')
  }

  const handlePasswordChange = async () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('请填写所有字段')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('新密码长度至少为6位')
      return
    }

    // 显示加载提示
    const loadingToast = toast.loading('正在修改密码...')

    try {
      const endpoint = userType === 'student' ? '/student/change-password' : '/auth/change-password'
      const token = userType === 'student'
        ? localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')
        : localStorage.getItem('token') || sessionStorage.getItem('token')

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username,
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword
        })
      })

      // 关闭加载提示
      toast.dismiss(loadingToast)

      // 处理HTTP错误状态码
      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: '服务器错误' }))
        toast.error(data.message || `请求失败 (${response.status})`)
        return
      }

      const data = await response.json()

      if (data.success) {
        toast.success('✅ 密码修改成功，请重新登录')
        setShowPasswordModal(false)
        setTimeout(() => handleLogout(), 1500)
      } else {
        toast.error(data.message || '密码修改失败，请重试')
      }
    } catch (error: any) {
      // 关闭加载提示
      toast.dismiss(loadingToast)
      console.error('密码修改错误:', error)
      toast.error('❌ 密码修改失败：' + (error.message || '网络错误，请检查连接'))
    }
  }

  const handleUsernameChange = async () => {
    if (!newUsername.trim()) {
      toast.error('请输入新用户名')
      return
    }

    if (newUsername.length < 3) {
      toast.error('用户名长度至少为3位')
      return
    }

    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')

      const response = await fetch('/api/auth/change-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          oldUsername: username,
          newUsername: newUsername
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('用户名修改成功，请重新登录')
        setTimeout(() => handleLogout(), 1500)
      } else {
        toast.error(data.message || '用户名修改失败')
      }
    } catch (error: any) {
      toast.error('用户名修改失败：' + error.message)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 用户信息按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-800/50 transition-colors"
      >
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
          userType === 'student' ? 'from-purple-600 to-purple-800' : 'from-blue-600 to-blue-800'
        } flex items-center justify-center`}>
          {userType === 'student' ? (
            <User size={20} className="text-white" />
          ) : (
            <Shield size={20} className="text-white" />
          )}
        </div>
        <div className="text-left">
          <p className="text-white text-sm font-semibold">{nickname}</p>
          <p className="text-gray-400 text-xs">{userType === 'student' ? '学员' : '管理员'}</p>
        </div>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden z-50">
          {userType === 'admin' && (
            <button
              onClick={() => {
                setShowUsernameModal(true)
                setIsOpen(false)
                setNewUsername('')
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left"
            >
              <Edit size={18} className="text-blue-400" />
              <span className="text-white">修改用户名</span>
            </button>
          )}
          
          <button
            onClick={() => {
              setShowPasswordModal(true)
              setIsOpen(false)
              setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
            }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left"
          >
            <KeyRound size={18} className="text-green-400" />
            <span className="text-white">修改密码</span>
          </button>
          
          <div className="border-t border-gray-700"></div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-900/30 transition-colors text-left"
          >
            <LogOut size={18} className="text-red-400" />
            <span className="text-red-400">退出登录</span>
          </button>
        </div>
      )}

      {/* 修改用户名弹窗 */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700 shadow-2xl">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">修改用户名</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">当前用户名</label>
                  <input
                    type="text"
                    value={username}
                    disabled
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">新用户名</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="请输入新用户名"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowUsernameModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleUsernameChange}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  确认修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700 shadow-2xl">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">修改密码</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">旧密码</label>
                  <input
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                    placeholder="请输入旧密码"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">新密码</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="请输入新密码（至少6位）"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">确认新密码</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="请再次输入新密码"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handlePasswordChange}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  确认修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
