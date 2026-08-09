import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getAdminSecurityHeaders } from '../utils/deviceIdentity'

const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api'

interface Badges {
  leavePending: number
  leaveEndPending: number
  assessmentPending: number
  reminderCount: number
  opinionPending: number
  assistantPending: number
}

interface BadgeContextValue extends Badges {
  /** 强制绕过服务端短缓存，审批等写操作后应调用 */
  refreshBadges: () => Promise<void>
}

const defaultBadges: Badges = {
  leavePending: 0,
  leaveEndPending: 0,
  assessmentPending: 0,
  reminderCount: 0,
  opinionPending: 0,
  assistantPending: 0,
}

const BadgeContext = createContext<BadgeContextValue>({ ...defaultBadges, refreshBadges: async () => {} })

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [badges, setBadges] = useState<Badges>(() => {
    try {
      const raw = sessionStorage.getItem('adminBadgesCache')
      if (!raw) return defaultBadges
      return { ...defaultBadges, ...JSON.parse(raw) }
    } catch {
      return defaultBadges
    }
  })
  const seqRef = useRef(0)

  const fetchBadges = useCallback(async (opts?: { fresh?: boolean }) => {
    const seq = ++seqRef.current
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      if (!token) return
      const sec = await getAdminSecurityHeaders().catch(() => ({} as Record<string, string>))
      const qs = opts?.fresh ? '?fresh=1' : ''
      const res = await fetch(`${API}/badges${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts?.fresh ? { 'X-Badge-Fresh': '1' } : {}),
          ...sec,
        },
        cache: 'no-store',
      })
      const data = await res.json()
      if (seq !== seqRef.current) return
      if (data.success) {
        const next = {
          ...defaultBadges,
          ...data.data,
        }
        setBadges(next)
        try {
          sessionStorage.setItem('adminBadgesCache', JSON.stringify(next))
        } catch {
          /* ignore quota */
        }
      }
    } catch {
      // silently ignore network errors
    }
  }, [])

  const refreshBadges = useCallback(() => fetchBadges({ fresh: true }), [fetchBadges])

  useEffect(() => {
    // 首屏强制新鲜，避免 sessionStorage / 服务端短缓存导致刷新仍显示旧数字
    void fetchBadges({ fresh: true })
    const id = setInterval(() => { void fetchBadges() }, 60_000)
    const onFocus = () => { void fetchBadges({ fresh: true }) }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchBadges({ fresh: true })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchBadges])

  const value = useMemo(
    () => ({ ...badges, refreshBadges }),
    [badges, refreshBadges]
  )

  return <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
}

export const useBadges = () => useContext(BadgeContext)
