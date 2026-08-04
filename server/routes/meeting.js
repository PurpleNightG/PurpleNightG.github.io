import express from 'express'
import { pool } from '../config/database.js'

const router = express.Router()

const ASSISTANT_FIELDS =
  'id, username, nickname, qq, status, is_assistant, screen_share_enabled, screen_share_quota, screen_share_used, guest_code_max'

/** @type {Map<string, Meeting>} */
const meetings = new Map()

let requestSeq = 1
let chatSeq = 1

/**
 * @typedef {{
 *   sessionId: string
 *   displayName: string
 *   userType: 'admin' | 'student' | 'guest'
 *   userId: string
 *   memberId: number | null
 *   qq: string | null
 *   avatar: string | null
 *   micOn: boolean
 *   joinedAt: number
 *   lastHeartbeat: number
 * }} MeetingMember
 *
 * @typedef {{
 *   code: string
 *   title: string
 *   createdBy: string
 *   createdByType: 'admin'
 *   createdAt: number
 *   hostSessionId: string | null
 *   kickedSessionIds?: Set<string>
 *   bannedKeys?: Set<string>           // m:{memberId} | a:{name} | guest:{name} | student:{name}
 *   shareCooldownUntil?: Map<string, number>  // sessionId → 可再申请共享的时间戳
 *   members: Map<string, MeetingMember>
 *   sharer: null | { sessionId: string, displayName: string, userId: string, startedAt: number }
 *   shareRequests: { id: number, sessionId: string, username: string, status: 'pending' | 'approved' | 'rejected', createdAt: number }[]
 *   chat: { id: number, from: string, fromSessionId?: string, userId?: string, avatar?: string|null, qq?: string|null, text: string, at: number }[]
 * }} Meeting
 */

const SHARE_REJECT_COOLDOWN_MS = 5000

function memberBanKey(m) {
  if (!m) return null
  if (m.memberId != null && Number(m.memberId) > 0) return `m:${Number(m.memberId)}`
  if (m.userType === 'admin') return `a:${String(m.displayName || '').trim()}`
  if (m.userType === 'guest') return `guest:${String(m.displayName || '').trim()}`
  return `${m.userType || 'student'}:${String(m.displayName || '').trim()}`
}

function joinBanKey({ userType, displayName, memberId }) {
  if (memberId != null && Number(memberId) > 0) return `m:${Number(memberId)}`
  if (userType === 'admin') return `a:${String(displayName || '').trim()}`
  if (userType === 'guest') return `guest:${String(displayName || '').trim()}`
  return `${userType || 'student'}:${String(displayName || '').trim()}`
}

function getShareStatusForSession(meeting, sessionId) {
  if (!meeting || !sessionId) return { shareStatus: null, shareCooldownMs: 0 }
  const pending = meeting.shareRequests.find((r) => r.sessionId === sessionId && r.status === 'pending')
  if (pending) return { shareStatus: 'pending', shareCooldownMs: 0, shareRequestId: pending.id }
  const approved = meeting.shareRequests.find((r) => r.sessionId === sessionId && r.status === 'approved')
  if (approved) return { shareStatus: 'approved', shareCooldownMs: 0, shareRequestId: approved.id }
  const until = meeting.shareCooldownUntil?.get(sessionId) || 0
  const left = Math.max(0, until - Date.now())
  if (left > 0) return { shareStatus: 'cooldown', shareCooldownMs: left }
  const rejected = meeting.shareRequests.find((r) => r.sessionId === sessionId && r.status === 'rejected')
  if (rejected) return { shareStatus: 'rejected', shareCooldownMs: 0 }
  return { shareStatus: null, shareCooldownMs: 0 }
}

;(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS meeting_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(8) NOT NULL,
        title VARCHAR(128) NOT NULL DEFAULT '紫夜会议',
        created_by VARCHAR(128) NOT NULL,
        status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP NULL,
        UNIQUE KEY uk_meeting_code (code),
        INDEX idx_meeting_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  } catch (e) {
    console.warn('[meeting] table init:', e.message)
  }
})()

/** memberId → 邀请信息（仅学员侧浮窗） */
const pendingInvites = new Map()

function inviteKey(memberId) {
  return Number(memberId)
}

