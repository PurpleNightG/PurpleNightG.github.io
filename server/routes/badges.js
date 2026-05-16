import express from 'express'
import { pool } from '../config/database.js'

const router = express.Router()

// 获取三个导航栏的待办数量：请假待审批、考核待审批、催促名单数量
// 每个查询独立 try/catch，任一失败不影响其他计数返回
router.get('/', async (req, res) => {
  let leavePending = 0
  let assessmentPending = 0
  let reminderCount = 0

  // 1. 待审批请假申请数
  try {
    const [[row]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM leave_applications WHERE status = '待审批'"
    )
    leavePending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] leave_applications query failed:', e.message)
  }

  // 2. 待审批考核申请数
  try {
    const [[row]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM assessment_applications WHERE status = '待审批'"
    )
    assessmentPending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] assessment_applications query failed:', e.message)
  }

  // 3. 催促名单数量（与 GET /api/reminders 使用相同的 WHERE 条件）
  try {
    const [settingRows] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'reminder_timeout_days'"
    )
    const defaultTimeoutDays = settingRows.length > 0 ? parseInt(settingRows[0].setting_value) : 7
    const threshold = Math.max(defaultTimeoutDays - 7, 0)
    const trainingStages = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考']

    const [[row]] = await pool.query(`
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
    reminderCount = Number(row.cnt)
  } catch (e) {
    console.error('[badges] reminder count query failed:', e.message)
  }

  res.json({
    success: true,
    data: { leavePending, assessmentPending, reminderCount }
  })
})

export default router
