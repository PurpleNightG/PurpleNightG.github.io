import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Peer, { MediaConnection } from 'peerjs'
import { Monitor, Users, Copy, Check, StopCircle, Play, Link2, X, Maximize2, Minimize2, Wifi, Zap, Globe, Lock, Clock, CheckCircle, XCircle, ChevronDown, Search, Trash2, GraduationCap, Mic, MicOff, Volume2, VolumeX, LogIn, GripVertical, Video, PhoneOff, UserX, UserPlus, CheckSquare, Square, Loader2 } from 'lucide-react'
import ScreenShareAssistantPanel, { type AssistantRow, type AssistantCandidate } from '../components/ScreenShareAssistantPanel'
import ScreenShareGuestCodesPanel from '../components/ScreenShareGuestCodesPanel'
import MeetingRoom from './MeetingRoom'
import MemberAvatar from '../components/MemberAvatar'
import { loadGuestSession, saveGuestSession, clearGuestSession, type GuestSession } from '../utils/guestSession'
import { setLiveSessionBusy } from '../utils/liveSessionFlag'
import {
  parseVolcVoiceMessage,
  setVolcLocalMicVolume,
  setVolcMicAutoGain,
  setVolcRemoteMicVolume,
  startVolcMic,
  startVolcScreenCapture,
  stopVolcMic,
  subscribeVolcMic,
  VOLC_MIC_VOLUME_DEFAULT,
  VOLC_MIC_VOLUME_MAX,
} from '../utils/volcScreenShare'

type Mode = 'select' | 'host' | 'viewer' | 'meeting'
type Status = 'idle' | 'connecting' | 'streaming' | 'watching' | 'error'

const PEER_PREFIX = 'ziye-share-'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const AGORA_APP_ID: string = import.meta.env.VITE_AGORA_APP_ID || 'a51f2304cab54d86a883ab04b41840a6'
const VOLC_APP_ID: string = import.meta.env.VITE_VOLC_APP_ID || '69a1d9e90340ba017226d5c0'

type ScreenQuality = 240 | 480 | 720 | 1080
type ScreenFps = 30 | 60
/** 清晰=保细节(detail)；流畅=保帧率(motion) */
type ScreenEncodeMode = 'detail' | 'motion'

const SCREEN_QUALITY_OPTIONS: {
  id: ScreenQuality
  label: string
  height: number
  /**
   * 清晰模式上限码率（@60fps）。文档/静态为主，码率可偏低。
   * 参考火山文档：1080p 静态约 2000kbps。
   */
  maxKbpsDetail: number
  /**
   * 流畅模式上限码率（@60fps）。游戏/剧烈运动需要更高余量。
   * 旧值 1080p=12000 偏高易顶满上行；火山动态推荐 1080p30≈4000，游戏 60fps 约需翻倍。
   */
  maxKbpsMotion: number
}[] = [
  { id: 240, label: '240p', height: 240, maxKbpsDetail: 500, maxKbpsMotion: 900 },
  { id: 480, label: '480p', height: 480, maxKbpsDetail: 1200, maxKbpsMotion: 2200 },
  { id: 720, label: '720p', height: 720, maxKbpsDetail: 2800, maxKbpsMotion: 5000 },
  { id: 1080, label: '1080p', height: 1080, maxKbpsDetail: 5000, maxKbpsMotion: 9000 },
]

const SCREEN_ENCODE_MODE_OPTIONS: { id: ScreenEncodeMode; label: string; hint: string }[] = [
  { id: 'motion', label: '流畅', hint: '优先保帧率，适合游戏/视频；高动态时更稳' },
  { id: 'detail', label: '清晰', hint: '优先保细节，适合文档/PPT；高动态可能掉帧' },
]

const SCREEN_FPS_OPTIONS: { id: ScreenFps; label: string }[] = [
  { id: 30, label: '30fps' },
  { id: 60, label: '60fps' },
]

function getScreenQualityPreset(q: ScreenQuality) {
  return SCREEN_QUALITY_OPTIONS.find(o => o.id === q) || SCREEN_QUALITY_OPTIONS[3]
}

function getVolcMaxKbps(quality: ScreenQuality, fps: ScreenFps, encodeMode: ScreenEncodeMode) {
  const preset = getScreenQualityPreset(quality)
  const base = encodeMode === 'motion' ? preset.maxKbpsMotion : preset.maxKbpsDetail
  // 30fps 信息量更低，按比例下调，避免静态场景浪费带宽
  const brScale = fps === 30 ? 0.75 : 1
  return Math.round(base * brScale)
}

function getVolcEncoderConfig(quality: ScreenQuality, fps: ScreenFps, encodeMode: ScreenEncodeMode) {
  const preset = getScreenQualityPreset(quality)
  return {
    width: Math.round((preset.height * 16) / 9),
    height: preset.height,
    frameRate: fps,
    maxKbps: getVolcMaxKbps(quality, fps, encodeMode),
    contentHint: encodeMode,
  }
}

/** 监测推流码率塌陷 + 回报帧率/延迟 */
/** Chrome/Chromium：注入起步码率，避免刚连上时从极低码率慢慢爬 */
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
    const guest = loadGuestSession()
    if (guest?.nickname) return guest.nickname
  } catch {}
  return '未知用户'
}

function getCurrentAvatar(): string | null {
  try {
    const adminUser = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (adminUser) {
      const parsed = JSON.parse(adminUser)
      return parsed.avatar || null
    }
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentUser) {
      const parsed = JSON.parse(studentUser)
      return parsed.avatar || null
    }
  } catch {}
  return null
}

