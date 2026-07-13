import React, { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { MediaConnection } from 'peerjs'
import { Monitor, Users, Copy, Check, StopCircle, Play, Link2, X, Maximize2, Minimize2, Wifi, Zap, Globe, Lock, Clock, CheckCircle, XCircle, ChevronDown, Search, Trash2, GraduationCap, Server } from 'lucide-react'
import ScreenShareAssistantPanel, { type AssistantRow, type AssistantCandidate } from '../components/ScreenShareAssistantPanel'

type Mode = 'select' | 'host' | 'viewer'
type Status = 'idle' | 'connecting' | 'streaming' | 'watching' | 'error'

const PEER_PREFIX = 'ziye-share-'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const AGORA_APP_ID: string = import.meta.env.VITE_AGORA_APP_ID || 'a51f2304cab54d86a883ab04b41840a6'
const VOLC_APP_ID: string = import.meta.env.VITE_VOLC_APP_ID || '69a1d9e90340ba017226d5c0'

// 紫夜自建服务器配置 - 在 .env 中设置 VITE_ZIYE_SERVER_URL
const ZIYE_SERVER = import.meta.env.VITE_ZIYE_SERVER_URL || ''
const ZIYE_TURN_PORT = import.meta.env.VITE_ZIYE_TURN_PORT || '10115'
const ZIYE_TURN_HOST = import.meta.env.VITE_ZIYE_TURN_HOST || '160.202.254.36'
// 设为 '0' / 'false' 时不走 TURN，仅 STUN + 直连 ZLM(10195)
const ZIYE_USE_TURN = !['0', 'false', 'off', 'no'].includes(
  String(import.meta.env.VITE_ZIYE_USE_TURN ?? 'true').toLowerCase()
)
const ZIYE_WHIP_URL = ZIYE_SERVER ? `${ZIYE_SERVER}/index/api/whip?app=live&stream=screen-` : ''
const ZIYE_WHEP_URL = ZIYE_SERVER ? `${ZIYE_SERVER}/index/api/whep?app=live&stream=screen-` : ''
const ZIYE_ICE_SERVERS: RTCIceServer[] = ZIYE_SERVER ? [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.qq.com:3478' },
  ...(ZIYE_USE_TURN
    ? [{ urls: `turn:${ZIYE_TURN_HOST}:${ZIYE_TURN_PORT}`, username: 'screen123', credential: 'share666' } as RTCIceServer]
    : []),
] : []

async function parseZlmSdpAnswer(res: Response): Promise<string> {
  const text = await res.text()
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json') || text.trimStart().startsWith('{')) {
    const data = JSON.parse(text)
    if (data.code !== 0 && data.code !== undefined) throw new Error(data.msg || `服务器错误 code=${data.code}`)
    if (!data.sdp) throw new Error('服务器未返回 SDP')
    return data.sdp
  }
  return text
}

/** ICE 收集带超时，避免 TURN 不可达时无限卡住 */
function waitIceGathering(pc: RTCPeerConnection, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve()
      return
    }
    const timer = window.setTimeout(resolve, timeoutMs)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer)
        resolve()
      }
    }, { once: true })
  })
}

type ZiyeQuality = 240 | 480 | 720 | 1080
type ZiyeFps = 30 | 60

const ZIYE_QUALITY_OPTIONS: {
  id: ZiyeQuality
  label: string
  height: number
  scale: number
  maxBitrate: number
  minBitrate: number
  startKbps: number
}[] = [
  { id: 240, label: '240p', height: 240, scale: 4.5, maxBitrate: 800_000, minBitrate: 200_000, startKbps: 500 },
  { id: 480, label: '480p', height: 480, scale: 2.25, maxBitrate: 2_000_000, minBitrate: 500_000, startKbps: 1200 },
  { id: 720, label: '720p', height: 720, scale: 1.5, maxBitrate: 4_500_000, minBitrate: 1_200_000, startKbps: 2500 },
  { id: 1080, label: '1080p', height: 1080, scale: 1, maxBitrate: 10_000_000, minBitrate: 2_500_000, startKbps: 5000 },
]

const ZIYE_FPS_OPTIONS: { id: ZiyeFps; label: string }[] = [
  { id: 30, label: '30fps' },
  { id: 60, label: '60fps' },
]

const ZIYE_CONNECTION_LABEL = '鲶大禹服务器'

function getZiyeQualityPreset(q: ZiyeQuality) {
  return ZIYE_QUALITY_OPTIONS.find(o => o.id === q) || ZIYE_QUALITY_OPTIONS[3]
}

