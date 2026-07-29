import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { surveyAPI } from '../utils/api'

export interface PendingSurveyItem {
  id: number
  title: string
  my_status: string
  end_at?: string | null
}

interface SurveyPendingValue {
  pending: PendingSurveyItem[]
  count: number
  loading: boolean
  refresh: () => Promise<void>
  dismiss: () => void
  dismissed: boolean
}

const SurveyPendingContext = createContext<SurveyPendingValue>({
  pending: [],
  count: 0,
  loading: false,
  refresh: async () => {},
  dismiss: () => {},
  dismissed: false,
})

function getStudentToken() {
  return localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken') || ''
}

function isFillable(status: string) {
  return status === 'open' || status === 'claimed'
}

export function SurveyPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingSurveyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const refresh = useCallback(async () => {
    if (!getStudentToken()) {
      setPending([])
      return
    }
    try {
      setLoading(true)
      const res = await surveyAPI.available()
      const list = (res.data || []) as PendingSurveyItem[]
      setPending(list.filter((s) => isFillable(s.my_status)))
    } catch {
      // 未登录 / 网络错误时静默
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 60_000)
    const onStorage = () => refresh()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  // 有新问卷时重新展示横幅
  const pendingKey = pending.map((p) => p.id).join(',')
  useEffect(() => {
    setDismissed(false)
  }, [pendingKey])

  const value = useMemo(
    () => ({
      pending,
      count: pending.length,
      loading,
      refresh,
      dismiss: () => setDismissed(true),
      dismissed,
    }),
    [pending, loading, refresh, dismissed],
  )

  return (
    <SurveyPendingContext.Provider value={value}>{children}</SurveyPendingContext.Provider>
  )
}

export function useSurveyPending() {
  return useContext(SurveyPendingContext)
}
