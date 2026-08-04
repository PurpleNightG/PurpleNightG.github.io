import { pool } from '../config/database.js'
import {
  TRAINING_STAGES,
  LEAVE_BUFFER_EXISTS,
  DAYS_UNTIL_TIMEOUT_SQL,
  BUFFER_REMAINING_DAYS_SQL,
  TRAINING_WARN_DAYS,
  buildTrainingReminderEligibleSql,
  buildIsCustomExtendedSql,
} from './reminderQuery.js'
import { getKickCycleInfo } from './kickCycle.js'
import { getSetting } from '../routes/settings.js'

export async function loadReminderConfig() {
  const timeoutRow = await getSetting('reminder_timeout_days', '7')
  const kickWeekdayRow = await getSetting('reminder_kick_weekday', '1')
  const leadRow = await getSetting('reminder_kick_lead_days', '3')
  const modeRow = await getSetting('reminder_display_mode', 'remaining')

  const [[dateRow]] = await pool.query('SELECT CURDATE() AS today')
  const raw = dateRow.today
  let todayIso
  if (raw instanceof Date) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    todayIso = `${y}-${m}-${d}`
  } else {
    todayIso = String(raw).slice(0, 10)
  }

  const kickWeekday = parseInt(kickWeekdayRow.setting_value, 10) || 1
  const leadDays = parseInt(leadRow.setting_value, 10) || 3
  const kickInfo = getKickCycleInfo(todayIso, kickWeekday, leadDays)

  return {
    defaultTimeoutDays: parseInt(timeoutRow.setting_value, 10) || 7,
    displayMode: modeRow.setting_value === 'kick_cycle' ? 'kick_cycle' : 'remaining',
    kickInfo,
    todayIso,
  }
}

/**
 * @param {number} defaultTimeoutDays
 * @param {number} warnDays 还剩 ≤ warnDays 天进入名单
 */
export async function queryTrainingReminders(defaultTimeoutDays, warnDays) {
  const stagePlaceholders = TRAINING_STAGES.map(() => '?').join(', ')
  const eligibleSql = buildTrainingReminderEligibleSql(warnDays)
  const extendedSql = buildIsCustomExtendedSql(warnDays)

  const [rows] = await pool.query(`
    SELECT * FROM (
      SELECT
        m.id AS id,
        m.id AS member_id,
        m.nickname AS member_name,
        m.qq,
        m.stage_role,
        m.last_training_date,
        CASE
          WHEN m.last_training_date IS NOT NULL THEN DATEDIFF(CURDATE(), m.last_training_date)
          ELSE DATEDIFF(CURDATE(), m.join_date)
        END AS days_without_training,
        rl.custom_timeout_days,
        ${BUFFER_REMAINING_DAYS_SQL} AS days_until_timeout,
        1 AS is_leave_buffer,
        ${BUFFER_REMAINING_DAYS_SQL} AS buffer_remaining_days,
        ${extendedSql} AS is_custom_extended
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
        AND ${eligibleSql}

      UNION ALL

      SELECT
        m.id AS id,
        m.id AS member_id,
        m.nickname AS member_name,
        m.qq,
        m.stage_role,
        m.last_training_date,
        CASE
          WHEN m.last_training_date IS NOT NULL THEN DATEDIFF(CURDATE(), m.last_training_date)
          ELSE DATEDIFF(CURDATE(), m.join_date)
        END AS days_without_training,
        rl.custom_timeout_days,
        ${DAYS_UNTIL_TIMEOUT_SQL} AS days_until_timeout,
        0 AS is_leave_buffer,
        NULL AS buffer_remaining_days,
        ${extendedSql} AS is_custom_extended
      FROM members m
      LEFT JOIN reminder_list rl ON m.id = rl.member_id
      LEFT JOIN retention_records ret ON m.id = ret.member_id
      WHERE m.status NOT IN ('已退队', '请假中', '其他')
        AND m.stage_role IN (${stagePlaceholders})
        AND ${eligibleSql}
        AND ret.id IS NULL
        AND NOT EXISTS (${LEAVE_BUFFER_EXISTS})
    ) combined
    ORDER BY is_leave_buffer DESC, is_custom_extended ASC, days_without_training DESC
  `, [
    defaultTimeoutDays, defaultTimeoutDays,
    ...TRAINING_STAGES,
    defaultTimeoutDays, defaultTimeoutDays,
    defaultTimeoutDays, defaultTimeoutDays,
    defaultTimeoutDays,
    defaultTimeoutDays, defaultTimeoutDays,
    ...TRAINING_STAGES,
    defaultTimeoutDays, defaultTimeoutDays,
    defaultTimeoutDays, defaultTimeoutDays,
  ])

  return rows
}

/** 按显示模式取训练催促人数（与列表接口一致） */
export async function countTrainingReminders(modeOverride = null) {
  const cfg = await loadReminderConfig()
  const mode = modeOverride === 'kick_cycle' || modeOverride === 'remaining'
    ? modeOverride
    : cfg.displayMode

  if (mode === 'kick_cycle') {
    if (!cfg.kickInfo.inWindow) return { count: 0, mode, cfg }
    const rows = await queryTrainingReminders(cfg.defaultTimeoutDays, cfg.kickInfo.daysUntilKick)
    return { count: rows.length, mode, cfg }
  }

  const rows = await queryTrainingReminders(cfg.defaultTimeoutDays, TRAINING_WARN_DAYS)
  return { count: rows.length, mode, cfg }
}
