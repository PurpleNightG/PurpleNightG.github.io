import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
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

  const fetchBadges = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      if (!token) return
      const sec = await getAdminSecurityHeaders().catch(() => ({} as Record<string, string>))
      const res = await fetch(`${API}/badges`, {
        headers: { Authorization: `Bearer ${token}`, ...sec },
        cache: 'no-store',
      })
      const data = await res.json()
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

  useEffect(() => {
    fetchBadges()
    const id = setInterval(fetchBadges, 60_000)
    const onFocus = () => { void fetchBadges() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchBadges()
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
    () => ({ ...badges, refreshBadges: fetchBadges }),
    [badges, fetchBadges]
  )

  return <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
}

export const useBadges = () => useContext(BadgeContext)
