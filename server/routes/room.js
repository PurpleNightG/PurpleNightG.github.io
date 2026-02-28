import express from 'express'
import { pool } from '../config/database.js'

const router = express.Router()

// ---- RTC Permission System (MySQL, must be before /:roomId routes) ----
// Auto-create table on first load
;(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rtc_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(128) NOT NULL,
        mode ENUM('agora', 'volc') NOT NULL,
        status ENUM('pending', 'approved') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_mode (username, mode)
      )
    `)
  } catch (e) {
    console.error('Failed to create rtc_permissions table:', e.message)
  }
})()

// Student requests access to agora/volc
router.post('/rtc-request', async (req, res) => {
  try {
    const { username, mode } = req.body
    if (!username || !['agora', 'volc'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'username and mode (agora/volc) required' })
    }
    await pool.execute(
      `INSERT INTO rtc_permissions (username, mode, status) VALUES (?, ?, 'pending')
       ON DUPLICATE KEY UPDATE status = IF(status = 'approved', 'approved', 'pending'), created_at = IF(status = 'approved', created_at, NOW())`,
      [username, mode]
    )
    res.json({ success: true, status: 'pending' })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Admin: get all pending requests
router.get('/rtc-requests', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT username, mode, UNIX_TIMESTAMP(created_at)*1000 AS requestedAt FROM rtc_permissions WHERE status = 'pending'`
    )
    res.json({ requests: rows })
  } catch (e) {
    res.status(500).json({ requests: [] })
  }
})