function clearInvitesForMeeting(code) {
  const c = String(code || '').toUpperCase()
  for (const [memberId, inv] of pendingInvites) {
    if (inv.code === c) pendingInvites.delete(memberId)
  }
}

function generateMeetingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

function toVolcUid(seed) {
  return String(seed || 'user').replace(/[^a-zA-Z0-9@\-_.]/g, '_').slice(0, 128) || 'user'
}

async function findMemberByDisplayName(name) {
  const [rows] = await pool.execute(
    `SELECT ${ASSISTANT_FIELDS}, avatar FROM members WHERE username = ? OR nickname = ? LIMIT 1`,
    [name, name]
  )
  return rows[0] || null
}

async function findMemberById(id) {
  const [rows] = await pool.execute(
    `SELECT ${ASSISTANT_FIELDS}, avatar FROM members WHERE id = ? LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

function isHostMember(meeting, m) {
  if (!meeting || !m) return false
  // 已绑定主持人会话时，只认 sessionId，避免同名学员被当成主持人
  if (meeting.hostSessionId) return m.sessionId === meeting.hostSessionId
  // 尚未绑定：仅管理员可视为主持人（创建者必为 admin，禁止用 displayName 误伤同名学员）
  return m.userType === 'admin'
}

/** 是否可主持操作（踢人/邀请等）：管理员，或当前主持人会话 */
function canModerate(meeting, { userType, sessionId } = {}) {
  if (!meeting) return false
  if (userType === 'admin') return true
  if (sessionId && meeting.hostSessionId && String(sessionId) === String(meeting.hostSessionId)) {
    return true
  }
  return false
}

async function endMeeting(meeting) {
  if (!meeting) return
  const code = meeting.code
  if (!meetings.has(code)) return
  meetings.delete(code)
  clearInvitesForMeeting(code)
  try {
    await pool.execute(
      `UPDATE meeting_rooms SET status = 'closed', closed_at = NOW() WHERE code = ? AND status = 'open'`,
      [code]
    )
  } catch {}
}

function pruneStaleMembers(meeting, maxAgeMs = 45000) {
  const now = Date.now()
  let hostGone = false
  for (const [key, m] of meeting.members) {
    if (now - m.lastHeartbeat > maxAgeMs) {
      if (isHostMember(meeting, m)) hostGone = true
      meeting.members.delete(key)
      if (meeting.sharer?.sessionId === m.sessionId) meeting.sharer = null
    }
  }
  if (hostGone) {
    void endMeeting(meeting)
  }
  return hostGone
}

function serializeMeeting(meeting) {
  const hostGone = pruneStaleMembers(meeting)
  if (hostGone || !meetings.has(meeting.code)) {
    return {
      exists: false,
      ended: true,
      reason: 'host_left',
      code: meeting.code,
      title: meeting.title,
      createdBy: meeting.createdBy,
      members: [],
      sharer: null,
      pendingShareRequests: [],
      chat: [],
      memberCount: 0,
    }
  }
  return {
    code: meeting.code,
    title: meeting.title,
    createdBy: meeting.createdBy,
    createdAt: meeting.createdAt,
    hostSessionId: meeting.hostSessionId || null,
    memberCount: meeting.members.size,
    sharer: meeting.sharer,
    members: [...meeting.members.values()].map((m) => ({
      sessionId: m.sessionId,
      displayName: m.displayName,
      userType: m.userType,
      userId: m.userId,
      qq: m.qq,
      avatar: m.avatar,
      micOn: m.micOn,
      isHost: isHostMember(meeting, m),
      isSharer: meeting.sharer?.sessionId === m.sessionId,
    })),
    pendingShareRequests: meeting.shareRequests.filter((r) => r.status === 'pending'),
    chat: meeting.chat.slice(-80),
    exists: true,
  }
}

function getMeeting(code) {
  const c = String(code || '').toUpperCase()
  return meetings.get(c) || null
}

function findMember(meeting, { sessionId, displayName }) {
  // 有 sessionId 时只按会话查，禁止用显示名回退（同名会误匹配主持人）
  if (sessionId) {
    return meeting.members.get(sessionId) || null
  }
  // 兼容极旧客户端：无 sessionId 时才按显示名（仅取第一个）
  if (displayName) {
    for (const m of meeting.members.values()) {
      if (m.displayName === displayName) return m
    }
  }
  return null
}

/** 管理创建会议 */
router.post('/create', async (req, res) => {
  try {
    const { adminName, title, userType } = req.body || {}
    if (userType !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可创建会议' })
    }
    if (!adminName) {
      return res.status(400).json({ success: false, error: '缺少管理员名称' })
    }

    let code = generateMeetingCode()
    for (let i = 0; i < 8 && meetings.has(code); i++) code = generateMeetingCode()

    const meetingTitle = (title && String(title).trim().slice(0, 64)) || '紫夜会议'
    /** @type {Meeting} */
    const meeting = {
      code,
      title: meetingTitle,
      createdBy: adminName,
      createdByType: 'admin',
      createdAt: Date.now(),
      hostSessionId: null,
      kickedSessionIds: new Set(),
      bannedKeys: new Set(),
      shareCooldownUntil: new Map(),
      members: new Map(),
      sharer: null,
      shareRequests: [],
      chat: [],
    }
    meetings.set(code, meeting)

    try {
      await pool.execute(
        `INSERT INTO meeting_rooms (code, title, created_by, status) VALUES (?, ?, ?, 'open')`,
        [code, meetingTitle, adminName]
      )
    } catch (e) {
      console.warn('[meeting] persist create:', e.message)
    }

    res.json({ success: true, code, title: meetingTitle })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

router.get('/active', (_req, res) => {
  const list = []
  for (const m of meetings.values()) {
    pruneStaleMembers(m)
    if (!meetings.has(m.code)) continue
    list.push({
      code: m.code,
      title: m.title,
      createdBy: m.createdBy,
      memberCount: m.members.size,
      hasSharer: !!m.sharer,
      createdAt: m.createdAt,
    })
  }
  list.sort((a, b) => b.createdAt - a.createdAt)
  res.json({ meetings: list })
})

/** 会议历史记录（meeting_rooms 表） */
router.get('/logs', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, code, title, created_by, status, created_at, closed_at
       FROM meeting_rooms
       ORDER BY created_at DESC
       LIMIT 200`
    )
    const liveCodes = new Set(meetings.keys())
    // 内存已无、库中仍 open 的僵尸记录：自动标记结束
    const staleIds = []
    for (const row of rows || []) {
      const code = String(row.code || '').toUpperCase()
      if (row.status === 'open' && !liveCodes.has(code)) staleIds.push(row.id)
    }
    if (staleIds.length > 0) {
      try {
        await pool.execute(
          `UPDATE meeting_rooms
           SET status = 'closed', closed_at = COALESCE(closed_at, NOW())
           WHERE id IN (${staleIds.map(() => '?').join(',')}) AND status = 'open'`,
          staleIds
        )
      } catch (e) {
        console.warn('[meeting] stale close:', e.message)
      }
    }

    const logs = (rows || []).map((row) => {
      const code = String(row.code || '').toUpperCase()
      const live = liveCodes.has(code)
      const wasStale = row.status === 'open' && !live
      return {
        id: row.id,
        code,
        title: row.title,
        created_by: row.created_by,
        status: live ? 'open' : 'closed',
        created_at: row.created_at,
        closed_at: live ? null : (row.closed_at || (wasStale ? new Date() : null)),
        live,
        memberCount: live ? (meetings.get(code)?.members.size || 0) : null,
      }
    })
    res.json({ success: true, logs })
  } catch (e) {
    console.warn('[meeting] logs:', e.message)
    res.json({ success: true, logs: [] })
  }
})

