import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../config/database.js'
import { createLoginSession, assertSessionActive, touchSession } from '../utils/loginSessions.js'

const router = express.Router()

router.post('/login', async (req, res) => {
  try {
    const { username, password, userType } = req.body
    const rememberMe = req.body?.rememberMe !== false && req.body?.rememberMe !== 0

    if (!username || !password || !userType) {
      return res.status(400).json({
        success: false,
        message: '请提供用户名、密码和用户类型'
      })
    }

    const tableName = userType === 'admin' ? 'admins' : 'students'
    const [users] = await pool.query(
      `SELECT * FROM ${tableName} WHERE username = ?`,
      [username]
    )

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      })
    }

    const user = users[0]
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      })
    }

    const sessionUserType = userType === 'admin' ? 'admin' : 'student'
    const sessionId = await createLoginSession(req, {
      userType: sessionUserType,
      userId: user.id,
      deviceName: req.body?.deviceName,
      rememberMe,
    })

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        userType,
        jti: sessionId,
      },
      process.env.JWT_SECRET,
      { expiresIn: rememberMe ? '7d' : '1d' }
    )

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name || username,
          userType,
          avatar: user.avatar || null,
        }
      }
    })
  } catch (error) {
    console.error('登录错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    })
  }
})

router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ success: false, message: '未提供认证令牌' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const active = await assertSessionActive(decoded)
    if (!active) {
      return res.status(401).json({ success: false, message: '会话已失效，请重新登录' })
    }
    void touchSession(decoded.jti)

    let avatar = null
    let displayName = decoded.username
    try {
      if (decoded.userType === 'admin') {
        const [rows] = await pool.query('SELECT name, username, avatar FROM admins WHERE id = ?', [decoded.id])
        if (rows[0]) {
          avatar = rows[0].avatar || null
          displayName = rows[0].name || rows[0].username || decoded.username
        }
      }
    } catch { /* ignore */ }

    res.json({
      success: true,
      data: {
        id: decoded.id,
        username: decoded.username,
        display_name: displayName,
        name: displayName,
        avatar,
        userType: decoded.userType
      }
    })
  } catch (error) {
    console.error('Token验证错误:', error)
    res.status(401).json({ success: false, message: '认证令牌无效或已过期' })
  }
})

router.put('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ success: false, message: '未提供认证令牌' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '请提供旧密码和新密码' })
    }

    const tableName = decoded.userType === 'admin' ? 'admins' : 'students'
    const [users] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [decoded.id])
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, users[0].password)
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: '旧密码错误' })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await pool.query(`UPDATE ${tableName} SET password = ? WHERE id = ?`, [hashedPassword, decoded.id])

    res.json({ success: true, message: '密码修改成功' })
  } catch (error) {
    console.error('修改密码错误:', error)
    res.status(500).json({ success: false, message: '服务器错误，请稍后重试' })
  }
})

export default router
