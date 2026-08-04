import { useState, useEffect, useRef } from 'react'
import { User, LogOut, KeyRound, Edit, Shield, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../utils/toast'

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

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success('密码修改成功')
        setShowPasswordModal(false)
        setTimeout(() => handleLogout(), 1500)
      } else {
        toast.error(data.message || '密码修改失败')
      }
    } catch (error: any) {
      console.error('密码修改错误:', error)
      toast.error(error.message || '密码修改失败')
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
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`student-glass-chip student-glass-chip--ghost flex items-center gap-3 px-4 py-2${isOpen ? ' is-open' : ''}`}
      >
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
          userType === 'student' ? 'from-purple-600 to-purple-800' : 'from-blue-600 to-blue-800'
        } flex items-center justify-center shrink-0`}>
          {userType === 'student' ? (
            <User size={20} className="text-white" />
          ) : (
            <Shield size={20} className="text-white" />
          )}
        </div>
        <div className="text-left min-w-0">
          <p className="text-white text-sm font-semibold truncate">{nickname}</p>
          <p className="text-gray-400 text-xs">{userType === 'student' ? '学员' : '管理员'}</p>
        </div>
        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 z-50">
          <div className="student-glass-panel student-glass-panel--static overflow-hidden">
            {userType === 'admin' && (
              <button
                onClick={() => {
                  setShowUsernameModal(true)
                  setIsOpen(false)
                  setNewUsername('')
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
              >
                <Edit size={18} className="text-blue-400 shrink-0" />
                <span className="text-white">修改用户名</span>
              </button>
            )}

            <button
              onClick={() => {
                setShowPasswordModal(true)
                setIsOpen(false)
                setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <KeyRound size={18} className="text-green-400 shrink-0" />
              <span className="text-white">修改密码</span>
            </button>

            <div className="border-t border-white/10" />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-left"
            >
              <LogOut size={18} className="text-red-400 shrink-0" />
              <span className="text-red-400">退出登录</span>
            </button>
          </div>
        </div>
      )}

      {showUsernameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-md">
            <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">修改用户名</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">当前用户名</label>
                  <input
                    type="text"
                    value={username}
                    disabled
                    className="student-glass-field opacity-70"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">新用户名</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="请输入新用户名"
                    className="student-glass-field"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowUsernameModal(false)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleUsernameChange}
                  className="flex-1 px-4 py-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  确认修改
                </button>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-md">
            <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full">
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
                    className="student-glass-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">新密码</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="请输入新密码（至少6位）"
                    className="student-glass-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">确认新密码</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="请再次输入新密码"
                    className="student-glass-field"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handlePasswordChange}
                  className="flex-1 px-4 py-2 bg-green-600/80 hover:bg-green-600 text-white rounded-lg transition-colors"
                >
                  确认修改
                </button>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