// Admin: approve a request
router.post('/rtc-approve', async (req, res) => {
  try {
    const { username, mode } = req.body
    await pool.execute(
      `UPDATE rtc_permissions SET status = 'approved' WHERE username = ? AND mode = ?`,
      [username, mode]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Admin: reject a request
router.post('/rtc-reject', async (req, res) => {
  try {
    const { username, mode } = req.body
    await pool.execute(
      `DELETE FROM rtc_permissions WHERE username = ? AND mode = ?`,
      [username, mode]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Student: check permission status
router.get('/rtc-permission/:username', async (req, res) => {
  try {
    const username = req.params.username
    const [rows] = await pool.execute(
      `SELECT mode, status FROM rtc_permissions WHERE username = ?`,
      [username]
    )
    const result = { agora: false, volc: false, agoraPending: false, volcPending: false }
    for (const r of rows) {
      if (r.mode === 'agora') {
        if (r.status === 'approved') result.agora = true
        if (r.status === 'pending') result.agoraPending = true
      }
      if (r.mode === 'volc') {
        if (r.status === 'approved') result.volc = true
        if (r.status === 'pending') result.volcPending = true
      }
    }
    res.json(result)
  } catch (e) {
    res.json({ agora: false, volc: false, agoraPending: false, volcPending: false })
  }
})

// Consume a one-time permission
router.post('/rtc-consume', async (req, res) => {
  try {
    const { username, mode } = req.body
    await pool.execute(
      `DELETE FROM rtc_permissions WHERE username = ? AND mode = ?`,
      [username, mode]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// ---- Share Logs (MySQL) ----
;(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS share_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(16) NOT NULL,
        host_name VARCHAR(128) NOT NULL,
        mode ENUM('peerjs', 'agora', 'volc') NOT NULL DEFAULT 'peerjs',
        peak_viewers INT NOT NULL DEFAULT 0,
        viewers TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL
      )
    `)
    // Add viewers column if table already existed without it
    try { await pool.execute(`ALTER TABLE share_logs ADD COLUMN viewers TEXT AFTER peak_viewers`) } catch {}
    // Note: we no longer auto-close stale records on startup because RTC connections
    // (Volcengine/Agora) may still be alive. Admin can manually close via active-rooms panel.
  } catch (e) {
    console.error('Failed to create share_logs table:', e.message)
  }
})()

// Admin: get share logs
router.get('/share-logs', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, room_id, host_name, mode, peak_viewers, viewers, started_at, ended_at
       FROM share_logs ORDER BY started_at DESC`
    )
    res.json({ logs: rows })
  } catch (e) {
    res.json({ logs: [] })
  }
})

// Admin: delete a share log (requires password)
router.delete('/share-logs/:id', async (req, res) => {
  const { password } = req.body || {}
  if (password !== '071031') {
    return res.status(403).json({ success: false, error: '删除密码错误' })
  }
  try {
    await pool.execute(`DELETE FROM share_logs WHERE id = ?`, [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// ---- Room Info ----
const rooms = new Map()
// Active user tracking: "userType:displayName" -> { role, roomId, displayName, registeredAt }
const activeUsers = new Map()
const ACTIVE_USER_TTL = 2 * 60 * 60 * 1000 // 2 hours

// Composite key to distinguish admin vs student with same name
function userKey(displayName, userType) {
  return userType ? `${userType}:${displayName}` : displayName
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { hostName: '', hostKey: '', viewers: new Map(), viewerKeys: new Map(), mode: 'peerjs', peakViewers: 0, allViewerNames: new Set() })
  return rooms.get(roomId)
}

// Check if user is already active in another role
router.get('/active-check/:displayName', (req, res) => {
  const name = decodeURIComponent(req.params.displayName)
  const ut = req.query.userType || ''
  const key = userKey(name, ut)
  const info = activeUsers.get(key)
  if (info) {
    // Auto-expire stale entries
    if (Date.now() - info.registeredAt > ACTIVE_USER_TTL) {
      activeUsers.delete(key)
      return res.json({ active: false })
    }
    res.json({ active: true, role: info.role, roomId: info.roomId })
  } else {
    res.json({ active: false })
  }
})

// Force-leave: clear stale active status
router.post('/force-leave', (req, res) => {
  const { displayName, userType: ut } = req.body || {}
  if (!displayName) return res.status(400).json({ success: false })
  const key = userKey(displayName, ut)
  activeUsers.delete(key)
  res.json({ success: true })
})

// List all active rooms (admin only)
router.get('/active-rooms', async (req, res) => {
  const list = []
  const seenRoomIds = new Set()
  // In-memory rooms (live data)
  for (const [roomId, room] of rooms.entries()) {
    if (!room.hostName) continue
    seenRoomIds.add(roomId)
    list.push({
      roomId,
      hostName: room.hostName,
      mode: room.mode,
      viewerCount: room.viewers.size,
      viewers: Array.from(room.viewers.values()),
    })
  }
  // DB fallback: share_logs with ended_at IS NULL not already in memory
  try {
    const [rows] = await pool.execute(
      `SELECT room_id, host_name, mode FROM share_logs WHERE ended_at IS NULL`
    )
    for (const row of rows) {
      if (seenRoomIds.has(row.room_id)) continue
      list.push({
        roomId: row.room_id,
        hostName: row.host_name,
        mode: row.mode,
        viewerCount: 0,
        viewers: [],
      })
    }
  } catch {}
  res.json({ rooms: list })
})

// Admin force-close a room
router.post('/admin-close/:roomId', async (req, res) => {
  const room = rooms.get(req.params.roomId)
  if (room) {
    if (room.hostKey) activeUsers.delete(room.hostKey)
    room.viewerKeys.forEach((vKey) => activeUsers.delete(vKey))
    const viewerNames = Array.from(room.allViewerNames)
    try {
      await pool.execute(
        `UPDATE share_logs SET ended_at = NOW(), peak_viewers = ?, viewers = ? WHERE room_id = ? AND ended_at IS NULL`,
        [room.peakViewers, JSON.stringify(viewerNames), req.params.roomId]
      )
    } catch {}
    rooms.delete(req.params.roomId)
  } else {
    // Room not in memory, clean DB
    try {
      await pool.execute(
        `UPDATE share_logs SET ended_at = NOW() WHERE room_id = ? AND ended_at IS NULL`,
        [req.params.roomId]
      )
    } catch {}
  }
  res.json({ success: true })
})

// Host registers room with display name
router.post('/:roomId/host', async (req, res) => {
  const room = getRoom(req.params.roomId)
  const { displayName, mode, userType: ut } = req.body
  if (displayName) {
    const key = userKey(displayName, ut)
    const existing = activeUsers.get(key)
    if (existing && existing.roomId !== req.params.roomId) {
      return res.status(409).json({ success: false, error: `你已经在房间 ${existing.roomId} 中${existing.role === 'host' ? '分享' : '观看'}，请先退出` })
    }
    room.hostName = displayName
    room.hostKey = key
    room.mode = mode || 'peerjs'
    room.peakViewers = 0
    activeUsers.set(key, { role: 'host', roomId: req.params.roomId, displayName, registeredAt: Date.now() })
    // Insert share log
    try {
      await pool.execute(
        `INSERT INTO share_logs (room_id, host_name, mode) VALUES (?, ?, ?)`,
        [req.params.roomId, displayName, room.mode]
      )
      console.log(`[ShareLog] Inserted: room=${req.params.roomId} host=${displayName} mode=${room.mode}`)
    } catch (e) {
      console.error(`[ShareLog] INSERT failed:`, e.message)
    }
  }
  room.viewers.clear()
  room.viewerKeys.clear()
  res.json({ success: true })
})

// Viewer joins room with display name
router.post('/:roomId/viewer', (req, res) => {
  const room = getRoom(req.params.roomId)
  const { userId, displayName, userType: ut } = req.body
  if (displayName) {
    const key = userKey(displayName, ut)
    const existing = activeUsers.get(key)
    if (existing) {
      return res.status(409).json({ success: false, error: `你已经在房间 ${existing.roomId} 中${existing.role === 'host' ? '分享' : '观看'}，请先退出` })
    }
    activeUsers.set(key, { role: 'viewer', roomId: req.params.roomId, displayName, registeredAt: Date.now() })
    if (userId) room.viewerKeys.set(userId, key)
  }
  if (userId && displayName) room.viewers.set(userId, displayName)
  if (displayName) room.allViewerNames.add(displayName)
  // Track peak viewers
  const currentViewers = room.viewers.size
  if (currentViewers > room.peakViewers) room.peakViewers = currentViewers
  res.json({ success: true, hostName: room.hostName })
})

// Get room info (host name + viewer list)
router.get('/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId)
  if (!room) return res.json({ hostName: '', viewers: [] })
  res.json({ hostName: room.hostName, viewers: Array.from(room.viewers.values()) })
})

// Viewer leaves
router.post('/:roomId/leave', (req, res) => {
  const { userId, displayName, userType: ut } = req.body
  const room = rooms.get(req.params.roomId)
  if (room && userId) {
    room.viewers.delete(userId)
    const storedKey = room.viewerKeys.get(userId)
    if (storedKey) { activeUsers.delete(storedKey); room.viewerKeys.delete(userId) }
  }
  // Fallback: try key from params
  if (displayName) {
    const key = userKey(displayName, ut)
    const info = activeUsers.get(key)
    if (info && info.roomId === req.params.roomId) activeUsers.delete(key)
  }
  res.json({ success: true })
})

// Host closes room
router.post('/:roomId/close', async (req, res) => {
  const { displayName, userType: ut } = req.body || {}
  const room = rooms.get(req.params.roomId)
  if (room) {
    if (room.hostKey) activeUsers.delete(room.hostKey)
    room.viewerKeys.forEach((vKey) => activeUsers.delete(vKey))
    // Update share log with end time, peak viewers, and viewer names
    const viewerNames = Array.from(room.allViewerNames)
    try {
      await pool.execute(
        `UPDATE share_logs SET ended_at = NOW(), peak_viewers = ?, viewers = ? WHERE room_id = ? AND ended_at IS NULL`,
        [room.peakViewers, JSON.stringify(viewerNames), req.params.roomId]
      )
    } catch {}
  } else {
    // Room not in memory — clean up by key and room_id
    if (displayName) {
      const key = userKey(displayName, ut)
      activeUsers.delete(key)
    }
    try {
      await pool.execute(
        `UPDATE share_logs SET ended_at = NOW() WHERE room_id = ? AND ended_at IS NULL`,
        [req.params.roomId]
      )
    } catch {}
  }
  rooms.delete(req.params.roomId)
  res.json({ success: true })
})

export default router
