import express from 'express'
import pkg from 'agora-token'
const { RtcTokenBuilder, RtcRole } = pkg

const router = express.Router()

router.post('/token', (req, res) => {
  const appId = process.env.AGORA_APP_ID
  const appCertificate = process.env.AGORA_APP_CERTIFICATE

  if (!appId || !appCertificate) {
    return res.status(500).json({ success: false, error: 'Agora credentials not configured' })
  }

  const { channelName, role } = req.body
  if (!channelName) {
    return res.status(400).json({ success: false, error: 'channelName is required' })
  }

  const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER
  const expireTime = Math.floor(Date.now() / 1000) + 3600

  const token = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, 0, rtcRole, expireTime, expireTime)

  res.json({ success: true, token })
})

export default router
