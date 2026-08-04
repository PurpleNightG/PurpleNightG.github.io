import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Mic, MicOff, MonitorUp, MonitorOff, MessageSquare, PhoneOff,
  Users, Copy, Check, X, Send, Shield, Video, VideoOff, Minimize2, Maximize2,
  UserPlus, SwitchCamera, ChevronUp, Search, CheckSquare, Square, Loader2,
  Volume2, VolumeX, UserX, Pencil, Check as CheckIcon,
} from 'lucide-react'
import MemberAvatar from '../components/MemberAvatar'
import {
  startVolcMic,
  stopVolcMic,
  acquireDisplayMedia,
  bindVolcScreenCapture,
  releaseVolcScreenCapture,
  setVolcLocalMicVolume,
  setVolcRemoteMicVolume,
  parseVolcVoiceMessage,
  getVolcEncoderConfig,
  getVolcMaxKbps,
  getScreenQualityPreset,
  SCREEN_QUALITY_OPTIONS,
  SCREEN_FPS_OPTIONS,
  SCREEN_ENCODE_MODE_OPTIONS,
  VOLC_MIC_VOLUME_DEFAULT,
  VOLC_MIC_VOLUME_MAX,
  type ScreenQuality,
  type ScreenFps,
  type ScreenEncodeMode,
} from '../utils/volcScreenShare'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const VOLC_APP_ID: string = import.meta.env.VITE_VOLC_APP_ID || '69a1d9e90340ba017226d5c0'

type MeetingMember = {
  sessionId?: string
  displayName: string
  userType: string
  userId: string
  qq: string | null
  avatar: string | null
  micOn: boolean
  isSharer: boolean
  isHost?: boolean
}

type ShareRequest = {
  id: number
  sessionId?: string
  username: string
  status: string
  createdAt: number
}

type ChatMsg = {
  id: number
  from: string
  fromSessionId?: string
  userId?: string
  avatar?: string | null
  qq?: string | null
  text: string
  at: number
}

type MeetingState = {
  code: string
  title: string
  createdBy: string
  hostSessionId?: string | null
  members: MeetingMember[]
  sharer: { sessionId?: string; displayName: string; userId: string; startedAt: number } | null
  pendingShareRequests: ShareRequest[]
  chat: ChatMsg[]
}

type Props = {
  code: string
  displayName: string
  userType: 'admin' | 'student' | 'guest'
  memberId?: number | null
  /** 管理端自定义头像（admins.avatar） */
  avatar?: string | null
  qq?: string | null
  /** reason 非空时由外层展示踢出/结束提示 */
  onLeave: (reason?: string) => void
}