function getCurrentQq(): string | null {
  try {
    const adminUser = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (adminUser) {
      const parsed = JSON.parse(adminUser)
      return parsed.qq != null ? String(parsed.qq) : null
    }
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentUser) {
      const parsed = JSON.parse(studentUser)
      return parsed.qq != null ? String(parsed.qq) : null
    }
  } catch {}
  return null
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('select')
  const [status, setStatus] = useState<Status>('idle')
  const [roomCode, setRoomCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [meetingCode, setMeetingCode] = useState('')
  const [meetingInput, setMeetingInput] = useState('')
  const [meetingCreating, setMeetingCreating] = useState(false)
  const [meetingJoining, setMeetingJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const [viewerNames, setViewerNames] = useState<string[]>([])
  const [hostName, setHostName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [connectionInfo, setConnectionInfo] = useState<string>('')
  const [connectStep, setConnectStep] = useState('')
  const [connMode, setConnMode] = useState<'auto' | 'relay' | 'stun' | 'agora' | 'volc'>('auto')
  const [hostConnMode, setHostConnMode] = useState<'peerjs' | 'agora' | 'volc'>('peerjs')
  const [activeStreamMode, setActiveStreamMode] = useState<'peerjs' | 'agora' | 'volc'>('peerjs')
  const [latency, setLatency] = useState<number | null>(null)
  const [screenQuality, setScreenQuality] = useState<ScreenQuality>(1080)
  const [screenFpsChoice, setScreenFpsChoice] = useState<ScreenFps>(60)
  const [screenEncodeMode, setScreenEncodeMode] = useState<ScreenEncodeMode>('motion')
  const [screenHostQuality, setScreenHostQuality] = useState<ScreenQuality>(1080)
  const [screenHostFps, setScreenHostFps] = useState<ScreenFps>(60)
  const [screenFps, setScreenFps] = useState<number | null>(null)
  const [mediaToast, setMediaToast] = useState<{ text: string; kind: 'loading' | 'success' } | null>(null)
  /** 火山房间语音：本地是否开麦（默认开） */
  const [micOn, setMicOn] = useState(true)
  /** 被共享者强制禁言后不可自行开麦 */
  const [micForcedOff, setMicForcedOff] = useState(false)
  /** uid -> 显示名 / 开麦状态（主机用于禁言） */
  const [volcPeers, setVolcPeers] = useState<{ userId: string; name: string; micOn: boolean }[]>([])
  /** 本端听到的各远端麦音量（%），仅影响本地播放 */
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({})
  /** 自己麦克风发送音量（%） */
  const [localMicVolume, setLocalMicVolume] = useState(VOLC_MIC_VOLUME_DEFAULT)
  /** 麦克风自动增益 AGC */
  const [micGainOn, setMicGainOn] = useState(true)
  /** 观众端主播 uid（用于调听感音量） */
  const [volcHostUserId, setVolcHostUserId] = useState('')
  /** 主机已强制禁言的 uid（与当前是否开麦解耦，方便再次解禁） */
  const [forcedMutedIds, setForcedMutedIds] = useState<Set<string>>(() => new Set())
  const kickedViewerIdsRef = useRef<Set<string>>(new Set())
  const [peersMenuOpen, setPeersMenuOpen] = useState(false)
  const [micMenuOpen, setMicMenuOpen] = useState(false)
  /** 主机邀请观看成员 */
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteCandidates, setInviteCandidates] = useState<{
    id: number
    nickname: string
    username: string
    qq: string | null
    avatar: string | null
    stageRole: string | null
  }[]>([])
  const [inviteSelected, setInviteSelected] = useState<Set<number>>(() => new Set())
  /** 主机：待批进入申请（全站 HostJoinRequestsFloat 负责） */
  const roomLinkHandledRef = useRef<string | null>(null)
  /** 来自「在线房间申请」批准后的进入，viewer 需带 fromRequest */
  const fromRequestRef = useRef(false)
  const handleJoinRoomRef = useRef<(code?: string) => Promise<void>>(async () => {})
  const [profileByName, setProfileByName] = useState<
    Record<string, { nickname: string; qq: string | null; avatar: string | null }>
  >({})
  const [allListenMuted, setAllListenMuted] = useState(false)
  const peersMenuRef = useRef<HTMLDivElement>(null)
  const micMenuRef = useRef<HTMLDivElement>(null)
  const [userType] = useState<'admin' | 'student' | null>(getUserType)
  const [guestSession, setGuestSession] = useState<GuestSession | null>(() =>
    getUserType() ? null : loadGuestSession()
  )
  const isGuest = !userType && !!guestSession
  const [guestNicknameInput, setGuestNicknameInput] = useState('')
  const [guestHostCodeInput, setGuestHostCodeInput] = useState('')
  const [guestValidatedCode, setGuestValidatedCode] = useState('')
  const [guestHostMode, setGuestHostMode] = useState<'peerjs' | 'agora' | 'volc' | null>(null)
  const [guestValidating, setGuestValidating] = useState(false)
  const effectiveUserType = userType || (isGuest ? 'guest' : null)
  const [rtcPerm, setRtcPerm] = useState<{
    agora: boolean
    volc: boolean
    agoraPending: boolean
    volcPending: boolean
    isAssistant?: boolean
    canUseRtc?: boolean
    screenShareEnabled?: boolean
    quotaRemaining?: number | null
    screenShareUsed?: number
    screenShareQuota?: number | null
  }>({ agora: false, volc: false, agoraPending: false, volcPending: false })
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
  const [meetingLogs, setMeetingLogs] = useState<{
    id: number
    code: string
    title: string
    created_by: string
    status: string
    created_at: string
    closed_at: string | null
    live?: boolean
    memberCount?: number | null
  }[]>([])
  const [meetingLogsOpen, setMeetingLogsOpen] = useState(false)
  const [meetingLogSearch, setMeetingLogSearch] = useState('')
  const [meetingLogPage, setMeetingLogPage] = useState(1)
  const [meetingDeleteConfirmId, setMeetingDeleteConfirmId] = useState<number | null>(null)
  const [meetingDeletePassword, setMeetingDeletePassword] = useState('')
  const [meetingDeleteError, setMeetingDeleteError] = useState('')
  const [meetingDeletingId, setMeetingDeletingId] = useState<number | null>(null)
  const [meetingEndConfirm, setMeetingEndConfirm] = useState<{ code: string } | null>(null)
  const [meetingEnding, setMeetingEnding] = useState(false)
  const MEETING_LOG_PAGE_SIZE = 8
  const [activeRooms, setActiveRooms] = useState<{ roomId: string; hostName: string; mode: string; viewerCount: number; viewers: string[] }[]>([])
  const [closingRoomId, setClosingRoomId] = useState<string | null>(null)
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null)
  const [activeRoomsPos, setActiveRoomsPos] = useState<{ x: number; y: number } | null>(null)
  const [activeRoomsCollapsed, setActiveRoomsCollapsed] = useState(false)
  const activeRoomsDragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const myName = useRef(getCurrentUsername())
  const guestCodeRef = useRef('')
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const kickedExitRef = useRef<(() => void) | null>(null)
  const agoraClientRef = useRef<any>(null)
  const agoraTrackRef = useRef<any>(null)
  const volcEngineRef = useRef<any>(null)
  const volcContainerRef = useRef<HTMLDivElement>(null)
  const volcHostUserIdRef = useRef<string>('')
  const volcScreenStreamRef = useRef<MediaStream | null>(null)
  const volcMicOnRef = useRef(true)
  const volcMicForcedOffRef = useRef(false)
  const volcMediaTypeRef = useRef<any>(null)
  const volcStreamIndexRef = useRef<any>(null)
  const peerVolumesRef = useRef<Record<string, number>>({})
  const localMicVolumeRef = useRef(VOLC_MIC_VOLUME_DEFAULT)
  const micGainOnRef = useRef(true)
  const screenQualityRef = useRef<ScreenQuality>(1080)
  const screenFpsChoiceRef = useRef<ScreenFps>(60)
  const screenEncodeModeRef = useRef<ScreenEncodeMode>('motion')
  const screenEncodeQualityRef = useRef<ScreenQuality>(1080)
  const screenEncodeFpsRef = useRef<ScreenFps>(60)
  const mediaToastTimerRef = useRef<number | null>(null)
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

  // 成员列表 / 麦设置：点击外部关闭
  useEffect(() => {
    if (!peersMenuOpen && !micMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (peersMenuOpen && peersMenuRef.current && !peersMenuRef.current.contains(t)) {
        setPeersMenuOpen(false)
      }
      if (micMenuOpen && micMenuRef.current && !micMenuRef.current.contains(t)) {
        setMicMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [peersMenuOpen, micMenuOpen])

  // 按显示名批量拉取头像 / QQ
  useEffect(() => {
    const names = new Set<string>()
    if (hostName) names.add(hostName)
    if (myName.current) names.add(myName.current)
    for (const n of viewerNames) if (n) names.add(n)
    for (const p of volcPeers) if (p.name) names.add(p.name)
    const list = [...names]
    if (list.length === 0) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/room/profiles-by-names`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: list }),
        })
        const data = await res.json()
        if (cancelled || !data?.success || !Array.isArray(data.data)) return
        setProfileByName((prev) => {
          const next = { ...prev }
          for (const row of data.data) {
            if (!row?.key) continue
            next[row.key] = {
              nickname: row.nickname || row.key,
              qq: row.qq || null,
              avatar: row.avatar || null,
            }
          }
          return next
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostName, viewerNames, volcPeers])

  useEffect(() => {
    if (guestSession?.nickname) {
      myName.current = guestSession.nickname
    }
  }, [guestSession])

  // 已登录账号优先，清掉残留访客会话
  useEffect(() => {
    if (userType && loadGuestSession()) {
      clearGuestSession()
      setGuestSession(null)
    }
  }, [userType])

  useEffect(() => {
    guestCodeRef.current = guestValidatedCode
  }, [guestValidatedCode])

  // ?guest=1 时若未登录且无访客会话，停留在访客登记；登录用户忽略该参数
  useEffect(() => {
    if (userType && searchParams.get('guest')) {
      searchParams.delete('guest')
      setSearchParams(searchParams, { replace: true })
    }
  }, [userType, searchParams, setSearchParams])

  // ?meeting=CODE：从邀请浮窗 / 管理端会议浮窗一键进入
  useEffect(() => {
    const raw = searchParams.get('meeting')?.trim().toUpperCase()
    if (!raw || raw.length !== 6) return
    if (mode === 'meeting' && meetingCode === raw) return
    if (!userType && !guestSession) return

    fromRequestRef.current = searchParams.get('fromRequest') === '1'

    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${API_URL}/meeting/${raw}`)
        const d = await r.json()
        if (cancelled) return
        if (!r.ok || !d.exists) {
          setErrorMsg(d.error || '会议不存在或已结束')
          const next = new URLSearchParams(searchParams)
          next.delete('meeting')
          next.delete('fromRequest')
          setSearchParams(next, { replace: true })
          return
        }
        setMeetingCode(raw)
        setMeetingInput(raw)
        setMode('meeting')
        const next = new URLSearchParams(searchParams)
        if (next.has('fromRequest')) {
          next.delete('fromRequest')
          setSearchParams(next, { replace: true })
        }
      } catch {
        if (!cancelled) setErrorMsg('无法加入会议，请稍后重试')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, userType, guestSession, mode, meetingCode, setSearchParams])

  // ?room=CODE：从共享邀请浮窗一键进入观看
  useEffect(() => {
    const raw = searchParams.get('room')?.trim().toUpperCase()
    if (!raw || raw.length !== 6) return
    if (!userType && !guestSession) return
    if (roomLinkHandledRef.current === raw) return
    if (mode === 'viewer' && roomCode === raw && (status === 'watching' || status === 'connecting')) return
    if (mode === 'host' && roomCode === raw) return

    roomLinkHandledRef.current = raw
    fromRequestRef.current = searchParams.get('fromRequest') === '1'
    const next = new URLSearchParams(searchParams)
    next.delete('room')
    next.delete('fromRequest')
    setSearchParams(next, { replace: true })
    void handleJoinRoomRef.current(raw)
  }, [searchParams, userType, guestSession, mode, roomCode, status, setSearchParams])

  const buildHostPayload = (modeName: 'peerjs' | 'agora' | 'volc', extra?: Record<string, unknown>) => {
    const payload: Record<string, unknown> = {
      displayName: myName.current || 'host',
      mode: modeName,
      userType: effectiveUserType,
      ...extra,
    }
    if (isGuest && guestCodeRef.current) {
      payload.guestCode = guestCodeRef.current
    }
    return payload
  }

  const enterAsGuest = () => {
    const name = guestNicknameInput.trim()
    if (name.length < 1) {
      setErrorMsg('请输入昵称')
      return
    }
    if (name.length > 24) {
      setErrorMsg('昵称最多 24 个字符')
      return
    }
    const session = saveGuestSession(name)
    setGuestSession(session)
    myName.current = session.nickname
    setErrorMsg('')
    if (searchParams.get('guest')) {
      searchParams.delete('guest')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const exitGuest = () => {
    clearGuestSession()
    setGuestSession(null)
    setGuestValidatedCode('')
    setGuestHostMode(null)
    setGuestHostCodeInput('')
    navigate('/login', { state: { from: { pathname: '/screen-share' } } })
  }

  const validateGuestHostCode = async () => {
    const code = guestHostCodeInput.trim().toUpperCase()
    if (!code) {
      setErrorMsg('请输入访客码')
      return
    }
    setGuestValidating(true)
    setErrorMsg('')
    try {
      const res = await fetch(`${API_URL}/room/guest-codes/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!data.success) {
        setGuestValidatedCode('')
        setGuestHostMode(null)
        setErrorMsg(data.error || '访客码无效')
        return
      }
      setGuestValidatedCode(data.data.code)
      setGuestHostMode(data.data.mode)
      setHostConnMode(data.data.mode)
      if (data.data.mode === 'agora') setConnMode('agora')
      else if (data.data.mode === 'volc') setConnMode('volc')
      else setConnMode('auto')
    } catch {
      setErrorMsg('校验访客码失败')
    } finally {
      setGuestValidating(false)
    }
  }

  // 访客码在开播成功后作废于服务端；本地清掉以免误以为可复用
  useEffect(() => {
    if (isGuest && status === 'streaming') {
      setGuestValidatedCode('')
      setGuestHostMode(null)
      setGuestHostCodeInput('')
      guestCodeRef.current = ''
    }
  }, [isGuest, status])

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
            new Blob([JSON.stringify({ displayName: myName.current, userType: userType || (loadGuestSession() ? 'guest' : undefined) })], { type: 'application/json' })
          )
        } else if (rtcRoleRef.current === 'viewer' && rtcUidRef.current) {
          navigator.sendBeacon(
            `${API_URL}/room/${rid}/leave`,
            new Blob([JSON.stringify({ userId: rtcUidRef.current, displayName: myName.current, userType: userType || (loadGuestSession() ? 'guest' : undefined) })], { type: 'application/json' })
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
        })
          .then((r) => r.json())
          .then((hd) => {
            if (hd?.kicked) kickedExitRef.current?.()
          })
          .catch(() => {})
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
          const mlr = await fetch(`${API_URL}/meeting/logs`)
          const mld = await mlr.json()
          setMeetingLogs(mld.logs || [])
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

  useEffect(() => {
    if (userType !== 'admin' || activeRooms.length === 0) return
    setActiveRoomsPos((prev) => prev ?? {
      x: 16,
      y: Math.max(88, Math.round(window.innerHeight / 2 - 160)),
    })
  }, [userType, activeRooms.length])

  const startActiveRoomsDrag = useCallback((
    e: React.MouseEvent,
    pos: { x: number; y: number }
  ) => {
    e.preventDefault()
    e.stopPropagation()
    activeRoomsDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    }
    const onMove = (ev: MouseEvent) => {
      const drag = activeRoomsDragRef.current
      if (!drag) return
      const cardW = 300
      const cardH = 280
      const nextX = drag.originX + (ev.clientX - drag.startX)
      const nextY = drag.originY + (ev.clientY - drag.startY)
      setActiveRoomsPos({
        x: Math.min(Math.max(8, nextX), Math.max(8, window.innerWidth - cardW - 8)),
        y: Math.min(Math.max(8, nextY), Math.max(8, window.innerHeight - cardH - 8)),
      })
    }
    const onUp = () => {
      activeRoomsDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // 真正进入共享/会议会话时标记忙碌，大厅选房页保持可看「在线房间」
  useEffect(() => {
    const inSession =
      mode === 'meeting' ||
      mode === 'host' ||
      mode === 'viewer' ||
      status === 'connecting' ||
      status === 'streaming' ||
      status === 'watching'
    setLiveSessionBusy(inSession)
  }, [mode, status])

  useEffect(() => {
    return () => setLiveSessionBusy(false)
  }, [])

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
    setScreenFps(null)
    setMicOn(true)
    setMicForcedOff(false)
    setPeersMenuOpen(false)
    setMicMenuOpen(false)
    volcMicOnRef.current = true
    volcMicForcedOffRef.current = false
    setVolcPeers([])
    setForcedMutedIds(new Set())
    kickedViewerIdsRef.current = new Set()
    setPeerVolumes({})
    peerVolumesRef.current = {}
    setLocalMicVolume(VOLC_MIC_VOLUME_DEFAULT)
    localMicVolumeRef.current = VOLC_MIC_VOLUME_DEFAULT
    setMicGainOn(true)
    micGainOnRef.current = true
    setVolcHostUserId('')
    volcHostUserIdRef.current = ''
    volcStreamIndexRef.current = null
    if (volcScreenStreamRef.current) {
      volcScreenStreamRef.current.getTracks().forEach((t) => {
        try { t.stop() } catch {}
      })
      volcScreenStreamRef.current = null
    }
    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current)
      latencyIntervalRef.current = null
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    if (mediaToastTimerRef.current) {
      window.clearTimeout(mediaToastTimerRef.current)
      mediaToastTimerRef.current = null
    }
    setMediaToast(null)
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
      try { _engine.stopAudioCapture() } catch {}
      try { _engine.stopScreenCapture() } catch {}
      // leaveRoom is async; destroy() after a short delay so the leave signal
      // is actually transmitted before the WebSocket is torn down, ensuring
      // peers receive onUserLeave immediately instead of waiting for the 15s timeout.
      Promise.resolve(_engine.leaveRoom()).catch(() => {}).finally(() => {
        try { _engine.destroy() } catch {}
      })
    }
    volcMediaTypeRef.current = null
    if (rtcRoomRef.current) {
      const rid = rtcRoomRef.current
      const endpoint = rtcRoleRef.current === 'host' ? 'close' : 'leave'
      const payload = rtcRoleRef.current === 'host'
        ? { displayName: myName.current, userType: effectiveUserType }
        : { userId: rtcUidRef.current, displayName: myName.current, userType: effectiveUserType }
      // Try close/leave, fallback to force-leave
      fetch(`${API_URL}/room/${rid}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() =>
        fetch(`${API_URL}/room/force-leave`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: myName.current, userType: effectiveUserType }),
        }).catch(() => {})
      )
    }
    volcHostUserIdRef.current = ''
    rtcRoomRef.current = ''
    rtcRoleRef.current = ''
    rtcUidRef.current = ''
    setActiveStreamMode('peerjs')
  }, [])

  kickedExitRef.current = () => {
    cleanup()
    setErrorMsg('你已被移出房间')
    setStatus('error')
    setMode('select')
  }

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
      const { default: VERTC, MediaType, StreamIndex } = volcModule
      const engine = VERTC.createEngine(VOLC_APP_ID)
      volcEngineRef.current = engine
      volcStreamIndexRef.current = StreamIndex
      volcMediaTypeRef.current = MediaType

      const q = screenQualityRef.current
      const f = screenFpsChoiceRef.current
      const em = screenEncodeModeRef.current
      screenEncodeQualityRef.current = q
      screenEncodeFpsRef.current = f
      setScreenHostQuality(q)
      setScreenHostFps(f)
      setScreenQuality(q)
      setScreenFpsChoice(f)
      setScreenEncodeMode(em)

      const enc = getVolcEncoderConfig(q, f, em)
      const modeLabel = em === 'motion' ? '流畅' : '清晰'
      setConnectStep(`获取屏幕共享权限（${enc.height}p${enc.frameRate}fps · ${modeLabel}）...`)
      const rawName = myName.current || 'host'
      const hostUid = rawName.replace(/[^a-zA-Z0-9@\-_.]/g, '_').slice(0, 128) || 'host'

      // 自定义 getDisplayMedia + restrictOwnAudio，避免本标签页语音进系统声回环
      const capture = await startVolcScreenCapture(engine, volcModule, enc)
      volcScreenStreamRef.current = capture.stream
      if (capture.stream) {
        const vTrack = capture.stream.getVideoTracks()[0]
        if (vTrack) {
          vTrack.addEventListener('ended', () => {
            cleanup()
            setErrorMsg('屏幕共享已停止')
            setStatus('error')
            setMode('select')
          })
        }
      }

      setConnectStep('连接火山引擎服务器...')
      const hostRes = await fetch(`${API_URL}/room/${code}/host`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildHostPayload('volc', {
          hostQuality: q,
          hostFps: f,
        })),
      })
      if (hostRes.status === 409) {
        const d = await hostRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      rtcRoomRef.current = code
      rtcRoleRef.current = 'host'
      rtcUidRef.current = hostUid
      volcMediaTypeRef.current = MediaType
      const volcToken = await fetchVolcToken(code, hostUid)
      await engine.joinRoom(volcToken, code, { userId: hostUid, extraInfo: rawName }, {
        isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false,
      })

      setConnectStep('发布屏幕流...')
      await engine.publishScreen(
        capture.hasSystemAudio ? MediaType.AUDIO_AND_VIDEO : MediaType.VIDEO
      )

      // 默认自由麦
      setConnectStep('开启麦克风...')
      try {
        await startVolcMic(engine, MediaType, {
          autoGain: micGainOnRef.current,
          captureVolume: localMicVolumeRef.current,
          StreamIndex,
        })
        setMicOn(true)
        volcMicOnRef.current = true
        setMicForcedOff(false)
        volcMicForcedOffRef.current = false
      } catch (micErr: any) {
        console.warn('[Volc] 主机开麦失败', micErr)
        setMicOn(false)
        volcMicOnRef.current = false
        setMediaToast({ text: '麦克风未开启（可稍后点击麦图标重试）', kind: 'success' })
      }

      engine.on(VERTC.events.onLocalStreamStats, (stats: any) => {
        const rtt = stats?.videoStats?.rtt ?? stats?.audioStats?.rtt
        if (rtt !== undefined) setLatency(Math.round(Number(rtt)))
        const fps = stats?.videoStats?.encoderOutputFrameRate
          ?? stats?.videoStats?.sentFrameRate
          ?? stats?.videoStats?.frameRate
        if (typeof fps === 'number') setScreenFps(Math.round(fps))
      })

      // Track viewers via SDK events (uid -> displayName map)
      const volcViewerMap = new Map<string, string>()
      const peerMicMap = new Map<string, boolean>()
      const syncPeers = () => {
        const list = Array.from(volcViewerMap.entries())
          .filter(([userId]) => !kickedViewerIdsRef.current.has(userId))
          .map(([userId, name]) => ({
            userId,
            name,
            micOn: peerMicMap.get(userId) ?? false,
          }))
        setVolcPeers(list)
        setViewerNames(list.map(p => p.name))
        setViewerCount(list.length)
      }

      engine.on(VERTC.events.onUserJoined, ({ userInfo }: { userInfo: { userId: string; extraInfo?: string } }) => {
        kickedViewerIdsRef.current.delete(userInfo.userId)
        const name = userInfo.extraInfo || userInfo.userId
        for (const [oldUid, oldName] of Array.from(volcViewerMap.entries())) {
          if (oldName === name && oldUid !== userInfo.userId) {
            volcViewerMap.delete(oldUid)
            peerMicMap.delete(oldUid)
            break
          }
        }
        volcViewerMap.set(userInfo.userId, name)
        if (!peerMicMap.has(userInfo.userId)) peerMicMap.set(userInfo.userId, false)
        syncPeers()
      })
      engine.on(VERTC.events.onUserLeave, ({ userInfo }: { userInfo: { userId: string } }) => {
        volcViewerMap.delete(userInfo.userId)
        peerMicMap.delete(userInfo.userId)
        kickedViewerIdsRef.current.delete(userInfo.userId)
        setForcedMutedIds(prev => {
          if (!prev.has(userInfo.userId)) return prev
          const next = new Set(prev)
          next.delete(userInfo.userId)
          return next
        })
        syncPeers()
      })

      engine.on(VERTC.events.onUserPublishStream, async ({ userId, mediaType }: { userId: string; mediaType: number }) => {
        if (userId === hostUid) return
        if (mediaType === MediaType.AUDIO || mediaType === MediaType.AUDIO_AND_VIDEO) {
          await subscribeVolcMic(engine, userId, MediaType, {
            StreamIndex: volcStreamIndexRef.current || StreamIndex,
            playbackVolume: peerVolumesRef.current[userId] ?? VOLC_MIC_VOLUME_DEFAULT,
          })
          peerMicMap.set(userId, true)
          syncPeers()
        }
      })
      engine.on(VERTC.events.onUserUnpublishStream, ({ userId, mediaType }: { userId: string; mediaType: number }) => {
        if (mediaType === MediaType.AUDIO || mediaType === MediaType.AUDIO_AND_VIDEO) {
          peerMicMap.set(userId, false)
          syncPeers()
        }
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
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
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
      const { default: VERTC, MediaType, StreamIndex } = volcModule
      const engine = VERTC.createEngine(VOLC_APP_ID)
      volcEngineRef.current = engine
      volcStreamIndexRef.current = StreamIndex
      volcMediaTypeRef.current = MediaType

      setConnectStep('连接火山引擎服务器...')
      const viewerDisplayName = myName.current || viewerUid
      const viewerRes = await fetch(`${API_URL}/room/${code}/viewer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: viewerUid,
          displayName: viewerDisplayName,
          userType: effectiveUserType,
          memberId: memberIdRef.current,
          fromRequest: fromRequestRef.current || undefined,
        }),
      })
      if (viewerRes.status === 403) {
        const d = await viewerRes.json().catch(() => ({}))
        fromRequestRef.current = false
        throw new Error(d.error || '尚未获得进入许可')
      }
      if (viewerRes.status === 409) {
        const d = await viewerRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      fromRequestRef.current = false
      rtcRoomRef.current = code
      rtcRoleRef.current = 'viewer'
      rtcUidRef.current = viewerUid
      volcMediaTypeRef.current = MediaType
      const roomRes = await viewerRes.json()
      if (roomRes.hostName) setHostName(roomRes.hostName)
      const volcToken = await fetchVolcToken(code, viewerUid)
      await engine.joinRoom(volcToken, code, { userId: viewerUid, extraInfo: viewerDisplayName }, {
        isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false,
      })

      setConnectStep('等待主播视频流...')

      const coViewerMap = new Map<string, string>()
      const peerMicMap = new Map<string, boolean>()
      let knownHostId = ''

      const refreshCoViewers = () => {
        const list = Array.from(coViewerMap.entries()).map(([userId, name]) => ({
          userId,
          name,
          micOn: peerMicMap.get(userId) ?? false,
        }))
        setVolcPeers(list)
        setViewerNames(list.map(p => p.name))
        setViewerCount(list.length)
      }

      const enableViewerMic = async () => {
        try {
          await startVolcMic(engine, MediaType, {
          autoGain: micGainOnRef.current,
          captureVolume: localMicVolumeRef.current,
          StreamIndex,
        })
          setMicOn(true)
          volcMicOnRef.current = true
        } catch (e) {
          console.warn('[Volc] 观众开麦失败', e)
          setMicOn(false)
          volcMicOnRef.current = false
        }
      }

      engine.on(VERTC.events.onUserJoined, ({ userInfo }: { userInfo: { userId: string; extraInfo?: string } }) => {
        if (userInfo.userId === knownHostId) return
        const name = userInfo.extraInfo || userInfo.userId
        if (name === viewerDisplayName) return
        for (const [oldUid, oldName] of Array.from(coViewerMap.entries())) {
          if (oldName === name && oldUid !== userInfo.userId) {
            coViewerMap.delete(oldUid)
            peerMicMap.delete(oldUid)
            break
          }
        }
        coViewerMap.set(userInfo.userId, name)
        if (!peerMicMap.has(userInfo.userId)) peerMicMap.set(userInfo.userId, false)
        refreshCoViewers()
      })
      engine.on(VERTC.events.onUserLeave, ({ userInfo }: { userInfo: { userId: string } }) => {
        coViewerMap.delete(userInfo.userId)
        peerMicMap.delete(userInfo.userId)
        refreshCoViewers()
        if (userInfo.userId === knownHostId) {
          setErrorMsg('主播已停止共享')
          setStatus('error')
          setTimeout(cleanup, 0)
        }
      })

      engine.on(VERTC.events.onUserPublishScreen, async ({ userId }: { userId: string }) => {
        knownHostId = userId
        if (coViewerMap.has(userId)) {
          coViewerMap.delete(userId)
          peerMicMap.delete(userId)
          refreshCoViewers()
        }
        await engine.subscribeScreen(userId, MediaType.AUDIO_AND_VIDEO)
        await subscribeVolcMic(engine, userId, MediaType, {
          StreamIndex: volcStreamIndexRef.current || StreamIndex,
          playbackVolume: peerVolumesRef.current[userId] ?? VOLC_MIC_VOLUME_DEFAULT,
        })
        volcHostUserIdRef.current = userId
        setVolcHostUserId(userId)
        setConnectionInfo('火山引擎 RTC')
        setActiveStreamMode('volc')
        setStatus('watching')
        if (!volcMicForcedOffRef.current) {
          await enableViewerMic()
        }
      })

      engine.on(VERTC.events.onUserPublishStream, async ({ userId, mediaType }: { userId: string; mediaType: number }) => {
        if (userId === viewerUid) return
        if (mediaType === MediaType.AUDIO || mediaType === MediaType.AUDIO_AND_VIDEO) {
          await subscribeVolcMic(engine, userId, MediaType, {
            StreamIndex: volcStreamIndexRef.current || StreamIndex,
            playbackVolume: peerVolumesRef.current[userId] ?? VOLC_MIC_VOLUME_DEFAULT,
          })
          if (userId !== knownHostId) {
            peerMicMap.set(userId, true)
            refreshCoViewers()
          }
        }
      })
      engine.on(VERTC.events.onUserUnpublishStream, ({ userId, mediaType }: { userId: string; mediaType: number }) => {
        if (mediaType === MediaType.AUDIO || mediaType === MediaType.AUDIO_AND_VIDEO) {
          if (userId !== knownHostId) {
            peerMicMap.set(userId, false)
            refreshCoViewers()
          }
        }
      })

      engine.on(VERTC.events.onUserMessageReceived, async ({ message }: { userId: string; message: string }) => {
        const msg = parseVolcVoiceMessage(message)
        if (!msg) return
        if (msg.action === 'force-mute') {
          volcMicForcedOffRef.current = true
          setMicForcedOff(true)
          await stopVolcMic(engine, MediaType)
          setMicOn(false)
          volcMicOnRef.current = false
          setMediaToast({ text: msg.by ? `${msg.by} 已禁言你` : '你已被禁言', kind: 'success' })
        } else if (msg.action === 'force-unmute') {
          volcMicForcedOffRef.current = false
          setMicForcedOff(false)
          setMediaToast({ text: '主播已解除禁言，可自行开麦', kind: 'success' })
        } else if (msg.action === 'force-kick') {
          kickedExitRef.current?.()
          if (msg.by) setErrorMsg(`你已被 ${msg.by} 移出房间`)
        }
      })

      engine.on(VERTC.events.onRemoteStreamStats, (stats: any) => {
        const rtt = stats?.videoStats?.rtt ?? stats?.audioStats?.rtt
        if (rtt !== undefined) setLatency(Math.round(Number(rtt)))
      })

      engine.on(VERTC.events.onUserUnpublishScreen, () => {
        setErrorMsg('主播已停止共享')
        setStatus('error')
        setTimeout(cleanup, 0)
      })

      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = setInterval(async () => {
        try {
          const hr = await fetch(`${API_URL}/room/${code}/heartbeat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: viewerUid }),
          })
          const hd = await hr.json()
          if (hd?.kicked) {
            kickedExitRef.current?.()
            return
          }
        } catch {}
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
      const hostRes = await fetch(`${API_URL}/room/${code}/host`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildHostPayload('agora')),
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
        if (stats && stats.RTT !== undefined) setLatency(Math.round(Number(stats.RTT)))
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
        body: JSON.stringify({
          userId: agoraViewerUid,
          displayName: viewerDisplayName,
          userType: effectiveUserType,
          memberId: memberIdRef.current,
          fromRequest: fromRequestRef.current || undefined,
        }),
      })
      if (viewerRes.status === 403) {
        const d = await viewerRes.json().catch(() => ({}))
        fromRequestRef.current = false
        throw new Error(d.error || '尚未获得进入许可')
      }
      if (viewerRes.status === 409) {
        const d = await viewerRes.json()
        throw new Error(d.error || '该账号已在其他房间中活跃')
      }
      fromRequestRef.current = false
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
        try {
          const hr = await fetch(`${API_URL}/room/${code}/heartbeat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: agoraViewerUid }),
          })
          const hd = await hr.json()
          if (hd?.kicked) {
            kickedExitRef.current?.()
            return
          }
        } catch {}
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
            if (stats && stats.RTT !== undefined) setLatency(Math.round(Number(stats.RTT)))
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

  const checkAlreadyActive = async (): Promise<boolean> => {
    try {
      const r = await fetch(`${API_URL}/room/active-check/${encodeURIComponent(myName.current)}?userType=${effectiveUserType || ''}`)
      const d = await r.json()
      if (d.active) {
        setErrorMsg(`你已经在房间 ${d.roomId} 中${d.role === 'host' ? '分享' : '观看'}，请先退出后再操作`)
        return true
      }
    } catch {}
    return false
  }

  const handleStartHost = async () => {
    if (isGuest) {
      if (!guestValidatedCode || !guestHostMode) {
        setErrorMsg('请先校验访客码')
        return
      }
      if (hostConnMode !== guestHostMode) {
        setHostConnMode(guestHostMode)
      }
    }
    if (await checkAlreadyActive()) return
    if (hostConnMode === 'volc') return handleStartHostVolc()
    if (hostConnMode === 'agora') return handleStartHostAgora()

    setMode('host')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('获取连接配置...')

    try {
      const iceServers = await fetchIceServers()

      // Capture screen first（audio:true 让浏览器弹窗显示「同时分享系统音频」）
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: 30, max: 60 },
        } as MediaTrackConstraints,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      // When user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        handleStop()
      }

      // Create peer with room code
      const code = generateRoomCode()
      setRoomCode(code)

      const hostRes = await fetch(`${API_URL}/room/${code}/host`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildHostPayload('peerjs')),
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

  const handleJoinRoom = async (codeOverride?: string) => {
    const code = (codeOverride ?? inputCode).trim().toUpperCase()
    if (code.length !== 6) {
      setErrorMsg('请输入6位房间代码')
      return
    }
    if (codeOverride) setInputCode(code)

    if (await checkAlreadyActive()) return

    setErrorMsg('')
    setConnectStep('识别房间类型...')
    // 根据主播开房时登记的 mode 自动加入，观众无需手动选连接方式
    let detected: 'peerjs' | 'agora' | 'volc' = 'peerjs'
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
      if (info.mode === 'agora' || info.mode === 'volc' || info.mode === 'peerjs') {
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
      body: JSON.stringify({
        userId: viewerUid,
        displayName: viewerDisplayName,
        userType: effectiveUserType,
        memberId: memberIdRef.current,
        fromRequest: fromRequestRef.current || undefined,
      }),
    })
    if (viewerRes.status === 403) {
      const d = await viewerRes.json().catch(() => ({}))
      fromRequestRef.current = false
      setErrorMsg(d.error || '尚未获得进入许可')
      setStatus('error')
      setMode('select')
      return
    }
    if (viewerRes.status === 409) {
      const d = await viewerRes.json()
      setErrorMsg(d.error || '该账号已在其他房间中活跃')
      setStatus('error')
      setMode('select')
      return
    }
    fromRequestRef.current = false
    rtcRoomRef.current = code
    rtcRoleRef.current = 'viewer'
    rtcUidRef.current = viewerUid

    const roomResData = await viewerRes.json()
    if (roomResData.hostName) setHostName(roomResData.hostName)

    // Heartbeat + viewer list poll every 10s
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
    heartbeatIntervalRef.current = setInterval(async () => {
      try {
        const hr = await fetch(`${API_URL}/room/${code}/heartbeat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: viewerUid }),
        })
        const hd = await hr.json()
        if (hd?.kicked) {
          kickedExitRef.current?.()
          return
        }
      } catch {}
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

  handleJoinRoomRef.current = handleJoinRoom

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

  const showMediaToast = (text: string, kind: 'loading' | 'success') => {
    if (mediaToastTimerRef.current) {
      window.clearTimeout(mediaToastTimerRef.current)
      mediaToastTimerRef.current = null
    }
    setMediaToast({ text, kind })
    if (kind === 'success') {
      mediaToastTimerRef.current = window.setTimeout(() => {
        setMediaToast(null)
        mediaToastTimerRef.current = null
      }, 2200)
    }
  }

  const toggleVolcMic = async () => {
    const engine = volcEngineRef.current
    const MediaType = volcMediaTypeRef.current
    if (!engine || !MediaType || activeStreamMode !== 'volc') return
    if (volcMicOnRef.current) {
      await stopVolcMic(engine, MediaType)
      setMicOn(false)
      volcMicOnRef.current = false
      showMediaToast('已关麦', 'success')
      return
    }
    if (volcMicForcedOffRef.current) {
      showMediaToast('你已被主播禁言，无法开麦', 'success')
      return
    }
    try {
      await startVolcMic(engine, MediaType, {
        autoGain: micGainOnRef.current,
        captureVolume: localMicVolumeRef.current,
        StreamIndex: volcStreamIndexRef.current,
      })
      setMicOn(true)
      volcMicOnRef.current = true
      showMediaToast('已开麦', 'success')
    } catch (e: any) {
      showMediaToast(`开麦失败：${e?.message || '请检查麦克风权限'}`, 'success')
    }
  }

  const peerVolumeBeforeMuteRef = useRef<Record<string, number>>({})

  const handlePeerVolumeChange = (userId: string, percent: number) => {
    const v = Math.max(0, Math.min(VOLC_MIC_VOLUME_MAX, Math.round(percent)))
    peerVolumesRef.current = { ...peerVolumesRef.current, [userId]: v }
    setPeerVolumes(peerVolumesRef.current)
    const engine = volcEngineRef.current
    const StreamIndex = volcStreamIndexRef.current
    if (engine && StreamIndex) setVolcRemoteMicVolume(engine, StreamIndex, userId, v)
    if (v > 0) {
      setAllListenMuted(false)
      delete peerVolumeBeforeMuteRef.current[userId]
    }
  }

  const getRemoteListenTargets = useCallback(() => {
    const ids: string[] = []
    if (mode === 'viewer' && volcHostUserId) ids.push(volcHostUserId)
    for (const p of volcPeers) {
      if (p.userId && !ids.includes(p.userId)) ids.push(p.userId)
    }
    return ids
  }, [mode, volcHostUserId, volcPeers])

  const togglePeerListenMute = (userId: string) => {
    if (activeStreamMode !== 'volc') return
    const cur = peerVolumesRef.current[userId] ?? VOLC_MIC_VOLUME_DEFAULT
    if (cur <= 0) {
      const restore = peerVolumeBeforeMuteRef.current[userId] ?? VOLC_MIC_VOLUME_DEFAULT
      delete peerVolumeBeforeMuteRef.current[userId]
      handlePeerVolumeChange(userId, restore)
    } else {
      peerVolumeBeforeMuteRef.current[userId] = cur
      handlePeerVolumeChange(userId, 0)
    }
  }

  const toggleMuteAllListen = () => {
    const ids = getRemoteListenTargets()
    if (ids.length === 0 || activeStreamMode !== 'volc') return
    const nextMuted = !allListenMuted
    if (nextMuted) {
      for (const id of ids) {
        const cur = peerVolumesRef.current[id] ?? VOLC_MIC_VOLUME_DEFAULT
        if (cur > 0) peerVolumeBeforeMuteRef.current[id] = cur
        peerVolumesRef.current = { ...peerVolumesRef.current, [id]: 0 }
        const engine = volcEngineRef.current
        const StreamIndex = volcStreamIndexRef.current
        if (engine && StreamIndex) setVolcRemoteMicVolume(engine, StreamIndex, id, 0)
      }
    } else {
      for (const id of ids) {
        const restore = peerVolumeBeforeMuteRef.current[id] ?? VOLC_MIC_VOLUME_DEFAULT
        delete peerVolumeBeforeMuteRef.current[id]
        peerVolumesRef.current = { ...peerVolumesRef.current, [id]: restore }
        const engine = volcEngineRef.current
        const StreamIndex = volcStreamIndexRef.current
        if (engine && StreamIndex) setVolcRemoteMicVolume(engine, StreamIndex, id, restore)
      }
    }
    setPeerVolumes({ ...peerVolumesRef.current })
    setAllListenMuted(nextMuted)
    showMediaToast(nextMuted ? '已一键静音远端语音' : '已恢复远端听感音量', 'success')
  }

  const resolveProfile = (name?: string | null) => {
    const key = String(name || '').trim()
    if (!key) return { nickname: '未知', qq: null as string | null, avatar: null as string | null }
    return profileByName[key] || { nickname: key, qq: null, avatar: null }
  }

  const handleLocalMicVolumeChange = (percent: number) => {
    const v = Math.max(0, Math.min(VOLC_MIC_VOLUME_MAX, Math.round(percent)))
    localMicVolumeRef.current = v
    setLocalMicVolume(v)
    const engine = volcEngineRef.current
    const StreamIndex = volcStreamIndexRef.current
    if (engine && StreamIndex && volcMicOnRef.current) {
      setVolcLocalMicVolume(engine, StreamIndex, v)
    }
  }

  const setMicGainEnabled = async (enabled: boolean) => {
    if (micGainOnRef.current === enabled) return
    micGainOnRef.current = enabled
    setMicGainOn(enabled)
    const engine = volcEngineRef.current
    if (engine && volcMicOnRef.current) {
      await setVolcMicAutoGain(engine, enabled)
    }
    showMediaToast(enabled ? '已开启麦克风增益' : '已关闭麦克风增益', 'success')
  }

  const hostForceMutePeer = async (userId: string, mute: boolean) => {
    const engine = volcEngineRef.current
    if (!engine || rtcRoleRef.current !== 'host' || activeStreamMode !== 'volc') return
    const payload = JSON.stringify({
      t: 'ziye-voice',
      action: mute ? 'force-mute' : 'force-unmute',
      by: myName.current || '主播',
    })
    try {
      await engine.sendUserMessage(userId, payload)
      setForcedMutedIds(prev => {
        const next = new Set(prev)
        if (mute) next.add(userId)
        else next.delete(userId)
        return next
      })
      setVolcPeers(prev => prev.map(p => p.userId === userId ? { ...p, micOn: mute ? false : p.micOn } : p))
      showMediaToast(mute ? '已禁言该成员' : '已解除禁言', 'success')
    } catch (e: any) {
      showMediaToast(`操作失败：${e?.message || '请重试'}`, 'success')
    }
  }

  const hostKickViewer = async (userId: string, name?: string) => {
    if (rtcRoleRef.current !== 'host' || !roomCode) return
    try {
      const r = await fetch(`${API_URL}/room/${roomCode}/kick-viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          hostName: myName.current,
          userType: effectiveUserType,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '踢出失败')
      kickedViewerIdsRef.current.add(userId)
      if (Array.isArray(d.viewers)) {
        setViewerNames(d.viewers)
        setViewerCount(d.viewerCount ?? d.viewers.length)
      }
      setVolcPeers((prev) => prev.filter((p) => p.userId !== userId))
      setForcedMutedIds((prev) => {
        if (!prev.has(userId)) return prev
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
      const engine = volcEngineRef.current
      if (engine && activeStreamMode === 'volc') {
        try {
          await engine.sendUserMessage(
            userId,
            JSON.stringify({ t: 'ziye-voice', action: 'force-kick', by: myName.current || '主播' })
          )
        } catch {}
      }
      showMediaToast(`已将 ${name || d.kickedName || '该成员'} 移出房间`, 'success')
    } catch (e: any) {
      showMediaToast(e?.message || '踢出失败', 'success')
    }
  }

  const openInvitePanel = async () => {
    if (!roomCode || mode !== 'host') return
    setInviteOpen(true)
    setInviteQuery('')
    setInviteSelected(new Set())
    setInviteLoading(true)
    try {
      const r = await fetch(
        `${API_URL}/room/${roomCode}/invite-candidates${
          memberIdRef.current ? `?excludeMemberId=${memberIdRef.current}` : ''
        }`
      )
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '加载成员失败')
      setInviteCandidates(d.candidates || [])
    } catch (e: any) {
      setInviteCandidates([])
      showMediaToast(e?.message || '加载成员失败', 'success')
    } finally {
      setInviteLoading(false)
    }
  }

  const toggleInviteSelect = (id: number) => {
    setInviteSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sendInvites = async () => {
    if (inviteBusy || inviteSelected.size === 0 || !roomCode) return
    setInviteBusy(true)
    try {
      const r = await fetch(`${API_URL}/room/${roomCode}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userType: effectiveUserType,
          hostName: myName.current,
          displayName: myName.current,
          memberIds: [...inviteSelected],
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '邀请失败')
      showMediaToast(
        d.invitedCount > 0
          ? `已向 ${d.invitedCount} 位成员发出邀请（对方需已登录学员端）`
          : '没有可邀请的成员',
        'success'
      )
      setInviteOpen(false)
    } catch (e: any) {
      showMediaToast(e?.message || '邀请失败', 'success')
    } finally {
      setInviteBusy(false)
    }
  }

  const applyVolcEncodeLive = async (quality: ScreenQuality, fps: ScreenFps, encodeMode: ScreenEncodeMode) => {
    const engine = volcEngineRef.current
    if (!engine || activeStreamMode !== 'volc' || rtcRoleRef.current !== 'host') return
    const enc = getVolcEncoderConfig(quality, fps, encodeMode)
    screenEncodeQualityRef.current = quality
    screenEncodeFpsRef.current = fps
    screenEncodeModeRef.current = encodeMode
    try {
      await engine.setScreenEncoderConfig(enc)
    } catch (e) {
      console.warn('setScreenEncoderConfig failed', e)
    }
  }

  const handleScreenQualityChange = async (q: ScreenQuality) => {
    if (mode === 'viewer' && q > screenHostQuality) return
    if (q === screenQualityRef.current) return
    const label = getScreenQualityPreset(q).label
    showMediaToast(`正在切换至 ${label}…`, 'loading')
    setScreenQuality(q)
    screenQualityRef.current = q
    if (mode === 'host' || rtcRoleRef.current === 'host') {
      setScreenHostQuality(q)
      await applyVolcEncodeLive(q, screenFpsChoiceRef.current, screenEncodeModeRef.current)
    }
    showMediaToast(`已切换至 ${label}`, 'success')
  }

  const handleScreenFpsChange = async (f: ScreenFps) => {
    if (mode === 'viewer' && f > screenHostFps) return
    if (f === screenFpsChoiceRef.current) return
    showMediaToast(`正在切换至 ${f}fps…`, 'loading')
    setScreenFpsChoice(f)
    screenFpsChoiceRef.current = f
    if (mode === 'host' || rtcRoleRef.current === 'host') {
      setScreenHostFps(f)
      await applyVolcEncodeLive(screenQualityRef.current, f, screenEncodeModeRef.current)
    }
    showMediaToast(`已切换至 ${f}fps`, 'success')
  }

  const handleScreenEncodeModeChange = async (em: ScreenEncodeMode) => {
    if (em === screenEncodeModeRef.current) return
    const opt = SCREEN_ENCODE_MODE_OPTIONS.find(o => o.id === em)
    const label = opt?.label || em
    showMediaToast(`正在切换至${label}模式…`, 'loading')
    setScreenEncodeMode(em)
    screenEncodeModeRef.current = em
    if (mode === 'host' || rtcRoleRef.current === 'host') {
      await applyVolcEncodeLive(screenQualityRef.current, screenFpsChoiceRef.current, em)
    }
    showMediaToast(`已切换至${label}模式`, 'success')
  }

  // Check if student can HOST (share) with a mode - viewing is always allowed
  const canHostMode = (m: 'peerjs' | 'agora' | 'volc'): boolean => {
    if (isGuest) return guestHostMode === m && !!guestValidatedCode
    if (m === 'peerjs') return true
    if (userType === 'admin') return true
    if (rtcPerm.canUseRtc) return true
    if (m === 'agora') return rtcPerm.agora
    if (m === 'volc') return rtcPerm.volc
    return false
  }

  const refreshAssistants = async () => {
    const ar = await fetch(`${API_URL}/room/assistants`)
    const ad = await ar.json()
    setAssistants(ad.assistants || [])
    setAssistantCandidates(ad.candidates || [])
  }

  const isPending = (m: 'agora' | 'volc'): boolean => {
    if (m === 'agora') return rtcPerm.agoraPending
    if (m === 'volc') return rtcPerm.volcPending
    return false
  }

  const rtcModeLabel = (m: string) =>
    m === 'agora' ? '声网 Agora' : m === 'volc' ? '火山引擎' : m

  const rtcModeColor = (m: string) =>
    m === 'agora' ? '#60a5fa' : m === 'volc' ? '#fb923c' : '#9ca3af'

  // Unified mode change handler: syncs hostConnMode and connMode
  const handleModeChange = (m: 'peerjs' | 'agora' | 'volc') => {
    setHostConnMode(m)
    if (m === 'agora') setConnMode('agora')
    else if (m === 'volc') setConnMode('volc')
    else setConnMode('auto')
  }

  // Student: request access to a mode
  const handleRequestAccess = async (m: 'agora' | 'volc') => {
    try {
      await fetch(`${API_URL}/room/rtc-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myName.current, mode: m }),
      })
      const pendingKey = m === 'agora' ? 'agoraPending' : 'volcPending'
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
  const consumePermission = async (m: 'agora' | 'volc', asHost = false) => {
    if (userType === 'admin' || isGuest) return
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

  const modeDescriptions: Record<'peerjs' | 'agora' | 'volc', string> = {
    peerjs: '基于 WebRTC 技术，数据在浏览器间直接传输，延迟最低，但需要网络环境支持',
    agora: '通过声网全球节点中转，连接稳定可靠，适合跨地区使用',
    volc: '通过火山引擎国内节点中转，针对国内网络优化；可调清晰度/帧率/码率',
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

  // 未登录且未登记访客：先选登录或输入昵称
  if (!userType && !guestSession) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-gray-700/50 bg-gray-800/40 backdrop-blur-sm p-6 sm:p-8 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-800 flex items-center justify-center">
              <Monitor size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">屏幕共享</h1>
            <p className="text-gray-500 text-sm">登录账号，或以访客身份观看 / 使用访客码共享</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { state: { from: { pathname: '/screen-share' } } })}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
          >
            登录账号
          </button>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700/60" /></div>
            <div className="relative flex justify-center text-xs"><span className="px-2 bg-transparent text-gray-500">或访客进入</span></div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-400">访客昵称</label>
            <input
              type="text"
              value={guestNicknameInput}
              onChange={(e) => setGuestNicknameInput(e.target.value.slice(0, 24))}
              onKeyDown={(e) => e.key === 'Enter' && enterAsGuest()}
              placeholder="输入显示昵称"
              maxLength={24}
              className="w-full bg-gray-950/60 border border-gray-600/40 rounded-xl px-3 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
            />
            <button
              type="button"
              onClick={enterAsGuest}
              className="w-full py-3 rounded-xl bg-amber-600/25 hover:bg-amber-600/35 border border-amber-500/35 text-amber-100 font-medium transition-colors"
            >
              以访客进入
            </button>
          </div>
          {errorMsg && <p className="text-red-400 text-sm text-center">{errorMsg}</p>}
          <p className="text-gray-600 text-xs leading-relaxed text-center">
            访客可输入房间码观看；发起共享需管理或助教提供的访客码。
          </p>
        </div>
      </div>
    )
  }

  // Mode selection screen
  if (mode === 'meeting' && meetingCode) {
    const meetingUserType: 'admin' | 'student' | 'guest' =
      userType === 'admin' ? 'admin' : userType === 'student' ? 'student' : 'guest'
    return (
      <MeetingRoom
        code={meetingCode}
        displayName={myName.current}
        userType={meetingUserType}
        memberId={memberIdRef.current || getStudentMemberId()}
        avatar={getCurrentAvatar()}
        qq={getCurrentQq()}
        fromRequest={fromRequestRef.current}
        onLeave={(reason) => {
          fromRequestRef.current = false
          setMeetingCode('')
          setMode('select')
          if (reason) setErrorMsg(reason)
          const next = new URLSearchParams(searchParams)
          if (next.has('meeting')) {
            next.delete('meeting')
            setSearchParams(next, { replace: true })
          }
        }}
      />
    )
  }

  if (mode === 'select') {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Admin: draggable active rooms float (考勤进度同款风格) */}
        {userType === 'admin' && activeRooms.length > 0 && activeRoomsPos && createPortal(
          <aside
            className="fixed z-50 w-[18.75rem] pointer-events-none"
            style={{ left: activeRoomsPos.x, top: activeRoomsPos.y }}
            aria-label="正在共享的房间"
          >
            <div className="pointer-events-auto">
              <div className="student-float-panel student-float-panel--purple overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-grab active:cursor-grabbing select-none"
                  onMouseDown={(e) => startActiveRoomsDrag(e, activeRoomsPos)}
                >
                  <div className="p-2.5 rounded-2xl ring-1 shrink-0 bg-purple-400/15 ring-purple-300/20">
                    <Wifi className="text-purple-300" size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-0.5 flex items-center gap-1">
                      <GripVertical size={11} className="opacity-60" />
                      Live Share
                    </div>
                    <h3 className="text-white font-semibold leading-tight flex items-center gap-2">
                      正在共享
                      <span className="inline-flex items-center gap-1 text-xs font-normal text-red-300">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                        </span>
                        {activeRooms.length}
                      </span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    title={activeRoomsCollapsed ? '展开' : '收起'}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setActiveRoomsCollapsed(v => !v)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
                  >
                    <ChevronDown size={16} className={`transition-transform duration-300 ${activeRoomsCollapsed ? '-rotate-90' : ''}`} />
                  </button>
                </div>

                <div className={`collapsible ${activeRoomsCollapsed ? '' : 'open'}`}>
                  <div>
                    <div className="px-4 pb-4 space-y-2.5 max-h-[min(55vh,22rem)] overflow-y-auto sidebar-scrollbar">
                    {activeRooms.map((room) => {
                      const modeLabel = room.mode === 'agora' ? '声网' : room.mode === 'volc' ? '火山' : 'P2P'
                      const modeColor = room.mode === 'agora' ? 'text-blue-300' : room.mode === 'volc' ? 'text-orange-300' : 'text-emerald-300'
                      const busy = !!closingRoomId || !!joiningRoomId
                      return (
                        <div
                          key={room.roomId}
                          className="rounded-xl bg-black/25 border border-white/10 p-3 space-y-2.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                            <span className="text-white text-sm font-medium truncate">{room.hostName}</span>
                            <span className={`text-[11px] font-medium flex-shrink-0 ${modeColor}`}>{modeLabel}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">房间码</div>
                              <div className="font-mono text-base tracking-[0.2em] text-purple-200 font-semibold">
                                {room.roomId}
                              </div>
                            </div>
                            {room.viewerCount > 0 && (
                              <span className="text-[11px] text-white/45 tabular-nums shrink-0">
                                {room.viewerCount} 人观看
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                if (busy) return
                                setJoiningRoomId(room.roomId)
                                try {
                                  await handleJoinRoom(room.roomId)
                                } finally {
                                  setJoiningRoomId(null)
                                }
                              }}
                              disabled={busy}
                              className={`flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                joiningRoomId === room.roomId
                                  ? 'bg-purple-600/35 border-purple-400/40 text-purple-100 cursor-wait'
                                  : busy
                                    ? 'opacity-50 cursor-not-allowed bg-purple-600/15 border-purple-500/25 text-purple-300'
                                    : 'bg-purple-600/25 hover:bg-purple-600/40 border-purple-400/35 text-purple-100'
                              }`}
                            >
                              <LogIn size={13} />
                              {joiningRoomId === room.roomId ? '加入中…' : '一键加入'}
                            </button>
                            <button
                              type="button"
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
                              disabled={busy}
                              className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                                closingRoomId === room.roomId
                                  ? 'bg-red-600/30 border-red-500/40 text-red-300 cursor-wait'
                                  : busy
                                    ? 'opacity-50 cursor-not-allowed bg-red-600/15 border-red-500/25 text-red-400'
                                    : 'bg-red-600/20 hover:bg-red-600/30 border-red-500/30 text-red-400'
                              }`}
                            >
                              <StopCircle size={13} />
                              {closingRoomId === room.roomId ? '关闭中' : '关闭'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>,
          document.body
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

        <div className={`${userType === 'admin' || (userType === 'student' && rtcPerm.isAssistant) ? 'max-w-[1480px]' : 'max-w-4xl'} w-full relative z-10 px-2 sm:px-3 mx-auto`}>
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

          {/* 上行：主操作台（限宽居中） */}
          <div className={`w-full mx-auto ${userType === 'admin' || (userType === 'student' && rtcPerm.isAssistant) ? 'max-w-5xl' : ''}`}>
          {/* 主操作台：左加入 / 右发起 */}
          <div className="anim-reveal-1 rounded-2xl border border-gray-700/50 bg-gray-800/30 backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-5">
              {/* 左：加入 */}
              <div className="md:col-span-3 p-6 sm:p-8 flex flex-col justify-center border-b md:border-b-0 md:border-r border-gray-700/50 relative md:min-h-[260px]">
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
                      onClick={() => handleJoinRoom()}
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
              <div className="md:col-span-2 p-6 sm:p-7 flex flex-col justify-center relative">
                <div className="absolute inset-0 bg-gradient-to-bl from-purple-600/[0.06] to-transparent pointer-events-none" />
                <div className="relative flex flex-col gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Play size={16} className="text-purple-400" />
                      <h2 className="text-base font-bold text-white">发起共享</h2>
                    </div>
                    <p className="text-gray-500 text-xs">
                      {isGuest ? '输入管理/助教发放的访客码后开始' : '选择方式后开始'}
                    </p>
                  </div>

                  {isGuest ? (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={guestHostCodeInput}
                          onChange={(e) => setGuestHostCodeInput(e.target.value.toUpperCase().slice(0, 16))}
                          onKeyDown={(e) => e.key === 'Enter' && validateGuestHostCode()}
                          placeholder="访客码"
                          className="flex-1 min-w-0 bg-gray-950/60 border border-gray-600/40 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 font-mono tracking-wider text-sm uppercase"
                        />
                        <button
                          type="button"
                          onClick={validateGuestHostCode}
                          disabled={guestValidating || !guestHostCodeInput.trim()}
                          className="shrink-0 px-3 py-2.5 rounded-xl bg-amber-600/25 hover:bg-amber-600/35 border border-amber-500/35 text-amber-100 text-sm disabled:opacity-50"
                        >
                          {guestValidating ? '校验…' : '校验'}
                        </button>
                      </div>
                      {guestHostMode && guestValidatedCode && (
                        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                          已绑定访客码 <span className="font-mono">{guestValidatedCode}</span>
                          · 模式{' '}
                          {guestHostMode === 'agora' ? '声网' : guestHostMode === 'volc' ? '火山' : 'WebRTC'}
                        </div>
                      )}
                      {guestHostMode === 'volc' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                            {SCREEN_ENCODE_MODE_OPTIONS.map(o => (
                              <button
                                key={o.id}
                                type="button"
                                title={o.hint}
                                onClick={() => { setScreenEncodeMode(o.id); screenEncodeModeRef.current = o.id }}
                                className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                                  screenEncodeMode === o.id ? 'bg-orange-600/40 text-orange-200' : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                            {SCREEN_QUALITY_OPTIONS.map(o => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => { setScreenQuality(o.id); screenQualityRef.current = o.id }}
                                className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                                  screenQuality === o.id ? 'bg-orange-600/40 text-orange-200' : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                            {SCREEN_FPS_OPTIONS.map(o => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => { setScreenFpsChoice(o.id); screenFpsChoiceRef.current = o.id }}
                                className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                                  screenFpsChoice === o.id ? 'bg-orange-600/40 text-orange-200' : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={handleStartHost}
                        disabled={!guestHostMode || !guestValidatedCode}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-all text-sm"
                      >
                        开始共享
                      </button>
                    </>
                  ) : (
                    <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { key: 'peerjs' as const, label: 'WebRTC', icon: Wifi, color: 'emerald' },
                      { key: 'agora' as const, label: '声网', icon: Globe, color: 'blue' },
                      { key: 'volc' as const, label: '火山', icon: Zap, color: 'orange' },
                    ]).map(({ key, label, icon: Icon, color }) => {
                      const isActive = hostConnMode === key
                      const colorMap: Record<string, { active: string; icon: string }> = {
                        emerald: { active: 'border-emerald-500/55 bg-emerald-500/10', icon: 'text-emerald-400' },
                        blue: { active: 'border-blue-500/55 bg-blue-500/10', icon: 'text-blue-400' },
                        orange: { active: 'border-orange-500/55 bg-orange-500/10', icon: 'text-orange-400' },
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

                  {hostConnMode === 'volc' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                        {SCREEN_ENCODE_MODE_OPTIONS.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            title={o.hint}
                            onClick={() => { setScreenEncodeMode(o.id); screenEncodeModeRef.current = o.id }}
                            className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                              screenEncodeMode === o.id ? 'bg-orange-600/40 text-orange-200' : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                        {SCREEN_QUALITY_OPTIONS.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            title={`${o.label} · 约 ${getVolcMaxKbps(o.id, screenFpsChoice, screenEncodeMode)}kbps`}
                            onClick={() => { setScreenQuality(o.id); screenQualityRef.current = o.id }}
                            className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                              screenQuality === o.id ? 'bg-orange-600/40 text-orange-200' : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-0.5 bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5">
                        {SCREEN_FPS_OPTIONS.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => { setScreenFpsChoice(o.id); screenFpsChoiceRef.current = o.id }}
                            className={`flex-1 px-1 py-1 rounded text-[11px] font-medium transition-colors ${
                              screenFpsChoice === o.id ? 'bg-orange-600/40 text-orange-200' : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    {canHostMode(hostConnMode) ? (
                      <button onClick={handleStartHost}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg font-medium transition-all text-sm hover:shadow-[0_0_18px_rgba(147,51,234,0.28)]">
                        开始共享
                      </button>
                    ) : rtcPerm.isAssistant && (hostConnMode === 'agora' || hostConnMode === 'volc') ? (
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
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* 会议房入口（腾讯会议式）：管理可创建，所有人可加入 */}
          {!isGuest && (
            <div className={`mt-4 w-full mx-auto ${userType === 'admin' || (userType === 'student' && rtcPerm.isAssistant) ? 'max-w-5xl' : 'max-w-4xl'}`}>
              <div className="anim-reveal-2 rounded-2xl border border-cyan-500/20 bg-gray-800/30 backdrop-blur-sm p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Video size={16} className="text-cyan-400" />
                  <h2 className="text-base font-bold text-white">会议房间</h2>
                  <span className="text-[10px] uppercase tracking-wider text-cyan-400/70">Meeting</span>
                </div>
                <p className="text-gray-500 text-xs mb-4">
                  多人语音会议 + 轮流共享屏幕。仅管理员可创建；助教共享扣次数，普通成员需管理员批准。
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  {userType === 'admin' && (
                    <button
                      type="button"
                      disabled={meetingCreating}
                      onClick={async () => {
                        setMeetingCreating(true)
                        setErrorMsg('')
                        try {
                          const r = await fetch(`${API_URL}/meeting/create`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              adminName: myName.current,
                              userType: 'admin',
                              title: '紫夜会议',
                            }),
                          })
                          const d = await r.json()
                          if (!r.ok || !d.success) throw new Error(d.error || '创建失败')
                          setMeetingCode(d.code)
                          setMode('meeting')
                          setSearchParams({ meeting: d.code }, { replace: true })
                        } catch (e: any) {
                          setErrorMsg(e?.message || '创建会议失败')
                        } finally {
                          setMeetingCreating(false)
                        }
                      }}
                      className="sm:w-40 shrink-0 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:from-gray-700 disabled:to-gray-700 text-white text-sm font-semibold transition-all"
                    >
                      {meetingCreating ? '创建中…' : '创建会议'}
                    </button>
                  )}
                  <div className="flex-1 flex gap-2 min-w-0">
                    <input
                      type="text"
                      value={meetingInput}
                      onChange={(e) => setMeetingInput(e.target.value.toUpperCase().slice(0, 6))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && meetingInput.length === 6) {
                          ;(e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click()
                        }
                      }}
                      placeholder="会 议 号"
                      maxLength={6}
                      className="meeting-code-input flex-1 min-w-0 bg-gray-950/60 border border-gray-600/40 rounded-xl px-3 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-mono text-lg tracking-[0.3em] text-center uppercase"
                    />
                    <button
                      type="button"
                      disabled={meetingInput.length !== 6 || meetingJoining}
                      onClick={async () => {
                        const c = meetingInput.trim().toUpperCase()
                        if (c.length !== 6) return
                        setMeetingJoining(true)
                        setErrorMsg('')
                        try {
                          const r = await fetch(`${API_URL}/meeting/${c}`)
                          const d = await r.json()
                          if (!r.ok || !d.exists) throw new Error(d.error || '会议不存在或已结束')
                          setMeetingCode(c)
                          setMode('meeting')
                          setSearchParams({ meeting: c }, { replace: true })
                        } catch (e: any) {
                          setErrorMsg(e?.message || '加入会议失败')
                        } finally {
                          setMeetingJoining(false)
                        }
                      }}
                      className="w-24 shrink-0 py-3 rounded-xl bg-cyan-600/25 hover:bg-cyan-600/40 border border-cyan-500/35 text-cyan-100 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {meetingJoining ? '…' : '进会议'}
                    </button>
                  </div>
                </div>

                {/* 会议记录（meeting_rooms） */}
                {userType === 'admin' && (() => {
                  const filtered = meetingLogs.filter((l) => {
                    if (!meetingLogSearch) return true
                    const q = meetingLogSearch.toLowerCase()
                    return (
                      l.code.toLowerCase().includes(q) ||
                      (l.title || '').toLowerCase().includes(q) ||
                      (l.created_by || '').toLowerCase().includes(q)
                    )
                  })
                  const totalPages = Math.max(1, Math.ceil(filtered.length / MEETING_LOG_PAGE_SIZE))
                  const safePage = Math.min(meetingLogPage, totalPages)
                  const paged = filtered.slice((safePage - 1) * MEETING_LOG_PAGE_SIZE, safePage * MEETING_LOG_PAGE_SIZE)
                  const handleDeleteClick = (id: number) => {
                    if (meetingDeleteConfirmId === id) {
                      setMeetingDeleteConfirmId(null)
                      setMeetingDeletePassword('')
                      setMeetingDeleteError('')
                      return
                    }
                    setMeetingDeleteConfirmId(id)
                    setMeetingDeletePassword('')
                    setMeetingDeleteError('')
                  }
                  const handleDeleteSubmit = async (id: number) => {
                    if (meetingDeletingId) return
                    if (!meetingDeletePassword) {
                      setMeetingDeleteError('请输入密码')
                      return
                    }
                    setMeetingDeletingId(id)
                    setMeetingDeleteError('')
                    const r = await fetch(`${API_URL}/meeting/logs/${id}`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ password: meetingDeletePassword }),
                    }).catch(() => null)
                    setMeetingDeletingId(null)
                    if (!r || !r.ok) {
                      if (r && r.status === 403) {
                        setMeetingDeleteError('密码错误')
                        return
                      }
                      const d = r ? await r.json().catch(() => ({})) : {}
                      setMeetingDeleteError(d.error || '删除失败')
                      return
                    }
                    setMeetingLogs((prev) => prev.filter((l) => l.id !== id))
                    setMeetingDeleteConfirmId(null)
                    setMeetingDeletePassword('')
                  }
                  const confirmEndMeeting = async () => {
                    if (!meetingEndConfirm || meetingEnding) return
                    setMeetingEnding(true)
                    try {
                      const r = await fetch(`${API_URL}/meeting/${meetingEndConfirm.code}/close`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          adminName: getCurrentUsername(),
                          userType: 'admin',
                        }),
                      })
                      const d = await r.json()
                      if (!r.ok || d.success === false) throw new Error(d.error || '结束失败')
                      setMeetingLogs((prev) =>
                        prev.map((l) =>
                          l.code === meetingEndConfirm.code
                            ? { ...l, live: false, status: 'closed', closed_at: new Date().toISOString(), memberCount: null }
                            : l
                        )
                      )
                      setMeetingEndConfirm(null)
                    } catch (e: any) {
                      setErrorMsg(e?.message || '结束会议失败')
                    } finally {
                      setMeetingEnding(false)
                    }
                  }
                  return (
                    <div className="mt-4 rounded-xl border border-cyan-500/15 bg-black/20 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMeetingLogsOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="text-gray-300 text-sm font-semibold flex items-center gap-2">
                          <Video size={15} className="text-cyan-400" />
                          会议记录
                          <span className="text-gray-600 text-xs font-normal">({meetingLogs.length})</span>
                        </span>
                        <ChevronDown size={15} className={`text-gray-500 transition-transform duration-300 ${meetingLogsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {meetingLogsOpen && (
                        <div className="border-t border-cyan-500/10 px-3.5 py-3 max-h-[min(42vh,22rem)] overflow-y-auto sidebar-scrollbar">
                          <div className="relative mb-2.5">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                              value={meetingLogSearch}
                              onChange={(e) => {
                                setMeetingLogSearch(e.target.value)
                                setMeetingLogPage(1)
                              }}
                              placeholder="搜索会议号 / 标题 / 发起人"
                              className="w-full pl-8 pr-3 py-1.5 bg-gray-950/50 border border-gray-700/45 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
                            />
                          </div>
                          {filtered.length === 0 ? (
                            <p className="text-gray-600 text-xs text-center py-4">
                              {meetingLogs.length === 0 ? '暂无会议记录' : '无匹配记录'}
                            </p>
                          ) : (
                            <>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-[#12161c]/95 backdrop-blur-sm z-10">
                                    <tr className="text-gray-500 border-b border-gray-700/40">
                                      <th className="text-left py-2 px-1.5 font-medium">会议号</th>
                                      <th className="text-left py-2 px-1.5 font-medium">标题</th>
                                      <th className="text-left py-2 px-1.5 font-medium">发起人</th>
                                      <th className="text-left py-2 px-1.5 font-medium">时间</th>
                                      <th className="text-left py-2 px-1.5 font-medium">状态</th>
                                      <th className="text-right py-2 px-1.5 font-medium w-16">操作</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {paged.map((log) => {
                                      const startTime = new Date(log.created_at).toLocaleString('zh-CN', {
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                      const isLive = !!log.live
                                      let duration = ''
                                      if (log.closed_at) {
                                        const ms = new Date(log.closed_at).getTime() - new Date(log.created_at).getTime()
                                        const mins = Math.floor(ms / 60000)
                                        duration =
                                          mins < 1
                                            ? '<1分钟'
                                            : mins < 60
                                              ? `${mins}分钟`
                                              : `${Math.floor(mins / 60)}小时${mins % 60}分`
                                      }
                                      return (
                                        <React.Fragment key={log.id}>
                                          <tr className="border-b border-gray-800/40 hover:bg-white/[0.02] group">
                                            <td className="py-2 px-1.5 font-mono tracking-wider text-cyan-200/90">{log.code}</td>
                                            <td className="py-2 px-1.5 text-white/80 truncate max-w-[7rem]" title={log.title}>{log.title}</td>
                                            <td className="py-2 px-1.5 text-gray-300">{log.created_by}</td>
                                            <td className="py-2 px-1.5 text-gray-400 whitespace-nowrap">{startTime}</td>
                                            <td className="py-2 px-1.5">
                                              {isLive ? (
                                                <span className="inline-flex items-center gap-1 text-cyan-300">
                                                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                                                  进行中{typeof log.memberCount === 'number' ? ` · ${log.memberCount}人` : ''}
                                                </span>
                                              ) : (
                                                <span className="text-gray-500">{duration || '已结束'}</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-1.5 text-right">
                                              {isLive ? (
                                                <button
                                                  type="button"
                                                  onClick={() => setMeetingEndConfirm({ code: log.code })}
                                                  title="结束会议"
                                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-red-300 hover:bg-red-600/20 border border-red-500/25"
                                                >
                                                  <PhoneOff size={11} />
                                                  结束
                                                </button>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteClick(log.id)}
                                                  title="删除"
                                                  className={`p-1 rounded transition-all ${
                                                    meetingDeleteConfirmId === log.id
                                                      ? 'opacity-100 bg-red-600/20 text-red-400'
                                                      : 'opacity-0 group-hover:opacity-100 hover:bg-red-600/20 text-gray-600 hover:text-red-400'
                                                  }`}
                                                >
                                                  <Trash2 size={13} />
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                          {meetingDeleteConfirmId === log.id && (
                                            <tr className="bg-gray-900/40">
                                              <td colSpan={6} className="p-0">
                                                <div className="flex items-center gap-2 px-2 py-2">
                                                  <input
                                                    type="password"
                                                    value={meetingDeletePassword}
                                                    onChange={(e) => {
                                                      setMeetingDeletePassword(e.target.value)
                                                      setMeetingDeleteError('')
                                                    }}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleDeleteSubmit(log.id)}
                                                    placeholder="输入删除密码"
                                                    autoFocus
                                                    className="bg-gray-800/60 border border-gray-600/50 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 w-32"
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => handleDeleteSubmit(log.id)}
                                                    disabled={!!meetingDeletingId}
                                                    className="px-2.5 py-1 rounded text-xs font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400"
                                                  >
                                                    {meetingDeletingId === log.id ? '删除中...' : '确认删除'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setMeetingDeleteConfirmId(null)
                                                      setMeetingDeletePassword('')
                                                      setMeetingDeleteError('')
                                                    }}
                                                    className="px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300"
                                                  >
                                                    取消
                                                  </button>
                                                  {meetingDeleteError && (
                                                    <span className="text-red-400 text-xs">{meetingDeleteError}</span>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-2.5">
                                  <span className="text-gray-600 text-[11px]">共 {filtered.length} 条</span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setMeetingLogPage((p) => Math.max(1, p - 1))}
                                      disabled={safePage <= 1}
                                      className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed"
                                    >
                                      上一页
                                    </button>
                                    <span className="text-gray-500 text-xs">{safePage} / {totalPages}</span>
                                    <button
                                      type="button"
                                      onClick={() => setMeetingLogPage((p) => Math.min(totalPages, p + 1))}
                                      disabled={safePage >= totalPages}
                                      className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed"
                                    >
                                      下一页
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {meetingEndConfirm && createPortal(
                        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
                          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a22] ring-1 ring-white/10 shadow-2xl p-5 space-y-4">
                            <h3 className="text-white font-semibold text-base">结束会议</h3>
                            <p className="text-sm text-white/65 leading-relaxed">
                              确定结束会议{' '}
                              <span className="font-mono text-cyan-300 tracking-wider">{meetingEndConfirm.code}</span>
                              ？所有成员将被移出。
                            </p>
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setMeetingEndConfirm(null)}
                                disabled={meetingEnding}
                                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={confirmEndMeeting}
                                disabled={meetingEnding}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
                              >
                                {meetingEnding ? '结束中…' : '确定结束'}
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* 下行：助教管理 | 共享记录 | 访客码 */}
          {userType === 'admin' && (
            <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
              <aside className="anim-slide-l min-w-0">
                <ScreenShareAssistantPanel
                  defaultOpen
                  assistants={assistants}
                  candidates={assistantCandidates}
                  onRefresh={refreshAssistants}
                />
              </aside>

              <div className="min-w-0">
            {(() => {
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
              <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl overflow-hidden anim-fade-last w-full">
                <button
                  type="button"
                  onClick={() => setLogsOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
                >
                  <span className="text-gray-300 text-sm font-semibold flex items-center gap-2">
                    <Monitor size={16} className="text-purple-400" />
                    共享记录
                    <span className="text-gray-600 text-xs font-normal">({shareLogs.length})</span>
                  </span>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform duration-300 ${logsOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`collapsible ${logsOpen ? 'open' : ''}`}>
                  <div>
                    <div className="px-4 pb-4 max-h-[min(50vh,28rem)] overflow-y-auto sidebar-scrollbar flex flex-col">
                    <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
                      <div className="relative flex-1 min-w-[120px]">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input value={logSearch} onChange={e => { setLogSearch(e.target.value); setLogPage(1) }}
                          placeholder="搜索发起人或房间号"
                          className="w-full pl-8 pr-3 py-1.5 bg-gray-900/50 border border-gray-700/50 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40" />
                      </div>
                      <div className="flex flex-wrap gap-1">
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
                            <thead className="sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
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
                          <div className="flex items-center justify-between mt-3 shrink-0">
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
              </div>

              <aside className="anim-slide-r min-w-0">
                <ScreenShareGuestCodesPanel
                  role="admin"
                  defaultOpen
                  creatorName={myName.current}
                />
              </aside>
            </div>
          )}

          {/* 助教：操作台下方访客码 */}
          {userType === 'student' && rtcPerm.isAssistant && (memberIdRef.current || getStudentMemberId()) && (
            <div className="mt-4 max-w-5xl mx-auto anim-slide-r">
              <ScreenShareGuestCodesPanel
                role="assistant"
                defaultOpen
                memberId={memberIdRef.current || getStudentMemberId() || undefined}
                creatorName={myName.current}
                onConsumedQuota={async () => {
                  const mid = memberIdRef.current || getStudentMemberId()
                  const q = mid ? `?memberId=${mid}` : ''
                  const r = await fetch(`${API_URL}/room/rtc-permission/${encodeURIComponent(myName.current)}${q}`)
                  const d = await r.json()
                  setRtcPerm(d)
                }}
              />
            </div>
          )}

          {isGuest && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 anim-fade-last">
              <div className="min-w-0 text-sm text-amber-100/90">
                访客身份：<span className="font-medium text-white">{guestSession?.nickname}</span>
                <span className="text-gray-500 text-xs ml-2">可观看；共享需访客码</span>
              </div>
              <button
                type="button"
                onClick={exitGuest}
                className="shrink-0 text-xs text-gray-400 hover:text-white px-2 py-1 rounded-md border border-gray-700/60"
              >
                退出访客
              </button>
            </div>
          )}

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
                  可直接使用声网 / 火山引擎分享，无需逐次审批。
                  {rtcPerm.quotaRemaining == null
                    ? ' 次数不限。'
                    : ` 剩余 ${rtcPerm.quotaRemaining} 次（已用 ${rtcPerm.screenShareUsed ?? 0} 次）。`}
                  {' '}也可生成访客码给无账号访客发起共享（生成时扣一次次数）。
                </p>
              ) : !rtcPerm.screenShareEnabled ? (
                <p className="text-gray-500 text-xs">管理员已关闭您的屏幕共享权限，请联系管理员。</p>
              ) : (
                <p className="text-gray-500 text-xs">声网 / 火山共享次数已用完，请联系管理员增加配额或重置次数。</p>
              )}
            </div>
          )}

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
  const volcStatsChip = activeStreamMode === 'volc' && (screenFps !== null || latency !== null) ? (
    <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1 font-mono text-xs tabular-nums">
      {screenFps !== null && <span className="text-cyan-300">{screenFps}fps</span>}
      {screenFps !== null && latency !== null && <span className="text-gray-600">·</span>}
      {latency !== null && (
        <span className={latency < 50 ? 'text-green-400' : latency < 150 ? 'text-yellow-400' : 'text-red-400'}>
          {Math.round(latency)}ms
        </span>
      )}
    </div>
  ) : null

  const volcMediaControls = activeStreamMode === 'volc' && mode === 'host' ? (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center bg-gray-800/60 border border-gray-700/50 rounded-lg p-0.5" title="编码模式">
        {SCREEN_ENCODE_MODE_OPTIONS.map(o => (
          <button
            key={o.id}
            type="button"
            title={o.hint}
            onClick={() => handleScreenEncodeModeChange(o.id)}
            className={`min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              screenEncodeMode === o.id
                ? 'bg-orange-600/45 text-orange-100'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/40'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex items-center bg-gray-800/60 border border-gray-700/50 rounded-lg p-0.5" title="清晰度（影响码率）">
        {SCREEN_QUALITY_OPTIONS.map(o => (
          <button
            key={o.id}
            type="button"
            title={`${o.label} · 最高约 ${getVolcMaxKbps(o.id, screenFpsChoice, screenEncodeMode)}kbps`}
            onClick={() => handleScreenQualityChange(o.id)}
            className={`min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              screenQuality === o.id
                ? 'bg-orange-600/45 text-orange-100'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/40'
            }`}
          >
            {o.id}
          </button>
        ))}
      </div>
      <div className="flex items-center bg-gray-800/60 border border-gray-700/50 rounded-lg p-0.5" title="帧率">
        {SCREEN_FPS_OPTIONS.map(o => (
          <button
            key={o.id}
            type="button"
            title={o.label}
            onClick={() => handleScreenFpsChange(o.id)}
            className={`min-w-[2.75rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              screenFpsChoice === o.id
                ? 'bg-orange-600/45 text-orange-100'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/40'
            }`}
          >
            {o.id}
          </button>
        ))}
      </div>
    </div>
  ) : null

  const volumeSliderClass =
    'flex-1 h-1.5 appearance-none bg-gray-700/80 rounded-full outline-none cursor-pointer ' +
    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 ' +
    '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:border-0 ' +
    '[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(147,51,234,0.25)] ' +
    '[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full ' +
    '[&::-moz-range-thumb]:bg-purple-400 [&::-moz-range-thumb]:border-0'

  const peerListenVolume = (userId: string) => {
    const vol = peerVolumes[userId] ?? VOLC_MIC_VOLUME_DEFAULT
    const muted = vol <= 0
    return (
      <div className="flex items-center gap-1.5 w-full mt-1.5" title="听感音量：只改你这边听到的大小">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            togglePeerListenMute(userId)
          }}
          className={`shrink-0 p-0.5 rounded transition-colors ${
            muted ? 'text-orange-400 hover:text-orange-300' : 'text-gray-500 hover:text-white'
          }`}
          title={muted ? '取消静音此人' : '静音此人（仅本机听感）'}
        >
          {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
        <input
          type="range"
          min={0}
          max={VOLC_MIC_VOLUME_MAX}
          step={5}
          value={vol}
          onChange={(e) => handlePeerVolumeChange(userId, Number(e.target.value))}
          className={volumeSliderClass}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="text-gray-500 text-[10px] tabular-nums w-9 text-right">
          {vol}%
        </span>
      </div>
    )
  }

  const renderNameWithAvatar = (name: string, opts?: {
    badge?: string
    micOn?: boolean
    forcedMute?: boolean
    size?: 'sm' | 'md'
  }) => {
    const profile = resolveProfile(name)
    const size = opts?.size || 'sm'
    const forced = !!opts?.forcedMute
    return (
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <MemberAvatar
          avatar={profile.avatar}
          qq={profile.qq}
          name={profile.nickname || name}
          size={size}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {typeof opts?.micOn === 'boolean' && (
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  forced ? 'bg-orange-400' : opts.micOn ? 'bg-green-500' : 'bg-gray-500'
                }`}
              />
            )}
            <span
              className={`text-sm truncate ${forced ? 'text-orange-200/90' : 'text-gray-200'}`}
              title={profile.nickname || name}
            >
              {profile.nickname || name}
            </span>
            {forced && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-400 shrink-0" title="已被主播禁言">
                <MicOff size={10} />
                禁言
              </span>
            )}
            {opts?.badge && !forced && (
              <span className="text-[10px] text-gray-500 shrink-0">{opts.badge}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  /** 左侧在线成员（展示用） */
  const onlineMemberRows: {
    key: string
    name: string
    micOn?: boolean
    badge?: string
    forcedMute?: boolean
  }[] = []
  if (mode === 'viewer' && (hostName || volcHostUserId)) {
    onlineMemberRows.push({ key: 'host', name: hostName || '主播', badge: '主播', micOn: true })
  }
  if (mode === 'host') {
    onlineMemberRows.push({
      key: 'self-host',
      name: myName.current || '主播',
      badge: '我',
      micOn: micOn && !micForcedOff,
      forcedMute: micForcedOff,
    })
  }
  if (mode === 'viewer') {
    onlineMemberRows.push({
      key: 'self-viewer',
      name: myName.current || '我',
      badge: '我',
      micOn: micOn && !micForcedOff,
      forcedMute: micForcedOff,
    })
  }
  if (activeStreamMode === 'volc' && volcPeers.length > 0) {
    for (const p of volcPeers) {
      const forced = forcedMutedIds.has(p.userId)
      onlineMemberRows.push({
        key: p.userId,
        name: p.name,
        micOn: p.micOn && !forced,
        forcedMute: forced,
      })
    }
  } else {
    for (const n of viewerNames) {
      if (n && n !== myName.current) onlineMemberRows.push({ key: `vn-${n}`, name: n, micOn: true })
    }
  }

  /** 右侧可调听感的远端 */
  const remoteVolumeTargets: { userId: string; name: string }[] = []
  if (activeStreamMode === 'volc') {
    if (mode === 'viewer' && volcHostUserId) {
      remoteVolumeTargets.push({ userId: volcHostUserId, name: hostName || '主播' })
    }
    for (const p of volcPeers) {
      remoteVolumeTargets.push({ userId: p.userId, name: p.name })
    }
  }

  const showSidePanels =
    (status === 'streaming' || status === 'watching') && !isFullscreen

  const leftMembersPanel = showSidePanels ? (
    <aside className="w-52 shrink-0 flex flex-col student-glass-panel student-glass-panel--static overflow-hidden self-stretch min-h-0">
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center gap-2">
        <Users size={14} className="text-purple-300" />
        <span className="text-white text-sm font-medium">在线成员</span>
        <span className="text-gray-500 text-xs ml-auto">{onlineMemberRows.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 sidebar-scrollbar">
        {onlineMemberRows.length === 0 ? (
          <p className="text-gray-500 text-xs px-2 py-4 text-center">暂无在线成员</p>
        ) : (
          onlineMemberRows.map((row) => (
            <div
              key={row.key}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 ${
                row.forcedMute ? 'bg-orange-500/10 border border-orange-500/20' : ''
              }`}
            >
              {renderNameWithAvatar(row.name, {
                badge: row.badge,
                micOn: row.micOn,
                forcedMute: row.forcedMute,
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  ) : null

  const rightVolumePanel = showSidePanels ? (
    <aside className="w-64 shrink-0 flex flex-col student-glass-panel student-glass-panel--static overflow-hidden self-stretch min-h-0">
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Volume2 size={14} className="text-purple-300 shrink-0" />
          <span className="text-white text-sm font-medium truncate">听感音量</span>
        </div>
        {activeStreamMode === 'volc' && remoteVolumeTargets.length > 0 && (
          <button
            type="button"
            onClick={toggleMuteAllListen}
            className={`shrink-0 text-xs px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors ${
              allListenMuted
                ? 'bg-orange-600/30 text-orange-200 hover:bg-orange-600/40'
                : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
            title={allListenMuted ? '恢复远端听感' : '一键静音远端语音（仅本机）'}
          >
            {allListenMuted ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {allListenMuted ? '取消静音' : '一键静音'}
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 sidebar-scrollbar">
        {activeStreamMode !== 'volc' ? (
          <p className="text-gray-500 text-xs px-2 py-4 text-center leading-relaxed">
            语音仅火山引擎可用
          </p>
        ) : remoteVolumeTargets.length === 0 ? (
          <p className="text-gray-500 text-xs px-2 py-4 text-center">暂无可调音量的远端成员</p>
        ) : (
          remoteVolumeTargets.map((t) => (
            <div key={t.userId} className="px-2 py-2 rounded-lg bg-white/[0.03] border border-white/5">
              {renderNameWithAvatar(t.name)}
              {peerListenVolume(t.userId)}
            </div>
          ))
        )}
      </div>
    </aside>
  ) : null

  const volcMicControl = activeStreamMode === 'volc' ? (
    <div className="relative flex items-stretch" ref={micMenuRef}>
      <button
        type="button"
        onClick={toggleVolcMic}
        title={micForcedOff ? '已被禁言' : micOn ? '关麦' : '开麦'}
        className={`flex items-center gap-1 rounded-l-lg px-2.5 py-1.5 border border-r-0 text-sm transition-colors ${
          micOn
            ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
            : 'bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-white'
        }`}
      >
        {micOn ? <Mic size={14} /> : <MicOff size={14} />}
        <span className="hidden sm:inline">{micOn ? '开麦' : micForcedOff ? '禁言中' : '关麦'}</span>
      </button>
      <button
        type="button"
        onClick={() => { setPeersMenuOpen(false); setMicMenuOpen(v => !v) }}
        title="麦克风设置"
        className={`flex items-center px-1.5 rounded-r-lg border text-sm transition-colors ${
          micOn
            ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300/80 hover:text-emerald-200'
            : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-white'
        } ${micMenuOpen ? 'ring-1 ring-purple-500/40' : ''}`}
      >
        <ChevronDown size={14} className={`transition-transform ${micMenuOpen ? 'rotate-180' : ''}`} />
      </button>
      {micMenuOpen && (
        <div className="absolute top-full left-0 mt-1 z-30 pt-1">
          <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700/80 rounded-xl shadow-xl py-3 px-3 w-[240px]">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-gray-400 text-xs font-medium">麦克风设置</p>
              <button type="button" onClick={() => setMicMenuOpen(false)} className="text-gray-600 hover:text-gray-300 p-0.5">
                <X size={12} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-gray-500 text-xs">发送音量</span>
                  <span className="text-purple-300/90 text-[11px] tabular-nums font-mono">{localMicVolume}%</span>
                </div>
                <div className="flex items-center gap-2" title="只影响对方听到你的大小">
                  <Volume2 size={12} className="text-gray-500 shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={VOLC_MIC_VOLUME_MAX}
                    step={5}
                    value={localMicVolume}
                    onChange={(e) => handleLocalMicVolumeChange(Number(e.target.value))}
                    className={volumeSliderClass}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-gray-500 text-xs">麦克风增益</span>
                  <span className="text-gray-600 text-[10px]">AGC</span>
                </div>
                <div
                  className="flex items-center bg-gray-900/50 border border-gray-700/45 rounded-lg p-0.5"
                  title="自动增益：小声抬高、大声压低。AI 降噪开启时可能由引擎强制开启"
                >
                  <button
                    type="button"
                    onClick={() => { void setMicGainEnabled(true) }}
                    className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                      micGainOn
                        ? 'bg-purple-600/40 text-purple-200'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    开启
                  </button>
                  <button
                    type="button"
                    onClick={() => { void setMicGainEnabled(false) }}
                    className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                      !micGainOn
                        ? 'bg-purple-600/40 text-purple-200'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  ) : null

  const inviteFiltered = inviteCandidates.filter((c) => {
    const q = inviteQuery.trim().toLowerCase()
    if (!q) return true
    return (
      c.nickname.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      (c.qq || '').includes(q) ||
      (c.stageRole || '').toLowerCase().includes(q)
    )
  })
  const inviteAllFilteredSelected =
    inviteFiltered.length > 0 && inviteFiltered.every((c) => inviteSelected.has(c.id))

  return (
    <div className={`flex flex-col ${isFullscreen ? 'h-screen bg-black' : 'min-h-[calc(100vh-8rem)] h-[calc(100vh-8rem)] px-3 sm:px-4 py-3 w-full'}`} ref={containerRef}>
      {/* 进入申请浮窗改由全站 HostJoinRequestsFloat 负责（学员首页/共享大厅/管理后台均可审批） */}

      {/* 邀请观看面板 */}
      {inviteOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md max-h-[min(80vh,36rem)] flex flex-col rounded-2xl bg-[#18181e] shadow-2xl shadow-black/50 ring-1 ring-white/10 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between bg-[#1e1e26]">
              <div>
                <h3 className="text-sm font-semibold text-white">邀请观看</h3>
                <p className="text-[11px] text-white/40 mt-0.5">选择后对方页面将弹出进入提示，无需输入房间号</p>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-3 pt-3 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  value={inviteQuery}
                  onChange={(e) => setInviteQuery(e.target.value)}
                  placeholder="搜索昵称 / QQ / 阶段…"
                  className="w-full bg-black/30 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-white/45 px-0.5">
                <button
                  type="button"
                  disabled={inviteFiltered.length === 0}
                  onClick={() => {
                    if (inviteAllFilteredSelected) {
                      setInviteSelected((prev) => {
                        const next = new Set(prev)
                        inviteFiltered.forEach((c) => next.delete(c.id))
                        return next
                      })
                    } else {
                      setInviteSelected((prev) => {
                        const next = new Set(prev)
                        inviteFiltered.forEach((c) => next.add(c.id))
                        return next
                      })
                    }
                  }}
                  className="inline-flex items-center gap-1.5 hover:text-purple-200 disabled:opacity-40"
                >
                  {inviteAllFilteredSelected ? <CheckSquare size={14} className="text-purple-400" /> : <Square size={14} />}
                  {inviteAllFilteredSelected ? '取消全选' : '全选当前列表'}
                </button>
                <span>已选 {inviteSelected.size} 人</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
              {inviteLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-white/45 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  加载中…
                </div>
              ) : inviteFiltered.length === 0 ? (
                <p className="text-center text-white/40 text-sm py-10">
                  {inviteCandidates.length === 0 ? '暂无可邀请成员' : '无匹配结果'}
                </p>
              ) : (
                inviteFiltered.map((c) => {
                  const selected = inviteSelected.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleInviteSelect(c.id)}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors ${
                        selected ? 'bg-purple-500/15' : 'hover:bg-white/5'
                      }`}
                    >
                      {selected ? (
                        <CheckSquare size={18} className="text-purple-400 shrink-0" />
                      ) : (
                        <Square size={18} className="text-white/35 shrink-0" />
                      )}
                      <MemberAvatar avatar={c.avatar} qq={c.qq} name={c.nickname} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{c.nickname}</div>
                        <div className="text-[10px] text-white/40 truncate">
                          {[c.username && c.username !== c.nickname ? `@${c.username}` : null, c.stageRole, c.qq ? `QQ ${c.qq}` : null]
                            .filter(Boolean)
                            .join(' · ') || '学员'}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            <div className="p-3 bg-[#1e1e26] flex gap-2">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={inviteSelected.size === 0 || inviteBusy}
                onClick={() => void sendInvites()}
                className="flex-1 py-2.5 rounded-xl bg-purple-600/40 hover:bg-purple-600/55 disabled:opacity-40 text-purple-50 text-sm font-medium inline-flex items-center justify-center gap-1.5"
              >
                {inviteBusy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                {inviteBusy ? '发送中…' : `发送邀请 (${inviteSelected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className={`flex items-center justify-between gap-3 ${isFullscreen ? 'absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300' : 'mb-3'}`}>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0 flex-1">
          {mode === 'host' && status === 'streaming' && (
            <>
              <div className="flex items-center gap-2 bg-red-600/20 border border-red-500/30 rounded-lg px-2.5 py-1.5">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-sm font-medium">共享中</span>
                {activeStreamMode === 'volc' && (
                  <span className="text-red-400/50 text-xs hidden sm:inline">· 火山引擎</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5">
                <span className="text-white font-mono text-base tracking-widest font-bold">{roomCode}</span>
                <button onClick={handleCopy} className="text-gray-400 hover:text-white transition-colors" title="复制房间号">
                  {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void openInvitePanel()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 text-sm transition-colors"
                title="邀请成员观看（无需输入房间号）"
              >
                <UserPlus size={15} />
                <span className="hidden sm:inline">邀请</span>
              </button>
              <div className="relative flex items-center gap-1 text-gray-400 text-sm" ref={peersMenuRef}>
                <button
                  type="button"
                  onClick={() => { setMicMenuOpen(false); setPeersMenuOpen(v => !v) }}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                  title="观看成员（点击展开，可禁言 / 踢人 / 调听感音量）"
                >
                  <Users size={15} />
                  <span>{viewerCount}</span>
                </button>
                {peersMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 pt-1">
                    <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700/80 rounded-xl shadow-xl py-2 px-1 min-w-[240px] max-h-[70vh] overflow-y-auto">
                      <div className="flex items-center justify-between px-3 pb-1.5 border-b border-gray-700/80 mb-1">
                        <p className="text-gray-400 text-xs font-medium">观看成员</p>
                        <button type="button" onClick={() => setPeersMenuOpen(false)} className="text-gray-600 hover:text-gray-300 p-0.5">
                          <X size={12} />
                        </button>
                      </div>
                      {activeStreamMode === 'volc' && volcPeers.length > 0
                        ? volcPeers.map((p) => {
                          const forced = forcedMutedIds.has(p.userId)
                          return (
                          <div key={p.userId} className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              {renderNameWithAvatar(p.name, { micOn: p.micOn && !forced, forcedMute: forced })}
                              <button
                                type="button"
                                title={forced ? '解除禁言' : '禁言'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  hostForceMutePeer(p.userId, !forced)
                                }}
                                className={`p-0.5 shrink-0 transition-colors ${
                                  forced ? 'text-orange-400 hover:text-orange-300' : 'text-gray-500 hover:text-orange-300'
                                }`}
                              >
                                {forced ? <Mic size={13} /> : <MicOff size={13} />}
                              </button>
                              <button
                                type="button"
                                title="移出房间"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void hostKickViewer(p.userId, p.name)
                                }}
                                className="p-0.5 shrink-0 text-gray-500 hover:text-red-400 transition-colors"
                              >
                                <UserX size={13} />
                              </button>
                            </div>
                            {peerListenVolume(p.userId)}
                          </div>
                          )
                        })
                        : viewerNames.length > 0
                          ? viewerNames.map((name, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                            {renderNameWithAvatar(name, { micOn: true })}
                          </div>
                        ))
                          : (
                          <p className="text-gray-600 text-xs px-3 py-2">暂无观看成员</p>
                          )}
                    </div>
                  </div>
                )}
              </div>
              {volcMicControl}
              {volcStatsChip}
              {volcMediaControls}
            </>
          )}
          {mode === 'viewer' && status === 'watching' && (
            <>
              <div className="flex items-center gap-2 bg-green-600/20 border border-green-500/30 rounded-lg px-2.5 py-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 text-sm font-medium">观看中</span>
                {activeStreamMode === 'volc' && (
                  <span className="text-green-400/50 text-xs hidden sm:inline">· 火山引擎</span>
                )}
              </div>
              {hostName && (
                <span className="text-gray-300 text-sm truncate max-w-[9rem]" title={hostName}>
                  {hostName}
                </span>
              )}
              {volcMicControl}
              {activeStreamMode !== 'volc' && connectionInfo && (
                <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-500 text-xs">连接:</span>
                  <span className="text-gray-300 text-xs font-mono">{connectionInfo}</span>
                </div>
              )}
              {activeStreamMode !== 'volc' && latency !== null && (
                <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-500 text-xs">延迟:</span>
                  <span className={`text-xs font-mono font-medium ${
                    latency < 50 ? 'text-green-400' : latency < 150 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{Math.round(latency)} ms</span>
                </div>
              )}
              {volcStatsChip}
              <div className="relative flex items-center gap-1 text-gray-400 text-sm" ref={peersMenuRef}>
                <button
                  type="button"
                  onClick={() => { setMicMenuOpen(false); setPeersMenuOpen(v => !v) }}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                  title="观看成员（可调听感音量）"
                >
                  <Users size={15} />
                  <span>{viewerCount}</span>
                </button>
                {peersMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 pt-1">
                    <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700/80 rounded-xl shadow-xl py-2 px-1 min-w-[240px] max-h-[70vh] overflow-y-auto">
                      <div className="flex items-center justify-between px-3 pb-1.5 border-b border-gray-700/80 mb-1">
                        <p className="text-gray-400 text-xs font-medium">观看成员</p>
                        <button type="button" onClick={() => setPeersMenuOpen(false)} className="text-gray-600 hover:text-gray-300 p-0.5">
                          <X size={12} />
                        </button>
                      </div>
                      {activeStreamMode === 'volc' && volcHostUserId && (
                        <div className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            {renderNameWithAvatar(hostName || '主播', { badge: '主播', micOn: true })}
                          </div>
                          {peerListenVolume(volcHostUserId)}
                        </div>
                      )}
                      {volcPeers.length > 0
                        ? volcPeers.map((p) => (
                          <div key={p.userId} className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              {renderNameWithAvatar(p.name, { micOn: p.micOn })}
                            </div>
                            {peerListenVolume(p.userId)}
                          </div>
                        ))
                        : !volcHostUserId && viewerNames.length > 0
                          ? viewerNames.map((name, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                              {renderNameWithAvatar(name, { micOn: true })}
                            </div>
                          ))
                          : !volcHostUserId && (
                            <p className="text-gray-600 text-xs px-3 py-2">暂无其他观看成员</p>
                          )}
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

      {/* Video + side panels */}
      <div className={`flex-1 min-h-0 flex gap-3 ${isFullscreen ? 'w-full h-full' : ''}`}>
        {leftMembersPanel}
        <div className={`flex-1 overflow-hidden flex items-center justify-center relative min-w-0 ${isFullscreen ? 'w-full h-full' : 'bg-gray-900/80 rounded-2xl border border-gray-700/50'}`}>
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
                style={isFullscreen ? { width: '100vw', height: '100vh' } : undefined}
              />
              <div
                ref={volcContainerRef}
                className={`absolute inset-0 ${activeStreamMode !== 'volc' ? 'hidden' : ''}`}
              />
              {activeStreamMode === 'volc' && mediaToast && (
                <div
                  className={`absolute bottom-4 left-4 z-30 pointer-events-none flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium shadow-lg backdrop-blur-sm transition-opacity ${
                    mediaToast.kind === 'loading'
                      ? 'bg-black/70 text-white border border-white/10'
                      : 'bg-emerald-600/90 text-white border border-emerald-400/30'
                  }`}
                >
                  {mediaToast.kind === 'loading' && (
                    <span className="w-3.5 h-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                  {mediaToast.text}
                </div>
              )}
            </>
          )}
        </div>
        {rightVolumePanel}
      </div>
    </div>
  )
}