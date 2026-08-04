const GUEST_SESSION_KEY = 'screenShareGuest'

export type GuestSession = {
  nickname: string
  guestId: string
  createdAt: number
}

export function loadGuestSession(): GuestSession | null {
  try {
    const raw = sessionStorage.getItem(GUEST_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.nickname || !parsed?.guestId) return null
    return parsed as GuestSession
  } catch {
    return null
  }
}

export function saveGuestSession(nickname: string): GuestSession {
  const session: GuestSession = {
    nickname: nickname.trim().slice(0, 24),
    guestId: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  }
  sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session))
  return session
}

export function clearGuestSession() {
  sessionStorage.removeItem(GUEST_SESSION_KEY)
}
