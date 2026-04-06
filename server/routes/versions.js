import express from 'express'
import { pool } from '../config/database.js'

const router = express.Router()

// 获取最新版本（公开接口，无需认证）
router.get('/latest', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM versions ORDER BY id DESC LIMIT 1')
    if (rows.length === 0) {
      return res.json({ success: true, data: null })
    }
    res.json({ success: true, data: rows[0] })
  } catch (error) {
    console.error('获取最新版本失败:', error)
    res.status(500).json({ success: false, message: '获取最新版本失败' })
  }
})

// 获取所有版本历史
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM versions ORDER BY id DESC')
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取版本列表失败:', error)
    res.status(500).json({ success: false, message: '获取版本列表失败' })
  }
})

// 查看表结构（调试用）
router.get('/columns', async (req, res) => {
  try {
    const [cols] = await pool.query('DESCRIBE versions')
    res.json({ success: true, data: cols })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
