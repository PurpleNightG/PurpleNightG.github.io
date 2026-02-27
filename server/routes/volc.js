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
    b.writeUInt16BE(n, 0)
    return b
  }
  function packUint32(n) {
    const b = Buffer.allocUnsafe(4)
    b.writeUInt32BE(n >>> 0, 0)
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

  const version = Buffer.from('001', 'utf8')

  // Sign only the data fields (without version prefix)
  // Order: appId, roomId, userId (as mentioned in Volcengine docs)
  const msgToSign = Buffer.concat([
    packString(appId),
    packString(roomId),
    packString(userId),
    packUint32(nonce),
    packUint32(now),
    packUint32(expiredAt),
    ...privBufs,
  ])

  const hmacKey = Buffer.from(appKey, 'hex')
  const sig = crypto.createHmac('sha256', hmacKey).update(msgToSign).digest()

  // Final token: version + data + signature
  return Buffer.concat([version, msgToSign, sig]).toString('base64')
}

router.post('/token', (req, res) => {
  // No-token test: set VOLC_NO_TOKEN=true in .env → SDK will use Basic auth (no real token)
  if (process.env.VOLC_NO_TOKEN === 'true') {
    return res.json({ success: true, token: null })
  }
  // Temp token passthrough for debugging - set VOLC_TEMP_TOKEN in .env to bypass generation
  if (process.env.VOLC_TEMP_TOKEN) {
    return res.json({ success: true, token: process.env.VOLC_TEMP_TOKEN })
  }

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
  console.log('[Volc] Generated token (first 20 chars):', token.substring(0, 20))
  res.json({ success: true, token })
})

// Debug: decode a token to inspect binary structure
router.post('/decode', (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'token required' })

  try {
    const buf = Buffer.from(token, 'base64')
    const result = { byteLength: buf.length, hex: buf.toString('hex'), fields: {} }

    let pos = 0
    const readStr = () => {
      if (pos + 2 > buf.length) return null
      const len = buf.readUInt16LE(pos); pos += 2
      if (pos + len > buf.length) return null
      const s = buf.toString('utf8', pos, pos + len); pos += len
      return s
    }
    const readStrBE = () => {
      if (pos + 2 > buf.length) return null
      const len = buf.readUInt16BE(pos); pos += 2
      if (pos + len > buf.length) return null
      const s = buf.toString('utf8', pos, pos + len); pos += len
      return s
    }

    result.fields.version_utf8 = buf.toString('utf8', 0, 3)
    result.fields.version_hex = buf.slice(0, 3).toString('hex')
    result.fields.byte3_LE = buf.readUInt16LE(3)
    result.fields.byte3_BE = buf.readUInt16BE(3)
    result.fields.byteAfterVersion_raw = buf.slice(3, 10).toString('hex')
    result.fields.signatureBytes = buf.slice(buf.length - 32).toString('hex')

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
