import { useEffect } from 'react'

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api'

/** 约 4 分钟一次，远低于 15 分钟空闲阈值 */
const HEARTBEAT_MS = 4 * 60 * 1000

function getEphemeralToken(): string | null {
  // 勾选「记住登录」会写入 localStorage；未勾选只用 sessionStorage
  if (localStorage.getItem('token') || localStorage.getItem('studentToken')) {
    return null
  }
  return (
    sessionStorage.getItem('token') ||
    sessionStorage.getItem('studentToken') ||
    null
  )
}

async function pingHeartbeat(token: string) {
  try {
    await fetch(`${API_URL}/account-security/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  } catch {
    /* 网络抖动忽略；下次再试 */
  }
}

/**
 * 未记住登录时：标签页还开着就定期刷新会话活跃时间，避免挂机被判已登出。
 * 标签页隐藏时暂停；切回前台立即补一次。
 */
export function useSessionHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const tick = () => {
      const token = getEphemeralToken()
      if (!token) {
        stop()
        return
      }
      if (document.visibilityState === 'hidden') return
      void pingHeartbeat(token)
    }

    const start = () => {
      stop()
      if (!getEphemeralToken()) return
      tick()
      timer = setInterval(tick, HEARTBEAT_MS)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        start()
      } else {
        stop()
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    // 登录/登出可能只改 sessionStorage，同页监听 storage 不一定触发；周期性检查 token 是否仍存在
    const watch = setInterval(() => {
      if (!getEphemeralToken()) stop()
      else if (!timer && document.visibilityState === 'visible') start()
    }, 30_000)

    return () => {
      stop()
      clearInterval(watch)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
