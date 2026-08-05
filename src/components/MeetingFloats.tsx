import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { Video, X, LogIn, GripVertical, PhoneOff, Monitor } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

function getStudentMemberId(): number | null {
  try {
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentUser) {
      const parsed = JSON.parse(studentUser)
      const id = Number(parsed.id)
      return Number.isFinite(id) && id > 0 ? id : null
    }
  } catch {}
  return null
}

function getAdminName(): string {
  try {
    const adminUser = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (adminUser) {
      const parsed = JSON.parse(adminUser)
      return parsed.username || parsed.name || '管理员'
    }
  } catch {}
  return '管理员'
}

function isStudentLoggedIn() {
  return !!(localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken'))
}

function isAdminLoggedIn() {
  return !!(localStorage.getItem('token') || sessionStorage.getItem('token'))
}

type FloatInvite =
  | {
      kind: 'meeting'
      code: string
      title: string
      invitedBy: string
      invitedAt: number
      memberCount: number
    }
  | {
      kind: 'room'
      roomId: string
      hostName: string
      invitedBy: string
      invitedAt: number
      viewerCount: number
      mode?: string
    }

/** 学员端：会议 / 屏幕共享邀请浮窗（全站） */
export function MeetingInviteFloat() {
  const navigate = useNavigate()
  const location = useLocation()
  const [invite, setInvite] = useState<FloatInvite | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const poll = useCallback(async () => {
    // 学员登录即可收邀请；管理控制台页不弹
    if (!isStudentLoggedIn()) {
      setInvite(null)
      return
    }
    if (location.pathname.startsWith('/admin')) {
      setInvite(null)
      return
    }
    const memberId = getStudentMemberId()
    if (!memberId) {
      setInvite(null)
      return
    }
    const params = location.pathname.includes('screen-share')
      ? new URLSearchParams(location.search)
      : null
    const currentMeeting = params?.get('meeting')?.toUpperCase() || null
    const currentRoom = params?.get('room')?.toUpperCase() || null
    try {
      const [mr, rr] = await Promise.all([
        fetch(`${API_URL}/meeting/invites/pending?memberId=${memberId}`),
        fetch(`${API_URL}/room/invites/pending?memberId=${memberId}`),
      ])
      const md = await mr.json()
      const rd = await rr.json()
      const meetingInvite: FloatInvite | null =
        md.invite && md.invite.code !== currentMeeting
          ? {
              kind: 'meeting',
              code: md.invite.code,
              title: md.invite.title,
              invitedBy: md.invite.invitedBy,
              invitedAt: md.invite.invitedAt || 0,
              memberCount: md.invite.memberCount || 0,
            }
          : null
      const roomInvite: FloatInvite | null =
        rd.invite && rd.invite.roomId !== currentRoom
          ? {
              kind: 'room',
              roomId: rd.invite.roomId,
              hostName: rd.invite.hostName,
              invitedBy: rd.invite.invitedBy,
              invitedAt: rd.invite.invitedAt || 0,
              viewerCount: rd.invite.viewerCount || 0,
              mode: rd.invite.mode,
            }
          : null
      // 同时有邀请时取较新的一条
      let next: FloatInvite | null = null
      if (meetingInvite && roomInvite) {
        next = (meetingInvite.invitedAt || 0) >= (roomInvite.invitedAt || 0) ? meetingInvite : roomInvite
      } else {
        next = meetingInvite || roomInvite
      }
      setInvite(next)
      if (next) {
        setPos((prev) => prev ?? {
          x: Math.max(16, window.innerWidth - 320),
          y: Math.max(88, Math.round(window.innerHeight / 2 - 100)),
        })
      }
    } catch {
      setInvite(null)
    }
  }, [location.pathname, location.search])

  useEffect(() => {
    poll()
    const iv = setInterval(poll, 1500)
    return () => clearInterval(iv)
  }, [poll])

  const startDrag = (e: React.MouseEvent, p: { x: number; y: number }) => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: p.x,
      originY: p.y,
    }
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setPos({
        x: Math.min(Math.max(8, drag.originX + ev.clientX - drag.startX), Math.max(8, window.innerWidth - 300)),
        y: Math.min(Math.max(8, drag.originY + ev.clientY - drag.startY), Math.max(8, window.innerHeight - 180)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const respond = async (accept: boolean) => {
    const memberId = getStudentMemberId()
    if (!invite || !memberId || busy) return
    setBusy(true)
    try {
      if (invite.kind === 'meeting') {
        await fetch(`${API_URL}/meeting/invites/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId,
            code: invite.code,
            accept,
            displayName: (() => {
              try {
                const u = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
                if (u) {
                  const p = JSON.parse(u)
                  return p.nickname || p.username || ''
                }
              } catch {}
              return ''
            })(),
          }),
        })
        const code = invite.code
        setInvite(null)
        if (accept) navigate(`/screen-share?meeting=${encodeURIComponent(code)}`)
      } else {
        await fetch(`${API_URL}/room/invites/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId,
            roomId: invite.roomId,
            accept,
            displayName: (() => {
              try {
                const u = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
                if (u) {
                  const p = JSON.parse(u)
                  return p.nickname || p.username || ''
                }
              } catch {}
              return ''
            })(),
          }),
        })
        const roomId = invite.roomId
        setInvite(null)
        if (accept) navigate(`/screen-share?room=${encodeURIComponent(roomId)}`)
      }
    } catch {
    } finally {
      setBusy(false)
    }
  }

  if (!invite || !pos) return null

  const isMeeting = invite.kind === 'meeting'
  const accent = isMeeting ? 'cyan' : 'purple'

  return createPortal(
    <aside
      className="fixed z-[70] w-[18rem] pointer-events-none"
      style={{ left: pos.x, top: pos.y }}
      aria-label={isMeeting ? '会议邀请' : '屏幕共享邀请'}
    >
      <div className="pointer-events-auto">
        <div className={`student-float-panel student-float-panel--${accent} overflow-hidden`}>
          <div
            className="flex items-center gap-3 p-4 cursor-grab active:cursor-grabbing select-none"
            onMouseDown={(e) => startDrag(e, pos)}
          >
            <div className={`p-2.5 rounded-2xl ring-1 shrink-0 ${
              isMeeting ? 'bg-cyan-400/15 ring-cyan-300/20' : 'bg-purple-400/15 ring-purple-300/20'
            }`}>
              {isMeeting
                ? <Video className="text-cyan-300" size={18} />
                : <Monitor className="text-purple-300" size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-0.5 flex items-center gap-1">
                <GripVertical size={11} className="opacity-60" />
                {isMeeting ? 'Meeting Invite' : 'Screen Share'}
              </div>
              <h3 className="text-white font-semibold leading-tight truncate">
                {isMeeting ? invite.title : `${invite.hostName} 的共享`}
              </h3>
            </div>
            <button
              type="button"
              title="忽略"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => respond(false)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-4 pb-4 space-y-3">
            <p className="text-sm text-white/70 leading-relaxed">
              <span className={isMeeting ? 'text-cyan-200' : 'text-purple-200'}>{invite.invitedBy}</span>
              {isMeeting ? ' 邀请你加入会议' : ' 邀请你观看屏幕共享'}
              <span className="block text-xs text-white/45 mt-1 tracking-wider">
                {isMeeting ? (
                  <>
                    会议号{' '}
                    <span className="font-mono">{invite.code}</span>
                    {' '}· {invite.memberCount} 人在房
                  </>
                ) : (
                  <>
                    房间号{' '}
                    <span className="font-mono">{invite.roomId}</span>
                    {' '}· {invite.viewerCount} 人观看
                  </>
                )}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => respond(true)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                  isMeeting
                    ? 'bg-cyan-600/35 hover:bg-cyan-600/50 border border-cyan-400/35 text-cyan-50'
                    : 'bg-purple-600/35 hover:bg-purple-600/50 border border-purple-400/35 text-purple-50'
                }`}
              >
                <LogIn size={14} />
                {busy ? '进入中…' : isMeeting ? '进入会议' : '进入观看'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => respond(false)}
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-sm"
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>,
    document.body
  )
}

type ActiveMeeting = {
  code: string
  title: string
  createdBy: string
  memberCount: number
  hasSharer: boolean
  createdAt: number
}

/** 管理端：进行中的会议浮窗（类似屏幕共享活跃房间） */
export function AdminMeetingsFloat() {
  const navigate = useNavigate()
  const location = useLocation()
  const [meetings, setMeetings] = useState<ActiveMeeting[]>([])
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [endingCode, setEndingCode] = useState<string | null>(null)
  const [endConfirmCode, setEndConfirmCode] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const poll = useCallback(async () => {
    if (!isAdminLoggedIn()) {
      setMeetings([])
      return
    }
    try {
      const r = await fetch(`${API_URL}/meeting/active`)
      const d = await r.json()
      const list: ActiveMeeting[] = d.meetings || []
      setMeetings(list)
      if (list.length > 0) {
        setPos((prev) => prev ?? {
          x: 16,
          y: Math.max(88, Math.round(window.innerHeight / 2 - 160)),
        })
      }
    } catch {
      setMeetings([])
    }
  }, [])

  useEffect(() => {
    poll()
    const iv = setInterval(poll, 3000)
    return () => clearInterval(iv)
  }, [poll])

  const startDrag = (e: React.MouseEvent, p: { x: number; y: number }) => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: p.x,
      originY: p.y,
    }
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setPos({
        x: Math.min(Math.max(8, drag.originX + ev.clientX - drag.startX), Math.max(8, window.innerWidth - 300)),
        y: Math.min(Math.max(8, drag.originY + ev.clientY - drag.startY), Math.max(8, window.innerHeight - 220)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const endMeeting = async (code: string) => {
    if (endingCode) return
    setEndingCode(code)
    try {
      const r = await fetch(`${API_URL}/meeting/${code}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminName: getAdminName(),
          userType: 'admin',
        }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) {
        setEndConfirmCode(null)
        return
      }
      setMeetings((prev) => prev.filter((m) => m.code !== code))
      setEndConfirmCode(null)
    } catch {
    } finally {
      setEndingCode(null)
      void poll()
    }
  }

  // 正在参与某场会议时，不展示该会议（避免盖在会议 UI 上）
  const inMeetingCode = location.pathname.includes('screen-share')
    ? new URLSearchParams(location.search).get('meeting')?.toUpperCase() || null
    : null
  const visibleMeetings = inMeetingCode
    ? meetings.filter((m) => m.code !== inMeetingCode)
    : meetings

  if (!isAdminLoggedIn()) return null
  if (visibleMeetings.length === 0 && !endConfirmCode) return null
  if (visibleMeetings.length > 0 && !pos && !endConfirmCode) return null

  return (
    <>
      {visibleMeetings.length > 0 && pos && createPortal(
        <aside
          className="fixed z-[70] w-[18.5rem] pointer-events-none"
          style={{ left: pos.x, top: pos.y }}
          aria-label="进行中的会议"
        >
          <div className="pointer-events-auto">
            <div className="student-float-panel student-float-panel--cyan overflow-hidden">
              <div
                className="flex items-center gap-3 p-4 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={(e) => startDrag(e, pos)}
              >
                <div className="p-2.5 rounded-2xl ring-1 shrink-0 bg-cyan-400/15 ring-cyan-300/20">
                  <Video className="text-cyan-300" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-0.5 flex items-center gap-1">
                    <GripVertical size={11} className="opacity-60" />
                    Live Meeting
                  </div>
                  <h3 className="text-white font-semibold leading-tight">
                    进行中的会议
                    <span className="ml-1.5 text-xs font-normal text-cyan-300">{visibleMeetings.length}</span>
                  </h3>
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setCollapsed((v) => !v)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 text-xs"
                >
                  {collapsed ? '展开' : '收起'}
                </button>
              </div>
              {!collapsed && (
                <div className="px-4 pb-4 space-y-2.5 max-h-[min(50vh,20rem)] overflow-y-auto sidebar-scrollbar">
                  {visibleMeetings.map((m) => (
                    <div
                      key={m.code}
                      className="rounded-xl bg-black/25 border border-white/10 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-white text-sm font-medium truncate">{m.title}</span>
                        {m.hasSharer && (
                          <span className="text-[10px] text-purple-300 shrink-0">共享中</span>
                        )}
                      </div>
                      <div className="text-[10px] text-white/40 tracking-wider">
                        <span className="font-mono">{m.code}</span>
                        {' '}· {m.createdBy} · {m.memberCount} 人
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/screen-share?meeting=${encodeURIComponent(m.code)}`)}
                          className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-cyan-600/25 hover:bg-cyan-600/40 border-cyan-400/35 text-cyan-100"
                        >
                          <LogIn size={12} />
                          一键加入
                        </button>
                        <button
                          type="button"
                          disabled={endingCode === m.code}
                          onClick={() => setEndConfirmCode(m.code)}
                          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-500/35 bg-red-600/25 hover:bg-red-600/40 text-red-100 disabled:opacity-50"
                          title="结束会议"
                        >
                          <PhoneOff size={12} />
                          {endingCode === m.code ? '…' : '结束'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>,
        document.body
      )}

      {endConfirmCode && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a22] ring-1 ring-white/10 shadow-2xl p-5 space-y-4">
            <h3 className="text-white font-semibold text-base">结束会议</h3>
            <p className="text-sm text-white/65 leading-relaxed">
              确定结束会议{' '}
              <span className="font-mono text-cyan-300 tracking-wider">{endConfirmCode}</span>
              ？所有成员将被移出。
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEndConfirmCode(null)}
                disabled={!!endingCode}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => endMeeting(endConfirmCode)}
                disabled={!!endingCode}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {endingCode === endConfirmCode ? '结束中…' : '确定结束'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

type LiveRoomItem =
  | {
      kind: 'share'
      roomId: string
      hostName: string
      mode: string
      viewerCount: number
    }
  | {
      kind: 'meeting'
      code: string
      title: string
      createdBy: string
      memberCount: number
      hasSharer: boolean
    }

type MyJoinStatus = { key: string; status: 'pending' | 'approved' | 'rejected' }

function getStudentDisplayName(): string {
  try {
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentUser) {
      const parsed = JSON.parse(studentUser)
      return parsed.nickname || parsed.username || '学员'
    }
  } catch {}
  return '学员'
}

/** 学员端：在线会议 / 屏幕共享列表，申请进入需发起者同意 */
export function StudentLiveRoomsFloat() {
  const navigate = useNavigate()
  const location = useLocation()
  const [items, setItems] = useState<LiveRoomItem[]>([])
  const [myStatuses, setMyStatuses] = useState<Record<string, MyJoinStatus['status']>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const enteredRef = useRef<Set<string>>(new Set())

  const poll = useCallback(async () => {
    // 已在屏幕共享/会议页时不展示在线房间（本人已在房间流程中）
    if (
      !isStudentLoggedIn() ||
      location.pathname.startsWith('/admin') ||
      location.pathname.includes('screen-share')
    ) {
      setItems([])
      return
    }
    const memberId = getStudentMemberId()
    if (!memberId) {
      setItems([])
      return
    }

    const params = location.pathname.includes('screen-share')
      ? new URLSearchParams(location.search)
      : null
    const currentMeeting = params?.get('meeting')?.toUpperCase() || null
    const currentRoom = params?.get('room')?.toUpperCase() || null

    try {
      const [roomRes, meetRes, roomMine, meetMine] = await Promise.all([
        fetch(`${API_URL}/room/live`),
        fetch(`${API_URL}/meeting/active`),
        fetch(`${API_URL}/room/join-requests/mine?memberId=${memberId}`),
        fetch(`${API_URL}/meeting/join-requests/mine?memberId=${memberId}`),
      ])
      const rd = await roomRes.json()
      const md = await meetRes.json()
      const rMine = await roomMine.json()
      const mMine = await meetMine.json()

      const statusMap: Record<string, MyJoinStatus['status']> = {}
      for (const r of rMine.requests || []) {
        statusMap[`share:${String(r.roomId).toUpperCase()}`] = r.status
      }
      for (const r of mMine.requests || []) {
        statusMap[`meeting:${String(r.code).toUpperCase()}`] = r.status
      }
      setMyStatuses(statusMap)

      // 批准后自动进入（仅一次）
      for (const [key, status] of Object.entries(statusMap)) {
        if (status !== 'approved' || enteredRef.current.has(key)) continue
        enteredRef.current.add(key)
        if (key.startsWith('share:')) {
          const roomId = key.slice(6)
          if (roomId !== currentRoom) {
            navigate(`/screen-share?room=${encodeURIComponent(roomId)}&fromRequest=1`)
          }
        } else if (key.startsWith('meeting:')) {
          const code = key.slice(8)
          if (code !== currentMeeting) {
            navigate(`/screen-share?meeting=${encodeURIComponent(code)}&fromRequest=1`)
          }
        }
      }

      const list: LiveRoomItem[] = []
      for (const room of rd.rooms || []) {
        const roomId = String(room.roomId || '').toUpperCase()
        if (!roomId || roomId === currentRoom) continue
        list.push({
          kind: 'share',
          roomId,
          hostName: room.hostName || '未知',
          mode: room.mode || 'peerjs',
          viewerCount: room.viewerCount || 0,
        })
      }
      for (const m of md.meetings || []) {
        const code = String(m.code || '').toUpperCase()
        if (!code || code === currentMeeting) continue
        list.push({
          kind: 'meeting',
          code,
          title: m.title || '紫夜会议',
          createdBy: m.createdBy || '',
          memberCount: m.memberCount || 0,
          hasSharer: !!m.hasSharer,
        })
      }
      setItems(list)
      if (list.length > 0) {
        setPos((prev) => prev ?? {
          x: 16,
          y: Math.max(88, Math.round(window.innerHeight / 2 - 160)),
        })
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[StudentLiveRoomsFloat]', e)
    }
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    poll()
    const iv = setInterval(poll, 2500)
    return () => clearInterval(iv)
  }, [poll])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  const startDrag = (e: React.MouseEvent, p: { x: number; y: number }) => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: p.x,
      originY: p.y,
    }
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setPos({
        x: Math.min(Math.max(8, drag.originX + ev.clientX - drag.startX), Math.max(8, window.innerWidth - 300)),
        y: Math.min(Math.max(8, drag.originY + ev.clientY - drag.startY), Math.max(8, window.innerHeight - 220)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const applyJoin = async (item: LiveRoomItem) => {
    const memberId = getStudentMemberId()
    if (!memberId || busyKey) return
    const displayName = getStudentDisplayName()
    const key = item.kind === 'share' ? `share:${item.roomId}` : `meeting:${item.code}`
    setBusyKey(key)
    try {
      const url = item.kind === 'share'
        ? `${API_URL}/room/${item.roomId}/join-request`
        : `${API_URL}/meeting/${item.code}/join-request`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, displayName }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) throw new Error(d.error || '申请失败')
      if (d.status === 'approved' || d.alreadyIn) {
        setMyStatuses((prev) => ({ ...prev, [key]: 'approved' }))
        enteredRef.current.add(key)
        if (item.kind === 'share') {
          navigate(`/screen-share?room=${encodeURIComponent(item.roomId)}&fromRequest=1`)
        } else {
          navigate(`/screen-share?meeting=${encodeURIComponent(item.code)}&fromRequest=1`)
        }
      } else {
        setMyStatuses((prev) => ({ ...prev, [key]: 'pending' }))
        setToast('已发送申请，等待发起者同意')
      }
    } catch (e: any) {
      setToast(e?.message || '申请失败')
    } finally {
      setBusyKey(null)
    }
  }

  if (
    !isStudentLoggedIn() ||
    location.pathname.startsWith('/admin') ||
    location.pathname.includes('screen-share')
  ) {
    return null
  }
  if (items.length === 0 || !pos) return null

  return createPortal(
    <aside
      className="fixed z-[65] w-[18.5rem] pointer-events-none"
      style={{ left: pos.x, top: pos.y }}
      aria-label="在线房间"
    >
      <div className="pointer-events-auto">
        <div className="student-float-panel student-float-panel--purple overflow-hidden">
          <div
            className="flex items-center gap-3 p-4 cursor-grab active:cursor-grabbing select-none"
            onMouseDown={(e) => startDrag(e, pos)}
          >
            <div className="p-2.5 rounded-2xl ring-1 shrink-0 bg-purple-400/15 ring-purple-300/20">
              <Monitor className="text-purple-300" size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-0.5 flex items-center gap-1">
                <GripVertical size={11} className="opacity-60" />
                Live Rooms
              </div>
              <h3 className="text-white font-semibold leading-tight">
                在线房间
                <span className="ml-1.5 text-xs font-normal text-purple-300">{items.length}</span>
              </h3>
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setCollapsed((v) => !v)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 text-xs"
            >
              {collapsed ? '展开' : '收起'}
            </button>
          </div>
          {!collapsed && (
            <div className="px-4 pb-4 space-y-2.5 max-h-[min(50vh,22rem)] overflow-y-auto sidebar-scrollbar">
              {items.map((item) => {
                const key = item.kind === 'share' ? `share:${item.roomId}` : `meeting:${item.code}`
                const status = myStatuses[key]
                const busy = busyKey === key
                return (
                  <div
                    key={key}
                    className="rounded-xl bg-black/25 border border-white/10 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-white text-sm font-medium truncate">
                        {item.kind === 'share' ? `${item.hostName} 的共享` : item.title}
                      </span>
                      <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded ${
                        item.kind === 'share'
                          ? 'bg-purple-500/20 text-purple-200'
                          : 'bg-cyan-500/20 text-cyan-200'
                      }`}>
                        {item.kind === 'share' ? '共享' : '会议'}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/40">
                      {item.kind === 'share'
                        ? `${item.viewerCount} 人观看 · ${item.mode}`
                        : `${item.createdBy} · ${item.memberCount} 人${item.hasSharer ? ' · 共享中' : ''}`}
                    </div>
                    {status === 'pending' ? (
                      <div className="text-xs text-amber-200/80 py-1">等待发起者同意…</div>
                    ) : status === 'rejected' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-300/80">已拒绝</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => applyJoin(item)}
                          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-50"
                        >
                          重新申请
                        </button>
                      </div>
                    ) : status === 'approved' ? (
                      <div className="text-xs text-emerald-300/90 py-1">已同意，正在进入…</div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => applyJoin(item)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                          item.kind === 'share'
                            ? 'bg-purple-600/25 hover:bg-purple-600/40 border-purple-400/35 text-purple-100'
                            : 'bg-cyan-600/25 hover:bg-cyan-600/40 border-cyan-400/35 text-cyan-100'
                        }`}
                      >
                        <LogIn size={12} />
                        {busy ? '申请中…' : '申请进入'}
                      </button>
                    )}
                  </div>
                )
              })}
              {toast && (
                <div className="text-[11px] text-center text-white/55 pt-1">{toast}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>,
    document.body
  )
}

