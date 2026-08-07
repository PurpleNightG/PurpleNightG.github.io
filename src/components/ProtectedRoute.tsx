import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getAdminSecurityHeaders } from '../utils/deviceIdentity'
import PageSkeleton from './Skeleton'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredUserType?: 'admin' | 'student'
}

function clearAuthStorage(userType: string | null) {
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
}

export default function ProtectedRoute({ children, requiredUserType }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [userType, setUserType] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      let token: string | null = null
      let userStr: string | null = null
      let endpoint = '/auth/verify'
      let detectedUserType: string | null = null

      if (requiredUserType === 'student') {
        token = localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')
        userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
        endpoint = '/student/verify'
        detectedUserType = 'student'
      } else if (requiredUserType === 'admin') {
        token = localStorage.getItem('token') || sessionStorage.getItem('token')
        userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
        endpoint = '/auth/verify'
        detectedUserType = 'admin'
      } else {
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
        if (!cancelled) setIsAuthenticated(false)
        return
      }

      try {
        const extraHeaders: Record<string, string> = {}
        if (detectedUserType === 'admin') {
          try {
            Object.assign(extraHeaders, await getAdminSecurityHeaders())
          } catch {
            /* ignore */
          }
        }
        const response = await fetch(`${API_URL}${endpoint}`, {
          headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
        })
        const data = await response.json()

        if (cancelled) return

        if (data.success) {
          setIsAuthenticated(true)
          setUserType(detectedUserType)
        } else {
          clearAuthStorage(detectedUserType)
          setIsAuthenticated(false)
        }
      } catch (error) {
        console.error('认证检查失败:', error)
        if (!cancelled) setIsAuthenticated(false)
      }
    }

    void checkAuth()
    // 周期复核：库中删掉管理员后，即使不刷新页面也会在约 30s 内踢出
    const timer = window.setInterval(() => {
      void checkAuth()
    }, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [requiredUserType, location.pathname])

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900">
        <PageSkeleton variant="cards" rows={6} className="max-w-6xl mx-auto pt-16" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredUserType && userType !== requiredUserType) {
    const correctPath = userType === 'admin' ? '/admin' : '/student'
    return <Navigate to={correctPath} replace />
  }

  return <>{children}</>
}