function applyZiyeVideoEncoding(pc: RTCPeerConnection, quality: ZiyeQuality = 1080, fps: ZiyeFps = 60) {
  const preset = getZiyeQualityPreset(quality)
  // 30fps 时码率适当降低
  const brScale = fps === 30 ? 0.7 : 1
  pc.getSenders().forEach(sender => {
    if (sender.track?.kind !== 'video') return
    try {
      if ('contentHint' in sender.track) {
        (sender.track as MediaStreamTrack & { contentHint?: string }).contentHint = 'detail'
      }
    } catch {}
    const params = sender.getParameters()
    if (!params.encodings?.length) params.encodings = [{}]
    params.encodings[0].maxBitrate = Math.round(preset.maxBitrate * brScale)
    ;(params.encodings[0] as RTCRtpEncodingParameters & { minBitrate?: number }).minBitrate = Math.round(preset.minBitrate * brScale)
    params.encodings[0].maxFramerate = fps
    params.encodings[0].scaleResolutionDownBy = preset.scale
    if ('degradationPreference' in params) {
      (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-resolution'
    }
    sender.setParameters(params).catch(console.error)
    const gen = (sender as RTCRtpSender & { generateKeyFrame?: () => Promise<void> }).generateKeyFrame
    if (typeof gen === 'function') gen.call(sender).catch(() => {})
  })
}

/** 监测推流码率塌陷 + 回报帧率/延迟 */
function startZiyeStatsMonitor(
  pc: RTCPeerConnection,
  role: 'host' | 'viewer',
  getEncode: () => { quality: ZiyeQuality; fps: ZiyeFps },
  onStats: (s: { kbps?: number; fps?: number; latencyMs?: number }) => void,
) {
  let lastBytes = 0
  let lastTs = 0
  let lowStreak = 0
  return window.setInterval(async () => {
    try {
      const stats = await pc.getStats()
      let bytes = 0
      let ts = 0
      let fps: number | undefined
      let latencyMs: number | undefined
      stats.forEach(r => {
        const any = r as any
        if (role === 'host' && r.type === 'outbound-rtp' && any.kind === 'video' && !any.remoteSource) {
          bytes = any.bytesSent || 0
          ts = r.timestamp
          if (typeof any.framesPerSecond === 'number') fps = Math.round(any.framesPerSecond)
        }
        if (role === 'viewer' && r.type === 'inbound-rtp' && any.kind === 'video') {
          bytes = any.bytesReceived || 0
          ts = r.timestamp
          if (typeof any.framesPerSecond === 'number') fps = Math.round(any.framesPerSecond)
        }
        if (r.type === 'candidate-pair' && any.state === 'succeeded' && any.nominated && typeof any.currentRoundTripTime === 'number') {
          latencyMs = Math.round(any.currentRoundTripTime * 1000)
        }
      })
      const out: { kbps?: number; fps?: number; latencyMs?: number } = {}
      if (typeof fps === 'number') out.fps = fps
      if (typeof latencyMs === 'number') out.latencyMs = latencyMs
      if (lastTs && ts > lastTs) {
        const kbps = Math.round(((bytes - lastBytes) * 8) / (ts - lastTs))
        out.kbps = kbps
        if (role === 'host' && kbps < 200) {
          lowStreak++
          if (lowStreak >= 2) {
            const e = getEncode()
            applyZiyeVideoEncoding(pc, e.quality, e.fps)
            lowStreak = 0
          }
        } else {
          lowStreak = 0
        }
      }
      lastBytes = bytes
      lastTs = ts
      onStats(out)
    } catch {}
  }, 2000)
}

/** Chrome/Chromium：注入起步码率，避免刚连上时从极低码率慢慢爬 */
function injectZiyeBitrateHints(sdp: string, startKbps = 5000): string {
  let out = sdp
  const minKbps = Math.max(300, Math.floor(startKbps * 0.4))
  const maxKbps = Math.max(startKbps, Math.floor(startKbps * 2))
  if (!/b=AS:/.test(out)) {
    out = out.replace(/(m=video .*\r?\n)/, `$1b=AS:${startKbps}\r\nb=TIAS:${startKbps * 1000}\r\n`)
  }
  out = out.replace(/a=fmtp:(\d+) ([^\r\n]*)/g, (full, pt, rest) => {
    if (/apt=/i.test(rest)) return full
    if (!/profile-level-id|packetization-mode|VP8|VP9|AV1|level-asymmetry/i.test(rest) && !/max-fs|max-fr/i.test(rest)) {
      if (/minptime|useinbandfec|stereo|maxplaybackrate/i.test(rest)) return full
    }
    let next = rest
      .replace(/;?x-google-start-bitrate=\d+/g, '')
      .replace(/;?x-google-min-bitrate=\d+/g, '')
      .replace(/;?x-google-max-bitrate=\d+/g, '')
    next += `;x-google-start-bitrate=${startKbps};x-google-min-bitrate=${minKbps};x-google-max-bitrate=${maxKbps}`
    return `a=fmtp:${pt} ${next}`
  })
  return out
}

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.qq.com:3478' },
  { urls: 'stun:stun.miwifi.com:3478' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
]

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${API_URL}/turn/credentials`, { method: 'POST' })
    const data = await res.json()
    if (data.success && data.iceServers) {
      return data.iceServers
    }
  } catch (e) {
    console.warn('TURN credentials fetch failed, using fallback STUN:', e)
  }
  return FALLBACK_ICE_SERVERS
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function getCurrentUsername(): string {
  try {
    const adminUser = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (adminUser) {
      const parsed = JSON.parse(adminUser)
      return parsed.username || parsed.name || '未知用户'
    }
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentUser) {
      const parsed = JSON.parse(studentUser)
      return parsed.username || parsed.name || parsed.game_id || '未知用户'
    }
  } catch {}
  return '未知用户'
}

function getStudentMemberId(): number | null {
  try {
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentUser) {
      const parsed = JSON.parse(studentUser)
      return parsed.id ?? null
    }
  } catch {}
  return null
}

function getUserType(): 'admin' | 'student' | null {
  if (localStorage.getItem('token') || sessionStorage.getItem('token')) return 'admin'
  if (localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken')) return 'student'
  return null
}

export default function ScreenShare() {
  const [mode, setMode] = useState<Mode>('select')
  const [status, setStatus] = useState<Status>('idle')
  const [roomCode, setRoomCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const [viewerNames, setViewerNames] = useState<string[]>([])
  const [hostName, setHostName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [connectionInfo, setConnectionInfo] = useState<string>('')
  const [connectStep, setConnectStep] = useState('')
  const [connMode, setConnMode] = useState<'auto' | 'relay' | 'stun' | 'agora' | 'volc' | 'ziye'>('auto')
  const [hostConnMode, setHostConnMode] = useState<'peerjs' | 'agora' | 'volc' | 'ziye'>('peerjs')
  const [activeStreamMode, setActiveStreamMode] = useState<'peerjs' | 'agora' | 'volc' | 'ziye'>('peerjs')
  const [latency, setLatency] = useState<number | null>(null)
  const [ziyeQuality, setZiyeQuality] = useState<ZiyeQuality>(1080)
  const [ziyeFpsChoice, setZiyeFpsChoice] = useState<ZiyeFps>(60)
  const [ziyeHostQuality, setZiyeHostQuality] = useState<ZiyeQuality>(1080)
  const [ziyeHostFps, setZiyeHostFps] = useState<ZiyeFps>(60)
  const [ziyeFps, setZiyeFps] = useState<number | null>(null)
  const [ziyeToast, setZiyeToast] = useState<{ text: string; kind: 'loading' | 'success' } | null>(null)
  const [userType] = useState<'admin' | 'student' | null>(getUserType)
  const [rtcPerm, setRtcPerm] = useState<{
    agora: boolean
    volc: boolean
    ziye: boolean
    agoraPending: boolean
    volcPending: boolean
    ziyePending: boolean
    isAssistant?: boolean
    canUseRtc?: boolean
    screenShareEnabled?: boolean
    quotaRemaining?: number | null
    screenShareUsed?: number
    screenShareQuota?: number | null
  }>({ agora: false, volc: false, ziye: false, agoraPending: false, volcPending: false, ziyePending: false })
  const [assistants, setAssistants] = useState<AssistantRow[]>([])
  const [assistantCandidates, setAssistantCandidates] = useState<AssistantCandidate[]>([])
  const memberIdRef = useRef<number | null>(getStudentMemberId())
  const [pendingRequests, setPendingRequests] = useState<{ username: string; mode: string; requestedAt: number }[]>([])
  const [shareLogs, setShareLogs] = useState<{ id: number; room_id: string; host_name: string; mode: string; peak_viewers: number; viewers: string | null; started_at: string; ended_at: string | null }[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [logSearch, setLogSearch] = useState('')
  const [logModeFilter, setLogModeFilter] = useState<'all' | 'peerjs' | 'agora' | 'volc'>('all')
  const [logPage, setLogPage] = useState(1)
  const LOG_PAGE_SIZE = 10
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState<string>('')
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null)
  const [activeRooms, setActiveRooms] = useState<{ roomId: string; hostName: string; mode: string; viewerCount: number; viewers: string[] }[]>([])
  const [closingRoomId, setClosingRoomId] = useState<string | null>(null)
  const [activeRoomsOpen, setActiveRoomsOpen] = useState(false)
  const myName = useRef(getCurrentUsername())
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const agoraClientRef = useRef<any>(null)
  const agoraTrackRef = useRef<any>(null)
  const volcEngineRef = useRef<any>(null)
  const volcContainerRef = useRef<HTMLDivElement>(null)
  const volcHostUserIdRef = useRef<string>('')
  // 紫夜自建服务器相关ref
  const ziyePeerConnRef = useRef<RTCPeerConnection | null>(null)
  const ziyeStreamRef = useRef<MediaStream | null>(null)
  const ziyeRoomIdRef = useRef<string>('')
  const ziyeTimersRef = useRef<number[]>([])
  const ziyeQualityRef = useRef<ZiyeQuality>(1080)
  const ziyeFpsChoiceRef = useRef<ZiyeFps>(60)
  const ziyeEncodeQualityRef = useRef<ZiyeQuality>(1080)
  const ziyeEncodeFpsRef = useRef<ZiyeFps>(60)
  const ziyeToastTimerRef = useRef<number | null>(null)
  const rtcRoomRef = useRef<string>('')
  const rtcRoleRef = useRef<'host' | 'viewer' | ''>('')
  const rtcUidRef = useRef<string>('')

  const peerRef = useRef<Peer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const connectionsRef = useRef<MediaConnection[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<Status>('idle')
  const connectStepRef = useRef('')

  // Keep statusRef in sync
  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    connectStepRef.current = connectStep
  }, [connectStep])

  // Bind stream to video element after React renders the <video>
  useEffect(() => {
    if ((status === 'streaming' || status === 'watching') && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      if (status === 'streaming') {
        videoRef.current.muted = true
      }
      videoRef.current.play().catch(() => {})
    }
  }, [status])

  // Cleanup on unmount + beforeunload (tab close / navigation away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery during page unload
      if (rtcRoomRef.current) {
        const rid = rtcRoomRef.current
        if (rtcRoleRef.current === 'host') {
          navigator.sendBeacon(
            `${API_URL}/room/${rid}/close`,
            new Blob([JSON.stringify({ displayName: myName.current, userType })], { type: 'application/json' })
          )
        } else if (rtcRoleRef.current === 'viewer' && rtcUidRef.current) {
          navigator.sendBeacon(
            `${API_URL}/room/${rid}/leave`,
            new Blob([JSON.stringify({ userId: rtcUidRef.current, displayName: myName.current, userType })], { type: 'application/json' })
          )
        }
      }
      // Volcengine RTC: send graceful leave signal so onUserLeave fires immediately on peers
      if (volcEngineRef.current) {
        try { volcEngineRef.current.leaveRoom() } catch {}
      }
      // Agora RTC: same
      if (agoraClientRef.current) {
        try { agoraClientRef.current.leave() } catch {}
      }
      // PeerJS cleanup
      if (peerRef.current) {
        peerRef.current.destroy()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      cleanup()
    }
  }, [])

  // Volcengine video binding - runs after DOM updates when mode switches to volc
  useEffect(() => {
    if (activeStreamMode !== 'volc') return
    const engine = volcEngineRef.current
    const container = volcContainerRef.current
    if (!engine || !container) return
    if (status === 'streaming') {
      engine.setLocalVideoPlayer(1, { renderDom: container }) // StreamIndex.STREAM_INDEX_SCREEN = 1
    } else if (status === 'watching' && volcHostUserIdRef.current) {
      engine.setRemoteVideoPlayer(1, { userId: volcHostUserIdRef.current, renderDom: container })
      engine.play(volcHostUserIdRef.current, 2, 1) // MediaType.VIDEO = 2
    }
  }, [activeStreamMode, status])

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Page Visibility API: when the tab becomes visible again after being backgrounded,
  // immediately send a heartbeat so the server doesn't expire the viewer due to
  // browser background-tab timer throttling (which can delay setInterval to 60+ seconds).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && rtcRoleRef.current === 'viewer' && rtcRoomRef.current && rtcUidRef.current) {
        fetch(`${API_URL}/room/${rtcRoomRef.current}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: rtcUidRef.current }),
        }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // RTC permission polling
  useEffect(() => {
    if (mode !== 'select') return
    const poll = async () => {
      try {
        if (userType === 'student') {
          const q = memberIdRef.current ? `?memberId=${memberIdRef.current}` : ''
          const r = await fetch(`${API_URL}/room/rtc-permission/${encodeURIComponent(myName.current)}${q}`)
          const d = await r.json()
          setRtcPerm(d)
        } else if (userType === 'admin') {
          const r = await fetch(`${API_URL}/room/rtc-requests`)
          const d = await r.json()
          setPendingRequests(d.requests || [])
          const ar = await fetch(`${API_URL}/room/assistants`)
          const ad = await ar.json()
          setAssistants(ad.assistants || [])
          setAssistantCandidates(ad.candidates || [])
          const lr = await fetch(`${API_URL}/room/share-logs`)
          const ld = await lr.json()
          setShareLogs(ld.logs || [])
          const activeRes = await fetch(`${API_URL}/room/active-rooms`)
          const activeData = await activeRes.json()
          setActiveRooms(activeData.rooms || [])
        }
      } catch {}
    }
    poll()
    const iv = setInterval(poll, 3000)
    return () => clearInterval(iv)
  }, [mode, userType])

  const cleanup = useCallback(() => {
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    // Close all connections
    connectionsRef.current.forEach(conn => conn.close())
    connectionsRef.current = []
    // Destroy peer
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setViewerCount(0)
    setViewerNames([])
    setLatency(null)
    setZiyeFps(null)
    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current)
      latencyIntervalRef.current = null
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    ziyeTimersRef.current.forEach(id => window.clearInterval(id))
    ziyeTimersRef.current = []
    if (ziyeToastTimerRef.current) {
      window.clearTimeout(ziyeToastTimerRef.current)
      ziyeToastTimerRef.current = null
    }
    setZiyeToast(null)
    if (agoraTrackRef.current) {
      const tracks = Array.isArray(agoraTrackRef.current) ? agoraTrackRef.current : [agoraTrackRef.current]
      tracks.forEach((t: any) => { try { t.close() } catch {} })
      agoraTrackRef.current = null
    }
    if (agoraClientRef.current) {
      try { agoraClientRef.current.leave() } catch {}
      agoraClientRef.current = null
    }
    if (volcEngineRef.current) {
      const _engine = volcEngineRef.current
      volcEngineRef.current = null
      try { _engine.stopScreenCapture() } catch {}
      // leaveRoom is async; destroy() after a short delay so the leave signal
      // is actually transmitted before the WebSocket is torn down, ensuring
      // peers receive onUserLeave immediately instead of waiting for the 15s timeout.
      Promise.resolve(_engine.leaveRoom()).catch(() => {}).finally(() => {
        try { _engine.destroy() } catch {}
      })
    }
    // 清理紫夜自建服务器连接
    if (ziyeStreamRef.current) {
      ziyeStreamRef.current.getTracks().forEach(track => track.stop())
      ziyeStreamRef.current = null
    }
    if (ziyePeerConnRef.current) {
      try { ziyePeerConnRef.current.close() } catch {}
      ziyePeerConnRef.current = null
    }
    ziyeRoomIdRef.current = ''
    if (rtcRoomRef.current) {
      const rid = rtcRoomRef.current
      const endpoint = rtcRoleRef.current === 'host' ? 'close' : 'leave'
      const payload = rtcRoleRef.current === 'host'
        ? { displayName: myName.current, userType }
        : { userId: rtcUidRef.current, displayName: myName.current, userType }
      // Try close/leave, fallback to force-leave
      fetch(`${API_URL}/room/${rid}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() =>
        fetch(`${API_URL}/room/force-leave`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: myName.current, userType }),
        }).catch(() => {})
      )
    }
    volcHostUserIdRef.current = ''
    rtcRoomRef.current = ''
    rtcRoleRef.current = ''
    rtcUidRef.current = ''
    setActiveStreamMode('peerjs')
  }, [])

  const fetchVolcToken = async (roomId: string, userId: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/volc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, userId }),
      })
      const data = await res.json()
      return data.success ? (data.token ?? null) : null
    } catch {
      return null
    }
  }

  const handleStartHostVolc = async () => {
    setMode('host')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('初始化火山引擎 SDK...')
    await consumePermission('volc', true)
    try {
      const code = generateRoomCode()
      setRoomCode(code)

      let volcModule
      try { volcModule = await import('@volcengine/rtc') } catch {
        window.location.reload(); return
      }
      const { default: VERTC, MediaType } = volcModule
      const engine = VERTC.createEngine(VOLC_APP_ID)
      volcEngineRef.current = engine

      setConnectStep('获取屏幕共享权限...')
      const rawName = myName.current || 'host'
      const hostUid = rawName.replace(/[^a-zA-Z0-9@\-_.]/g, '_').slice(0, 128) || 'host'
      await engine.startScreenCapture({ enableAudio: true })

      setConnectStep('连接火山引擎服务器...')
      const hostRes = await fetch(`${API_URL}/room/${code}/host`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: rawName, mode: 'volc', userType }),
      })
      if (hostRes.status === 409) {
        const d = await hostRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      rtcRoomRef.current = code
      rtcRoleRef.current = 'host'
      rtcUidRef.current = hostUid
      const volcToken = await fetchVolcToken(code, hostUid)
      await engine.joinRoom(volcToken, code, { userId: hostUid }, {
        isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false,
      })

      setConnectStep('发布屏幕流...')
      await engine.publishScreen(MediaType.AUDIO_AND_VIDEO)

      engine.on(VERTC.events.onLocalStreamStats, (stats: any) => {
        const rtt = stats?.videoStats?.rtt ?? stats?.audioStats?.rtt
        if (rtt !== undefined) setLatency(rtt)
      })

      // Track viewers via SDK events (uid -> displayName map)
      const volcViewerMap = new Map<string, string>()
      engine.on(VERTC.events.onUserJoined, ({ userInfo }: { userInfo: { userId: string; extraInfo?: string } }) => {
        const name = userInfo.extraInfo || userInfo.userId
        // Remove stale entry with same display name (quick re-join: new uid arrives before old uid's leave event)
        for (const [oldUid, oldName] of Array.from(volcViewerMap.entries())) {
          if (oldName === name && oldUid !== userInfo.userId) { volcViewerMap.delete(oldUid); break }
        }
        volcViewerMap.set(userInfo.userId, name)
        setViewerNames(Array.from(volcViewerMap.values()))
        setViewerCount(volcViewerMap.size)
      })
      engine.on(VERTC.events.onUserLeave, ({ userInfo }: { userInfo: { userId: string } }) => {
        volcViewerMap.delete(userInfo.userId)
        setViewerNames(Array.from(volcViewerMap.values()))
        setViewerCount(volcViewerMap.size)
      })

      // Poll only for admin force-close detection (no longer syncs viewer list)
      if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current)
      latencyIntervalRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_URL}/room/${code}`)
          const d = await r.json()
          if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error'); return }
        } catch {}
      }, 5000)

      setActiveStreamMode('volc')
      setConnectionInfo('火山引擎 RTC')
      setStatus('streaming')
    } catch (err: any) {
      cleanup()
      if (err.name === 'NotAllowedError') {
        setErrorMsg('您取消了屏幕共享')
      } else {
        setErrorMsg(`火山引擎连接失败: ${err.message}`)
      }
      setStatus('error')
      setMode('select')
    }
  }

  const handleJoinRoomVolc = async (code: string) => {
    setMode('viewer')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('初始化火山引擎 SDK...')
    await consumePermission('volc', false)
    try {
      const viewerUid = 'v' + Math.random().toString(36).slice(2, 8)

      let volcModule
      try { volcModule = await import('@volcengine/rtc') } catch {
        window.location.reload(); return
      }
      const { default: VERTC, MediaType } = volcModule
      const engine = VERTC.createEngine(VOLC_APP_ID)
      volcEngineRef.current = engine

      setConnectStep('连接火山引擎服务器...')
      const viewerDisplayName = myName.current || viewerUid
      const viewerRes = await fetch(`${API_URL}/room/${code}/viewer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: viewerUid, displayName: viewerDisplayName, userType }),
      })
      if (viewerRes.status === 409) {
        const d = await viewerRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      rtcRoomRef.current = code
      rtcRoleRef.current = 'viewer'
      rtcUidRef.current = viewerUid
      const roomRes = await viewerRes.json()
      if (roomRes.hostName) setHostName(roomRes.hostName)
      const volcToken = await fetchVolcToken(code, viewerUid)
      await engine.joinRoom(volcToken, code, { userId: viewerUid, extraInfo: viewerDisplayName }, {
        isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false,
      })

      setConnectStep('等待主播视频流...')

      // Track co-viewers via SDK events (uid -> displayName, excluding the host)
      const coViewerMap = new Map<string, string>()
      let knownHostId = ''

      // Helper: refresh viewer display (excludes self, same logic as host side)
      const refreshCoViewers = () => {
        setViewerNames(Array.from(coViewerMap.values()))
        setViewerCount(coViewerMap.size)
      }

      engine.on(VERTC.events.onUserJoined, ({ userInfo }: { userInfo: { userId: string; extraInfo?: string } }) => {
        if (userInfo.userId === knownHostId) return // skip host
        const name = userInfo.extraInfo || userInfo.userId
        if (name === viewerDisplayName) return // skip own stale session (re-join: old uid still alive ~15s)
        // Remove stale entry with same display name (quick re-join: new uid arrives before old uid's leave event)
        for (const [oldUid, oldName] of Array.from(coViewerMap.entries())) {
          if (oldName === name && oldUid !== userInfo.userId) { coViewerMap.delete(oldUid); break }
        }
        coViewerMap.set(userInfo.userId, name)
        refreshCoViewers()
      })
      engine.on(VERTC.events.onUserLeave, ({ userInfo }: { userInfo: { userId: string } }) => {
        coViewerMap.delete(userInfo.userId)
        refreshCoViewers()
        if (userInfo.userId === knownHostId) {
          setErrorMsg('主播已停止共享')
          setStatus('error')
          setTimeout(cleanup, 0)
        }
      })

      engine.on(VERTC.events.onUserPublishScreen, async ({ userId }: { userId: string }) => {
        knownHostId = userId
        // Remove host from co-viewer map if they were added before identity was known
        if (coViewerMap.has(userId)) {
          coViewerMap.delete(userId)
          refreshCoViewers()
        }
        await engine.subscribeScreen(userId, MediaType.AUDIO_AND_VIDEO)
        volcHostUserIdRef.current = userId
        setConnectionInfo('火山引擎 RTC')
        setActiveStreamMode('volc')
        setStatus('watching')
      })
      engine.on(VERTC.events.onRemoteStreamStats, (stats: any) => {
        const rtt = stats?.videoStats?.rtt ?? stats?.audioStats?.rtt
        if (rtt !== undefined) setLatency(rtt)
      })

      engine.on(VERTC.events.onUserUnpublishScreen, () => {
        setErrorMsg('主播已停止共享')
        setStatus('error')
        setTimeout(cleanup, 0)
      })

      // Heartbeat only - keeps activeUsers alive on backend; viewer list now driven by SDK events
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = setInterval(async () => {
        fetch(`${API_URL}/room/${code}/heartbeat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: viewerUid }),
        }).catch(() => {})
        try {
          const r = await fetch(`${API_URL}/room/${code}`)
          const d = await r.json()
          if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error'); return }
        } catch {}
      }, 10000)

      setTimeout(() => {
        if (statusRef.current === 'connecting') {
          cleanup()
          setErrorMsg(`连接超时，卡在：${connectStepRef.current}`)
          setStatus('error')
          setMode('select')
        }
      }, 15000)
    } catch (err: any) {
      cleanup()
      setErrorMsg(`火山引擎连接失败: ${err.message}`)
      setStatus('error')
      setMode('select')
    }
  }

  const handleStartHostAgora = async () => {
    setMode('host')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('初始化声网SDK...')
    await consumePermission('agora', true)
    try {
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
      AgoraRTC.setLogLevel(4)
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      agoraClientRef.current = client

      setConnectStep('获取屏幕共享权限...')
      const screenTrack = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1', optimizationMode: 'detail' },
        'auto'
      )
      const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack
      agoraTrackRef.current = screenTrack

      const code = generateRoomCode()
      setRoomCode(code)

      setConnectStep('获取连接凭证...')
      const rawName = myName.current || 'host'
      const hostRes = await fetch(`${API_URL}/room/${code}/host`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: rawName, mode: 'agora', userType }),
      })
      if (hostRes.status === 409) {
        const d = await hostRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      rtcRoomRef.current = code
      rtcRoleRef.current = 'host'
      rtcUidRef.current = 'agora-host'
      const tokenRes = await fetch(`${API_URL}/agora/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: code, role: 'publisher' })
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.success) throw new Error(tokenData.error || '获取Agora Token失败，请检查后端配置')
      const token: string = tokenData.token

      setConnectStep('连接声网服务器...')
      await client.join(AGORA_APP_ID, code, token, null)

      setConnectStep('发布屏幕流...')
      await client.publish(Array.isArray(screenTrack) ? screenTrack : [videoTrack])

      const mediaStream = new MediaStream([videoTrack.getMediaStreamTrack()])
      streamRef.current = mediaStream
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        videoRef.current.muted = true
        videoRef.current.play().catch(() => {})
      }

      videoTrack.on('track-ended', () => handleStop())

      setConnectionInfo('声网Agora')
      setStatus('streaming')

      if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current)
      latencyIntervalRef.current = setInterval(async () => {
        const stats = client.getRTCStats()
        if (stats && stats.RTT !== undefined) setLatency(stats.RTT)
        try {
          const r = await fetch(`${API_URL}/room/${code}`)
          const d = await r.json()
          if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error'); return }
          if (d.viewers) { setViewerNames(d.viewers); setViewerCount(d.viewers.length) }
        } catch {}
      }, 3000)
    } catch (err: any) {
      cleanup()
      if (err.name === 'NotAllowedError' || err.code === 'PERMISSION_DENIED') {
        setErrorMsg('您取消了屏幕共享')
      } else {
        setErrorMsg(`声网连接失败: ${err.message}`)
      }
      setStatus('error')
      setMode('select')
    }
  }

  const handleJoinRoomAgora = async (code: string) => {
    setMode('viewer')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('初始化声网SDK...')
    await consumePermission('agora', false)
    try {
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
      AgoraRTC.setLogLevel(4)
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      agoraClientRef.current = client

      const agoraViewerNumUid = Math.floor(Math.random() * 900000000) + 100000000
      const agoraViewerUid = String(agoraViewerNumUid)

      setConnectStep('获取连接凭证...')
      const viewerDisplayName = myName.current || agoraViewerUid
      const viewerRes = await fetch(`${API_URL}/room/${code}/viewer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: agoraViewerUid, displayName: viewerDisplayName, userType }),
      })
      if (viewerRes.status === 409) {
        const d = await viewerRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      rtcRoomRef.current = code
      rtcRoleRef.current = 'viewer'
      rtcUidRef.current = agoraViewerUid
      const roomRes = await viewerRes.json()
      if (roomRes.hostName) setHostName(roomRes.hostName)
      const tokenRes = await fetch(`${API_URL}/agora/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: code, role: 'subscriber' })
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.success) throw new Error(tokenData.error || '获取Agora Token失败，请检查后端配置')
      const token: string = tokenData.token

      setConnectStep('连接声网服务器...')
      await client.join(AGORA_APP_ID, code, token, agoraViewerNumUid)

      // Heartbeat + viewer list poll every 10s
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = setInterval(async () => {
        fetch(`${API_URL}/room/${code}/heartbeat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: agoraViewerUid }),
        }).catch(() => {})
        try {
          const r = await fetch(`${API_URL}/room/${code}`)
          const d = await r.json()
          if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error'); return }
          if (d.viewers) { setViewerCount(d.viewers.length); setViewerNames(d.viewers) }
        } catch {}
      }, 10000)

      setConnectStep('等待主播视频流...')

      client.on('user-published', async (user: any, mediaType: any) => {
        await client.subscribe(user, mediaType)
        if (mediaType === 'video' && user.videoTrack) {
          const mediaStream = new MediaStream([user.videoTrack.getMediaStreamTrack()])
          streamRef.current = mediaStream
          setConnectionInfo('声网Agora')
          setStatus('watching')
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream
            videoRef.current.play().catch(() => {})
          }
          if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current)
          latencyIntervalRef.current = setInterval(() => {
            const stats = client.getRTCStats()
            if (stats && stats.RTT !== undefined) setLatency(stats.RTT)
          }, 2000)
        }
      })

      client.on('user-unpublished', (_user: any, mediaType: any) => {
        if (mediaType === 'video') {
          setErrorMsg('主播已停止共享')
          setStatus('error')
          setTimeout(cleanup, 0)
        }
      })

      setTimeout(() => {
        if (statusRef.current === 'connecting') {
          cleanup()
          setErrorMsg(`连接超时，卡在：${connectStepRef.current}`)
          setStatus('error')
          setMode('select')
        }
      }, 15000)
    } catch (err: any) {
      cleanup()
      setErrorMsg(`声网连接失败: ${err.message}`)
      setStatus('error')
      setMode('select')
    }
  }

  // 紫夜自建服务器 - 主播推流 1080P60fps
  const handleStartHostZiye = async () => {
    setMode('host')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('初始化紫夜自建服务器连接...')
    await consumePermission('ziye', true)
    if (!ZIYE_SERVER) {
      setErrorMsg('紫夜自建服务器未配置，请联系管理员设置 VITE_ZIYE_SERVER_URL')
      setStatus('error')
      setMode('select')
      return
    }
    try {
      const code = generateRoomCode()
      setRoomCode(code)
      ziyeRoomIdRef.current = code
      const rawName = myName.current || '主播'
      const userTypeVal = userType || 'student'

      ziyeEncodeQualityRef.current = ziyeQualityRef.current
      ziyeEncodeFpsRef.current = ziyeFpsChoiceRef.current
      setZiyeHostQuality(ziyeQualityRef.current)
      setZiyeHostFps(ziyeFpsChoiceRef.current)

      setConnectStep('获取屏幕共享权限（1080P60fps）...')
      // 强制1080P60fps采集，编码侧再按所选清晰度/帧率降级，不断流切换
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 60, max: 60 },
          cursor: 'always'
        } as MediaTrackConstraints,
        audio: true
      })
      ziyeStreamRef.current = screenStream
      // 标记为屏幕内容（detail），减少画面糊块/马赛克倾向
      screenStream.getVideoTracks().forEach(t => {
        try { (t as MediaStreamTrack & { contentHint?: string }).contentHint = 'detail' } catch {}
      })

      setConnectStep('连接紫夜SFU服务器...')
      // 创建PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: ZIYE_ICE_SERVERS,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle'
      })
      ziyePeerConnRef.current = pc

      // 添加音视频轨
      screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream))
      applyZiyeVideoEncoding(pc, ziyeEncodeQualityRef.current, ziyeEncodeFpsRef.current)
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          applyZiyeVideoEncoding(pc, ziyeEncodeQualityRef.current, ziyeEncodeFpsRef.current)
        }
      })

      // 监听屏幕共享停止
      screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        handleStop()
      })

      // 创建offer WHIP推流
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      const startKbps = getZiyeQualityPreset(ziyeEncodeQualityRef.current).startKbps
      offer.sdp = injectZiyeBitrateHints(offer.sdp || '', startKbps)
      await pc.setLocalDescription(offer)

      setConnectStep('收集网络信息...')
      await waitIceGathering(pc)

      // ICE 完成后再次注入码率提示（candidate 插入后 SDP 可能被改写）
      if (pc.localDescription?.sdp) {
        await pc.setLocalDescription({
          type: 'offer',
          sdp: injectZiyeBitrateHints(pc.localDescription.sdp, startKbps),
        })
      }

      setConnectStep('推流到紫夜服务器...')
      const whipRes = await fetch(ZIYE_WHIP_URL + code, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: pc.localDescription?.sdp
      })
      const whipText = await whipRes.text()
      if (!whipRes.ok) throw new Error(`推流失败: ${whipRes.status} ${whipText.slice(0, 200)}`)
      const answerSdp = await parseZlmSdpAnswer(new Response(whipText, {
        headers: { 'content-type': whipRes.headers.get('content-type') || '' }
      }))
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      applyZiyeVideoEncoding(pc, ziyeEncodeQualityRef.current, ziyeEncodeFpsRef.current)

      // 前 90 秒刷码率 + 统计帧率/延迟
      ziyeTimersRef.current.forEach(id => window.clearInterval(id))
      ziyeTimersRef.current = []
      let boostTicks = 0
      ziyeTimersRef.current.push(window.setInterval(() => {
        if (!ziyePeerConnRef.current || boostTicks++ >= 30) return
        applyZiyeVideoEncoding(ziyePeerConnRef.current, ziyeEncodeQualityRef.current, ziyeEncodeFpsRef.current)
      }, 3000))
      ziyeTimersRef.current.push(startZiyeStatsMonitor(pc, 'host', () => ({
        quality: ziyeEncodeQualityRef.current,
        fps: ziyeEncodeFpsRef.current,
      }), (s) => {
        if (typeof s.fps === 'number') setZiyeFps(s.fps)
        if (typeof s.latencyMs === 'number') setLatency(s.latencyMs)
      }))

      // 注册房间到后端
      const hostRes = await fetch(`${API_URL}/room/${code}/host`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: rawName, mode: 'ziye', userType: userTypeVal }),
      })
      if (hostRes.status === 409) {
        const d = await hostRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      if (!hostRes.ok) throw new Error('房间注册失败')
      rtcRoomRef.current = code
      rtcRoleRef.current = 'host'

      // 注册主播清晰度/帧率上限与偏好
      fetch(`${API_URL}/room/${code}/quality`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quality: ziyeQualityRef.current,
          fps: ziyeFpsChoiceRef.current,
          userId: 'host',
          role: 'host',
        }),
      }).catch(() => {})
      setZiyeHostQuality(ziyeQualityRef.current)
      setZiyeHostFps(ziyeFpsChoiceRef.current)

      // 本地预览
      streamRef.current = screenStream
      if (videoRef.current) {
        videoRef.current.srcObject = screenStream
        videoRef.current.play().catch(() => {})
      }

      setActiveStreamMode('ziye')
      setConnectionInfo(ZIYE_CONNECTION_LABEL)
      setStatus('streaming')

      // 心跳 + 观众列表 + 按房间目标清晰度/帧率重编码
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = setInterval(async () => {
        fetch(`${API_URL}/room/${code}/heartbeat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: rawName, userType: userTypeVal }),
        }).catch(() => {})
        try {
          const r = await fetch(`${API_URL}/room/${code}`)
          const d = await r.json()
          if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error'); return }
          if (d.viewers) { setViewerNames(d.viewers); setViewerCount(d.viewers.length) }
          const tq = Number(d.targetQuality)
          const tf = Number(d.targetFps)
          const hq = Number(d.hostQuality)
          const hf = Number(d.hostFps)
          if ([240, 480, 720, 1080].includes(hq)) setZiyeHostQuality(hq as ZiyeQuality)
          if ([30, 60].includes(hf)) setZiyeHostFps(hf as ZiyeFps)
          const needQ = [240, 480, 720, 1080].includes(tq) && tq !== ziyeEncodeQualityRef.current
          const needF = [30, 60].includes(tf) && tf !== ziyeEncodeFpsRef.current
          if ((needQ || needF) && ziyePeerConnRef.current) {
            if (needQ) ziyeEncodeQualityRef.current = tq as ZiyeQuality
            if (needF) ziyeEncodeFpsRef.current = tf as ZiyeFps
            applyZiyeVideoEncoding(ziyePeerConnRef.current, ziyeEncodeQualityRef.current, ziyeEncodeFpsRef.current)
          }
        } catch {}
      }, 2000)

    } catch (err: any) {
      cleanup()
      if (err.name === 'NotAllowedError') {
        setErrorMsg('您取消了屏幕共享')
      } else if (err.name === 'NotSupportedError' || /getDisplayMedia|constraints/i.test(err.message || '')) {
        setErrorMsg(`屏幕共享失败: ${err.message}`)
      } else {
        setErrorMsg(`紫夜服务器连接失败: ${err.message}`)
      }
      setStatus('error')
      setMode('select')
    }
  }

  // 紫夜自建服务器 - 观众拉流
  const handleJoinRoomZiye = async (code: string) => {
    setMode('viewer')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('连接紫夜自建服务器...')
    if (!ZIYE_SERVER) {
      setErrorMsg('紫夜自建服务器未配置，请联系管理员设置 VITE_ZIYE_SERVER_URL')
      setStatus('error')
      setMode('select')
      return
    }
    try {
      const viewerUid = 'v' + Math.random().toString(36).slice(2, 8)
      const viewerDisplayName = myName.current || viewerUid

      // 创建PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: ZIYE_ICE_SERVERS,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle'
      })
      ziyePeerConnRef.current = pc

      // 监听 track：收到轨道即进入观看（与改前行为一致，首帧可能稍晚出现）
      const remoteStream = new MediaStream()
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach(track => {
          if (!remoteStream.getTracks().some(t => t.id === track.id)) {
            remoteStream.addTrack(track)
          }
        })
        if (event.track && !remoteStream.getTracks().some(t => t.id === event.track.id)) {
          remoteStream.addTrack(event.track)
        }
        streamRef.current = remoteStream
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream
          videoRef.current.play().catch(() => {})
        }
        setActiveStreamMode('ziye')
        setConnectionInfo(ZIYE_CONNECTION_LABEL)
        setStatus('watching')
        setConnectStep('')
      }

      // 创建offer WHEP拉流
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
      await pc.setLocalDescription(offer)

      setConnectStep('收集网络信息...')
      await waitIceGathering(pc)

      setConnectStep('从紫夜服务器拉流...')
      const whepRes = await fetch(ZIYE_WHEP_URL + code, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: pc.localDescription?.sdp
      })
      const whepText = await whepRes.text()
      if (!whepRes.ok) throw new Error(`拉流失败: ${whepRes.status} ${whepText.slice(0, 200)}`)
      const answerSdp = await parseZlmSdpAnswer(new Response(whepText, {
        headers: { 'content-type': whepRes.headers.get('content-type') || '' }
      }))
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

      ziyeTimersRef.current.forEach(id => window.clearInterval(id))
      ziyeTimersRef.current = []
      ziyeTimersRef.current.push(startZiyeStatsMonitor(pc, 'viewer', () => ({
        quality: ziyeQualityRef.current,
        fps: ziyeFpsChoiceRef.current,
      }), (s) => {
        if (typeof s.fps === 'number') setZiyeFps(s.fps)
        if (typeof s.latencyMs === 'number') setLatency(s.latencyMs)
      }))

      // 加入房间
      const viewerRes = await fetch(`${API_URL}/room/${code}/viewer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: viewerUid, displayName: viewerDisplayName, mode: 'ziye', userType }),
      })
      if (!viewerRes.ok) throw new Error('房间不存在或已关闭')
      const roomData = await viewerRes.json()
      if (roomData.hostName) setHostName(roomData.hostName)
      const hq = Number(roomData.hostQuality)
      const hf = Number(roomData.hostFps)
      if ([240, 480, 720, 1080].includes(hq)) {
        setZiyeHostQuality(hq as ZiyeQuality)
        if (ziyeQualityRef.current > hq) {
          const capped = hq as ZiyeQuality
          setZiyeQuality(capped)
          ziyeQualityRef.current = capped
        }
      }
      if ([30, 60].includes(hf)) {
        setZiyeHostFps(hf as ZiyeFps)
        if (ziyeFpsChoiceRef.current > hf) {
          const cappedF = hf as ZiyeFps
          setZiyeFpsChoice(cappedF)
          ziyeFpsChoiceRef.current = cappedF
        }
      }
      rtcRoomRef.current = code
      rtcRoleRef.current = 'viewer'
      rtcUidRef.current = viewerUid

      // 上报观众清晰度/帧率偏好（主播按最低偏好重编码，不断流）
      fetch(`${API_URL}/room/${code}/quality`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quality: ziyeQualityRef.current,
          fps: ziyeFpsChoiceRef.current,
          userId: viewerUid,
          role: 'viewer',
        }),
      }).catch(() => {})

      // 观众心跳 + 同步主播推流清晰度/帧率上限
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = setInterval(async () => {
        fetch(`${API_URL}/room/${code}/heartbeat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: viewerUid, displayName: viewerDisplayName, userType }),
        }).catch(() => {})
        try {
          const r = await fetch(`${API_URL}/room/${code}`)
          const d = await r.json()
          if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error'); return }
          const hq2 = Number(d.hostQuality)
          const hf2 = Number(d.hostFps)
          if ([240, 480, 720, 1080].includes(hq2)) {
            setZiyeHostQuality(hq2 as ZiyeQuality)
            if (ziyeQualityRef.current > hq2) {
              const capped = hq2 as ZiyeQuality
              setZiyeQuality(capped)
              ziyeQualityRef.current = capped
            }
          }
          if ([30, 60].includes(hf2)) {
            setZiyeHostFps(hf2 as ZiyeFps)
            if (ziyeFpsChoiceRef.current > hf2) {
              const cappedF = hf2 as ZiyeFps
              setZiyeFpsChoice(cappedF)
              ziyeFpsChoiceRef.current = cappedF
            }
          }
        } catch {}
      }, 5000)

    } catch (err: any) {
      cleanup()
      if (/502|代理失败|无法连接/i.test(err.message || '')) {
        setErrorMsg(`紫夜服务器连接失败: ${err.message}（请确认 10116 端口 NAT 已映射，且线上 API 已配置 ZIYE_UPSTREAM_URL）`)
      } else {
        setErrorMsg(`紫夜服务器连接失败: ${err.message}`)
      }
      setStatus('error')
      setMode('select')
    }
  }

  const checkAlreadyActive = async (): Promise<boolean> => {
    try {
      const r = await fetch(`${API_URL}/room/active-check/${encodeURIComponent(myName.current)}?userType=${userType || ''}`)
      const d = await r.json()
      if (d.active) {
        setErrorMsg(`你已经在房间 ${d.roomId} 中${d.role === 'host' ? '分享' : '观看'}，请先退出后再操作`)
        return true
      }
    } catch {}
    return false
  }

  const handleStartHost = async () => {
    if (await checkAlreadyActive()) return
    if (hostConnMode === 'volc') return handleStartHostVolc()
    if (hostConnMode === 'agora') return handleStartHostAgora()
    if (hostConnMode === 'ziye') return handleStartHostZiye()

    setMode('host')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('获取连接配置...')

    try {
      const iceServers = await fetchIceServers()

      // Capture screen first
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          cursor: 'always',
          frameRate: { ideal: 30, max: 60 }
        } as any,
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      streamRef.current = stream

      // When user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        handleStop()
      }

      // Create peer with room code
      const code = generateRoomCode()
      setRoomCode(code)

      const rawName = myName.current || 'host'
      const hostRes = await fetch(`${API_URL}/room/${code}/host`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: rawName, mode: 'peerjs', userType }),
      })
      if (hostRes.status === 409) {
        const d = await hostRes.json()
        stream.getTracks().forEach(t => t.stop())
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      rtcRoomRef.current = code
      rtcRoleRef.current = 'host'

      const peerId = PEER_PREFIX + code

      const peer = new Peer(peerId, {
        debug: 0,
        config: { iceServers }
      })

      peer.on('open', () => {
        setStatus('streaming')
        // Show local preview
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.muted = true
          videoRef.current.play().catch(() => {})
        }
        // Poll for admin force-close
        if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current)
        latencyIntervalRef.current = setInterval(async () => {
          try {
            const r = await fetch(`${API_URL}/room/${code}`)
            const d = await r.json()
            if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error') }
          } catch {}
        }, 3000)
      })

      // When a viewer connects via data connection, call them back with the stream
      peer.on('connection', (dataConn) => {
        let viewerName = ''
        let viewerUserId = ''
        dataConn.on('open', () => {
          // Send host name to viewer
          dataConn.send({ type: 'host-info', name: myName.current })
        })
        dataConn.on('data', (data: any) => {
          if (data?.type === 'viewer-info' && data.name) {
            viewerName = data.name
            if (data.userId) viewerUserId = data.userId
            setViewerNames(prev => [...prev, viewerName])
          }
        })
        dataConn.on('open', () => {
          const viewerPeerId = dataConn.peer
          // Host calls the viewer with the screen stream
          const call = peer.call(viewerPeerId, stream)
          connectionsRef.current.push(call)

          let removed = false
          const removeViewer = () => {
            if (removed) return
            removed = true
            connectionsRef.current = connectionsRef.current.filter(c => c !== call)
            setViewerCount(prev => Math.max(0, prev - 1))
            if (viewerName) setViewerNames(prev => { const i = prev.indexOf(viewerName); return i >= 0 ? [...prev.slice(0, i), ...prev.slice(i + 1)] : prev })
            if (viewerUserId) fetch(`${API_URL}/room/${code}/leave`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: viewerUserId, displayName: viewerName }),
            }).catch(() => {})
          }
          
          // Capture ICE connection info (use addEventListener to avoid overwriting PeerJS handlers)
          const pc = (call as any).peerConnection as RTCPeerConnection | undefined
          if (pc) {
            pc.addEventListener('connectionstatechange', () => {
              if (pc.connectionState === 'connected') {
                pc.getStats().then((stats) => {
                  let localCandidateId = ''
                  stats.forEach((report: any) => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                      localCandidateId = report.localCandidateId
                    }
                  })
                  if (localCandidateId) {
                    stats.forEach((r: any) => {
                      if (r.id === localCandidateId && r.candidateType) {
                        const type = r.candidateType === 'host' ? '局域网直连' : r.candidateType === 'prflx' ? 'P2P直连' : r.candidateType === 'srflx' ? 'STUN穿透' : r.candidateType === 'relay' ? 'TURN中继' : r.candidateType
                        setConnectionInfo(`${type} · ${r.protocol.toUpperCase()}`)
                      }
                    })
                  }
                })
              }
              if (pc.connectionState === 'connected') {
                if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current)
                latencyIntervalRef.current = setInterval(async () => {
                  pc.getStats().then((stats) => {
                    stats.forEach((r: any) => {
                      if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime !== undefined) {
                        setLatency(Math.round(r.currentRoundTripTime * 1000))
                      }
                    })
                  })
                  try {
                    const kr = await fetch(`${API_URL}/room/${code}`)
                    const kd = await kr.json()
                    if (kd.killed) { cleanup(); setErrorMsg(`已被管理员 ${kd.killedBy || '管理员'} 强制关闭`); setStatus('error') }
                  } catch {}
                }, 2000)
              }
              if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                removeViewer()
              }
            })
          }
          setViewerCount(prev => prev + 1)

          call.on('close', removeViewer)
          call.on('error', removeViewer)
          // dataConn close fires reliably when browser is closed abruptly
          dataConn.on('close', removeViewer)
        })
      })

      peer.on('error', (err) => {
        console.error('Peer error:', err)
        cleanup()
        if (err.type === 'unavailable-id') {
          setErrorMsg('房间代码冲突，请重试')
        } else {
          setErrorMsg(`连接错误: ${err.message}`)
        }
        setStatus('error')
        setMode('select')
      })

      peerRef.current = peer
    } catch (err: any) {
      console.error('Screen capture error:', err)
      if (err.name === 'NotAllowedError') {
        setErrorMsg('您取消了屏幕共享')
      } else {
        setErrorMsg(`无法捕获屏幕: ${err.message}`)
      }
      setStatus('error')
      setMode('select')
    }
  }

  const handleJoinRoom = async () => {
    const code = inputCode.trim().toUpperCase()
    if (code.length !== 6) {
      setErrorMsg('请输入6位房间代码')
      return
    }

    if (await checkAlreadyActive()) return

    setErrorMsg('')
    setConnectStep('识别房间类型...')
    // 根据主播开房时登记的 mode 自动加入，观众无需手动选连接方式
    let detected: 'peerjs' | 'agora' | 'volc' | 'ziye' = 'peerjs'
    try {
      const infoRes = await fetch(`${API_URL}/room/${code}`)
      const info = await infoRes.json()
      if (info.killed) {
        setErrorMsg(`房间已被管理员 ${info.killedBy || '管理员'} 关闭`)
        return
      }
      if (!info.exists || !info.hostName) {
        setErrorMsg('房间不存在或已关闭')
        return
      }
      if (info.mode === 'agora' || info.mode === 'volc' || info.mode === 'ziye' || info.mode === 'peerjs') {
        detected = info.mode
      }
      if (info.hostName) setHostName(info.hostName)
    } catch {
      setErrorMsg('无法查询房间信息，请稍后重试')
      return
    }

    setConnMode(detected === 'peerjs'
      ? (connMode === 'relay' || connMode === 'stun' ? connMode : 'auto')
      : detected)

    if (detected === 'volc') return handleJoinRoomVolc(code)
    if (detected === 'agora') return handleJoinRoomAgora(code)
    if (detected === 'ziye') return handleJoinRoomZiye(code)

    // peerjs / WebRTC P2P — 网络策略用当前已选的 auto/relay/stun
    const icePref = connMode === 'relay' || connMode === 'stun' ? connMode : 'auto'

    setMode('viewer')
    setStatus('connecting')
    setConnectStep('获取连接配置...')

    const allIceServers = await fetchIceServers()
    const iceServers = icePref === 'stun'
      ? allIceServers.filter((s: any) => {
          const urls = Array.isArray(s.urls) ? s.urls : [s.urls]
          return urls.every((u: string) => u.startsWith('stun:'))
        })
      : allIceServers
    setConnectStep('连接信令服务器...')

    const viewerUid = 'pv' + Math.random().toString(36).slice(2, 8)
    const viewerDisplayName = myName.current || viewerUid
    const viewerRes = await fetch(`${API_URL}/room/${code}/viewer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: viewerUid, displayName: viewerDisplayName, userType }),
    })
    if (viewerRes.status === 409) {
      const d = await viewerRes.json()
      setErrorMsg(d.error || '该账号已在其他房间中活跃')
      setStatus('error')
      setMode('select')
      return
    }
    rtcRoomRef.current = code
    rtcRoleRef.current = 'viewer'
    rtcUidRef.current = viewerUid

    const roomResData = await viewerRes.json()
    if (roomResData.hostName) setHostName(roomResData.hostName)

    // Heartbeat + viewer list poll every 10s
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
    heartbeatIntervalRef.current = setInterval(async () => {
      fetch(`${API_URL}/room/${code}/heartbeat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: viewerUid }),
      }).catch(() => {})
      try {
        const r = await fetch(`${API_URL}/room/${code}`)
        const d = await r.json()
        if (d.killed) { cleanup(); setErrorMsg(`已被管理员 ${d.killedBy || '管理员'} 强制关闭`); setStatus('error'); return }
        if (d.viewers) { setViewerCount(d.viewers.length); setViewerNames(d.viewers) }
      } catch {}
    }, 10000)

    const peer = new Peer({
      debug: 0,
      config: {
        iceServers,
        iceTransportPolicy: icePref === 'relay' ? 'relay' : 'all',
      }
    })

    peer.on('open', () => {
      setConnectStep('连接到主播...')
      const hostPeerId = PEER_PREFIX + code
      // Connect to host via data connection to announce ourselves
      const dataConn = peer.connect(hostPeerId)

      dataConn.on('open', () => {
        setConnectStep('等待主播回传视频流...')
        // Send viewer name to host
        dataConn.send({ type: 'viewer-info', name: myName.current, userId: viewerUid })
      })

      dataConn.on('data', (data: any) => {
        if (data?.type === 'host-info' && data.name) {
          setHostName(data.name)
        }
      })

      dataConn.on('error', (err) => {
        console.error('Data connection error:', err)
        cleanup()
        setErrorMsg('无法连接到房间（数据通道失败）')
        setStatus('error')
        setMode('select')
      })

      // Timeout for connection
      setTimeout(() => {
        if (statusRef.current === 'connecting') {
          cleanup()
          setErrorMsg(`连接超时，卡在：${connectStepRef.current}`)
          setStatus('error')
          setMode('select')
        }
      }, 15000)
    })

    // Host will call us back with the screen stream
    peer.on('call', (call) => {
      call.answer()
      
      // Capture ICE connection info (use addEventListener to avoid overwriting PeerJS handlers)
      const pc = (call as any).peerConnection as RTCPeerConnection | undefined
      if (pc) {
        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'connected') {
            pc.getStats().then((stats) => {
              let localCandidateId = ''
              stats.forEach((report: any) => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                  localCandidateId = report.localCandidateId
                }
              })
              // Check LOCAL candidate type (reflects this side's transport)
              let localType = ''
              let localProto = ''
              if (localCandidateId) {
                stats.forEach((r: any) => {
                  if (r.id === localCandidateId && r.candidateType) {
                    localType = r.candidateType
                    localProto = r.protocol || ''
                  }
                })
              }
              // If STUN-only mode but local side uses relay, reject
              if (icePref === 'stun' && localType === 'relay') {
                cleanup()
                setErrorMsg('STUN直连失败：当前网络环境无法建立P2P连接，连接已被阻止（未走TURN中继）')
                setStatus('error')
                setMode('select')
                return
              }
              if (localType) {
                const label = localType === 'host' ? '局域网直连' : localType === 'prflx' ? 'P2P直连' : localType === 'srflx' ? 'STUN穿透' : localType === 'relay' ? 'TURN中继' : localType
                setConnectionInfo(`${label} · ${localProto.toUpperCase()}`)
              }
            })
            if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current)
            latencyIntervalRef.current = setInterval(() => {
              pc.getStats().then((stats) => {
                stats.forEach((r: any) => {
                  if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime !== undefined) {
                    setLatency(Math.round(r.currentRoundTripTime * 1000))
                  }
                })
              })
            }, 2000)
          }
        })
      }

      call.on('stream', (remoteStream) => {
        setStatus('watching')
        streamRef.current = remoteStream
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream
          videoRef.current.play().catch(() => {})
        }
      })

      call.on('close', () => {
        cleanup()
        setErrorMsg('主播已停止共享')
        setStatus('error')
        setMode('select')
      })

      call.on('error', (err) => {
        console.error('Call error:', err)
        cleanup()
        setErrorMsg('连接失败')
        setStatus('error')
        setMode('select')
      })

      connectionsRef.current.push(call)
    })

    peer.on('error', (err) => {
      console.error('Peer error:', err)
      cleanup()
      if (err.type === 'peer-unavailable') {
        setErrorMsg('房间不存在或已关闭')
      } else {
        setErrorMsg(`连接错误: ${err.message}`)
      }
      setStatus('error')
      setMode('select')
    })

    peerRef.current = peer
  }

  const handleStop = () => {
    // Optimistically remove from active rooms before mode switches to 'select',
    // preventing the race where the immediate active-rooms poll still returns
    // this room because the /close fetch hasn't reached the server yet.
    const closingCode = roomCode
    cleanup()
    setStatus('idle')
    setMode('select')
    setRoomCode('')
    setInputCode('')
    setErrorMsg('')
    if (closingCode) {
      setActiveRooms(prev => prev.filter(r => r.roomId !== closingCode))
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textArea = document.createElement('textarea')
      textArea.value = roomCode
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current.requestFullscreen()
    }
  }

  // Check if student can HOST (share) with a mode - viewing is always allowed
  const canHostMode = (m: 'peerjs' | 'agora' | 'volc' | 'ziye'): boolean => {
    if (m === 'peerjs') return true
    if (userType === 'admin') return true
    if (rtcPerm.canUseRtc) return true
    if (m === 'agora') return rtcPerm.agora
    if (m === 'volc') return rtcPerm.volc
    if (m === 'ziye') return rtcPerm.ziye
    return false
  }

  const refreshAssistants = async () => {
    const ar = await fetch(`${API_URL}/room/assistants`)
    const ad = await ar.json()
    setAssistants(ad.assistants || [])
    setAssistantCandidates(ad.candidates || [])
  }

  const isPending = (m: 'agora' | 'volc' | 'ziye'): boolean => {
    if (m === 'agora') return rtcPerm.agoraPending
    if (m === 'volc') return rtcPerm.volcPending
    return rtcPerm.ziyePending
  }

  const rtcModeLabel = (m: string) =>
    m === 'agora' ? '声网 Agora' : m === 'volc' ? '火山引擎' : m === 'ziye' ? '紫夜自建' : m

  const rtcModeColor = (m: string) =>
    m === 'agora' ? '#60a5fa' : m === 'volc' ? '#fb923c' : m === 'ziye' ? '#c084fc' : '#9ca3af'

  // Unified mode change handler: syncs hostConnMode and connMode
  const handleModeChange = (m: 'peerjs' | 'agora' | 'volc' | 'ziye') => {
    setHostConnMode(m)
    if (m === 'agora') setConnMode('agora')
    else if (m === 'volc') setConnMode('volc')
    else if (m === 'ziye') setConnMode('ziye')
    else setConnMode('auto')
  }

  const showZiyeToast = (text: string, kind: 'loading' | 'success') => {
    if (ziyeToastTimerRef.current) {
      window.clearTimeout(ziyeToastTimerRef.current)
      ziyeToastTimerRef.current = null
    }
    setZiyeToast({ text, kind })
    if (kind === 'success') {
      ziyeToastTimerRef.current = window.setTimeout(() => {
        setZiyeToast(null)
        ziyeToastTimerRef.current = null
      }, 2200)
    }
  }

  const postZiyeMediaPrefs = async (patch: { quality?: ZiyeQuality; fps?: ZiyeFps }) => {
    const roomId = rtcRoomRef.current || ziyeRoomIdRef.current
    const uid = rtcRoleRef.current === 'host' ? 'host' : (rtcUidRef.current || 'viewer')
    const role = rtcRoleRef.current || (mode === 'host' ? 'host' : 'viewer')
    let targetQuality = patch.quality ?? ziyeQualityRef.current
    let targetFps = patch.fps ?? ziyeFpsChoiceRef.current
    let hostQ = ziyeHostQuality
    let hostF = ziyeHostFps
    if (!roomId) return { targetQuality, targetFps, hostQuality: hostQ, hostFps: hostF }
    try {
      const res = await fetch(`${API_URL}/room/${roomId}/quality`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, userId: uid, role }),
      })
      const data = await res.json()
      if ([240, 480, 720, 1080].includes(Number(data.targetQuality))) {
        targetQuality = Number(data.targetQuality) as ZiyeQuality
      }
      if ([30, 60].includes(Number(data.targetFps))) {
        targetFps = Number(data.targetFps) as ZiyeFps
      }
      if ([240, 480, 720, 1080].includes(Number(data.hostQuality))) {
        hostQ = Number(data.hostQuality) as ZiyeQuality
        setZiyeHostQuality(hostQ)
      }
      if ([30, 60].includes(Number(data.hostFps))) {
        hostF = Number(data.hostFps) as ZiyeFps
        setZiyeHostFps(hostF)
      }
    } catch {}
    return { targetQuality, targetFps, hostQuality: hostQ, hostFps: hostF }
  }

  const handleZiyeQualityChange = async (q: ZiyeQuality) => {
    if (rtcRoleRef.current === 'viewer' && q > ziyeHostQuality) return
    if (q === ziyeQualityRef.current) return
    const label = getZiyeQualityPreset(q).label
    showZiyeToast(`正在切换至 ${label}…`, 'loading')
    setZiyeQuality(q)
    ziyeQualityRef.current = q
    if (rtcRoleRef.current === 'host' || mode === 'host') {
      setZiyeHostQuality(q)
    }
    const { targetQuality, targetFps } = await postZiyeMediaPrefs({ quality: q })
    // 仅改编码参数，不重连，画面不中断
    if ((rtcRoleRef.current === 'host' || mode === 'host') && ziyePeerConnRef.current) {
      ziyeEncodeQualityRef.current = targetQuality
      ziyeEncodeFpsRef.current = targetFps
      applyZiyeVideoEncoding(ziyePeerConnRef.current, targetQuality, targetFps)
    }
    showZiyeToast(`已切换至 ${label}`, 'success')
  }

  const handleZiyeFpsChange = async (f: ZiyeFps) => {
    if (rtcRoleRef.current === 'viewer' && f > ziyeHostFps) return
    if (f === ziyeFpsChoiceRef.current) return
    showZiyeToast(`正在切换至 ${f}fps…`, 'loading')
    setZiyeFpsChoice(f)
    ziyeFpsChoiceRef.current = f
    if (rtcRoleRef.current === 'host' || mode === 'host') {
      setZiyeHostFps(f)
    }
    const { targetQuality, targetFps } = await postZiyeMediaPrefs({ fps: f })
    if ((rtcRoleRef.current === 'host' || mode === 'host') && ziyePeerConnRef.current) {
      ziyeEncodeQualityRef.current = targetQuality
      ziyeEncodeFpsRef.current = targetFps
      applyZiyeVideoEncoding(ziyePeerConnRef.current, targetQuality, targetFps)
    }
    showZiyeToast(`已切换至 ${f}fps`, 'success')
  }

  // Student: request access to a mode
  const handleRequestAccess = async (m: 'agora' | 'volc' | 'ziye') => {
    try {
      await fetch(`${API_URL}/room/rtc-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myName.current, mode: m }),
      })
      const pendingKey = m === 'agora' ? 'agoraPending' : m === 'volc' ? 'volcPending' : 'ziyePending'
      setRtcPerm(prev => ({ ...prev, [pendingKey]: true }))
    } catch {}
  }

  // Admin: approve a request
  const handleApprove = async (username: string, m: string) => {
    const key = `approve-${username}-${m}`
    if (actionLoading) return
    setActionLoading(key)
    await fetch(`${API_URL}/room/rtc-approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, mode: m }),
    }).catch(() => {})
    setPendingRequests(prev => prev.filter(r => !(r.username === username && r.mode === m)))
    setActionLoading('')
  }

  // Admin: reject a request
  const handleReject = async (username: string, m: string) => {
    const key = `reject-${username}-${m}`
    if (actionLoading) return
    setActionLoading(key)
    await fetch(`${API_URL}/room/rtc-reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, mode: m }),
    }).catch(() => {})
    setPendingRequests(prev => prev.filter(r => !(r.username === username && r.mode === m)))
    setActionLoading('')
  }

  // Consume permission when student starts using a non-webrtc mode
  const consumePermission = async (m: 'agora' | 'volc' | 'ziye', asHost = false) => {
    if (userType === 'admin') return
    if (rtcPerm.isAssistant) {
      if (!asHost) return
    }
    const body: Record<string, unknown> = {
      username: myName.current,
      mode: m,
      asHost,
    }
    if (memberIdRef.current) body.memberId = memberIdRef.current
    const res = await fetch(`${API_URL}/room/rtc-consume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    if (asHost && rtcPerm.isAssistant && res?.ok) {
      const q = memberIdRef.current ? `?memberId=${memberIdRef.current}` : ''
      const r = await fetch(`${API_URL}/room/rtc-permission/${encodeURIComponent(myName.current)}${q}`)
      const d = await r.json()
      setRtcPerm(d)
    }
  }

  const modeDescriptions = {
    peerjs: '基于 WebRTC 技术，数据在浏览器间直接传输，延迟最低，但需要网络环境支持',
    agora: '通过声网全球节点中转，连接稳定可靠，适合跨地区使用',
    volc: '通过火山引擎国内节点中转，针对国内网络优化，延迟极低',
    ziye: '鲶大禹服务器：自建SFU。卡顿时可降低清晰度，带宽占用下降，画面区域大小不变',
  }

  // Canvas particle effect
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (mode !== 'select') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let animId: number
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number; color: string; life: number }[] = []
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    const colors = ['147,51,234', '59,130,246', '249,115,22', '16,185,129']
    const spawn = () => {
      if (particles.length < 60) {
        const c = colors[Math.floor(Math.random() * colors.length)]
        particles.push({
          x: Math.random() * canvas.width, y: canvas.height + 10,
          vx: (Math.random() - 0.5) * 0.5, vy: -(0.3 + Math.random() * 0.8),
          size: 1 + Math.random() * 2, alpha: 0.1 + Math.random() * 0.4, color: c, life: 200 + Math.random() * 300
        })
      }
    }
    let started = false
    const startTimer = setTimeout(() => { started = true }, 800)
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!started) { animId = requestAnimationFrame(draw); return }
      // Grid
      ctx.strokeStyle = 'rgba(147,51,234,0.03)'
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
      for (let y = 0; y < canvas.height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }
      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy; p.life--
        const fade = Math.min(1, p.life / 60)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color},${p.alpha * fade})`
        ctx.fill()
        // Trail
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * 8, p.y - p.vy * 8)
        ctx.strokeStyle = `rgba(${p.color},${p.alpha * fade * 0.3})`
        ctx.lineWidth = p.size * 0.5
        ctx.stroke()
        if (p.life <= 0 || p.y < -10) particles.splice(i, 1)
      }
      spawn(); spawn()
      // Connection lines between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 100) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(147,51,234,${0.06 * (1 - dist / 100)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); clearTimeout(startTimer); window.removeEventListener('resize', resize) }
  }, [mode])

  // Mode selection screen
  if (mode === 'select') {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Admin: floating active rooms sidebar */}
        {userType === 'admin' && activeRooms.length > 0 && (
          <div className="fixed left-0 top-1/2 -translate-y-1/2 z-50 flex items-stretch">
            <div
              className={`transition-all duration-300 ease-in-out ${activeRoomsOpen ? 'w-72 opacity-100' : 'w-0 opacity-0'} overflow-hidden`}
            >
              <div className="bg-gray-900/95 backdrop-blur-xl border border-purple-500/30 border-r-0 rounded-r-none shadow-[0_0_40px_rgba(147,51,234,0.15)] p-4 min-w-[18rem] h-full">
                <h3 className="text-purple-400 text-sm font-semibold mb-3 flex items-center gap-2">
                  <Wifi size={16} />
                  正在共享的房间
                </h3>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {activeRooms.map((room) => {
                    const modeLabel = room.mode === 'agora' ? '声网' : room.mode === 'volc' ? '火山' : room.mode === 'ziye' ? '紫夜自建' : 'P2P'
                    const modeColor = room.mode === 'agora' ? 'text-blue-400' : room.mode === 'volc' ? 'text-orange-400' : room.mode === 'ziye' ? 'text-purple-400' : 'text-emerald-400'
                    return (
                      <div key={room.roomId} className="bg-gray-800/70 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                          <span className="text-white text-sm font-medium truncate">{room.hostName}</span>
                          <span className={`text-xs font-medium flex-shrink-0 ${modeColor}`}>{modeLabel}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{room.roomId}</span>
                            {room.viewerCount > 0 && <span>{room.viewerCount}人观看</span>}
                          </div>
                          <button
                            onClick={async () => {
                              setClosingRoomId(room.roomId)
                              try {
                                await fetch(`${API_URL}/room/admin-close/${room.roomId}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ adminName: getCurrentUsername() }),
                                })
                                setActiveRooms(prev => prev.filter(r => r.roomId !== room.roomId))
                              } catch {}
                              setClosingRoomId(null)
                            }}
                            disabled={!!closingRoomId}
                            className={`flex items-center gap-1 px-2 py-1 border rounded-md text-xs font-medium transition-colors ${
                              closingRoomId === room.roomId
                                ? 'bg-red-600/30 border-red-500/40 text-red-300 cursor-wait'
                                : closingRoomId ? 'opacity-50 cursor-not-allowed bg-red-600/20 border-red-500/30 text-red-400'
                                : 'bg-red-600/20 hover:bg-red-600/30 border-red-500/30 text-red-400'
                            }`}>
                            <StopCircle size={12} /> {closingRoomId === room.roomId ? '关闭中' : '强制关闭'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveRoomsOpen(prev => !prev)}
              className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-2 py-3 rounded-r-xl border border-purple-500/30 border-l-0 bg-gray-900/95 text-purple-400 hover:bg-gray-800/95 transition-all duration-300`}
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-xs font-medium">{activeRooms.length} 个房间</span>
              <ChevronDown size={12} className={`transition-transform duration-300 ${activeRoomsOpen ? 'rotate-90' : '-rotate-90'}`} />
            </button>
          </div>
        )}

        {/* Animated CSS */}
        <style>{`
          @keyframes light-sweep {
            0% { transform: translateX(-100%) skewX(-15deg); opacity: 0; }
            5% { opacity: 1; }
            80% { opacity: 1; }
            100% { transform: translateX(300%) skewX(-15deg); opacity: 0; }
          }
          @keyframes hex-rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes pulse-ring {
            0% { transform: scale(0.8); opacity: 0.6; }
            50% { transform: scale(1.5); opacity: 0; }
            100% { transform: scale(0.8); opacity: 0; }
          }
          @keyframes gradient-shift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes cinematic-in {
            0% { opacity: 0; transform: scale(0.85); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes reveal-up {
            from { opacity: 0; transform: translateY(40px) perspective(600px) rotateX(10deg); filter: blur(6px); }
            to { opacity: 1; transform: translateY(0) perspective(600px) rotateX(0deg); filter: blur(0); }
          }
          @keyframes slide-left {
            from { opacity: 0; transform: translateX(-60px) perspective(600px) rotateY(8deg); filter: blur(4px); }
            to { opacity: 1; transform: translateX(0) perspective(600px) rotateY(0deg); filter: blur(0); }
          }
          @keyframes slide-right {
            from { opacity: 0; transform: translateX(60px) perspective(600px) rotateY(-8deg); filter: blur(4px); }
            to { opacity: 1; transform: translateX(0) perspective(600px) rotateY(0deg); filter: blur(0); }
          }
          @keyframes glow-breathe {
            0%, 100% { box-shadow: 0 0 20px rgba(147,51,234,0.4), 0 0 60px rgba(147,51,234,0.15), inset 0 0 20px rgba(147,51,234,0.1); }
            50% { box-shadow: 0 0 40px rgba(147,51,234,0.6), 0 0 100px rgba(147,51,234,0.25), inset 0 0 30px rgba(147,51,234,0.15); }
          }
          @keyframes scan-line {
            0% { top: -2px; }
            100% { top: calc(100% + 2px); }
          }
          @keyframes energy-flow {
            0% { stroke-dashoffset: 200; opacity: 0; }
            20% { opacity: 1; }
            100% { stroke-dashoffset: 0; opacity: 0; }
          }
          @keyframes fade-in-delayed {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .anim-cinematic-in { animation: cinematic-in 1.2s cubic-bezier(0.22,1,0.36,1) both; }
          .anim-reveal-1 { animation: reveal-up 0.8s 0.3s cubic-bezier(0.16,1,0.3,1) both; }
          .anim-reveal-2 { animation: reveal-up 0.8s 0.5s cubic-bezier(0.16,1,0.3,1) both; }
          .anim-slide-l { animation: slide-left 0.9s 0.7s cubic-bezier(0.16,1,0.3,1) both; }
          .anim-slide-r { animation: slide-right 0.9s 0.7s cubic-bezier(0.16,1,0.3,1) both; }
          .anim-fade-last { animation: reveal-up 0.6s 1s ease-out both; }
          @keyframes slide-down {
            from { opacity: 0; max-height: 0; transform: translateY(-8px); }
            to { opacity: 1; max-height: 800px; transform: translateY(0); }
          }
          @keyframes slide-down-row {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .anim-slide-down-row { animation: slide-down-row 0.2s ease-out both; }
          .collapsible { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease; opacity: 0; }
          .collapsible.open { grid-template-rows: 1fr; opacity: 1; }
          .collapsible > div { overflow: hidden; min-height: 0; }
        `}</style>

        {/* Canvas particle system + grid */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Light sweep effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0" style={{ opacity: 0, animation: 'light-sweep 2s 0.3s ease-in-out both' }}>
            <div className="absolute top-0 bottom-0 w-32 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent" />
          </div>
        </div>

        {/* Ambient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[500px] h-[500px] -top-40 -left-40 rounded-full blur-[120px] bg-purple-600/[0.07]" />
          <div className="absolute w-[400px] h-[400px] -bottom-32 -right-32 rounded-full blur-[100px] bg-blue-600/[0.05]" />
          <div className="absolute w-[300px] h-[300px] top-1/3 right-1/4 rounded-full blur-[80px] bg-orange-500/[0.04]" />
        </div>

        <div className="max-w-4xl w-full relative z-10">
          {/* Header - cinematic entrance */}
          <div className="text-center mb-7 anim-cinematic-in">
            <div className="relative inline-flex items-center justify-center mb-5">
              {/* Rotating hex frame */}
              <svg className="absolute w-28 h-28" viewBox="0 0 100 100" style={{ animation: 'hex-rotate 20s linear infinite' }}>
                <polygon points="50,2 93,25 93,75 50,98 7,75 7,25" fill="none" stroke="rgba(147,51,234,0.15)" strokeWidth="0.5" />
                <polygon points="50,8 88,28 88,72 50,92 12,72 12,28" fill="none" stroke="rgba(147,51,234,0.1)" strokeWidth="0.3" />
              </svg>
              {/* Energy flow lines */}
              <svg className="absolute w-32 h-32" viewBox="0 0 100 100" style={{ animation: 'hex-rotate 30s linear infinite reverse' }}>
                <circle cx="50" cy="50" r="42" fill="none" stroke="url(#energyGrad)" strokeWidth="0.8" strokeDasharray="8 12" style={{ animation: 'energy-flow 3s linear infinite' }} />
                <defs><linearGradient id="energyGrad"><stop offset="0%" stopColor="rgba(147,51,234,0)" /><stop offset="50%" stopColor="rgba(147,51,234,0.6)" /><stop offset="100%" stopColor="rgba(147,51,234,0)" /></linearGradient></defs>
              </svg>
              {/* Pulse rings */}
              <div className="absolute w-24 h-24 rounded-full border border-purple-500/30" style={{ animation: 'pulse-ring 3s ease-out infinite' }} />
              <div className="absolute w-24 h-24 rounded-full border border-purple-400/20" style={{ animation: 'pulse-ring 3s 1s ease-out infinite' }} />
              <div className="absolute w-24 h-24 rounded-full border border-purple-300/10" style={{ animation: 'pulse-ring 3s 2s ease-out infinite' }} />
              {/* Icon */}
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 flex items-center justify-center" style={{ animation: 'glow-breathe 4s ease-in-out infinite' }}>
                <Monitor size={32} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                  <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-300/80 to-transparent" style={{ animation: 'scan-line 2.5s linear infinite' }} />
                </div>
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-2 tracking-wider" style={{
              background: 'linear-gradient(135deg, #c084fc 0%, #e879f9 25%, #818cf8 50%, #c084fc 75%, #f0abfc 100%)',
              backgroundSize: '300% 300%',
              animation: 'gradient-shift 4s ease infinite',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 40px rgba(192,132,252,0.3)',
            }}>屏幕共享</h1>
            <p className="text-gray-400 text-sm tracking-widest uppercase" style={{ letterSpacing: '0.3em' }}>Screen Sharing System</p>
          </div>

          {/* 主操作台：左加入 / 右发起 */}
          <div className="anim-reveal-1 rounded-2xl border border-gray-700/50 bg-gray-800/30 backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-5 md:min-h-[280px]">
              {/* 左：加入 */}
              <div className="md:col-span-3 p-6 sm:p-8 flex flex-col justify-center border-b md:border-b-0 md:border-r border-gray-700/50 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/[0.06] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <Link2 size={16} className="text-blue-400" />
                    <h2 className="text-base font-bold text-white">加入房间</h2>
                  </div>
                  <p className="text-gray-500 text-xs mb-5">输入代码即可观看，自动识别连接方式</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                      placeholder="······"
                      maxLength={6}
                      autoComplete="off"
                      className="flex-1 min-w-0 bg-gray-950/60 border border-gray-600/40 rounded-xl px-3 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:shadow-[0_0_18px_rgba(59,130,246,0.12)] font-mono text-2xl tracking-[0.4em] text-center uppercase transition-all"
                    />
                    <button
                      onClick={handleJoinRoom}
                      disabled={inputCode.length !== 6}
                      className="w-24 shrink-0 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white rounded-xl font-semibold transition-all text-sm"
                    >
                      加入
                    </button>
                  </div>
                  <details className="mt-3 group">
                    <summary className="cursor-pointer list-none text-gray-600 hover:text-gray-400 text-[11px] flex items-center gap-1 select-none w-fit">
                      <ChevronDown size={11} className="transition-transform group-open:rotate-180" />
                      高级选项
                    </summary>
                    <div className="flex gap-1 mt-2">
                      {(['auto', 'relay', 'stun'] as const).map((m) => {
                        const labels = { auto: '自动', relay: 'TURN', stun: 'STUN' }
                        const hints = { auto: '优先直连，失败回退中继', relay: '强制中继', stun: '仅直连' }
                        const active = connMode === m || (m === 'auto' && !['relay', 'stun'].includes(connMode))
                        return (
                          <button key={m} type="button" onClick={() => setConnMode(m)} title={hints[m]}
                            className={`flex-1 py-1 rounded text-[11px] font-medium transition-all border ${
                              active
                                ? 'bg-blue-600/25 border-blue-500/45 text-blue-300'
                                : 'bg-gray-900/40 border-gray-700/40 text-gray-500 hover:text-gray-300'
                            }`}>{labels[m]}</button>
                        )
                      })}
                    </div>
                  </details>
                  {errorMsg && mode === 'select' && (
                    <p className="text-red-400 text-sm mt-3">{errorMsg}</p>
                  )}
                </div>
              </div>

              {/* 右：发起共享 */}
              <div className="md:col-span-2 p-6 sm:p-7 flex flex-col relative">
                <div className="absolute inset-0 bg-gradient-to-bl from-purple-600/[0.06] to-transparent pointer-events-none" />
                <div className="relative flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-1">
                    <Play size={16} className="text-purple-400" />
                    <h2 className="text-base font-bold text-white">发起共享</h2>
                  </div>
                  <p className="text-gray-500 text-xs mb-4">选择方式后开始</p>

                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {([
                      { key: 'peerjs' as const, label: 'WebRTC', icon: Wifi, color: 'emerald' },
                      { key: 'agora' as const, label: '声网', icon: Globe, color: 'blue' },
                      { key: 'volc' as const, label: '火山', icon: Zap, color: 'orange' },
                      { key: 'ziye' as const, label: '紫夜', icon: Server, color: 'purple' },
                    ]).map(({ key, label, icon: Icon, color }) => {
                      const isActive = hostConnMode === key
                      const colorMap: Record<string, { active: string; icon: string }> = {
                        emerald: { active: 'border-emerald-500/55 bg-emerald-500/10', icon: 'text-emerald-400' },
                        blue: { active: 'border-blue-500/55 bg-blue-500/10', icon: 'text-blue-400' },
                        orange: { active: 'border-orange-500/55 bg-orange-500/10', icon: 'text-orange-400' },
                        purple: { active: 'border-purple-500/55 bg-purple-500/10', icon: 'text-purple-400' },
                      }
                      const c = colorMap[color]
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleModeChange(key)}
                          title={modeDescriptions[key]}
                          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-left transition-all ${
                            isActive ? c.active : 'border-gray-700/45 bg-gray-900/25 hover:border-gray-600'
                          }`}
                        >
                          <Icon size={14} className={isActive ? c.icon : 'text-gray-500'} />
                          <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400'}`}>{label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {hostConnMode === 'ziye' && (
                    <div className="mb-3 space-y-1.5">
                      <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                        {ZIYE_QUALITY_OPTIONS.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => { setZiyeQuality(o.id); ziyeQualityRef.current = o.id }}
                            className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                              ziyeQuality === o.id ? 'bg-purple-600/40 text-purple-200' : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                        {ZIYE_FPS_OPTIONS.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => { setZiyeFpsChoice(o.id); ziyeFpsChoiceRef.current = o.id }}
                            className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                              ziyeFpsChoice === o.id ? 'bg-purple-600/40 text-purple-200' : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-2">
                    {canHostMode(hostConnMode) ? (
                      <button onClick={handleStartHost}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg font-medium transition-all text-sm hover:shadow-[0_0_18px_rgba(147,51,234,0.28)]">
                        开始共享
                      </button>
                    ) : rtcPerm.isAssistant && (hostConnMode === 'agora' || hostConnMode === 'volc' || hostConnMode === 'ziye') ? (
                      <button disabled
                        className="w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 bg-gray-800/60 border border-gray-700/50 text-gray-500 cursor-not-allowed">
                        <Lock size={14} />
                        {!rtcPerm.screenShareEnabled ? '共享权限已关闭' : '共享次数已用完'}
                      </button>
                    ) : hostConnMode !== 'peerjs' ? (
                      <button
                        onClick={() => !isPending(hostConnMode) && handleRequestAccess(hostConnMode)}
                        disabled={isPending(hostConnMode)}
                        className={`w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                          isPending(hostConnMode)
                            ? 'bg-yellow-600/15 border border-yellow-500/30 text-yellow-400 cursor-wait'
                            : 'bg-gray-700/60 hover:bg-gray-700 border border-gray-600/50 text-gray-300'
                        }`}>
                        {isPending(hostConnMode)
                          ? <><Clock size={14} />审批中...</>
                          : <><Lock size={14} />申请{rtcModeLabel(hostConnMode)}分享</>
                        }
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Admin: pending RTC requests */}
          {userType === 'admin' && pendingRequests.length > 0 && (
            <div className="mt-5 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 anim-reveal-2">
              <h3 className="text-amber-400 text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock size={16} />
                待审批的连接方式申请 ({pendingRequests.length})
              </h3>
              <div className="space-y-2">
                {pendingRequests.map((req, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-4 py-2.5">
                    <div>
                      <span className="text-white text-sm font-medium">{req.username}</span>
                      <span className="text-gray-400 text-sm mx-2">申请使用</span>
                      <span className="text-sm font-medium" style={{ color: rtcModeColor(req.mode) }}>
                        {rtcModeLabel(req.mode)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(req.username, req.mode)}
                        disabled={!!actionLoading}
                        className={`flex items-center gap-1 px-3 py-1 border rounded-md text-xs font-medium transition-colors ${
                          actionLoading === `approve-${req.username}-${req.mode}`
                            ? 'bg-green-600/30 border-green-500/40 text-green-300 cursor-wait'
                            : actionLoading ? 'opacity-50 cursor-not-allowed bg-green-600/20 border-green-500/30 text-green-400'
                            : 'bg-green-600/20 hover:bg-green-600/30 border-green-500/30 text-green-400'
                        }`}>
                        <CheckCircle size={14} /> {actionLoading === `approve-${req.username}-${req.mode}` ? '处理中...' : '批准'}
                      </button>
                      <button onClick={() => handleReject(req.username, req.mode)}
                        disabled={!!actionLoading}
                        className={`flex items-center gap-1 px-3 py-1 border rounded-md text-xs font-medium transition-colors ${
                          actionLoading === `reject-${req.username}-${req.mode}`
                            ? 'bg-red-600/30 border-red-500/40 text-red-300 cursor-wait'
                            : actionLoading ? 'opacity-50 cursor-not-allowed bg-red-600/20 border-red-500/30 text-red-400'
                            : 'bg-red-600/20 hover:bg-red-600/30 border-red-500/30 text-red-400'
                        }`}>
                        <XCircle size={14} /> {actionLoading === `reject-${req.username}-${req.mode}` ? '处理中...' : '拒绝'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student: assistant status */}
          {userType === 'student' && rtcPerm.isAssistant && (
            <div className={`mt-5 rounded-xl p-4 anim-reveal-2 border ${
              rtcPerm.canUseRtc
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-gray-800/40 border-gray-700/40'
            }`}>
              <h3 className={`text-sm font-semibold mb-1 flex items-center gap-2 ${
                rtcPerm.canUseRtc ? 'text-emerald-400' : 'text-gray-400'
              }`}>
                <GraduationCap size={16} />
                助教身份
              </h3>
              {rtcPerm.canUseRtc ? (
                <p className="text-gray-400 text-xs">
                  可直接使用声网 / 火山引擎 / 紫夜自建分享，无需逐次审批。
                  {rtcPerm.quotaRemaining == null
                    ? ' 次数不限。'
                    : ` 剩余 ${rtcPerm.quotaRemaining} 次（已用 ${rtcPerm.screenShareUsed ?? 0} 次）。`}
                </p>
              ) : !rtcPerm.screenShareEnabled ? (
                <p className="text-gray-500 text-xs">管理员已关闭您的屏幕共享权限，请联系管理员。</p>
              ) : (
                <p className="text-gray-500 text-xs">声网 / 火山 / 紫夜共享次数已用完，请联系管理员增加配额或清零次数。</p>
              )}
            </div>
          )}

          {/* Admin: assistant management */}
          {userType === 'admin' && (
            <ScreenShareAssistantPanel
              assistants={assistants}
              candidates={assistantCandidates}
              onRefresh={refreshAssistants}
            />
          )}

          {/* Admin: share logs (collapsible) */}
          {userType === 'admin' && (() => {
            const filtered = shareLogs.filter(l => {
              if (logModeFilter !== 'all' && l.mode !== logModeFilter) return false
              if (logSearch) {
                const q = logSearch.toLowerCase()
                const viewerList: string[] = l.viewers ? JSON.parse(l.viewers) : []
                if (!l.host_name.toLowerCase().includes(q) && !l.room_id.toLowerCase().includes(q) && !viewerList.some(v => v.toLowerCase().includes(q))) return false
              }
              return true
            })
            const totalPages = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE))
            const safePage = Math.min(logPage, totalPages)
            const paged = filtered.slice((safePage - 1) * LOG_PAGE_SIZE, safePage * LOG_PAGE_SIZE)
            const handleDeleteClick = (id: number) => {
              if (deleteConfirmId === id) { setDeleteConfirmId(null); setDeletePassword(''); setDeleteError(''); return }
              setDeleteConfirmId(id); setDeletePassword(''); setDeleteError('')
            }
            const handleDeleteSubmit = async (id: number) => {
              if (deletingId) return
              if (!deletePassword) { setDeleteError('请输入密码'); return }
              setDeletingId(id); setDeleteError('')
              const r = await fetch(`${API_URL}/room/share-logs/${id}`, {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: deletePassword }),
              }).catch(() => null)
              setDeletingId(null)
              if (!r || !r.ok) {
                if (r && r.status === 403) { setDeleteError('密码错误'); return }
                setDeleteError('删除失败'); return
              }
              setShareLogs(prev => prev.filter(l => l.id !== id))
              setDeleteConfirmId(null); setDeletePassword('')
            }
            return (
              <div className="mt-6 bg-gray-800/30 border border-gray-700/40 rounded-xl overflow-hidden anim-fade-last">
                <button onClick={() => setLogsOpen(!logsOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors">
                  <span className="text-gray-300 text-sm font-semibold flex items-center gap-2">
                    <Monitor size={16} className="text-purple-400" />
                    共享记录
                    <span className="text-gray-600 text-xs font-normal">({shareLogs.length})</span>
                  </span>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform duration-300 ${logsOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`collapsible ${logsOpen ? 'open' : ''}`}>
                  <div>
                    <div className="px-4 pb-4">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="relative flex-1 min-w-[140px]">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input value={logSearch} onChange={e => { setLogSearch(e.target.value); setLogPage(1) }}
                          placeholder="搜索发起人或房间号"
                          className="w-full pl-8 pr-3 py-1.5 bg-gray-900/50 border border-gray-700/50 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40" />
                      </div>
                      <div className="flex gap-1">
                        {([['all', '全部'], ['peerjs', 'WebRTC'], ['agora', '声网'], ['volc', '火山']] as const).map(([k, label]) => (
                          <button key={k} onClick={() => { setLogModeFilter(k); setLogPage(1) }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                              logModeFilter === k
                                ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                                : 'bg-gray-900/30 border-gray-700/40 text-gray-500 hover:text-gray-300'
                            }`}>{label}</button>
                        ))}
                      </div>
                    </div>
                    {filtered.length === 0 ? (
                      <p className="text-gray-600 text-xs text-center py-4">{shareLogs.length === 0 ? '暂无共享记录' : '无匹配记录'}</p>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-700/50">
                                <th className="text-left py-2 px-2 font-medium">发起人</th>
                                <th className="text-left py-2 px-2 font-medium">方式</th>
                                <th className="text-left py-2 px-2 font-medium">观看者</th>
                                <th className="text-left py-2 px-2 font-medium">开始时间</th>
                                <th className="text-left py-2 px-2 font-medium">状态</th>
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {paged.map((log) => {
                                const modeLabel = log.mode === 'agora' ? '声网' : log.mode === 'volc' ? '火山引擎' : 'WebRTC'
                                const modeColor = log.mode === 'agora' ? 'text-blue-400' : log.mode === 'volc' ? 'text-orange-400' : 'text-emerald-400'
                                const startTime = new Date(log.started_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                                const isLive = !log.ended_at
                                let duration = ''
                                if (log.ended_at) {
                                  const ms = new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()
                                  const mins = Math.floor(ms / 60000)
                                  duration = mins < 1 ? '<1分钟' : mins < 60 ? `${mins}分钟` : `${Math.floor(mins / 60)}小时${mins % 60}分`
                                }
                                return (
                                  <React.Fragment key={log.id}>
                                  <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 group">
                                    <td className="py-2 px-2 text-white font-medium">{log.host_name}</td>
                                    <td className={`py-2 px-2 font-medium ${modeColor}`}>{modeLabel}</td>
                                    <td className="py-2 px-2 text-gray-400">
                                      {(() => { try {
                                        const v: string[] = log.viewers ? JSON.parse(log.viewers) : []
                                        if (v.length === 0) return <span>-</span>
                                        return <button onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                          className="text-purple-400 hover:text-purple-300 transition-colors text-xs">
                                          {v.length}人
                                        </button>
                                      } catch { return <span>-</span> } })()}
                                    </td>
                                    <td className="py-2 px-2 text-gray-400">{startTime}</td>
                                    <td className="py-2 px-2">
                                      {isLive
                                        ? <span className="inline-flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />进行中</span>
                                        : <span className="text-gray-500">{duration}</span>
                                      }
                                    </td>
                                    <td className="py-2 px-1">
                                      <button onClick={() => handleDeleteClick(log.id)} title="删除"
                                        className={`p-1 rounded transition-all ${deleteConfirmId === log.id ? 'opacity-100 bg-red-600/20 text-red-400' : 'opacity-0 group-hover:opacity-100 hover:bg-red-600/20 text-gray-600 hover:text-red-400'}`}>
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  </tr>
                                  <tr className={deleteConfirmId === log.id ? 'bg-gray-900/40' : ''}>
                                    <td colSpan={6} className="p-0">
                                      <div className={`collapsible ${deleteConfirmId === log.id ? 'open' : ''}`}>
                                        <div>
                                          <div className="flex items-center gap-2 px-2 py-2">
                                            <input type="password" value={deleteConfirmId === log.id ? deletePassword : ''} onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                                              onKeyDown={e => e.key === 'Enter' && handleDeleteSubmit(log.id)}
                                              placeholder="输入删除密码" autoFocus={deleteConfirmId === log.id}
                                              className="bg-gray-800/60 border border-gray-600/50 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 w-32" />
                                            <button onClick={() => handleDeleteSubmit(log.id)} disabled={!!deletingId}
                                              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                                deletingId === log.id ? 'bg-red-600/30 text-red-300 cursor-wait' : 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                                              }`}>
                                              {deletingId === log.id ? '删除中...' : '确认删除'}
                                            </button>
                                            <button onClick={() => { setDeleteConfirmId(null); setDeletePassword(''); setDeleteError('') }}
                                              className="px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300 transition-colors">取消</button>
                                            {deleteError && <span className="text-red-400 text-xs">{deleteError}</span>}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  {(() => { try {
                                    const v: string[] = log.viewers ? JSON.parse(log.viewers) : []
                                    if (v.length === 0) return null
                                    return (
                                      <tr className={expandedLogId === log.id ? 'bg-gray-900/30' : ''}>
                                        <td colSpan={6} className="p-0">
                                          <div className={`collapsible ${expandedLogId === log.id ? 'open' : ''}`}>
                                            <div>
                                              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                                                <span className="text-gray-500 text-xs mr-1">观看者：</span>
                                                {v.map((name, i) => (
                                                  <span key={i} className="inline-block bg-purple-600/15 border border-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded-md">{name}</span>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  } catch { return null } })()}
                                  </React.Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-gray-600 text-xs">共 {filtered.length} 条</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                                className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors">上一页</button>
                              <span className="text-gray-500 text-xs">{safePage} / {totalPages}</span>
                              <button onClick={() => setLogPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                                className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors">下一页</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Author */}
          <div className="mt-6 text-center anim-fade-last">
            <div className="flex items-center justify-center gap-2 text-gray-600 text-xs">
              <div className="h-px w-8 bg-gradient-to-r from-transparent to-gray-700" />
              <span>技术开发：鲶大禹</span>
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-gray-700" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Streaming / Watching screen
  const ziyeStatsChip = activeStreamMode === 'ziye' && (ziyeFps !== null || latency !== null) ? (
    <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1 font-mono text-xs tabular-nums">
      {ziyeFps !== null && <span className="text-cyan-300">{ziyeFps}fps</span>}
      {ziyeFps !== null && latency !== null && <span className="text-gray-600">·</span>}
      {latency !== null && (
        <span className={latency < 50 ? 'text-green-400' : latency < 150 ? 'text-yellow-400' : 'text-red-400'}>
          {latency}ms
        </span>
      )}
    </div>
  ) : null

  const ziyeMediaControls = activeStreamMode === 'ziye' ? (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className="text-gray-500 text-[11px] px-1 hidden sm:inline"
        title="主播当前推流清晰度与帧率上限"
      >
        上限 {getZiyeQualityPreset(ziyeHostQuality).label}/{ziyeHostFps}
      </span>
      <div className="flex items-center bg-gray-800/60 border border-gray-700/50 rounded-lg p-0.5" title="清晰度">
        {ZIYE_QUALITY_OPTIONS.map(o => {
          const disabled = mode === 'viewer' && o.id > ziyeHostQuality
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              title={disabled ? `主播最高 ${getZiyeQualityPreset(ziyeHostQuality).label}` : o.label}
              onClick={() => handleZiyeQualityChange(o.id)}
              className={`min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : ziyeQuality === o.id
                  ? 'bg-purple-600/45 text-purple-100'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/40'
              }`}
            >
              {o.id}
            </button>
          )
        })}
      </div>
      <div className="flex items-center bg-gray-800/60 border border-gray-700/50 rounded-lg p-0.5" title="帧率">
        {ZIYE_FPS_OPTIONS.map(o => {
          const disabled = mode === 'viewer' && o.id > ziyeHostFps
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              title={disabled ? `主播最高 ${ziyeHostFps}fps` : o.label}
              onClick={() => handleZiyeFpsChange(o.id)}
              className={`min-w-[2.75rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : ziyeFpsChoice === o.id
                  ? 'bg-purple-600/45 text-purple-100'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/40'
              }`}
            >
              {o.id}
            </button>
          )
        })}
      </div>
    </div>
  ) : null

  return (
    <div className={`flex flex-col ${isFullscreen ? 'h-screen bg-black' : 'min-h-[calc(100vh-8rem)] px-6 py-4 max-w-[1600px] mx-auto w-full'}`} ref={containerRef}>
      {/* Top bar */}
      <div className={`flex items-center justify-between gap-3 ${isFullscreen ? 'absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300' : 'mb-3'}`}>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0 flex-1">
          {mode === 'host' && status === 'streaming' && (
            <>
              <div className="flex items-center gap-2 bg-red-600/20 border border-red-500/30 rounded-lg px-2.5 py-1.5">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-sm font-medium">共享中</span>
                {activeStreamMode === 'ziye' && (
                  <span className="text-red-400/50 text-xs hidden sm:inline">· {ZIYE_CONNECTION_LABEL}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5">
                <span className="text-white font-mono text-base tracking-widest font-bold">{roomCode}</span>
                <button onClick={handleCopy} className="text-gray-400 hover:text-white transition-colors" title="复制房间号">
                  {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                </button>
              </div>
              <div className="relative group flex items-center gap-1 text-gray-400 text-sm cursor-default">
                <Users size={15} />
                <span>{viewerCount}</span>
                {viewerNames.length > 0 && (
                  <div className="absolute top-full left-0 mt-2 hidden group-hover:block z-20">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2 px-1 min-w-[140px]">
                      <p className="text-gray-500 text-xs px-3 pb-1.5 border-b border-gray-700 mb-1">观看成员</p>
                      {viewerNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-gray-300 text-sm whitespace-nowrap">{name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {ziyeStatsChip}
              {ziyeMediaControls}
            </>
          )}
          {mode === 'viewer' && status === 'watching' && (
            <>
              <div className="flex items-center gap-2 bg-green-600/20 border border-green-500/30 rounded-lg px-2.5 py-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 text-sm font-medium">观看中</span>
                {activeStreamMode === 'ziye' && (
                  <span className="text-green-400/50 text-xs hidden sm:inline">· {ZIYE_CONNECTION_LABEL}</span>
                )}
              </div>
              {hostName && (
                <span className="text-gray-300 text-sm truncate max-w-[9rem]" title={hostName}>
                  {hostName}
                </span>
              )}
              {activeStreamMode !== 'ziye' && connectionInfo && (
                <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-500 text-xs">连接:</span>
                  <span className="text-gray-300 text-xs font-mono">{connectionInfo}</span>
                </div>
              )}
              {activeStreamMode !== 'ziye' && latency !== null && (
                <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-500 text-xs">延迟:</span>
                  <span className={`text-xs font-mono font-medium ${
                    latency < 50 ? 'text-green-400' : latency < 150 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{latency} ms</span>
                </div>
              )}
              {ziyeStatsChip}
              {ziyeMediaControls}
              <div className="relative group flex items-center gap-1 text-gray-400 text-sm cursor-default select-none">
                <Users size={15} />
                <span>{viewerCount}</span>
                {viewerNames.length > 0 && (
                  <div className="absolute top-full left-0 mt-2 hidden group-hover:block z-20">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2 px-1 min-w-[140px]">
                      <p className="text-gray-500 text-xs px-3 pb-1.5 border-b border-gray-700 mb-1">观看成员</p>
                      {viewerNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-gray-300 text-sm whitespace-nowrap">{name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {status === 'connecting' && (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-400">{connectStep || '正在连接...'}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(status === 'streaming' || status === 'watching') && (
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg transition-colors"
          >
            {mode === 'host' ? <StopCircle size={18} /> : <X size={18} />}
            <span className="text-sm font-medium hidden sm:inline">{mode === 'host' ? '停止共享' : '断开'}</span>
          </button>
        </div>
      </div>

      {/* Video area */}
      <div className={`flex-1 overflow-hidden flex items-center justify-center relative ${isFullscreen ? 'w-full h-full' : 'bg-gray-900/80 rounded-2xl border border-gray-700/50 min-h-[60vh]'}`}>
        {status === 'error' ? (
          <div className="text-center p-8">
            <div className="w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center mx-auto mb-4">
              <X size={32} className="text-red-400" />
            </div>
            <p className="text-red-400 text-lg mb-2">{errorMsg}</p>
            <button
              onClick={handleStop}
              className="mt-4 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              返回
            </button>
          </div>
        ) : status === 'connecting' ? (
          <div className="text-center p-8">
            <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400 text-lg">
              {mode === 'host' ? '准备共享屏幕...' : '正在连接到房间...'}
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-contain ${activeStreamMode === 'volc' ? 'hidden' : ''}`}
              style={isFullscreen ? { width: '100vw', height: '100vh' } : { maxHeight: 'calc(100vh - 12rem)' }}
            />
            <div
              ref={volcContainerRef}
              className={`absolute inset-0 ${activeStreamMode !== 'volc' ? 'hidden' : ''}`}
            />
            {activeStreamMode === 'ziye' && ziyeToast && (
              <div
                className={`absolute bottom-4 left-4 z-30 pointer-events-none flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium shadow-lg backdrop-blur-sm transition-opacity ${
                  ziyeToast.kind === 'loading'
                    ? 'bg-black/70 text-white border border-white/10'
                    : 'bg-emerald-600/90 text-white border border-emerald-400/30'
                }`}
              >
                {ziyeToast.kind === 'loading' && (
                  <span className="w-3.5 h-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                {ziyeToast.text}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
