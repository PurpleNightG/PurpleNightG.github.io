import express from 'express'
import { pool } from '../config/database.js'
import { TRAINING_STAGES, LEAVE_BUFFER_EXISTS, TRAINING_INACTIVITY_THRESHOLD_PER_MEMBER } from '../utils/reminderQuery.js'

const router = express.Router()

// 获取导航栏待办数量
router.get('/', async (req, res) => {
  let leavePending = 0
  let leaveEndPending = 0
  let assessmentPending = 0
  let reminderCount = 0

  try {
    const [[row]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM leave_applications WHERE status = '待审批'"
    )
    leavePending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] leave_applications query failed:', e.message)
  }

  try {
    const [[row]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM leave_records WHERE status = '待结束审批'"
    )
    leaveEndPending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] leave_end_pending query failed:', e.message)
  }

  try {
    const [[row]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM assessment_applications WHERE status = '待审批'"
    )
    assessmentPending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] assessment_applications query failed:', e.message)
  }

  try {
    const [settingRows] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'reminder_timeout_days'"
    )
    const defaultTimeoutDays = settingRows.length > 0 ? parseInt(settingRows[0].setting_value) : 7
    const stagePlaceholders = TRAINING_STAGES.map(() => '?').join(', ')

    const [[row]] = await pool.query(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT m.id
        FROM members m
        INNER JOIN leave_records lr ON lr.id = (
          SELECT id FROM leave_records
          WHERE member_id = m.id
            AND status = '已结束'
            AND buffer_start_date IS NOT NULL
            AND DATEDIFF(CURDATE(), buffer_start_date) < 7
          ORDER BY buffer_start_date DESC
          LIMIT 1
        )
        LEFT JOIN reminder_list rl ON m.id = rl.member_id
        LEFT JOIN retention_records ret ON m.id = ret.member_id
        WHERE m.status NOT IN ('已退队', '请假中', '其他')
          AND m.stage_role IN (${stagePlaceholders})
          AND ret.id IS NULL
          AND ${TRAINING_INACTIVITY_THRESHOLD_PER_MEMBER}

        UNION ALL

        SELECT m.id
        FROM members m
        LEFT JOIN reminder_list rl ON m.id = rl.member_id
        LEFT JOIN retention_records ret ON m.id = ret.member_id
        WHERE m.status NOT IN ('已退队', '请假中', '其他')
          AND m.stage_role IN (${stagePlaceholders})
          AND ${TRAINING_INACTIVITY_THRESHOLD_PER_MEMBER}
          AND ret.id IS NULL
          AND NOT EXISTS (${LEAVE_BUFFER_EXISTS})
      ) combined
    `, [
      ...TRAINING_STAGES,
      defaultTimeoutDays,
      defaultTimeoutDays,
      ...TRAINING_STAGES,
      defaultTimeoutDays,
      defaultTimeoutDays,
    ])
    reminderCount = Number(row.cnt)
  } catch (e) {
    console.error('[badges] reminder count query failed:', e.message)
  }

  res.json({
    success: true,
    data: { leavePending, leaveEndPending, assessmentPending, reminderCount }
  })
})

export default router
