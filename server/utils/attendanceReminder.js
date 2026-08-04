/**
 * 考勤催促：
 * - 加入后 60 天内达到新训三期
 * - 达到三期后 45 天内成为正式队员及以上（下调仍按首次达三期计时，总上限 105 天）
 * - 紫夜/紫夜尖兵半年未参加新训
 * - 请假期间暂停计时；留队 / 状态「其他」不计
 */

export const PHASE3_DEADLINE_DAYS = 60
export const FORMAL_DEADLINE_DAYS = 45
export const MAX_TRACK_DAYS = PHASE3_DEADLINE_DAYS + FORMAL_DEADLINE_DAYS // 105
export const FORMAL_IDLE_DAYS = 180 // 半年
export const ATTENDANCE_WARN_DAYS = 7

const PHASE3_STAGES = new Set([
  '新训三期', '新训准考', '紫夜', '紫夜尖兵',
  '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师',
])

const FORMAL_STAGES = new Set(['紫夜', '紫夜尖兵'])

const FORMAL_OR_ABOVE = new Set([
  '紫夜', '紫夜尖兵',
  '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师',
])

function toDateOnly(v) {
  if (!v) return null
  if (v instanceof Date) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate())
  }
  const s = String(v).slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function datediff(a, b) {
  const da = toDateOnly(a)
  const db = toDateOnly(b)
  if (!da || !db) return 0
  return Math.round((da - db) / 86400000)
}

/** 区间 [rangeStart, rangeEnd] 与请假记录的重叠天数（按 MySQL DATEDIFF 风格，不含末日外延） */
export function leaveDaysInRange(leaves, rangeStart, rangeEnd, today = new Date()) {
  const rs = toDateOnly(rangeStart)
  const re = toDateOnly(rangeEnd) || toDateOnly(today)
  if (!rs || !re || re < rs) return 0

  let total = 0
  for (const leave of leaves || []) {
    const ls = toDateOnly(leave.start_date)
    if (!ls) continue
    let le = toDateOnly(leave.end_date)
    if (leave.status === '请假中' || leave.status === '待结束审批') {
      le = re
    }
    if (!le) continue
    const start = ls > rs ? ls : rs
    const end = le < re ? le : re
    if (end >= start) {
      total += datediff(end, start)
    }
  }
  return Math.max(0, total)
}

/** 有效已过天数 = 日历天数 − 请假天数 */
export function effectiveElapsedDays(fromDate, toDate, leaves) {
  const raw = datediff(toDate, fromDate)
  if (raw <= 0) return 0
  const paused = leaveDaysInRange(leaves, fromDate, toDate, toDate)
  return Math.max(0, raw - paused)
}

export function isPhase3OrAbove(stage) {
  return PHASE3_STAGES.has(stage)
}

export function isFormalOrAbove(stage) {
  return FORMAL_OR_ABOVE.has(stage)
}

export function isFormalMember(stage) {
  return FORMAL_STAGES.has(stage)
}

/**
 * 计算单名成员的考勤催促信息。
 * @returns {null | object}
 */
