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
// Active user tracking: displayName -> { role: 'host'|'viewer', roomId }
const activeUsers = new Map()

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { hostName: '', viewers: new Map(), mode: 'peerjs', peakViewers: 0, allViewerNames: new Set() })
  return rooms.get(roomId)
}

// Check if user is already active in another role
router.get('/active-check/:displayName', (req, res) => {
  const name = decodeURIComponent(req.params.displayName)
  const info = activeUsers.get(name)
  if (info) {
    res.json({ active: true, role: info.role, roomId: info.roomId })
  } else {
    res.json({ active: false })
  }
})

// Host registers room with display name
router.post('/:roomId/host', async (req, res) => {
  const room = getRoom(req.params.roomId)
  const { displayName, mode } = req.body
  if (displayName) {
    const existing = activeUsers.get(displayName)
    if (existing && existing.roomId !== req.params.roomId) {
      return res.status(409).json({ success: false, error: `你已经在房间 ${existing.roomId} 中${existing.role === 'host' ? '分享' : '观看'}，请先退出` })
    }
    room.hostName = displayName
    room.mode = mode || 'peerjs'
    room.peakViewers = 0
    activeUsers.set(displayName, { role: 'host', roomId: req.params.roomId })
    // Insert share log
    try {
      await pool.execute(
        `INSERT INTO share_logs (room_id, host_name, mode) VALUES (?, ?, ?)`,
        [req.params.roomId, displayName, room.mode]
      )
    } catch {}
  }
  room.viewers.clear()
  res.json({ success: true })
})

// Viewer joins room with display name
router.post('/:roomId/viewer', (req, res) => {
  const room = getRoom(req.params.roomId)
  const { userId, displayName } = req.body
  if (displayName) {
    const existing = activeUsers.get(displayName)
    if (existing) {
      return res.status(409).json({ success: false, error: `你已经在房间 ${existing.roomId} 中${existing.role === 'host' ? '分享' : '观看'}，请先退出` })
    }
    activeUsers.set(displayName, { role: 'viewer', roomId: req.params.roomId })
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
  const { userId, displayName } = req.body
  const room = rooms.get(req.params.roomId)
  if (room && userId) room.viewers.delete(userId)
  // Only remove activeUser if it matches this room
  if (displayName) {
    const info = activeUsers.get(displayName)
    if (info && info.roomId === req.params.roomId) activeUsers.delete(displayName)
  }
  res.json({ success: true })
})

// Host closes room
router.post('/:roomId/close', async (req, res) => {
  const room = rooms.get(req.params.roomId)
  if (room) {
    if (room.hostName) activeUsers.delete(room.hostName)
    room.viewers.forEach((viewerName) => activeUsers.delete(viewerName))
    // Update share log with end time, peak viewers, and viewer names
    const viewerNames = Array.from(room.allViewerNames)
    try {
      await pool.execute(
        `UPDATE share_logs SET ended_at = NOW(), peak_viewers = ?, viewers = ? WHERE room_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
        [room.peakViewers, JSON.stringify(viewerNames), req.params.roomId]
      )
    } catch {}
  }
  rooms.delete(req.params.roomId)
  res.json({ success: true })
})

export default router