export default function MeetingRoom({
  code,
  displayName,
  userType,
  memberId,
  avatar: propAvatar = null,
  qq: propQq = null,
  onLeave,
}: Props) {
  const [state, setState] = useState<MeetingState | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
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
  const [chatText, setChatText] = useState('')
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [connecting, setConnecting] = useState(true)
  /** userId → 是否正在说话 */
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({})
  /** 本地是否被主持人强制禁言 */
  const [micForcedOff, setMicForcedOff] = useState(false)
  /** 主持人视角：已被禁言的远端 userId */
  const [forcedMutedIds, setForcedMutedIds] = useState<Set<string>>(() => new Set())
  const micForcedOffRef = useRef(false)
  const [cameraOn, setCameraOn] = useState(false)
  /** userId → 摄像头是否开启 */
  const [cameraMap, setCameraMap] = useState<Record<string, boolean>>({})
  const cameraMapRef = useRef<Record<string, boolean>>({})
  cameraMapRef.current = cameraMap
  /** 本机摄像头列表 / 当前选用 */
  const [videoDevices, setVideoDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [videoDeviceId, setVideoDeviceId] = useState('')
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false)
  /** 自己麦克风发送音量（%） */
  const [localMicVolume, setLocalMicVolume] = useState(VOLC_MIC_VOLUME_DEFAULT)
  /** 听感音量：userId → % */
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({})
  const [micMenuOpen, setMicMenuOpen] = useState(false)
  const [listenMenuOpen, setListenMenuOpen] = useState(false)
  /** 点击宫格放大的用户 */
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null)
  /** 共享画面全屏 / 会议内最大化 */
  const [isScreenFullscreen, setIsScreenFullscreen] = useState(false)
  const [screenExpanded, setScreenExpanded] = useState(false)
  /** 已选屏，等待管理批准后自动发布 */
  const [shareAwaitingApproval, setShareAwaitingApproval] = useState(false)
  /** 已批准但本地无待发布流时，提示再点一次 */
  const [shareApprovedPrompt, setShareApprovedPrompt] = useState(false)
  /** 屏幕共享编码（与投屏页一致） */
  const [screenQuality, setScreenQuality] = useState<ScreenQuality>(1080)
  const [screenFps, setScreenFps] = useState<ScreenFps>(30)
  const [screenEncodeMode, setScreenEncodeMode] = useState<ScreenEncodeMode>('motion')
  const screenQualityRef = useRef<ScreenQuality>(1080)
  const screenFpsRef = useRef<ScreenFps>(30)
  const screenEncodeModeRef = useRef<ScreenEncodeMode>('motion')
  /** 踢人确认 */
  const [kickTarget, setKickTarget] = useState<MeetingMember | null>(null)
  const [kickBanRejoin, setKickBanRejoin] = useState(true)
  const [kickBusy, setKickBusy] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleBusy, setTitleBusy] = useState(false)

  const engineRef = useRef<any>(null)
  const volcModuleRef = useRef<any>(null)
  const mediaTypeRef = useRef<any>(null)
  const streamIndexRef = useRef<any>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenContainerRef = useRef<HTMLDivElement>(null)
  const screenStageRef = useRef<HTMLDivElement>(null)
  const remoteScreenUserRef = useRef<string>('')
  const focusVideoRef = useRef<HTMLDivElement | null>(null)
  const tileVideoRefs = useRef<Record<string, HTMLDivElement | null>>({})
  /** 稳定回调 ref，避免每次重渲染触发 null→el 导致摄像头反复解绑闪烁 */
  const tileRefCallbacks = useRef<Record<string, (el: HTMLDivElement | null) => void>>({})
  /** 当前已绑定的渲染容器，目标未变则跳过重绑 */
  const cameraBoundDomRef = useRef<Record<string, HTMLElement | null>>({})
  const focusedUserIdRef = useRef<string | null>(null)
  const cameraOnRef = useRef(false)
  const videoDeviceIdRef = useRef('')
  const cameraMenuRef = useRef<HTMLDivElement>(null)
  const micMenuRef = useRef<HTMLDivElement>(null)
  const listenMenuRef = useRef<HTMLDivElement>(null)
  const localMicVolumeRef = useRef(VOLC_MIC_VOLUME_DEFAULT)
  const peerVolumesRef = useRef<Record<string, number>>({})
  const peerVolumeBeforeMuteRef = useRef<Record<string, number>>({})
  const kickExitRef = useRef<((reason?: string) => void) | null>(null)
  const pendingShareRef = useRef<{ stream: MediaStream | null; hasSystemAudio: boolean; mode?: 'custom' | 'sdk' } | null>(null)
  const shareAwaitingApprovalRef = useRef(false)
  const discardingShareRef = useRef(false)
  const publishingShareRef = useRef(false)
  const publishApprovedShareRef = useRef<(() => void) | null>(null)
  const discardPendingShareRef = useRef<((reason?: string) => void) | null>(null)
  const userIdRef = useRef('')
  const sessionIdRef = useRef(
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    ).slice(0, 24)
  )
  const joinedRef = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const startAtRef = useRef(Date.now())

  const sessionPayload = useCallback(() => ({
    sessionId: sessionIdRef.current,
    displayName,
    userType,
    memberId,
  }), [displayName, userType, memberId])

  const applyState = useCallback((data: any) => {
    if (!data?.exists && data?.success === false) return
    setState({
      code: data.code,
      title: data.title,
      createdBy: data.createdBy,
      hostSessionId: data.hostSessionId || null,
      members: data.members || [],
      sharer: data.sharer || null,
      pendingShareRequests: data.pendingShareRequests || [],
      chat: data.chat || [],
    })
  }, [])

  const fetchVolcToken = async (roomId: string, userId: string) => {
    const res = await fetch(`${API_URL}/volc/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, userId }),
    })
    const data = await res.json()
    return data.success ? (data.token ?? null) : null
  }

  const bindRemoteScreen = useCallback(async (userId: string) => {
    const engine = engineRef.current
    const container = screenContainerRef.current
    if (!engine || !container || !userId) return
    remoteScreenUserRef.current = userId
    try {
      await engine.setRemoteVideoPlayer(1, { userId, renderDom: container })
    } catch (e) {
      console.warn('[Meeting] setRemoteVideoPlayer', e)
    }
  }, [])

  const clearRemoteScreen = useCallback(async () => {
    const engine = engineRef.current
    const uid = remoteScreenUserRef.current
    if (engine && uid) {
      try {
        await engine.setRemoteVideoPlayer(1, { userId: uid, renderDom: null })
      } catch {}
    }
    remoteScreenUserRef.current = ''
    if (screenContainerRef.current) screenContainerRef.current.innerHTML = ''
  }, [])

  /** 把摄像头画面绑到放大区或宫格小窗；目标 DOM 未变时不重绑，避免小窗闪烁 */
  const bindCameraVideo = useCallback(async (
    peerUserId: string,
    isLocal: boolean,
    attempt = 0,
    force = false,
  ) => {
    const engine = engineRef.current
    const StreamIndex = streamIndexRef.current
    if (!engine || !StreamIndex || !peerUserId) return
    const focused = focusedUserIdRef.current === peerUserId
    const el = focused
      ? focusVideoRef.current
      : tileVideoRefs.current[peerUserId]
    if (!el) {
      // 放大层刚挂载时 ref 可能尚未就绪，短重试
      if (attempt < 8) {
        requestAnimationFrame(() => {
          void bindCameraVideo(peerUserId, isLocal, attempt + 1, force)
        })
      }
      return
    }
    // 隐藏中的小窗不要绑（display:none 会导致无画面）
    if (!focused && el.classList.contains('hidden')) {
      if (attempt < 8) {
        requestAnimationFrame(() => {
          void bindCameraVideo(peerUserId, isLocal, attempt + 1, force)
        })
      }
      return
    }
    // 已绑到同一容器则跳过（强制重绑除外）
    if (!force && cameraBoundDomRef.current[peerUserId] === el) return
    try {
      // 换容器时必须先解绑：即使本地缓存丢失，SDK 仍可能挂在旧 DOM 上（放大黑屏主因）
      if (isLocal) {
        try {
          await engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
            renderDom: null as unknown as HTMLElement,
          })
        } catch {}
        await engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, { renderDom: el })
      } else {
        try {
          await engine.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
            userId: peerUserId,
            renderDom: null as unknown as HTMLElement,
          })
        } catch {}
        await engine.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
          userId: peerUserId,
          renderDom: el,
        })
      }
      cameraBoundDomRef.current[peerUserId] = el
    } catch (e) {
      console.warn('[Meeting] bindCameraVideo', e)
      cameraBoundDomRef.current[peerUserId] = null
      if (attempt < 5) {
        setTimeout(() => {
          void bindCameraVideo(peerUserId, isLocal, attempt + 1, true)
        }, 50)
      }
    }
  }, [])

  const getTileVideoRef = useCallback((uid: string) => {
    if (!tileRefCallbacks.current[uid]) {
      tileRefCallbacks.current[uid] = (el) => {
        const prev = tileVideoRefs.current[uid]
        tileVideoRefs.current[uid] = el
        if (!el) {
          if (cameraBoundDomRef.current[uid] === prev) {
            cameraBoundDomRef.current[uid] = null
          }
          return
        }
        if (el === prev) return
        const selfId = userIdRef.current
        const focused = focusedUserIdRef.current === uid
        // 放大时小窗不抢播放器
        if (focused) return
        if (cameraOnRef.current && uid === selfId) {
          void bindCameraVideo(uid, true)
        } else if (uid !== selfId && cameraMapRef.current[uid]) {
          void bindCameraVideo(uid, false)
        }
      }
    }
    return tileRefCallbacks.current[uid]
  }, [bindCameraVideo])

  const setFocusVideoRef = useCallback((el: HTMLDivElement | null) => {
    const prev = focusVideoRef.current
    focusVideoRef.current = el
    if (!el) {
      // 大窗卸载时不要清掉绑定记录：缩小后还要用 prev≠tile 触发迁移解绑
      return
    }
    if (el === prev) return
    const uid = focusedUserIdRef.current
    if (!uid) return
    const selfId = userIdRef.current
    // 大窗挂载后立即绑定（比 useEffect 更稳）
    requestAnimationFrame(() => {
      if (focusVideoRef.current !== el) return
      if (uid === selfId) {
        if (cameraOnRef.current) void bindCameraVideo(uid, true, 0, true)
      } else if (cameraMapRef.current[uid]) {
        void bindCameraVideo(uid, false, 0, true)
      }
    })
  }, [bindCameraVideo])

  // Join meeting + Volc
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setConnecting(true)
      setError('')
      try {
        const joinRes = await fetch(`${API_URL}/meeting/${code}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName,
            userType,
            memberId,
            sessionId: sessionIdRef.current,
            micOn: true,
            avatar: propAvatar,
            qq: propQq,
          }),
        })
        const joinData = await joinRes.json()
        if (!joinRes.ok || !joinData.success) {
          throw new Error(joinData.error || '加入会议失败')
        }
        if (cancelled) return
        if (joinData.sessionId) sessionIdRef.current = joinData.sessionId
        userIdRef.current = joinData.userId
        applyState(joinData)
        startAtRef.current = Date.now()

        const volcModule = await import('@volcengine/rtc')
        if (cancelled) return
        volcModuleRef.current = volcModule
        const { default: VERTC, MediaType, StreamIndex } = volcModule
        mediaTypeRef.current = MediaType
        streamIndexRef.current = StreamIndex

        const engine = VERTC.createEngine(VOLC_APP_ID)
        engineRef.current = engine

        engine.on(VERTC.events.onUserPublishScreen, async (e: any) => {
          const uid = e?.userId
          if (!uid || uid === userIdRef.current) return
          await engine.subscribeScreen(uid, MediaType.AUDIO_AND_VIDEO).catch(() =>
            engine.subscribeScreen(uid, MediaType.VIDEO)
          )
          await bindRemoteScreen(uid)
        })
        engine.on(VERTC.events.onUserUnpublishScreen, async (e: any) => {
          if (e?.userId === remoteScreenUserRef.current) await clearRemoteScreen()
        })
        engine.on(VERTC.events.onUserPublishStream, async (e: any) => {
          const uid = e?.userId as string | undefined
          if (!uid || uid === userIdRef.current) return
          const mediaType = e?.mediaType
          const hasAudio =
            mediaType === MediaType.AUDIO || mediaType === MediaType.AUDIO_AND_VIDEO
          const hasVideo =
            mediaType === MediaType.VIDEO || mediaType === MediaType.AUDIO_AND_VIDEO
          if (hasAudio) {
            try {
              await engine.subscribeStream(uid, MediaType.AUDIO)
              const vol = peerVolumesRef.current[uid] ?? VOLC_MIC_VOLUME_DEFAULT
              setVolcRemoteMicVolume(engine, StreamIndex, uid, vol)
            } catch {}
          }
          if (hasVideo) {
            try {
              await engine.subscribeStream(uid, MediaType.VIDEO)
            } catch {
              try {
                await engine.subscribeStream(uid, MediaType.AUDIO_AND_VIDEO)
              } catch {}
            }
            setCameraMap((prev) => (prev[uid] ? prev : { ...prev, [uid]: true }))
            requestAnimationFrame(() => {
              void bindCameraVideo(uid, false)
            })
          }
        })
        engine.on(VERTC.events.onUserUnpublishStream, async (e: any) => {
          const uid = e?.userId as string | undefined
          if (!uid || uid === userIdRef.current) return
          const mediaType = e?.mediaType
          const hasVideo =
            mediaType === MediaType.VIDEO || mediaType === MediaType.AUDIO_AND_VIDEO || mediaType == null
          if (hasVideo) {
            setCameraMap((prev) => {
              if (!prev[uid]) return prev
              const next = { ...prev }
              delete next[uid]
              return next
            })
            cameraBoundDomRef.current[uid] = null
            try {
              await engine.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
                userId: uid,
                renderDom: null as unknown as HTMLElement,
              })
            } catch {}
          }
        })

        // 主持人禁言 / 解除禁言（与屏幕共享语音一致）
        engine.on(VERTC.events.onUserMessageReceived, async ({ message }: { userId?: string; message: string }) => {
          const msg = parseVolcVoiceMessage(message)
          if (!msg) return
          if (msg.action === 'force-mute') {
            micForcedOffRef.current = true
            setMicForcedOff(true)
            try {
              await stopVolcMic(engine, MediaType)
            } catch {}
            setMicOn(false)
            const uid = userIdRef.current
            if (uid) setSpeakingMap((prev) => (prev[uid] ? { ...prev, [uid]: false } : prev))
            setToast(msg.by ? `${msg.by} 已禁言你` : '你已被主持人禁言')
          } else if (msg.action === 'force-unmute') {
            micForcedOffRef.current = false
            setMicForcedOff(false)
            setToast('主持人已解除禁言，可自行开麦')
          } else if (msg.action === 'force-kick') {
            const text = msg.banned
              ? (msg.by ? `${msg.by} 已将你移出并禁止再次进入此会议` : '你已被移出并禁止再次进入此会议')
              : (msg.by ? `${msg.by} 已将你移出会议` : '你已被移出会议')
            setToast(text)
            // 稍留提示时间；退出时勿调 leave API（同名会误伤主持人）
            setTimeout(() => {
              kickExitRef.current?.(text)
            }, 800)
          } else if (msg.action === 'share-approved') {
            // 同名时消息可能误投；仅目标会话处理
            if (msg.toSessionId && msg.toSessionId !== sessionIdRef.current) return
            if (msg.toUserId && msg.toUserId !== userIdRef.current) return
            setToast(msg.by ? `${msg.by} 已批准共享，正在开始…` : '共享已批准，正在开始…')
            publishApprovedShareRef.current?.()
          } else if (msg.action === 'share-rejected') {
            if (msg.toSessionId && msg.toSessionId !== sessionIdRef.current) return
            if (msg.toUserId && msg.toUserId !== userIdRef.current) return
            const sec = msg.cooldownMs ? Math.ceil(msg.cooldownMs / 1000) : 5
            discardPendingShareRef.current?.(
              msg.by
                ? `${msg.by} 已拒绝共享申请，${sec} 秒内不可再次申请`
                : `共享申请被拒绝，${sec} 秒内不可再次申请`
            )
          }
        })

        // 说话高亮：周期上报本地/远端音量
        const SPEAK_THRESHOLD = 30 // linearVolume 0–255，>25 近似有声
        try {
          engine.enableAudioPropertiesReport?.({ interval: 200, enableInBackground: true })
        } catch {}

        engine.on(VERTC.events.onLocalAudioPropertiesReport, (infos: any[]) => {
          const speaking = (infos || []).some((info) => {
            if (info?.streamIndex === StreamIndex.STREAM_INDEX_SCREEN) return false
            return (info?.audioPropertiesInfo?.linearVolume ?? 0) > SPEAK_THRESHOLD
          })
          const uid = userIdRef.current
          if (!uid) return
          setSpeakingMap((prev) => {
            if (!!prev[uid] === speaking) return prev
            return { ...prev, [uid]: speaking }
          })
        })

        engine.on(VERTC.events.onRemoteAudioPropertiesReport, (infos: any[]) => {
          const remoteSpeaking: Record<string, boolean> = {}
          for (const info of infos || []) {
            if (info?.streamKey?.streamIndex === StreamIndex.STREAM_INDEX_SCREEN) continue
            const uid = info?.streamKey?.userId as string | undefined
            if (!uid) continue
            if ((info?.audioPropertiesInfo?.linearVolume ?? 0) > SPEAK_THRESHOLD) {
              remoteSpeaking[uid] = true
            }
          }
          setSpeakingMap((prev) => {
            let changed = false
            const next = { ...prev }
            for (const key of Object.keys(next)) {
              if (key === userIdRef.current) continue
              if (next[key] && !remoteSpeaking[key]) {
                next[key] = false
                changed = true
              }
            }
            for (const [uid, sp] of Object.entries(remoteSpeaking)) {
              if (next[uid] !== sp) {
                next[uid] = sp
                changed = true
              }
            }
            return changed ? next : prev
          })
        })

        const token = await fetchVolcToken(code, joinData.userId)
        await engine.joinRoom(token, code, {
          userId: joinData.userId,
          extraInfo: displayName,
        }, {
          isAutoPublish: false,
          isAutoSubscribeAudio: true,
          isAutoSubscribeVideo: false,
        })
        joinedRef.current = true

        try {
          await startVolcMic(engine, MediaType, {
            autoGain: true,
            captureVolume: localMicVolumeRef.current,
            StreamIndex,
          })
          setMicOn(true)
        } catch {
          setMicOn(false)
          setToast('麦克风未开启，可稍后点击重试')
        }

        setConnecting(false)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || '进入会议失败')
          setConnecting(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, displayName, userType, memberId, propAvatar, propQq])

  // 放大目标变化时，把画面从小窗迁到大窗（或迁回）；保留绑定记录以便正确解绑
  useEffect(() => {
    focusedUserIdRef.current = focusedUserId
    let cancelled = false
    const run = async () => {
      // 等主舞台挂载 / 小窗 hidden 切换完成，再绑播放器
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      if (cancelled) return
      const selfId = userIdRef.current
      if (cameraOnRef.current && selfId) {
        await bindCameraVideo(selfId, true, 0, true)
      }
      for (const [uid, on] of Object.entries(cameraMapRef.current)) {
        if (cancelled) return
        if (on && uid !== selfId) await bindCameraVideo(uid, false, 0, true)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [focusedUserId, bindCameraVideo])

  // 远端/本地新开摄像头时绑定（不依赖对象引用反复触发）
  useEffect(() => {
    const selfId = userIdRef.current
    for (const [uid, on] of Object.entries(cameraMap)) {
      if (!on) continue
      if (focusedUserIdRef.current === uid) {
        void bindCameraVideo(uid, uid === selfId)
      } else if (uid === selfId) {
        if (cameraOnRef.current) void bindCameraVideo(uid, true)
      } else {
        void bindCameraVideo(uid, false)
      }
    }
  }, [cameraMap, bindCameraVideo])

  // Timer
  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state?.chat?.length, chatOpen])

  const cleanupRtc = useCallback(async () => {
    const engine = engineRef.current
    const MediaType = mediaTypeRef.current
    const StreamIndex = streamIndexRef.current
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }
    if (engine) {
      try {
        await stopVolcMic(engine, MediaType)
      } catch {}
      if (cameraOnRef.current) {
        try { await engine.unpublishStream(MediaType?.VIDEO) } catch {}
        try { await engine.stopVideoCapture() } catch {}
        try {
          await engine.setLocalVideoPlayer(StreamIndex?.STREAM_INDEX_MAIN ?? 0, { renderDom: null })
        } catch {}
        cameraOnRef.current = false
      }
      try {
        await engine.unpublishScreen(MediaType?.AUDIO_AND_VIDEO ?? 3)
      } catch {}
      try {
        if (joinedRef.current) await engine.leaveRoom()
      } catch {}
      try {
        const VERTC = volcModuleRef.current?.default
        VERTC?.destroyEngine?.(engine)
      } catch {}
    }
    engineRef.current = null
    joinedRef.current = false
  }, [])

  // Poll state + heartbeat（主持人离开后会议结束，成员自动退出）
  useEffect(() => {
    if (connecting || error) return
    let left = false
    const exitEnded = async (msg: string) => {
      if (left) return
      left = true
      setToast(msg)
      await cleanupRtc()
      onLeave(msg)
    }
    const tick = async () => {
      try {
        const r = await fetch(`${API_URL}/meeting/${code}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            displayName,
            micOn,
          }),
        })
        const d = await r.json()
        if (r.ok) {
          if (d.ended || d.exists === false) {
            await exitEnded('主持人已离开，会议已结束')
            return
          }
          applyState(d)
          if (d.sharer && d.sharer.userId !== userIdRef.current) {
            if (remoteScreenUserRef.current !== d.sharer.userId) {
              await bindRemoteScreen(d.sharer.userId)
            }
          } else if (!d.sharer && remoteScreenUserRef.current && !sharing) {
            await clearRemoteScreen()
          }
          if (d.sharer?.sessionId === sessionIdRef.current) setSharing(true)
          else if (sharing && d.sharer?.sessionId !== sessionIdRef.current) setSharing(false)
          if (d.shareStatus === 'approved') {
            // 已有他人在共享时不要每 2.5s 自动重试（且失败时曾误调 stop-share 顶掉同名共享）
            if (d.sharer && d.sharer.sessionId && d.sharer.sessionId !== sessionIdRef.current) {
              // 保留批准状态，等对方结束后再由用户点击或下次心跳触发
            } else {
              publishApprovedShareRef.current?.()
            }
          } else if (
            (d.shareStatus === 'rejected' || d.shareStatus === 'cooldown') &&
            shareAwaitingApprovalRef.current
          ) {
            const sec = d.shareCooldownMs ? Math.ceil(d.shareCooldownMs / 1000) : 5
            discardPendingShareRef.current?.(`共享申请被拒绝，${sec} 秒内不可再次申请`)
          }
        } else if (r.status === 404) {
          await exitEnded('会议已结束')
        } else if (r.status === 403 && d?.kicked) {
          await exitEnded(d?.banned ? '你已被移出并禁止再次进入此会议' : '你已被移出会议')
        }
      } catch {}
    }
    tick()
    const iv = setInterval(tick, 2500)
    return () => clearInterval(iv)
  }, [connecting, error, code, displayName, micOn, applyState, bindRemoteScreen, clearRemoteScreen, sharing, cleanupRtc, onLeave])

  useEffect(() => {
    const onFs = () => setIsScreenFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleScreenMaximize = useCallback(async () => {
    setFocusedUserId(null)
    setChatOpen(false)
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setScreenExpanded(false)
        return
      }
      if (screenExpanded) {
        setScreenExpanded(false)
        return
      }
      const el = screenStageRef.current
      if (el?.requestFullscreen) {
        await el.requestFullscreen()
      } else {
        setScreenExpanded(true)
      }
    } catch {
      // 浏览器拦截全屏时退化为会议内铺满
      setScreenExpanded(true)
    }
  }, [screenExpanded])

  const exitScreenMaximize = useCallback(async () => {
    setScreenExpanded(false)
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {}
    }
  }, [])

  // 共享结束后退出放大
  useEffect(() => {
    if (!sharing && !state?.sharer) {
      void exitScreenMaximize()
    }
  }, [sharing, state?.sharer, exitScreenMaximize])

  useEffect(() => {
    if (!screenExpanded && !isScreenFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void exitScreenMaximize()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screenExpanded, isScreenFullscreen, exitScreenMaximize])

  const leaveMeeting = async (_endForAll = false) => {
    try {
      if (sharing) {
        await fetch(`${API_URL}/meeting/${code}/stop-share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sessionPayload() }),
        })
      }
      // 主持人/管理离开：结束整场；普通成员仅自己离开
      if (userType === 'admin') {
        await fetch(`${API_URL}/meeting/${code}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminName: displayName, userType: 'admin' }),
        })
      } else {
        await fetch(`${API_URL}/meeting/${code}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            displayName,
            userType,
          }),
        })
      }
    } catch {}
    await cleanupRtc()
    onLeave()
  }

  /** 被踢出：只清理本地，不要再请求 leave（避免同名误结束会议） */
  kickExitRef.current = (reason?: string) => {
    void (async () => {
      await cleanupRtc()
      onLeave(reason || '你已被移出会议')
    })()
  }

  const saveMeetingTitle = async () => {
    if (!isHostReady()) return
    const next = titleDraft.trim().slice(0, 64)
    if (!next) {
      setToast('标题不能为空')
      return
    }
    if (next === state?.title) {
      setTitleEditing(false)
      return
    }
    setTitleBusy(true)
    try {
      const r = await fetch(`${API_URL}/meeting/${code}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: next,
          userType,
          sessionId: sessionIdRef.current,
          displayName,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '修改失败')
      applyState(d)
      setTitleEditing(false)
      setToast('会议标题已更新')
    } catch (e: any) {
      setToast(e?.message || '修改标题失败')
    } finally {
      setTitleBusy(false)
    }
  }

  const isHostReady = () =>
    userType === 'admin' ||
    (!!state?.hostSessionId && state.hostSessionId === sessionIdRef.current)

  /** 打开邀请面板，加载可选成员 */
  const openInvitePanel = async () => {
    setInviteOpen(true)
    setInviteQuery('')
    setInviteSelected(new Set())
    setInviteLoading(true)
    try {
      const r = await fetch(`${API_URL}/meeting/${code}/invite-candidates`)
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '加载成员失败')
      setInviteCandidates(d.candidates || [])
    } catch (e: any) {
      setInviteCandidates([])
      setToast(e?.message || '加载成员失败')
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
    if (inviteBusy || inviteSelected.size === 0) return
    setInviteBusy(true)
    try {
      const r = await fetch(`${API_URL}/meeting/${code}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userType,
          displayName,
          sessionId: sessionIdRef.current,
          memberIds: [...inviteSelected],
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '邀请失败')
      setToast(d.invitedCount > 0 ? `已向 ${d.invitedCount} 位成员发出邀请` : '没有可邀请的成员')
      setInviteOpen(false)
    } catch (e: any) {
      setToast(e?.message || '邀请失败')
    } finally {
      setInviteBusy(false)
    }
  }

  useEffect(() => {
    const onUnload = () => {
      navigator.sendBeacon?.(
        `${API_URL}/meeting/${code}/leave`,
        new Blob(
          [JSON.stringify({ sessionId: sessionIdRef.current, displayName, userType })],
          { type: 'application/json' }
        )
      )
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      void cleanupRtc()
    }
  }, [code, displayName, userType, cleanupRtc])

  const toggleMic = async () => {
    const engine = engineRef.current
    const MediaType = mediaTypeRef.current
    const StreamIndex = streamIndexRef.current
    if (!engine || !MediaType) return
    if (!micOn && micForcedOffRef.current) {
      setToast('你已被主持人禁言，无法自行开麦')
      return
    }
    try {
      if (micOn) {
        await stopVolcMic(engine, MediaType)
        setMicOn(false)
        const uid = userIdRef.current
        if (uid) setSpeakingMap((prev) => (prev[uid] ? { ...prev, [uid]: false } : prev))
      } else {
        await startVolcMic(engine, MediaType, {
          autoGain: true,
          captureVolume: localMicVolumeRef.current,
          StreamIndex,
        })
        setVolcLocalMicVolume(engine, StreamIndex, localMicVolumeRef.current)
        setMicOn(true)
      }
    } catch {
      setToast('麦克风切换失败')
    }
  }

  const handleLocalMicVolumeChange = (percent: number) => {
    const v = Math.max(0, Math.min(VOLC_MIC_VOLUME_MAX, Math.round(percent)))
    localMicVolumeRef.current = v
    setLocalMicVolume(v)
    const engine = engineRef.current
    const StreamIndex = streamIndexRef.current
    if (engine && StreamIndex) setVolcLocalMicVolume(engine, StreamIndex, v)
  }

  const handlePeerVolumeChange = (userId: string, percent: number) => {
    const v = Math.max(0, Math.min(VOLC_MIC_VOLUME_MAX, Math.round(percent)))
    peerVolumesRef.current = { ...peerVolumesRef.current, [userId]: v }
    setPeerVolumes(peerVolumesRef.current)
    const engine = engineRef.current
    const StreamIndex = streamIndexRef.current
    if (engine && StreamIndex) setVolcRemoteMicVolume(engine, StreamIndex, userId, v)
    if (v > 0) delete peerVolumeBeforeMuteRef.current[userId]
  }

  const togglePeerListenMute = (userId: string) => {
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

  const hostForceMutePeer = async (peerUserId: string, mute: boolean) => {
    const engine = engineRef.current
    if (!engine || !peerUserId || peerUserId === userIdRef.current) return
    const payload = JSON.stringify({
      t: 'ziye-voice',
      action: mute ? 'force-mute' : 'force-unmute',
      by: displayName || '主持人',
    })
    try {
      await engine.sendUserMessage(peerUserId, payload)
      setForcedMutedIds((prev) => {
        const next = new Set(prev)
        if (mute) next.add(peerUserId)
        else next.delete(peerUserId)
        return next
      })
      setToast(mute ? '已禁言该成员' : '已解除禁言')
    } catch (e: any) {
      setToast(`操作失败：${e?.message || '请重试'}`)
    }
  }

  const openKickConfirm = (peer: MeetingMember) => {
    if (userType !== 'admin' && state?.hostSessionId !== sessionIdRef.current) return
    if (!peer.sessionId) return
    if (peer.userId === userIdRef.current || peer.sessionId === sessionIdRef.current) return
    if (peer.isHost || (state?.hostSessionId && peer.sessionId === state.hostSessionId)) {
      setToast('不能踢出主持人')
      return
    }
    setKickBanRejoin(true)
    setKickTarget(peer)
  }

  const confirmKickPeer = async () => {
    const peer = kickTarget
    if (!peer?.sessionId || kickBusy) return
    setKickBusy(true)
    try {
      const r = await fetch(`${API_URL}/meeting/${code}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userType,
          displayName,
          sessionId: sessionIdRef.current,
          targetSessionId: peer.sessionId,
          targetUserId: peer.userId,
          banRejoin: kickBanRejoin,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '踢出失败')
      applyState(d)
      const engine = engineRef.current
      if (engine && peer.userId) {
        try {
          await engine.sendUserMessage(
            peer.userId,
            JSON.stringify({
              t: 'ziye-voice',
              action: 'force-kick',
              by: displayName || '主持人',
              banned: !!d.banned,
            })
          )
        } catch {}
      }
      setFocusedUserId((prev) => (prev === peer.userId ? null : prev))
      setKickTarget(null)
      setToast(
        d.banned
          ? `已将 ${peer.displayName} 移出，并禁止再次进入`
          : `已将 ${peer.displayName} 移出会议`
      )
    } catch (e: any) {
      setToast(e?.message || '踢出失败')
    } finally {
      setKickBusy(false)
    }
  }

  const refreshVideoDevices = useCallback(async () => {
    try {
      const VERTC = volcModuleRef.current?.default
      const listFn =
        engineRef.current?.enumerateVideoCaptureDevices?.bind(engineRef.current) ||
        VERTC?.enumerateVideoCaptureDevices?.bind(VERTC)
      if (!listFn) return
      const list: MediaDeviceInfo[] = await listFn()
      const cams = (list || [])
        .filter((d) => d.kind === 'videoinput' || !d.kind)
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `摄像头 ${i + 1}`,
        }))
        .filter((d) => d.deviceId)
      setVideoDevices(cams)
      if (cams.length && !videoDeviceIdRef.current) {
        videoDeviceIdRef.current = cams[0].deviceId
        setVideoDeviceId(cams[0].deviceId)
      }
    } catch (e) {
      console.warn('[Meeting] enumerate cameras', e)
    }
  }, [])

  const switchCamera = async (deviceId: string) => {
    if (!deviceId || deviceId === videoDeviceIdRef.current) {
      setCameraMenuOpen(false)
      return
    }
    const engine = engineRef.current
    if (!engine?.setVideoCaptureDevice) {
      setToast('当前环境不支持切换摄像头')
      setCameraMenuOpen(false)
      return
    }
    try {
      await engine.setVideoCaptureDevice(deviceId)
      videoDeviceIdRef.current = deviceId
      setVideoDeviceId(deviceId)
      setCameraMenuOpen(false)
      setToast('已切换摄像头')
      // 若已在采集，切换后强制重新绑本地预览（含放大态）
      if (cameraOnRef.current && userIdRef.current) {
        cameraBoundDomRef.current[userIdRef.current] = null
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        await bindCameraVideo(userIdRef.current, true, 0, true)
      }
    } catch (e: any) {
      setToast(e?.message || '切换摄像头失败')
    }
  }

  const toggleCamera = async () => {
    const engine = engineRef.current
    const MediaType = mediaTypeRef.current
    const StreamIndex = streamIndexRef.current
    if (!engine || !MediaType || !StreamIndex) return
    const selfId = userIdRef.current
    try {
      if (cameraOn) {
        try {
          await engine.unpublishStream(MediaType.VIDEO)
        } catch {}
        try {
          await engine.stopVideoCapture()
        } catch {}
        try {
          await engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, { renderDom: null })
        } catch {}
        cameraOnRef.current = false
        setCameraOn(false)
        if (selfId) cameraBoundDomRef.current[selfId] = null
        setCameraMap((prev) => {
          if (!selfId || !prev[selfId]) return prev
          const next = { ...prev }
          delete next[selfId]
          return next
        })
      } else {
        await refreshVideoDevices()
        const prefer = videoDeviceIdRef.current
        if (prefer && engine.setVideoCaptureDevice) {
          try {
            await engine.setVideoCaptureDevice(prefer)
          } catch {}
        }
        await engine.startVideoCapture()
        cameraOnRef.current = true
        setCameraOn(true)
        if (selfId) {
          setCameraMap((prev) => ({ ...prev, [selfId]: true }))
        }
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        if (selfId) await bindCameraVideo(selfId, true)
        await engine.publishStream(MediaType.VIDEO)
      }
    } catch (e: any) {
      cameraOnRef.current = false
      setCameraOn(false)
      if (e?.name === 'NotAllowedError') setToast('已取消摄像头授权')
      else setToast(e?.message || '摄像头开关失败')
    }
  }

  useEffect(() => {
    if (!connecting && !error) void refreshVideoDevices()
  }, [connecting, error, refreshVideoDevices])

  useEffect(() => {
    if (!cameraMenuOpen && !micMenuOpen && !listenMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (cameraMenuOpen && cameraMenuRef.current && !cameraMenuRef.current.contains(t)) {
        setCameraMenuOpen(false)
      }
      if (micMenuOpen && micMenuRef.current && !micMenuRef.current.contains(t)) {
        setMicMenuOpen(false)
      }
      if (listenMenuOpen && listenMenuRef.current && !listenMenuRef.current.contains(t)) {
        setListenMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [cameraMenuOpen, micMenuOpen, listenMenuOpen])

  const stopShareLocal = async () => {
    const engine = engineRef.current
    const MediaType = mediaTypeRef.current
    discardingShareRef.current = true
    pendingShareRef.current = null
    shareAwaitingApprovalRef.current = false
    setShareAwaitingApproval(false)
    setShareApprovedPrompt(false)
    const stream = screenStreamRef.current
    screenStreamRef.current = null
    if (engine && MediaType) {
      try {
        await engine.unpublishScreen(MediaType.AUDIO_AND_VIDEO)
      } catch {
        try { await engine.unpublishScreen(MediaType.VIDEO) } catch {}
      }
    }
    await releaseVolcScreenCapture(engine, volcModuleRef.current, stream)
    if (screenContainerRef.current) screenContainerRef.current.innerHTML = ''
    setSharing(false)
    discardingShareRef.current = false
    await fetch(`${API_URL}/meeting/${code}/stop-share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sessionPayload() }),
    })
  }

  const discardPendingShare = (reason?: string) => {
    discardingShareRef.current = true
    const pending = pendingShareRef.current
    const stream = pending?.stream || null
    pendingShareRef.current = null
    shareAwaitingApprovalRef.current = false
    setShareAwaitingApproval(false)
    setShareApprovedPrompt(false)
    if (screenStreamRef.current && (!stream || screenStreamRef.current === stream)) {
      screenStreamRef.current = null
    }
    // 审批前未绑定引擎；停轨前设 discarding，避免 ended 回调误调 unpublish
    try {
      stream?.getTracks().forEach((t) => { try { t.stop() } catch {} })
    } catch {}
    void releaseVolcScreenCapture(engineRef.current, volcModuleRef.current, null)
      .catch(() => {})
      .finally(() => {
        discardingShareRef.current = false
      })
    if (reason) setToast(reason)
  }

  discardPendingShareRef.current = discardPendingShare

  const publishCapture = async (capture: { stream: MediaStream | null; hasSystemAudio: boolean; mode?: 'custom' | 'sdk' }) => {
    const engine = engineRef.current
    const volcModule = volcModuleRef.current
    const MediaType = mediaTypeRef.current
    if (!engine || !volcModule || !MediaType) throw new Error('RTC 未就绪')

    // 本地先拦一层：已有他人共享时不要去打 stop-share（同名会误伤）
    const currentSharer = state?.sharer
    if (
      currentSharer?.sessionId &&
      currentSharer.sessionId !== sessionIdRef.current
    ) {
      throw new Error(`${currentSharer.displayName || '成员'} 正在共享，请稍后再试`)
    }

    const startRes = await fetch(`${API_URL}/meeting/${code}/start-share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sessionPayload() }),
    })
    const startData = await startRes.json()
    if (!startRes.ok) throw new Error(startData.error || '开始共享失败')
    applyState(startData)

    const enc = getVolcEncoderConfig(
      screenQualityRef.current,
      screenFpsRef.current,
      screenEncodeModeRef.current
    )
    const bound = await bindVolcScreenCapture(
      engine,
      volcModule,
      { stream: capture.stream, hasSystemAudio: capture.hasSystemAudio, mode: capture.mode || 'custom' },
      enc
    )

    screenStreamRef.current = bound.stream
    const vTrack = bound.stream?.getVideoTracks()?.[0]
    if (vTrack) {
      vTrack.addEventListener('ended', () => {
        if (discardingShareRef.current) return
        void stopShareLocal()
      })
    }

    if (screenContainerRef.current) {
      try {
        await engine.setLocalVideoPlayer(1, { renderDom: screenContainerRef.current })
      } catch {}
    }

    await engine.publishScreen(
      bound.hasSystemAudio ? MediaType.AUDIO_AND_VIDEO : MediaType.VIDEO
    )
    pendingShareRef.current = null
    shareAwaitingApprovalRef.current = false
    setShareAwaitingApproval(false)
    setShareApprovedPrompt(false)
    setSharing(true)
    setToast('已开始屏幕共享')
  }

  const publishApprovedShare = async () => {
    if (sharing || shareBusy || publishingShareRef.current) return
    const pending = pendingShareRef.current
    if (!pending) {
      setShareApprovedPrompt((prev) => {
        if (!prev) setToast('共享已批准，请点击「共享屏幕」选择画面并开始')
        return true
      })
      return
    }
    // 流已结束则提示重选
    const live = pending.stream?.getVideoTracks?.().some((t) => t.readyState === 'live')
    if (pending.stream && !live) {
      pendingShareRef.current = null
      shareAwaitingApprovalRef.current = false
      setShareAwaitingApproval(false)
      setShareApprovedPrompt(true)
      setToast('共享已批准，请重新点击「共享屏幕」开始')
      return
    }
    publishingShareRef.current = true
    setShareBusy(true)
    try {
      await publishCapture(pending)
    } catch (e: any) {
      setToast(e?.message || '开始共享失败')
      discardPendingShare()
      // 开始失败时切勿调用 stop-share：同名会误清掉当前真正在共享的人
    } finally {
      publishingShareRef.current = false
      setShareBusy(false)
    }
  }

  publishApprovedShareRef.current = () => {
    void publishApprovedShare()
  }

  const startShare = async () => {
    if (shareBusy || sharing) return
    if (shareAwaitingApprovalRef.current && pendingShareRef.current) {
      setToast('已选择屏幕，等待管理员批准后将自动开始共享')
      return
    }
    // 已有待批申请但画面丢了：只重新选屏，不重复提交申请
    const reselectOnly = shareAwaitingApprovalRef.current && !pendingShareRef.current

    setShareBusy(true)
    setToast('')
    try {
      const engine = engineRef.current
      const volcModule = volcModuleRef.current
      const MediaType = mediaTypeRef.current
      if (!engine || !volcModule || !MediaType) throw new Error('RTC 未就绪')

      // 先只选屏，不绑定引擎；批准后再 bind，避免拒绝时 SDK 报 track 未连接
      const enc = getVolcEncoderConfig(
        screenQualityRef.current,
        screenFpsRef.current,
        screenEncodeModeRef.current
      )
      const capture = await acquireDisplayMedia(enc)
      screenStreamRef.current = capture.stream
      const vTrack = capture.stream?.getVideoTracks()?.[0]
      if (vTrack) {
        vTrack.addEventListener('ended', () => {
          if (discardingShareRef.current) return
          if (shareAwaitingApprovalRef.current) {
            pendingShareRef.current = null
            setToast('已取消屏幕选择；若申请仍在等待，批准后请重新点击共享')
          } else if (sharing) {
            void stopShareLocal()
          } else {
            screenStreamRef.current = null
          }
        })
      }

      if (reselectOnly) {
        pendingShareRef.current = {
          stream: capture.stream,
          hasSystemAudio: capture.hasSystemAudio,
          mode: capture.mode,
        }
        setToast('已重新选择屏幕，等待管理员批准后将自动开始共享')
        return
      }

      const probe = await fetch(`${API_URL}/meeting/${code}/share-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sessionPayload() }),
      })
      const probeData = await probe.json()
      if (!probe.ok) {
        discardingShareRef.current = true
        capture.stream?.getTracks().forEach((t) => { try { t.stop() } catch {} })
        screenStreamRef.current = null
        discardingShareRef.current = false
        throw new Error(probeData.error || '无法申请共享')
      }

      if (!probeData.canShareNow) {
        pendingShareRef.current = {
          stream: capture.stream,
          hasSystemAudio: capture.hasSystemAudio,
          mode: capture.mode,
        }
        shareAwaitingApprovalRef.current = true
        setShareAwaitingApproval(true)
        setShareApprovedPrompt(false)
        setToast('已选择屏幕，等待管理员批准后将自动开始共享')
        return
      }

      await publishCapture(capture)
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') setToast('已取消屏幕选择')
      else setToast(e?.message || '共享失败')
      discardPendingShare()
      // 仅当本会话确实是当前共享者时才结束共享，避免同名误清他人
      if (state?.sharer?.sessionId === sessionIdRef.current) {
        try {
          await fetch(`${API_URL}/meeting/${code}/stop-share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...sessionPayload() }),
          })
        } catch {}
        setSharing(false)
      }
    } finally {
      setShareBusy(false)
    }
  }

  const applyVolcEncodeLive = async (
    quality: ScreenQuality,
    fps: ScreenFps,
    encodeMode: ScreenEncodeMode
  ) => {
    const engine = engineRef.current
    if (!engine || !sharing) return
    const enc = getVolcEncoderConfig(quality, fps, encodeMode)
    screenQualityRef.current = quality
    screenFpsRef.current = fps
    screenEncodeModeRef.current = encodeMode
    try {
      await engine.setScreenEncoderConfig(enc)
    } catch (e) {
      console.warn('[Meeting] setScreenEncoderConfig', e)
    }
  }

  const handleScreenQualityChange = async (q: ScreenQuality) => {
    if (q === screenQualityRef.current) return
    const label = getScreenQualityPreset(q).label
    setScreenQuality(q)
    screenQualityRef.current = q
    await applyVolcEncodeLive(q, screenFpsRef.current, screenEncodeModeRef.current)
    setToast(`已切换至 ${label}`)
  }

  const handleScreenFpsChange = async (f: ScreenFps) => {
    if (f === screenFpsRef.current) return
    setScreenFps(f)
    screenFpsRef.current = f
    await applyVolcEncodeLive(screenQualityRef.current, f, screenEncodeModeRef.current)
    setToast(`已切换至 ${f}fps`)
  }

  const handleScreenEncodeModeChange = async (em: ScreenEncodeMode) => {
    if (em === screenEncodeModeRef.current) return
    const opt = SCREEN_ENCODE_MODE_OPTIONS.find((o) => o.id === em)
    const label = opt?.label || em
    setScreenEncodeMode(em)
    screenEncodeModeRef.current = em
    await applyVolcEncodeLive(screenQualityRef.current, screenFpsRef.current, em)
    setToast(`已切换至${label}模式`)
  }

  const sendChat = async () => {
    const text = chatText.trim()
    if (!text) return
    setChatText('')
    try {
      const r = await fetch(`${API_URL}/meeting/${code}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          displayName,
          text,
        }),
      })
      const d = await r.json()
      if (r.ok) {
        setState((prev) => (prev ? { ...prev, chat: d.chat || prev.chat } : prev))
      } else setToast(d.error || '发送失败')
    } catch {
      setToast('发送失败')
    }
  }

  const approveShare = async (requestId: number, approve: boolean) => {
    try {
      const r = await fetch(`${API_URL}/meeting/${code}/share-${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, userType }),
      })
      const d = await r.json()
      if (!r.ok) {
        setToast(d.error || (approve ? '批准失败' : '拒绝失败'))
        return
      }
      applyState(d)
      const engine = engineRef.current
      if (engine && d.applicantUserId) {
        try {
          await engine.sendUserMessage(
            d.applicantUserId,
            JSON.stringify(
              approve
                ? {
                    t: 'ziye-voice',
                    action: 'share-approved',
                    by: displayName || '管理员',
                    toSessionId: d.applicantSessionId || undefined,
                    toUserId: d.applicantUserId,
                  }
                : {
                    t: 'ziye-voice',
                    action: 'share-rejected',
                    by: displayName || '管理员',
                    cooldownMs: d.cooldownMs || 5000,
                    toSessionId: d.applicantSessionId || undefined,
                    toUserId: d.applicantUserId,
                  }
            )
          )
        } catch {}
      }
      setToast(approve ? `已批准 ${d.applicantName || '成员'} 的共享` : `已拒绝 ${d.applicantName || '成员'} 的共享`)
    } catch {
      setToast(approve ? '批准失败' : '拒绝失败')
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => leaveMeeting(false)}
            className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm"
          >
            返回
          </button>
        </div>
      </div>
    )
  }

  if (connecting || !state) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-6">
        <p className="text-gray-400 text-sm animate-pulse">正在进入会议…</p>
      </div>
    )
  }

  const members = state.members
  const showScreen = !!state.sharer || sharing
  const isHost =
    userType === 'admin' ||
    (!!state.hostSessionId && state.hostSessionId === sessionIdRef.current)
  const focusedMember = focusedUserId
    ? members.find((m) => m.userId === focusedUserId) || null
    : null
  const showFocusStage = !!focusedMember
  const showMainStage = showScreen || showFocusStage
  const screenMaximized = isScreenFullscreen || screenExpanded
  const showScreenChrome = showScreen && !showFocusStage
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
    <div className={`fixed inset-0 z-[60] bg-[#1a1a1e] flex flex-col text-white ${screenMaximized ? 'bg-black' : ''}`}>
      {/* 邀请成员面板 */}
      {inviteOpen && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md max-h-[min(80vh,36rem)] flex flex-col rounded-2xl bg-[#18181e] shadow-2xl shadow-black/50 ring-1 ring-white/10 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between bg-[#1e1e26]">
              <div>
                <h3 className="text-sm font-semibold text-white">邀请成员</h3>
                <p className="text-[11px] text-white/40 mt-0.5">选择后对方页面将弹出进入会议提示</p>
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
                  className="w-full bg-black/30 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
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
                  className="inline-flex items-center gap-1.5 hover:text-cyan-200 disabled:opacity-40"
                >
                  {inviteAllFilteredSelected ? <CheckSquare size={14} className="text-cyan-400" /> : <Square size={14} />}
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
                        selected ? 'bg-cyan-500/15' : 'hover:bg-white/5'
                      }`}
                    >
                      {selected ? (
                        <CheckSquare size={18} className="text-cyan-400 shrink-0" />
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
                onClick={sendInvites}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600/40 hover:bg-cyan-600/55 disabled:opacity-40 text-cyan-50 text-sm font-medium inline-flex items-center justify-center gap-1.5"
              >
                {inviteBusy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                {inviteBusy ? '发送中…' : `发送邀请 (${inviteSelected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar — 会议号醒目展示 */}
      <header
        className={`h-14 shrink-0 flex items-center justify-between gap-3 px-4 bg-black/40 ${
          screenMaximized
            ? 'absolute top-0 left-0 right-0 z-40 opacity-0 hover:opacity-100 transition-opacity duration-200'
            : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {titleEditing ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-md">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value.slice(0, 64))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveMeetingTitle()
                  if (e.key === 'Escape') setTitleEditing(false)
                }}
                autoFocus
                maxLength={64}
                className="min-w-0 flex-1 bg-black/40 border border-cyan-500/35 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                placeholder="会议标题"
              />
              <button
                type="button"
                disabled={titleBusy}
                onClick={() => void saveMeetingTitle()}
                className="p-1.5 rounded-lg text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-50"
                title="保存"
              >
                {titleBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckIcon size={14} />}
              </button>
              <button
                type="button"
                disabled={titleBusy}
                onClick={() => setTitleEditing(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5"
                title="取消"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <span className="text-sm font-medium text-white/90 truncate">{state.title}</span>
              {isHost && (
                <button
                  type="button"
                  title="修改会议标题"
                  onClick={() => {
                    setTitleDraft(state.title || '')
                    setTitleEditing(true)
                  }}
                  className="p-1 rounded-md text-white/35 hover:text-cyan-300 hover:bg-white/5 shrink-0"
                >
                  <Pencil size={13} />
                </button>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={copyCode}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/15 hover:bg-cyan-500/25 px-3 py-1.5 transition-colors"
          title="点击复制会议号"
        >
          <span className="text-[10px] uppercase tracking-wider text-cyan-300/80">会议号</span>
          <span className="font-mono text-base tracking-[0.28em] text-cyan-100 font-semibold">{code}</span>
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-cyan-300/80" />}
        </button>
        <div className="flex items-center justify-end gap-3 text-xs text-white/50 min-w-0">
          {state.sharer && (
            <span className="text-purple-300/90 truncate hidden sm:inline">
              正在共享：{state.sharer.displayName}
            </span>
          )}
          <span className="tabular-nums">{formatTime(elapsed)}</span>
          <span className="inline-flex items-center gap-1">
            <Users size={13} /> {members.length}
          </span>
        </div>
      </header>

      {/* Admin share requests */}
      {userType === 'admin' && state.pendingShareRequests.length > 0 && !screenMaximized && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex flex-wrap gap-2 items-center">
          <Shield size={14} className="text-amber-300" />
          {state.pendingShareRequests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs bg-black/30 rounded-lg px-2 py-1">
              <span className="text-amber-100">{r.username} 申请共享</span>
              <button type="button" onClick={() => approveShare(r.id, true)} className="text-emerald-400 hover:underline">批准</button>
              <button type="button" onClick={() => approveShare(r.id, false)} className="text-red-400 hover:underline">拒绝</button>
            </div>
          ))}
        </div>
      )}

      {/* Main */}
      <div className={`flex-1 min-h-0 flex relative ${screenMaximized ? 'p-0' : ''}`}>
        <div className={`flex-1 min-w-0 flex flex-col gap-3 ${screenMaximized ? 'p-0 gap-0' : 'p-4'}`}>
          {/* 大画面：屏幕共享 或 点击放大的成员 */}
          <div
            ref={screenStageRef}
            className={`relative overflow-hidden bg-black ${
              screenMaximized
                ? 'flex-1 min-h-0 rounded-none border-0'
                : showMainStage
                  ? 'flex-1 min-h-[42%] rounded-2xl border border-white/10 bg-black/50'
                  : 'hidden'
            }`}
            onDoubleClick={() => {
              if (showScreen) void toggleScreenMaximize()
            }}
          >
            {/* 屏幕共享层 */}
            <div
              ref={screenContainerRef}
              className={`absolute inset-0 w-full h-full ${
                showScreen && !showFocusStage
                  ? 'z-10'
                  : showScreen
                    ? 'z-0 opacity-40'
                    : 'hidden'
              }`}
            />
            {/* 共享画面控制：全屏放大 */}
            {showScreenChrome && (
              <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
                <span className="text-sm text-white/90 bg-black/45 rounded-lg px-2.5 py-1 pointer-events-auto max-w-[60%] truncate">
                  {state.sharer?.displayName || (sharing ? '我' : '')}
                  {sharing ? ' · 正在共享' : ' · 屏幕共享'}
                </span>
                <button
                  type="button"
                  title={screenMaximized ? '退出全屏 (Esc)' : '全屏放大共享画面'}
                  onClick={() => void toggleScreenMaximize()}
                  className="pointer-events-auto p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white/80"
                >
                  {screenMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            )}
            {/* 放大成员层 */}
            {showFocusStage && focusedMember && (
              <div className="absolute inset-0 z-20 flex flex-col bg-[#1e1e24]">
                <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
                  <span className="text-sm text-white/90 bg-black/45 rounded-lg px-2.5 py-1 pointer-events-auto">
                    {focusedMember.displayName}
                    {cameraMap[focusedMember.userId] ||
                    (focusedMember.userId === userIdRef.current && cameraOn)
                      ? ''
                      : ' · 未开摄像头'}
                  </span>
                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    {showScreen && (
                      <button
                        type="button"
                        title="全屏放大共享画面"
                        onClick={() => void toggleScreenMaximize()}
                        className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white/80"
                      >
                        <Maximize2 size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      title="缩小"
                      onClick={() => setFocusedUserId(null)}
                      className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white/80"
                    >
                      <Minimize2 size={16} />
                    </button>
                  </div>
                </div>
                <div
                  ref={setFocusVideoRef}
                  className={`absolute inset-0 w-full h-full bg-black ${
                    cameraMap[focusedMember.userId] ||
                    (focusedMember.userId === userIdRef.current && cameraOn)
                      ? ''
                      : 'opacity-0'
                  }`}
                />
                {!(
                  cameraMap[focusedMember.userId] ||
                  (focusedMember.userId === userIdRef.current && cameraOn)
                ) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <MemberAvatar
                      avatar={focusedMember.avatar}
                      qq={focusedMember.qq}
                      name={focusedMember.displayName}
                      size="lg"
                      className="!w-28 !h-28 !text-3xl"
                    />
                    <span className="text-white/70 text-sm">{focusedMember.displayName}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Participants strip / grid */}
          <div
            className={`${
              screenMaximized
                ? 'hidden'
                : showMainStage
                  ? 'h-40 shrink-0'
                  : 'flex-1'
            } overflow-x-auto overflow-y-hidden flex items-center ${showMainStage ? 'justify-start sm:justify-center' : 'justify-center'}`}
          >
            <div
              className={`${
                showMainStage
                  ? 'flex flex-row flex-nowrap gap-3 p-1 w-max'
                  : `grid gap-3 p-1 ${
                      members.length <= 1
                        ? 'grid-cols-1'
                        : members.length === 2
                          ? 'grid-cols-2'
                          : members.length <= 4
                            ? 'grid-cols-2 md:grid-cols-4'
                            : 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                    }`
              }`}
            >
              {members.map((m) => {
                const isSpeaking = !!speakingMap[m.userId]
                const isSelf = m.userId === userIdRef.current || m.sessionId === sessionIdRef.current
                const peerForced = forcedMutedIds.has(m.userId)
                const selfForced = isSelf && micForcedOff
                const showForced = peerForced || selfForced
                const camOn = !!cameraMap[m.userId]
                const isFocused = focusedUserId === m.userId
                return (
                <div
                  key={m.sessionId || m.userId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFocusedUserId((prev) => (prev === m.userId ? null : m.userId))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setFocusedUserId((prev) => (prev === m.userId ? null : m.userId))
                    }
                  }}
                  className={`relative w-[10.5rem] h-[7.5rem] shrink-0 rounded-xl bg-[#25252b] border flex flex-col items-center justify-center gap-1 p-2 cursor-pointer select-none overflow-hidden transition-colors duration-150 ${
                    isFocused
                      ? 'border-cyan-400 ring-1 ring-cyan-400/40'
                      : isSpeaking && !showForced
                        ? 'border-purple-400 ring-1 ring-purple-400/50 shadow-[0_0_16px_rgba(168,85,247,0.35)]'
                        : showForced
                          ? 'border-orange-400/70 ring-1 ring-orange-400/30'
                          : m.isSharer
                            ? 'border-emerald-400/70 ring-1 ring-emerald-400/30'
                            : 'border-white/55 hover:border-white/80'
                  }`}
                >
                  {isHost && !isSelf && (
                    <div className="absolute top-1.5 right-1.5 z-20 flex flex-col gap-1">
                      <button
                        type="button"
                        title={peerForced ? '解除禁言' : '禁言'}
                        onClick={(e) => {
                          e.stopPropagation()
                          hostForceMutePeer(m.userId, !peerForced)
                        }}
                        className={`p-1 rounded-md transition-colors ${
                          peerForced
                            ? 'bg-orange-500/25 text-orange-300 hover:bg-orange-500/40'
                            : 'bg-black/40 text-white/50 hover:text-white hover:bg-black/60'
                        }`}
                      >
                        <MicOff size={12} />
                      </button>
                      <button
                        type="button"
                        title="移出会议"
                        onClick={(e) => {
                          e.stopPropagation()
                          openKickConfirm(m)
                        }}
                        className="p-1 rounded-md bg-black/40 text-white/50 hover:text-red-300 hover:bg-red-600/30 transition-colors"
                      >
                        <UserX size={12} />
                      </button>
                    </div>
                  )}

                  {/* 摄像头画面（放大时隐藏小窗避免抢占播放器） */}
                  <div
                    ref={getTileVideoRef(m.userId)}
                    className={`absolute inset-0 z-0 ${camOn && !isFocused ? '' : 'hidden'}`}
                  />

                  {(!camOn || isFocused) && (
                    <div className="relative z-10 flex flex-col items-center gap-1.5 pointer-events-none">
                      <MemberAvatar avatar={m.avatar} qq={m.qq} name={m.displayName} size="lg" />
                    </div>
                  )}

                  <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10 flex items-center justify-center gap-1 pointer-events-none">
                    <span className={`text-[11px] truncate max-w-[5.5rem] ${showForced ? 'text-orange-200/90' : 'text-white/90 drop-shadow'}`}>
                      {m.displayName}
                      {m.userType === 'admin' ? ' ·管理' : ''}
                    </span>
                    {showForced ? (
                      <MicOff size={11} className="text-orange-400 shrink-0" />
                    ) : m.micOn || (isSelf && micOn) ? (
                      <Mic size={11} className={`shrink-0 ${isSpeaking ? 'text-purple-300' : 'text-blue-400'}`} />
                    ) : (
                      <MicOff size={11} className="text-white/35 shrink-0" />
                    )}
                    {camOn && <Video size={11} className="text-emerald-300 shrink-0" />}
                  </div>
                  {showForced && (
                    <span className="absolute top-1.5 left-1.5 z-10 text-[9px] text-orange-400/90 bg-black/40 px-1 rounded">
                      禁言
                    </span>
                  )}
                </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Chat drawer — QQ 风格气泡 */}
        {chatOpen && (
          <aside className="w-[19.5rem] shrink-0 bg-[#0e0e12]/95 flex flex-col shadow-[-12px_0_28px_rgba(0,0,0,0.35)]">
            <div className="h-11 px-3 flex items-center justify-between bg-[#16161c]">
              <span className="text-sm text-white/75 font-medium">聊天</span>
              <button type="button" onClick={() => setChatOpen(false)} className="text-white/35 hover:text-white/80 p-1 rounded-md hover:bg-white/5">
                <X size={16} />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse at 20% 0%, rgba(88,80,140,0.08), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(40,90,120,0.06), transparent 50%)',
              }}
            >
              {(state.chat || []).map((msg) => {
                const isSelf =
                  msg.fromSessionId === sessionIdRef.current ||
                  (!msg.fromSessionId && msg.from === displayName)
                const peer =
                  members.find(
                    (m) =>
                      (msg.fromSessionId && m.sessionId === msg.fromSessionId) ||
                      m.displayName === msg.from
                  ) || null
                const avatar = msg.avatar ?? peer?.avatar
                const qq = msg.qq ?? peer?.qq
                const time = new Date(msg.at).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <MemberAvatar
                      avatar={avatar}
                      qq={qq}
                      name={msg.from}
                      size="sm"
                      className={`!w-8 !h-8 shrink-0 ${isSelf ? '' : 'mt-[14px]'}`}
                    />
                    <div className={`max-w-[75%] min-w-0 flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                      {!isSelf && (
                        <span className="text-[10px] text-white/40 mb-0.5 px-1 truncate max-w-full leading-none">
                          {msg.from}
                        </span>
                      )}
                      <div
                        className={`relative px-2.5 py-1.5 text-[13px] leading-relaxed break-words shadow-sm ${
                          isSelf
                            ? 'bg-[#95ec69] text-[#111] rounded-2xl rounded-br-md'
                            : 'bg-[#2a2a32] text-white/90 rounded-2xl rounded-bl-md'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[9px] text-white/25 mt-0.5 px-1">{time}</span>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="p-2.5 bg-[#16161c] flex gap-2 items-end">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="说点什么…"
                className="flex-1 bg-[#22222a] rounded-2xl px-3.5 py-2 text-[13px] text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#95ec69]/35"
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={!chatText.trim()}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#95ec69] text-[#16380a] hover:brightness-105 disabled:opacity-35 disabled:hover:brightness-100 transition"
                title="发送"
              >
                <Send size={15} />
              </button>
            </div>
          </aside>
        )}
      </div>

      {toast && (
        <div className={`absolute left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/75 border border-white/10 text-xs text-white/90 ${
          screenMaximized ? 'bottom-6' : 'bottom-24'
        }`}>
          {toast}
          <button type="button" className="ml-2 text-white/40" onClick={() => setToast('')}>×</button>
        </div>
      )}

      {/* 共享中可调；主持人未共享时也可预设，下次共享生效 */}
      {(sharing || isHost) && !screenMaximized && (
        <div className="shrink-0 flex items-center justify-center gap-1.5 flex-wrap px-3 py-1.5 bg-black/30">
          {!sharing && (
            <span className="text-[10px] text-white/35 mr-0.5">共享画质预设</span>
          )}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5" title="编码模式">
            {SCREEN_ENCODE_MODE_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                title={o.hint}
                onClick={() => void handleScreenEncodeModeChange(o.id)}
                className={`min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  screenEncodeMode === o.id
                    ? 'bg-cyan-600/45 text-cyan-100'
                    : 'text-white/45 hover:text-white hover:bg-white/10'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5" title="清晰度（影响码率）">
            {SCREEN_QUALITY_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                title={`${o.label} · 最高约 ${getVolcMaxKbps(o.id, screenFps, screenEncodeMode)}kbps`}
                onClick={() => void handleScreenQualityChange(o.id)}
                className={`min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  screenQuality === o.id
                    ? 'bg-cyan-600/45 text-cyan-100'
                    : 'text-white/45 hover:text-white hover:bg-white/10'
                }`}
              >
                {o.id}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5" title="帧率">
            {SCREEN_FPS_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                title={o.label}
                onClick={() => void handleScreenFpsChange(o.id)}
                className={`min-w-[2.75rem] px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  screenFps === o.id
                    ? 'bg-cyan-600/45 text-cyan-100'
                    : 'text-white/45 hover:text-white hover:bg-white/10'
                }`}
              >
                {o.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <footer
        className={`h-[4.5rem] shrink-0 flex items-center justify-center gap-1 sm:gap-2 px-3 bg-black/40 backdrop-blur-md ${
          screenMaximized
            ? 'absolute bottom-0 left-0 right-0 z-40 opacity-0 hover:opacity-100 transition-opacity duration-200'
            : ''
        }`}
      >
        <div className="relative flex items-end" ref={micMenuRef}>
          <ToolBtn
            active={!micOn || micForcedOff}
            danger={!micOn || micForcedOff}
            label={micForcedOff ? '禁言中' : micOn ? '静音' : '取消静音'}
            onClick={toggleMic}
            icon={micOn && !micForcedOff ? <Mic size={20} /> : <MicOff size={20} />}
          />
          <button
            type="button"
            title="麦克风音量"
            onClick={() => {
              setListenMenuOpen(false)
              setCameraMenuOpen(false)
              setMicMenuOpen((v) => !v)
            }}
            className="absolute -top-1 -right-1 z-10 p-0.5 rounded-md bg-black/60 text-white/70 hover:text-white hover:bg-black/80 border border-white/10"
          >
            <ChevronUp size={12} className={micMenuOpen ? 'rotate-180' : ''} />
          </button>
          {micMenuOpen && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 z-50 w-56 rounded-xl bg-[#1c1c22] shadow-xl shadow-black/50 ring-1 ring-white/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-white/45 flex items-center gap-1.5">
                  <Mic size={12} />
                  麦克风发送音量
                </span>
                <span className="text-[11px] tabular-nums text-cyan-300/90 font-mono">{localMicVolume}%</span>
              </div>
              <p className="text-[10px] text-white/30 mb-2">只影响别人听到你的声音大小</p>
              <div className="flex items-center gap-2">
                <Volume2 size={13} className="text-white/40 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={VOLC_MIC_VOLUME_MAX}
                  step={5}
                  value={localMicVolume}
                  onChange={(e) => handleLocalMicVolumeChange(Number(e.target.value))}
                  className="flex-1 h-1.5 appearance-none bg-white/10 rounded-full outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                />
              </div>
            </div>
          )}
        </div>
        <div className="relative flex items-end" ref={listenMenuRef}>
          <ToolBtn
            active={listenMenuOpen}
            label="收听音量"
            onClick={() => {
              setMicMenuOpen(false)
              setCameraMenuOpen(false)
              setListenMenuOpen((v) => !v)
            }}
            icon={<Volume2 size={20} />}
          />
          {listenMenuOpen && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl bg-[#1c1c22] shadow-xl shadow-black/50 ring-1 ring-white/10 overflow-hidden">
              <div className="px-3 py-2 text-[11px] text-white/45 flex items-center gap-1.5 border-b border-white/[0.06]">
                <Volume2 size={12} />
                收听音量（仅本机）
              </div>
              <div className="max-h-56 overflow-y-auto p-2 space-y-2">
                {members.filter((m) => m.userId !== userIdRef.current).length === 0 ? (
                  <p className="text-center text-white/35 text-xs py-4">暂无其他成员</p>
                ) : (
                  members
                    .filter((m) => m.userId !== userIdRef.current)
                    .map((m) => {
                      const vol = peerVolumes[m.userId] ?? VOLC_MIC_VOLUME_DEFAULT
                      const muted = vol <= 0
                      return (
                        <div key={m.userId} className="rounded-lg bg-black/25 px-2.5 py-2">
                          <div className="flex items-center gap-2 mb-1.5 min-w-0">
                            <MemberAvatar avatar={m.avatar} qq={m.qq} name={m.displayName} size="sm" className="!w-6 !h-6" />
                            <span className="text-xs text-white/80 truncate flex-1">{m.displayName}</span>
                            <span className="text-[10px] tabular-nums text-white/40 w-8 text-right">{vol}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title={muted ? '取消静音' : '本机静音此人'}
                              onClick={() => togglePeerListenMute(m.userId)}
                              className={`shrink-0 p-0.5 rounded ${muted ? 'text-orange-400' : 'text-white/40 hover:text-white/70'}`}
                            >
                              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={VOLC_MIC_VOLUME_MAX}
                              step={5}
                              value={vol}
                              onChange={(e) => handlePeerVolumeChange(m.userId, Number(e.target.value))}
                              className="flex-1 h-1.5 appearance-none bg-white/10 rounded-full outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                            />
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </div>
          )}
        </div>
        <div className="relative flex items-end" ref={cameraMenuRef}>
          <ToolBtn
            active={!cameraOn}
            danger={!cameraOn}
            label={cameraOn ? '关摄像头' : '开摄像头'}
            onClick={toggleCamera}
            icon={cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          />
          <button
            type="button"
            title="切换摄像头"
            onClick={async () => {
              setMicMenuOpen(false)
              setListenMenuOpen(false)
              await refreshVideoDevices()
              setCameraMenuOpen((v) => !v)
            }}
            className={`absolute -top-1 -right-1 z-10 p-0.5 rounded-md bg-black/60 text-white/70 hover:text-white hover:bg-black/80 border border-white/10 ${
              videoDevices.length <= 1 && !cameraMenuOpen ? 'opacity-50' : ''
            }`}
          >
            <ChevronUp size={12} className={cameraMenuOpen ? 'rotate-180' : ''} />
          </button>
          {cameraMenuOpen && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 z-50 w-52 rounded-xl bg-[#1c1c22] shadow-xl shadow-black/50 ring-1 ring-white/10 overflow-hidden">
              <div className="px-3 py-2 text-[11px] text-white/45 flex items-center gap-1.5 border-b border-white/[0.06]">
                <SwitchCamera size={12} />
                选择摄像头
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {videoDevices.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-white/40">未检测到摄像头</p>
                ) : (
                  videoDevices.map((d) => {
                    const active = d.deviceId === videoDeviceId
                    return (
                      <button
                        key={d.deviceId}
                        type="button"
                        onClick={() => switchCamera(d.deviceId)}
                        className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${
                          active
                            ? 'bg-cyan-500/15 text-cyan-100'
                            : 'text-white/75 hover:bg-white/5'
                        }`}
                      >
                        {d.label}
                        {active ? ' · 当前' : ''}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
        <ToolBtn
          active={sharing || shareAwaitingApproval}
          label={
            sharing
              ? '停止共享'
              : shareAwaitingApproval
                ? '等待批准'
                : shareApprovedPrompt
                  ? '开始共享'
                  : '共享屏幕'
          }
          onClick={() => (sharing ? stopShareLocal() : startShare())}
          disabled={shareBusy}
          highlight={!sharing}
          icon={sharing ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
        />
        <ToolBtn
          active={chatOpen}
          label="聊天"
          onClick={() => setChatOpen((v) => !v)}
          icon={<MessageSquare size={20} />}
        />
        {isHost && (
          <ToolBtn
            active={inviteOpen}
            label="邀请"
            onClick={openInvitePanel}
            highlight
            icon={<UserPlus size={20} />}
          />
        )}
        <div className="w-px h-8 bg-white/10 mx-1" />
        {userType === 'admin' || isHost ? (
          <button
            type="button"
            onClick={() => leaveMeeting(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
          >
            <PhoneOff size={16} />
            结束会议
          </button>
        ) : (
          <button
            type="button"
            onClick={() => leaveMeeting(false)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
          >
            <PhoneOff size={16} />
            离开
          </button>
        )}
      </footer>

      {kickTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a22] ring-1 ring-white/10 shadow-2xl p-5 space-y-4">
            <h3 className="text-white font-semibold text-base">移出会议</h3>
            <p className="text-sm text-white/65 leading-relaxed">
              确定将 <span className="text-white font-medium">{kickTarget.displayName}</span> 移出会议？
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                className="sr-only"
                checked={kickBanRejoin}
                onChange={(e) => setKickBanRejoin(e.target.checked)}
              />
              <span
                aria-hidden
                className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                  kickBanRejoin
                    ? 'bg-cyan-500 border-cyan-400 text-white'
                    : 'bg-black/40 border-white/35 text-transparent group-hover:border-white/55'
                }`}
              >
                <CheckIcon size={11} strokeWidth={3} />
              </span>
              <span className="text-sm text-white/75 leading-snug">
                不允许此人再次进入此会议
                <span className="block text-xs text-white/40 mt-0.5">仅对当前会议生效，会议结束后失效</span>
              </span>
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setKickTarget(null)}
                disabled={kickBusy}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmKickPeer()}
                disabled={kickBusy}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {kickBusy ? '处理中…' : '确认移出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolBtn({
  icon,
  label,
  onClick,
  active,
  danger,
  highlight,
  disabled,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  active?: boolean
  danger?: boolean
  highlight?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 min-w-[3.75rem] px-2 py-1.5 rounded-xl transition-colors disabled:opacity-50 ${
        danger
          ? 'bg-red-600/25 text-red-200'
          : active
            ? 'bg-white/15 text-white'
            : highlight
              ? 'text-emerald-300 hover:bg-emerald-500/15'
              : 'text-white/70 hover:bg-white/8 hover:text-white'
      }`}
    >
      {icon}
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  )
}
