import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

interface Badges {
  leavePending: number
  leaveEndPending: number
  assessmentPending: number
  reminderCount: number
  opinionPending: number
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
}

const BadgeContext = createContext<BadgeContextValue>({ ...defaultBadges, refreshBadges: async () => {} })

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [badges, setBadges] = useState<Badges>(defaultBadges)

  const fetchBadges = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/badges`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success) {
        setBadges({
          ...defaultBadges,
          ...data.data,
        })
      }
    } catch {
      // silently ignore network errors
    }
  }, [])

  useEffect(() => {
    fetchBadges()
    const id = setInterval(fetchBadges, 15_000)
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
