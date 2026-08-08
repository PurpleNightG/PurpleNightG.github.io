import FingerprintJS from '@fingerprintjs/fingerprintjs'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

let fpAgentPromise: Promise<any> | null = null
let cachedVisitorId: string | null = null
let cachedPublicIp: string | null = null
let publicIpFetchedAt = 0
let publicIpInflight: Promise<string | undefined> | null = null

async function getFpAgent() {
  if (!fpAgentPromise) {
    fpAgentPromise = FingerprintJS.load()
  }
  return fpAgentPromise
}

const FP_STORAGE_KEY = 'ziye_device_fp'

/** FingerprintJS visitorId（开源版，MIT）；并落盘，避免关浏览器后偶发算不出导致会话被误伤 */
export async function getDeviceFingerprint(): Promise<string | undefined> {
  try {
    if (cachedVisitorId) return cachedVisitorId
    try {
      const stored = localStorage.getItem(FP_STORAGE_KEY)
      if (stored) cachedVisitorId = stored
    } catch {
      /* ignore */
    }
    const agent = await getFpAgent()
    const result = await agent.get()
    const id = String(result?.visitorId || '').trim()
    if (id) {
      cachedVisitorId = id
      try {
        localStorage.setItem(FP_STORAGE_KEY, id)
      } catch {
        /* ignore */
      }
      return id
    }
  } catch (e) {
    console.warn('[deviceIdentity] fingerprint failed', e)
  }
  return cachedVisitorId || undefined
}

function pickIp(text: string): string | undefined {
  const m = String(text || '').match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
  return m?.[1]
}

/**
 * 公网出口 IP：优先走本地后端探测（与会话绑定同源，避免浏览器 DNS/墙问题）
 */
export async function getClientPublicIp(): Promise<string | undefined> {
  const now = Date.now()
  if (cachedPublicIp && now - publicIpFetchedAt < 30 * 60 * 1000) {
    return cachedPublicIp
  }
  if (publicIpInflight) return publicIpInflight

  publicIpInflight = (async () => {
    // 1) 本地/同源后端
    try {
      const ctrl = new AbortController()
      const t = window.setTimeout(() => ctrl.abort(), 4000)
      const r = await fetch(`${API_BASE_URL}/auth/egress-ip`, {
        signal: ctrl.signal,
        cache: 'no-store',
      })
      window.clearTimeout(t)
      if (r.ok) {
        const j = await r.json()
        const ip = typeof j?.data?.ip === 'string' ? pickIp(j.data.ip) : undefined
        if (ip) {
          cachedPublicIp = ip
          publicIpFetchedAt = Date.now()
          return ip
        }
      }
    } catch {
      /* fall through */
    }

    // 2) 浏览器外网回退（可选，失败可忽略）
    const externals = [
      'https://ipv4.icanhazip.com',
      'https://ifconfig.me/ip',
    ]
    for (const url of externals) {
      try {
        const ctrl = new AbortController()
        const t = window.setTimeout(() => ctrl.abort(), 2000)
        const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
        window.clearTimeout(t)
        if (!r.ok) continue
        const ip = pickIp(await r.text())
        if (ip) {
          cachedPublicIp = ip
          publicIpFetchedAt = Date.now()
          return ip
        }
      } catch {
        /* next */
      }
    }
    return cachedPublicIp || undefined
  })()

  try {
    return await publicIpInflight
  } finally {
    publicIpInflight = null
  }
}

/** 供管理端 API 请求附带的安全头 */
export async function getAdminSecurityHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  const fp = await getDeviceFingerprint()
  if (fp) headers['X-Device-Fingerprint'] = fp
  const ip = await getClientPublicIp()
  if (ip) headers['X-Client-Public-Ip'] = ip
  return headers
}
