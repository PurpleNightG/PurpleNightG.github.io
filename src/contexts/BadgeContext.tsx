import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

interface Badges {
  leavePending: number
  leaveEndPending: number
  assessmentPending: number
  reminderCount: number
}

const defaultBadges: Badges = { leavePending: 0, leaveEndPending: 0, assessmentPending: 0, reminderCount: 0 }

const BadgeContext = createContext<Badges>(defaultBadges)

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [badges, setBadges] = useState<Badges>(defaultBadges)

  const fetchBadges = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/badges`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const data = await res.json()
      if (data.success) setBadges(data.data)
    } catch {
      // silently ignore network errors
    }
  }, [])

  useEffect(() => {
    fetchBadges()
    const id = setInterval(fetchBadges, 60_000)
    return () => clearInterval(id)
  }, [fetchBadges])

  return <BadgeContext.Provider value={badges}>{children}</BadgeContext.Provider>
}

export const useBadges = () => useContext(BadgeContext)
