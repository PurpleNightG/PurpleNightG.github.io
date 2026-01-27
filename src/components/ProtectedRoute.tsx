import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredUserType?: 'admin' | 'student'
}

export default function ProtectedRoute({ children, requiredUserType }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [userType, setUserType] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    // 根据requiredUserType选择检查管理员或学员的token
    let token: string | null = null
    let userStr: string | null = null
    let endpoint: string = '/auth/verify'
    let detectedUserType: string | null = null

    if (requiredUserType === 'student') {
      // 学员路由：检查studentToken
      token = localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')
      userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      endpoint = '/student/verify'
      detectedUserType = 'student'
    } else if (requiredUserType === 'admin') {
      // 管理员路由：检查token
      token = localStorage.getItem('token') || sessionStorage.getItem('token')
      userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
      endpoint = '/auth/verify'
      detectedUserType = 'admin'
    } else {
      // 未指定类型，尝试两种token
      const adminToken = localStorage.getItem('token') || sessionStorage.getItem('token')
      const studentToken = localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')
      
      if (adminToken) {
        token = adminToken
        userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
        endpoint = '/auth/verify'
        detectedUserType = 'admin'
      } else if (studentToken) {
        token = studentToken
        userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
        endpoint = '/student/verify'
        detectedUserType = 'student'
      }
    }

    if (!token || !userStr) {
      setIsAuthenticated(false)
      return
    }

    try {
      // 验证token是否有效
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        setIsAuthenticated(true)
        setUserType(detectedUserType)
      } else {
        // token无效，清除存储
        if (detectedUserType === 'student') {
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
        setIsAuthenticated(false)
      }
    } catch (error) {
      console.error('认证检查失败:', error)
      setIsAuthenticated(false)
    }
  }

  // 加载中
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">验证登录状态...</p>
        </div>
      </div>
    )
  }

  // 未登录，跳转到登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 已登录，但用户类型不匹配
  if (requiredUserType && userType !== requiredUserType) {
    // 重定向到正确的后台
    const correctPath = userType === 'admin' ? '/admin' : '/student'
    return <Navigate to={correctPath} replace />
  }

  // 验证通过，显示内容
  return <>{children}</>
}
