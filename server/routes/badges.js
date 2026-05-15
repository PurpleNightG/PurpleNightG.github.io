import express from 'express'
import { pool } from '../config/database.js'

const router = express.Router()

// 获取三个导航栏的待办数量：请假待审批、考核待审批、催促名单数量
router.get('/', async (req, res) => {
  try {
    // 1. 待审批请假申请数
    const [[leaveRow]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM leave_applications WHERE status = '待审批'"
    )

    // 2. 待审批考核申请数
    const [[assessRow]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM assessment_applications WHERE status = '待审批'"
    )

    // 3. 催促名单数量（与 GET /api/reminders 使用相同的 WHERE 条件）
    const [[settingRow]] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'reminder_timeout_days'"
    )
    const defaultTimeoutDays = settingRow ? parseInt(settingRow.setting_value) : 7
    const threshold = Math.max(defaultTimeoutDays - 7, 0)
    const trainingStages = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考']

    const [[reminderRow]] = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM members m
      LEFT JOIN reminder_list rl ON m.id = rl.member_id
      LEFT JOIN retention_records ret ON m.id = ret.member_id
      WHERE m.status NOT IN ('已退队', '请假中', '其他')
        AND m.stage_role IN (?, ?, ?, ?, ?, ?)
        AND (
          (m.last_training_date IS NOT NULL AND DATEDIFF(CURDATE(), m.last_training_date) >= ?)
          OR (m.last_training_date IS NULL AND m.join_date IS NOT NULL AND DATEDIFF(CURDATE(), m.join_date) >= ?)
        )
        AND ret.id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM leave_records lr
          WHERE lr.member_id = m.id
            AND lr.status = '已结束'
            AND lr.end_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        )
    `, [...trainingStages, threshold, threshold])

    res.json({
      success: true,
      data: {
        leavePending: leaveRow.cnt,
        assessmentPending: assessRow.cnt,
        reminderCount: reminderRow.cnt
      }
    })
  } catch (error) {
    console.error('获取徽章数据失败:', error)
    res.status(500).json({ success: false, message: '获取数据失败' })
  }
})

export default router
