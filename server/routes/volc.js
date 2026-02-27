import express from 'express'
import crypto from 'crypto'

const router = express.Router()

function buildVolcToken(appId, appKey, roomId, userId, expireSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000)
  const expiredAt = now + expireSeconds
  const nonce = Math.floor(Math.random() * 0xFFFFFFFF)

  const privileges = { 1: expiredAt, 2: expiredAt, 4: expiredAt, 8: expiredAt, 16: expiredAt, 32: expiredAt }

  function packUint16(n) {
    const b = Buffer.allocUnsafe(2)
    b.writeUInt16LE(n, 0)
    return b
  }
  function packUint32(n) {
    const b = Buffer.allocUnsafe(4)
    b.writeUInt32LE(n >>> 0, 0)
    return b
  }
  function packString(s) {
    const sb = Buffer.from(s, 'utf8')
    return Buffer.concat([packUint16(sb.length), sb])
  }

  const sortedKeys = Object.keys(privileges).map(Number).sort((a, b) => a - b)
  const privBufs = [packUint16(sortedKeys.length)]
  for (const k of sortedKeys) {
    privBufs.push(packUint16(k))
    privBufs.push(packUint32(privileges[k]))
  }

  const content = Buffer.concat([
    Buffer.from('001', 'utf8'),
    packString(appId),
    packString(userId),
    packString(roomId),
    packUint32(nonce),
    packUint32(now),
    packUint32(expiredAt),
    ...privBufs,
  ])

  const hmac = crypto.createHmac('sha256', appKey)
  hmac.update(content)
  const sig = hmac.digest()

  return Buffer.concat([content, sig]).toString('base64')
}

router.post('/token', (req, res) => {
  const appId = process.env.VOLC_APP_ID
  const appKey = process.env.VOLC_APP_KEY

  if (!appId || !appKey) {
    return res.status(500).json({ success: false, error: 'Volcengine credentials not configured' })
  }

  const { roomId, userId } = req.body
  if (!roomId || !userId) {
    return res.status(400).json({ success: false, error: 'roomId and userId are required' })
  }

  const token = buildVolcToken(appId, appKey, roomId, userId)
  res.json({ success: true, token })
})

export default router
