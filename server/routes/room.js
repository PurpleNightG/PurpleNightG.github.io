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

// ---- Room Info ----
const rooms = new Map()
function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { hostName: '', viewers: new Map() })
  return rooms.get(roomId)
}

// Host registers room with display name
router.post('/:roomId/host', (req, res) => {
  const room = getRoom(req.params.roomId)
  const { displayName } = req.body
  if (displayName) room.hostName = displayName
  room.viewers.clear()
  res.json({ success: true })
})

// Viewer joins room with display name
router.post('/:roomId/viewer', (req, res) => {
  const room = getRoom(req.params.roomId)
  const { userId, displayName } = req.body
  if (userId && displayName) room.viewers.set(userId, displayName)
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
  const { userId } = req.body
  const room = rooms.get(req.params.roomId)
  if (room && userId) room.viewers.delete(userId)
  res.json({ success: true })
})

// Host closes room
router.post('/:roomId/close', (req, res) => {
  rooms.delete(req.params.roomId)
  res.json({ success: true })
})

export default router
