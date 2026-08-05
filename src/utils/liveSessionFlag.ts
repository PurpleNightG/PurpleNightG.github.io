/** 学员是否已进入屏幕共享/会议会话（非大厅选房页） */
const KEY = 'ziyeLiveSessionBusy'
const EVENT = 'ziye-live-session'

export function setLiveSessionBusy(busy: boolean) {
  try {
    if (busy) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {}
  try {
    window.dispatchEvent(new Event(EVENT))
  } catch {}
}

export function isLiveSessionBusy(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function onLiveSessionBusyChange(cb: () => void) {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
