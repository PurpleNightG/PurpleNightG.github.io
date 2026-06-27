/** 催促名单与 badge 共用的阶段列表 */
export const TRAINING_STAGES = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考']

/** 成员处于请假结束缓冲期内（审批通过后 7 天内） */
export const LEAVE_BUFFER_EXISTS = `
  SELECT 1 FROM leave_records lr
  WHERE lr.member_id = m.id
    AND lr.status = '已结束'
    AND lr.buffer_start_date IS NOT NULL
    AND DATEDIFF(CURDATE(), lr.buffer_start_date) < 7
`

/** 未训天数达到催促预警阈值（全局固定 threshold，占位符 2 次） */
export const TRAINING_INACTIVITY_THRESHOLD = `
  (
    (m.last_training_date IS NOT NULL AND DATEDIFF(CURDATE(), m.last_training_date) >= ?)
    OR (m.last_training_date IS NULL AND m.join_date IS NOT NULL AND DATEDIFF(CURDATE(), m.join_date) >= ?)
  )
`

/** 未训天数达到该成员的有效超时预警线（COALESCE 自定义/全局 - 7，占位符 2 次） */
export const TRAINING_INACTIVITY_THRESHOLD_PER_MEMBER = `
  (
    (m.last_training_date IS NOT NULL AND DATEDIFF(CURDATE(), m.last_training_date) >= GREATEST(COALESCE(rl.custom_timeout_days, ?) - 7, 0))
    OR (m.last_training_date IS NULL AND m.join_date IS NOT NULL AND DATEDIFF(CURDATE(), m.join_date) >= GREATEST(COALESCE(rl.custom_timeout_days, ?) - 7, 0))
  )
`

/** 请假缓冲剩余天数（自结束审批通过日起算 7 天，与训练超时倒计时独立） */
export const BUFFER_REMAINING_DAYS_SQL = `GREATEST(0, 7 - DATEDIFF(CURDATE(), lr.buffer_start_date))`

/** 距离超时天数计算（defaultTimeoutDays 占位符一次） */
export const DAYS_UNTIL_TIMEOUT_SQL = `
  CASE
    WHEN rl.custom_timeout_days IS NOT NULL THEN
      rl.custom_timeout_days - CASE
        WHEN m.last_training_date IS NOT NULL THEN DATEDIFF(CURDATE(), m.last_training_date)
        ELSE DATEDIFF(CURDATE(), m.join_date)
      END
    ELSE
      ? - CASE
        WHEN m.last_training_date IS NOT NULL THEN DATEDIFF(CURDATE(), m.last_training_date)
        ELSE DATEDIFF(CURDATE(), m.join_date)
      END
  END
`