export function computeAttendanceForMember(member, leaves, opts = {}) {
  const {
    today = new Date(),
    ignored = false,
    inRetention = false,
    showAll = false,
    /** @type {Record<string, number>} reason_code -> custom_deadline_days */
    overrides = {},
  } = opts

  if (inRetention) return null
  if (member.status === '其他' || member.status === '已退队') return null

  const joinDate = toDateOnly(member.join_date)
  if (!joinDate) return null

  const onLeave = member.status === '请假中'
  const stage = member.stage_role
  const phase3At = toDateOnly(member.phase3_reached_at)
  const lastTraining = toDateOnly(member.last_training_date) || joinDate

  /** @type {{ reason_code: string, reason_label: string, deadline_days: number, elapsed_days: number, remaining_days: number, paused: boolean, has_custom_deadline?: boolean }[]} */
  const clocks = []

  // 1) 未达三期：60 天内达三期
  if (!phase3At && !isPhase3OrAbove(stage)) {
    const elapsed = effectiveElapsedDays(joinDate, today, leaves)
    clocks.push({
      reason_code: 'to_phase3',
      reason_label: '需在加入后 60 天内达到新训三期',
      deadline_days: PHASE3_DEADLINE_DAYS,
      elapsed_days: elapsed,
      remaining_days: PHASE3_DEADLINE_DAYS - elapsed,
      paused: onLeave,
    })
  }

  // 2) 已达三期但未转正：45 天（总上限 105）
  if ((phase3At || isPhase3OrAbove(stage)) && !isFormalOrAbove(stage)) {
    const start = phase3At || joinDate
    const elapsedFromPhase3 = effectiveElapsedDays(start, today, leaves)
    const elapsedFromJoin = effectiveElapsedDays(joinDate, today, leaves)
    const remainFormal = FORMAL_DEADLINE_DAYS - elapsedFromPhase3
    const remainCap = MAX_TRACK_DAYS - elapsedFromJoin
    const remaining = Math.min(remainFormal, remainCap)
    clocks.push({
      reason_code: 'to_formal',
      reason_label: '达到三期后需在 45\u00A0天内成为正式队员及以上（总上限 105\u00A0天）',
      deadline_days: FORMAL_DEADLINE_DAYS,
      elapsed_days: elapsedFromPhase3,
      remaining_days: remaining,
      paused: onLeave,
    })
  }

  // 3) 紫夜 / 紫夜尖兵：半年未新训
  if (isFormalMember(stage)) {
    const elapsed = effectiveElapsedDays(lastTraining, today, leaves)
    clocks.push({
      reason_code: 'formal_idle',
      reason_label: '正式队员半年内需至少参加一次新训',
      deadline_days: FORMAL_IDLE_DAYS,
      elapsed_days: elapsed,
      remaining_days: FORMAL_IDLE_DAYS - elapsed,
      paused: onLeave,
    })
  }

  if (clocks.length === 0) return null

  // 应用自定义期限：还剩天数 = custom_deadline - elapsed
  for (const clock of clocks) {
    const custom = overrides[clock.reason_code]
    if (custom != null && Number(custom) > 0) {
      const customDays = Number(custom)
      clock.deadline_days = customDays
      clock.remaining_days = customDays - clock.elapsed_days
      clock.has_custom_deadline = true
    }
  }

  clocks.sort((a, b) => a.remaining_days - b.remaining_days)
  const primary = clocks[0]
  const remaining_days = primary.remaining_days
  const hasCustom = clocks.some((c) => c.has_custom_deadline)

  const inWarnWindow = remaining_days <= ATTENDANCE_WARN_DAYS
  // 有自定义期限的成员始终保留在名单（便于回看/再改），除非已忽略且非 showAll
  if (!showAll && !inWarnWindow && !ignored && !hasCustom) return null
  if (ignored && !showAll) return null
  if (onLeave && !showAll) return null

  return {
    member_id: member.id,
    member_name: member.nickname,
    qq: member.qq,
    stage_role: stage,
    join_date: member.join_date,
    last_training_date: member.last_training_date,
    phase3_reached_at: member.phase3_reached_at,
    status: member.status,
    ignored,
    paused: onLeave,
    reason_code: primary.reason_code,
    reason_label: primary.reason_label,
    remaining_days,
    elapsed_days: primary.elapsed_days,
    deadline_days: primary.deadline_days,
    has_custom_deadline: !!primary.has_custom_deadline,
    custom_deadline_days: primary.has_custom_deadline ? primary.deadline_days : null,
    reasons: clocks,
  }
}

export async function ensurePhase3ReachedAt(pool, memberId, newStage) {
  if (!isPhase3OrAbove(newStage)) return
  await pool.query(
    `UPDATE members
     SET phase3_reached_at = COALESCE(phase3_reached_at, CURDATE())
     WHERE id = ?`,
    [memberId]
  )
}
