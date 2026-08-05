import express from 'express'
import { pool } from '../config/database.js'
import { computeAttendanceForMember } from '../utils/attendanceReminder.js'
import { countTrainingReminders } from '../utils/trainingReminderList.js'

const router = express.Router()

// 获取导航栏待办数量
router.get('/', async (req, res) => {
  let leavePending = 0
  let leaveEndPending = 0
  let assessmentPending = 0
  let opinionPending = 0
  let reminderCount = 0
  let attendanceReminderCount = 0
  let assistantPending = 0

  try {
    const [[row]] = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM leave_applications la
      INNER JOIN members m ON m.id = la.member_id AND m.status != '已退队'
      WHERE la.status = '待审批'
    `)
    leavePending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] leave_applications query failed:', e.message)
  }

  try {
    const [[row]] = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM leave_records lr
      INNER JOIN members m ON m.id = lr.member_id AND m.status != '已退队'
      WHERE lr.status = '待结束审批'
    `)
    leaveEndPending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] leave_end_pending query failed:', e.message)
  }

  try {
    const [[row]] = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM assessment_applications aa
      INNER JOIN members m ON m.id = aa.member_id AND m.status != '已退队'
      WHERE aa.status = '待审批'
    `)
    assessmentPending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] assessment_applications query failed:', e.message)
  }

  try {
    const { count } = await countTrainingReminders()
    reminderCount = count
  } catch (e) {
    console.error('[badges] reminder count query failed:', e.message)
  }

  try {
    const [members] = await pool.query(`
      SELECT
        m.id, m.nickname, m.qq, m.stage_role, m.status,
        m.join_date, m.last_training_date, m.phase3_reached_at,
        CASE WHEN ret.id IS NOT NULL THEN 1 ELSE 0 END AS in_retention
      FROM members m
      LEFT JOIN retention_records ret ON m.id = ret.member_id
      WHERE m.status NOT IN ('已退队', '请假中', '其他')
    `)
    const [leaves] = await pool.query(`
      SELECT member_id, start_date, end_date, status
      FROM leave_records
      WHERE status IN ('请假中', '待结束审批', '已结束')
    `)
    const leaveMap = new Map()
    for (const row of leaves) {
      if (!leaveMap.has(row.member_id)) leaveMap.set(row.member_id, [])
      leaveMap.get(row.member_id).push(row)
    }
    const [ignores] = await pool.query('SELECT member_id FROM attendance_reminder_ignores')
    const ignoreSet = new Set(ignores.map(r => r.member_id))
    for (const m of members) {
      const item = computeAttendanceForMember(m, leaveMap.get(m.id) || [], {
        ignored: ignoreSet.has(m.id),
        inRetention: !!m.in_retention,
        showAll: false,
      })
      if (item) attendanceReminderCount++
    }
  } catch (e) {
    console.error('[badges] attendance reminder count failed:', e.message)
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opinion_box (
        id INT PRIMARY KEY AUTO_INCREMENT,
        member_id INT NOT NULL,
        is_anonymous TINYINT(1) NOT NULL DEFAULT 1,
        category VARCHAR(50) NOT NULL DEFAULT '建议',
        content TEXT NOT NULL,
        status ENUM('pending','read','archived') NOT NULL DEFAULT 'pending',
        admin_note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_opinion_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    const [[row]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM opinion_box WHERE status = 'pending'"
    )
    opinionPending = Number(row.cnt)
  } catch (e) {
    console.error('[badges] opinion_box query failed:', e.message)
  }

  try {
    const [[a]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM assistant_student_assignments WHERE status = '待审批'`
    )
    const [[c]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM pending_member_creates WHERE status = '待审批'`
    )
    const [[p]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM pending_stage_promotions WHERE status = '待审批'`
    )
    const [[e]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM pending_member_edits WHERE status = '待审批'`
    )
    const [[bp]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM pending_black_points WHERE status = '待审批'`
    )
    const [[lv]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM pending_leaves WHERE status = '待审批'`
    )
    assistantPending =
      Number(a.cnt) + Number(c.cnt) + Number(p.cnt) + Number(e.cnt) + Number(bp.cnt) + Number(lv.cnt)
  } catch (e) {
    console.error('[badges] assistant pending query failed:', e.message)
  }

  res.json({
    success: true,
    data: {
      leavePending,
      leaveEndPending,
      assessmentPending,
      opinionPending,
      assistantPending,
      reminderCount: reminderCount + attendanceReminderCount,
      trainingReminderCount: reminderCount,
      attendanceReminderCount,
    }
  })
})

export default router