/** 删除会议记录（需删除密码，同共享记录） */
router.delete('/logs/:id', async (req, res) => {
  const { password } = req.body || {}
  if (password !== '071031') {
    return res.status(403).json({ success: false, error: '删除密码错误' })
  }
  try {
    const id = parseInt(String(req.params.id), 10)
    if (!id) return res.status(400).json({ success: false, error: '无效 ID' })
    const [rows] = await pool.execute(`SELECT code, status FROM meeting_rooms WHERE id = ?`, [id])
    const row = rows[0]
    if (!row) return res.status(404).json({ success: false, error: '记录不存在' })
    const code = String(row.code || '').toUpperCase()
    if (meetings.has(code) || row.status === 'open') {
      return res.status(400).json({ success: false, error: '进行中的会议不能删除，请先结束会议' })
    }
    await pool.execute(`DELETE FROM meeting_rooms WHERE id = ?`, [id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/** 学员：查询待处理会议邀请 */
router.get('/invites/pending', (req, res) => {
  const memberId = inviteKey(req.query.memberId)
  if (!memberId) return res.json({ invite: null })
  const inv = pendingInvites.get(memberId)
  if (!inv) return res.json({ invite: null })
  const meeting = getMeeting(inv.code)
  if (!meeting) {
    pendingInvites.delete(memberId)
    return res.json({ invite: null })
  }
  res.json({
    invite: {
      code: inv.code,
      title: inv.title || meeting.title,
      invitedBy: inv.invitedBy,
      invitedAt: inv.invitedAt,
      memberCount: meeting.members.size,
    },
  })
})

/** 学员：接受或忽略邀请 */
router.post('/invites/respond', (req, res) => {
  const { memberId, code, accept } = req.body || {}
  const mid = inviteKey(memberId)
  if (!mid) return res.status(400).json({ success: false, error: '缺少 memberId' })
  const inv = pendingInvites.get(mid)
  if (inv && (!code || inv.code === String(code).toUpperCase())) {
    pendingInvites.delete(mid)
  }
  res.json({ success: true, accept: !!accept })
})

/** 可邀请成员列表（未退队、且当前不在会议内） */
router.get('/:code/invite-candidates', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.status(404).json({ success: false, error: '会议不存在或已结束' })
    const inMeetingIds = new Set(
      [...meeting.members.values()]
        // 管理员会话即使误绑了 memberId，也不应从邀请列表排除同名学员
        .filter((m) => m.userType !== 'admin')
        .map((m) => m.memberId)
        .filter((id) => id != null)
        .map((id) => Number(id))
    )
    const [rows] = await pool.execute(
      `SELECT id, nickname, username, qq, avatar, stage_role
       FROM members
       WHERE status != '已退队'
       ORDER BY nickname ASC, id ASC`
    )
    const candidates = rows
      .map((row) => ({
        id: Number(row.id),
        nickname: row.nickname || row.username || `成员${row.id}`,
        username: row.username || '',
        qq: row.qq != null ? String(row.qq) : null,
        avatar: row.avatar || null,
        stageRole: row.stage_role || null,
        inMeeting: inMeetingIds.has(Number(row.id)),
      }))
      .filter((c) => !c.inMeeting)
    res.json({ success: true, candidates })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/**
 * 邀请指定成员进入会议（学员端通过 /invites/pending 轮询收到浮窗）
 * body.memberIds: number[]
 */
router.post('/:code/invite', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.status(404).json({ success: false, error: '会议不存在或已结束' })
    const { userType, displayName, memberIds, sessionId } = req.body || {}
    if (!canModerate(meeting, { userType, sessionId })) {
      return res.status(403).json({ success: false, error: '仅主持人可邀请' })
    }

    const ids = [...new Set(
      (Array.isArray(memberIds) ? memberIds : [])
        .map((id) => inviteKey(id))
        .filter((id) => id > 0)
    )]
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要邀请的成员' })
    }

    const inMeetingIds = new Set(
      [...meeting.members.values()]
        .filter((m) => m.userType !== 'admin')
        .map((m) => m.memberId)
        .filter((id) => id != null)
        .map((id) => Number(id))
    )

    const placeholders = ids.map(() => '?').join(',')
    const [rows] = await pool.execute(
      `SELECT id FROM members WHERE id IN (${placeholders}) AND status != '已退队'`,
      ids
    )

    const now = Date.now()
    let invitedCount = 0
    for (const row of rows) {
      const mid = inviteKey(row.id)
      if (!mid || inMeetingIds.has(mid)) continue
      pendingInvites.set(mid, {
        code: meeting.code,
        title: meeting.title,
        invitedBy: displayName || meeting.createdBy,
        invitedAt: now,
      })
      invitedCount++
    }
    res.json({ success: true, invitedCount })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

router.get('/:code', (req, res) => {
  const meeting = getMeeting(req.params.code)
  if (!meeting) return res.status(404).json({ exists: false, error: '会议不存在或已结束' })
  res.json({ exists: true, ...serializeMeeting(meeting) })
})

router.get('/:code/state', (req, res) => {
  const meeting = getMeeting(req.params.code)
  if (!meeting) return res.status(404).json({ exists: false, error: '会议不存在或已结束' })
  res.json({ exists: true, ...serializeMeeting(meeting) })
})

router.post('/:code/join', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.status(404).json({ success: false, error: '会议不存在或已结束' })

    const { displayName, userType, memberId, micOn, sessionId: rawSessionId, avatar: clientAvatar, qq: clientQq } = req.body || {}
    if (!displayName) return res.status(400).json({ success: false, error: '缺少显示名' })

    const sessionId = String(rawSessionId || '').trim().slice(0, 64)
      || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

    let memberRow = null
    let adminRow = null
    // 管理员账号不在 members 表；禁止按昵称回落，避免同名学员被误判「已在会议」
    if (userType === 'admin') {
      try {
        const [rows] = await pool.execute(
          `SELECT id, username, name, avatar FROM admins
           WHERE name = ? OR username = ? LIMIT 1`,
          [displayName, displayName]
        )
        adminRow = rows[0] || null
      } catch {}
    } else {
      if (memberId) memberRow = await findMemberById(memberId)
      if (!memberRow) memberRow = await findMemberByDisplayName(displayName)
    }

    const resolvedMemberId = memberRow?.id != null
      ? Number(memberRow.id)
      : null
    const banKey = joinBanKey({ userType, displayName, memberId: resolvedMemberId })
    if (banKey && meeting.bannedKeys?.has(banKey)) {
      return res.status(403).json({ success: false, banned: true, error: '你已被禁止进入此会议' })
    }

    // Volc UID 必须唯一：加入 session 后缀，避免同名互相顶号
    const uidSeed = memberRow?.id
      ? `m${memberRow.id}_${sessionId}`
      : adminRow?.id
        ? `a${adminRow.id}_${sessionId}`
        : `${userType || 'u'}_${sessionId}`
    const userId = toVolcUid(uidSeed)

    const existing = meeting.members.get(sessionId)
    const now = Date.now()
    const resolvedAvatar =
      (memberRow?.avatar || adminRow?.avatar || clientAvatar || existing?.avatar || null) || null
    const resolvedQq =
      (memberRow?.qq != null ? String(memberRow.qq) : null) ||
      (clientQq != null ? String(clientQq) : null) ||
      existing?.qq ||
      null

    meeting.members.set(sessionId, {
      sessionId,
      displayName,
      userType: userType || 'student',
      userId,
      memberId: resolvedMemberId,
      qq: resolvedQq,
      avatar: resolvedAvatar,
      micOn: typeof micOn === 'boolean' ? micOn : existing?.micOn ?? true,
      joinedAt: existing?.joinedAt || now,
      lastHeartbeat: now,
    })

    // 首位入会的管理员绑定为主持人会话（不用 displayName，避免同名学员抢主持）
    if (!meeting.hostSessionId && userType === 'admin') {
      meeting.hostSessionId = sessionId
    }

    // 加入会议后清除该成员的待处理邀请
    if (resolvedMemberId) {
      const mid = inviteKey(resolvedMemberId)
      const inv = pendingInvites.get(mid)
      if (inv && inv.code === meeting.code) pendingInvites.delete(mid)
    }

    res.json({ success: true, sessionId, userId, ...serializeMeeting(meeting) })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

router.post('/:code/heartbeat', (req, res) => {
  const meeting = getMeeting(req.params.code)
  if (!meeting) return res.status(404).json({ success: false, exists: false, ended: true, error: '会议已结束' })
  const { sessionId, displayName, micOn } = req.body || {}
  const m = findMember(meeting, { sessionId, displayName })
  if (m) {
    m.lastHeartbeat = Date.now()
    if (typeof micOn === 'boolean') m.micOn = micOn
  } else if (sessionId && meeting.kickedSessionIds?.has(sessionId)) {
    return res.status(403).json({ success: false, kicked: true, error: '你已被移出会议' })
  }
  const data = serializeMeeting(meeting)
  if (data.ended || !meetings.has(meeting.code)) {
    return res.status(404).json({ success: false, exists: false, ended: true, error: '会议已结束' })
  }
  const shareMeta = getShareStatusForSession(meeting, sessionId)
  res.json({ success: true, ...data, ...shareMeta })
})

router.post('/:code/leave', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.json({ success: true, ended: true })
    const { sessionId, displayName } = req.body || {}
    const m = findMember(meeting, { sessionId, displayName })
    // 已被踢出或会话已不存在：直接成功，切勿按同名误判为主持人离开
    if (!m) {
      return res.json({ success: true, ended: false, alreadyGone: true })
    }
    // 仅真正的主持人会话离开才结束会议
    if (isHostMember(meeting, m)) {
      await endMeeting(meeting)
      return res.json({ success: true, ended: true })
    }

    meeting.members.delete(m.sessionId)
    if (meeting.sharer?.sessionId === m.sessionId) meeting.sharer = null
    res.json({ success: true, ended: false })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/** 修改会议标题（主持人/管理员） */
router.post('/:code/title', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.status(404).json({ success: false, error: '会议不存在或已结束' })
    const { title, userType, sessionId, displayName } = req.body || {}
    if (!canModerate(meeting, { userType, sessionId })) {
      return res.status(403).json({ success: false, error: '仅主持人可修改标题' })
    }
    const next = String(title || '').trim().slice(0, 64)
    if (!next) return res.status(400).json({ success: false, error: '标题不能为空' })
    meeting.title = next
    try {
      await pool.execute(
        `UPDATE meeting_rooms SET title = ? WHERE code = ? AND status = 'open'`,
        [next, meeting.code]
      )
    } catch (e) {
      console.warn('[meeting] title persist:', e.message)
    }
    res.json({ success: true, title: next, ...serializeMeeting(meeting) })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/** 主持人踢出成员 */
router.post('/:code/kick', (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.status(404).json({ success: false, error: '会议不存在或已结束' })
    const { userType, displayName, sessionId, targetSessionId, targetUserId, banRejoin } = req.body || {}
    if (!canModerate(meeting, { userType, sessionId })) {
      return res.status(403).json({ success: false, error: '仅主持人可踢人' })
    }

    let target = null
    if (targetSessionId && meeting.members.has(targetSessionId)) {
      target = meeting.members.get(targetSessionId)
    } else if (targetUserId) {
      for (const m of meeting.members.values()) {
        if (m.userId === targetUserId) {
          target = m
          break
        }
      }
    }
    if (!target) return res.status(404).json({ success: false, error: '成员不在会议中' })
    if (isHostMember(meeting, target)) {
      return res.status(400).json({ success: false, error: '不能踢出主持人' })
    }

    meeting.members.delete(target.sessionId)
    if (meeting.sharer?.sessionId === target.sessionId) meeting.sharer = null
    if (!meeting.kickedSessionIds) meeting.kickedSessionIds = new Set()
    meeting.kickedSessionIds.add(target.sessionId)

    let banned = false
    if (banRejoin) {
      const key = memberBanKey(target)
      if (key) {
        if (!meeting.bannedKeys) meeting.bannedKeys = new Set()
        meeting.bannedKeys.add(key)
        banned = true
      }
    }

    res.json({
      success: true,
      kickedSessionId: target.sessionId,
      kickedUserId: target.userId,
      kickedName: target.displayName,
      banned,
      ...serializeMeeting(meeting),
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

router.post('/:code/close', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.json({ success: true })
    const { adminName, userType } = req.body || {}
    if (userType !== 'admin' && adminName !== meeting.createdBy) {
      return res.status(403).json({ success: false, error: '仅管理员可结束会议' })
    }
    await endMeeting(meeting)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

router.post('/:code/chat', (req, res) => {
  const meeting = getMeeting(req.params.code)
  if (!meeting) return res.status(404).json({ success: false, error: '会议不存在' })
  const { sessionId, displayName, text } = req.body || {}
  const msg = String(text || '').trim().slice(0, 500)
  if (!displayName || !msg) return res.status(400).json({ success: false, error: '消息无效' })
  const m = findMember(meeting, { sessionId, displayName })
  if (!m) return res.status(403).json({ success: false, error: '请先加入会议' })
  const item = {
    id: chatSeq++,
    from: m.displayName,
    fromSessionId: m.sessionId,
    userId: m.userId,
    avatar: m.avatar || null,
    qq: m.qq || null,
    text: msg,
    at: Date.now(),
  }
  meeting.chat.push(item)
  if (meeting.chat.length > 200) meeting.chat.splice(0, meeting.chat.length - 200)
  res.json({ success: true, message: item, chat: meeting.chat.slice(-80) })
})

router.post('/:code/share-request', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.status(404).json({ success: false, error: '会议不存在' })
    const { displayName, userType, memberId, sessionId } = req.body || {}
    if (!displayName) return res.status(400).json({ success: false, error: '缺少用户名' })
    const self = findMember(meeting, { sessionId, displayName })
    if (!self) return res.status(403).json({ success: false, error: '请先加入会议' })

    if (userType === 'admin') {
      return res.json({ success: true, canShareNow: true, reason: 'admin' })
    }

    let member = null
    if (memberId) member = await findMemberById(memberId)
    if (!member) member = await findMemberByDisplayName(displayName)

    if (member?.is_assistant) {
      if (!member.screen_share_enabled) {
        return res.status(403).json({ success: false, error: '助教屏幕共享权限已关闭' })
      }
      const used = Number(member.screen_share_used) || 0
      if (member.screen_share_quota != null && used >= member.screen_share_quota) {
        return res.status(403).json({ success: false, error: '助教屏幕共享次数已用完' })
      }
      return res.json({ success: true, canShareNow: true, reason: 'assistant' })
    }

    const pending = meeting.shareRequests.find(
      (r) => r.sessionId === self.sessionId && r.status === 'pending'
    )
    if (pending) {
      return res.json({ success: true, canShareNow: false, request: pending, reason: 'pending' })
    }
    const approved = meeting.shareRequests.find(
      (r) => r.sessionId === self.sessionId && r.status === 'approved'
    )
    if (approved) {
      return res.json({ success: true, canShareNow: true, reason: 'approved', request: approved })
    }

    const cooldownUntil = meeting.shareCooldownUntil?.get(self.sessionId) || 0
    const cooldownLeft = Math.max(0, cooldownUntil - Date.now())
    if (cooldownLeft > 0) {
      const sec = Math.ceil(cooldownLeft / 1000)
      return res.status(429).json({
        success: false,
        error: `申请过于频繁，请 ${sec} 秒后再试`,
        retryAfterMs: cooldownLeft,
        reason: 'cooldown',
      })
    }

    // 清理本会话已拒绝记录，允许重新申请
    meeting.shareRequests = meeting.shareRequests.filter(
      (r) => !(r.sessionId === self.sessionId && r.status === 'rejected')
    )

    const request = {
      id: requestSeq++,
      sessionId: self.sessionId,
      username: self.displayName,
      status: 'pending',
      createdAt: Date.now(),
    }
    meeting.shareRequests.push(request)
    res.json({ success: true, canShareNow: false, request, reason: 'created' })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

router.post('/:code/share-approve', (req, res) => {
  const meeting = getMeeting(req.params.code)
  if (!meeting) return res.status(404).json({ success: false, error: '会议不存在' })
  const { requestId, userType } = req.body || {}
  if (userType !== 'admin') return res.status(403).json({ success: false, error: '仅管理员可审批' })
  const reqItem = meeting.shareRequests.find((r) => r.id === Number(requestId))
  if (!reqItem) return res.status(404).json({ success: false, error: '申请不存在' })
  reqItem.status = 'approved'
  if (meeting.shareCooldownUntil) meeting.shareCooldownUntil.delete(reqItem.sessionId)
  const applicant = meeting.members.get(reqItem.sessionId) || null
  res.json({
    success: true,
    applicantUserId: applicant?.userId || null,
    applicantSessionId: reqItem.sessionId,
    applicantName: reqItem.username,
    ...serializeMeeting(meeting),
  })
})

router.post('/:code/share-reject', (req, res) => {
  const meeting = getMeeting(req.params.code)
  if (!meeting) return res.status(404).json({ success: false, error: '会议不存在' })
  const { requestId, userType } = req.body || {}
  if (userType !== 'admin') return res.status(403).json({ success: false, error: '仅管理员可审批' })
  const reqItem = meeting.shareRequests.find((r) => r.id === Number(requestId))
  if (!reqItem) return res.status(404).json({ success: false, error: '申请不存在' })
  reqItem.status = 'rejected'
  if (!meeting.shareCooldownUntil) meeting.shareCooldownUntil = new Map()
  meeting.shareCooldownUntil.set(reqItem.sessionId, Date.now() + SHARE_REJECT_COOLDOWN_MS)
  const applicant = meeting.members.get(reqItem.sessionId) || null
  res.json({
    success: true,
    applicantUserId: applicant?.userId || null,
    applicantSessionId: reqItem.sessionId,
    applicantName: reqItem.username,
    cooldownMs: SHARE_REJECT_COOLDOWN_MS,
    ...serializeMeeting(meeting),
  })
})

router.post('/:code/start-share', async (req, res) => {
  try {
    const meeting = getMeeting(req.params.code)
    if (!meeting) return res.status(404).json({ success: false, error: '会议不存在' })
    const { displayName, userType, memberId, sessionId } = req.body || {}
    if (!displayName) return res.status(400).json({ success: false, error: '缺少用户名' })
    const self = findMember(meeting, { sessionId, displayName })
    if (!self) return res.status(403).json({ success: false, error: '请先加入会议' })

    if (meeting.sharer && meeting.sharer.sessionId !== self.sessionId) {
      return res.status(409).json({
        success: false,
        error: `${meeting.sharer.displayName} 正在共享，请稍后再试`,
      })
    }

    const setSharer = () => {
      meeting.sharer = {
        sessionId: self.sessionId,
        displayName: self.displayName,
        userId: self.userId,
        startedAt: Date.now(),
      }
    }

    if (userType === 'admin') {
      setSharer()
      return res.json({ success: true, ...serializeMeeting(meeting) })
    }

    let member = null
    if (memberId) member = await findMemberById(memberId)
    if (!member) member = await findMemberByDisplayName(displayName)

    if (member?.is_assistant) {
      if (!member.screen_share_enabled) {
        return res.status(403).json({ success: false, error: '助教屏幕共享权限已关闭' })
      }
      const used = Number(member.screen_share_used) || 0
      if (member.screen_share_quota != null && used >= member.screen_share_quota) {
        return res.status(403).json({ success: false, error: '助教屏幕共享次数已用完' })
      }
      await pool.execute(
        'UPDATE members SET screen_share_used = screen_share_used + 1 WHERE id = ?',
        [member.id]
      )
      meeting.shareRequests = meeting.shareRequests.filter(
        (r) => !(r.sessionId === self.sessionId && r.status === 'approved')
      )
      setSharer()
      return res.json({ success: true, consumed: 'assistant', ...serializeMeeting(meeting) })
    }

    const approved = meeting.shareRequests.find(
      (r) => r.sessionId === self.sessionId && r.status === 'approved'
    )
    if (!approved) {
      return res.status(403).json({ success: false, error: '请先申请并由管理员批准后再共享' })
    }
    meeting.shareRequests = meeting.shareRequests.filter((r) => r.id !== approved.id)
    setSharer()
    res.json({ success: true, consumed: 'approval', ...serializeMeeting(meeting) })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

router.post('/:code/stop-share', (req, res) => {
  const meeting = getMeeting(req.params.code)
  if (!meeting) return res.json({ success: true })
  const { sessionId, displayName, userType } = req.body || {}
  const self = findMember(meeting, { sessionId, displayName })
  // 仅允许：管理员强制结束，或当前共享者本人（按 sessionId）。
  // 禁止用 displayName 匹配，否则同名学员失败重试会误清掉别人的共享。
  if (
    meeting.sharer &&
    (userType === 'admin' ||
      (!!self?.sessionId && meeting.sharer.sessionId === self.sessionId))
  ) {
    meeting.sharer = null
  }
  res.json({ success: true, ...serializeMeeting(meeting) })
})

export default router
