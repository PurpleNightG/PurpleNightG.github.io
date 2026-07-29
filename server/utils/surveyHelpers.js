/** 满意度调查问卷：按人展开 / 门禁隐藏 / 计分 */

export const ATTENDED = '上过'
export const NOT_ATTENDED = '我没有上过这个教官的课'

export function parseJsonField(value, fallback) {
  if (value == null) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

/** 从「很满意(5)」或纯数字提取分数 */
export function extractScoreValue(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw)
  const paren = s.match(/\((\d+(?:\.\d+)?)\)/)
  if (paren) return Number(paren[1])
  const num = s.match(/^(\d+(?:\.\d+)?)$/)
  if (num) return Number(num[1])
  // 常见中文量表兜底
  if (s.includes('很满意')) return 5
  if (s.includes('满意') && !s.includes('不')) return 4
  if (s.includes('一般')) return 3
  if (s.includes('很不满意')) return 1
  if (s.includes('不满意')) return 2
  return null
}

export function isFieldVisible(field, answers) {
  if (!field?.gate_field_id) return true
  const gate = answers?.[field.gate_field_id]
  if (!gate) return false
  if (field.hide_when_gate && gate === field.hide_when_gate) return false
  return true
}

/**
 * 若有评价对象 subjects，将「按人」模板题按人展开；scope=global 的题目保持全局不展开。
 * subjects: [{ id, name, member_id? }]
 * fields: 题目模板（不含 subject_gate）
 */
export function expandSurveyFields(subjects, templates) {
  const subs = Array.isArray(subjects) ? subjects : []
  const tpls = Array.isArray(templates) ? templates.filter((f) => f.type !== 'subject_gate') : []
  if (!subs.length) return tpls

  const perSubject = tpls.filter((t) => t.scope !== 'global')
  const globalOnes = tpls.filter((t) => t.scope === 'global')

  const fields = []
  for (const sub of subs) {
    const gateId = `gate__${sub.id}`
    fields.push({
      id: gateId,
      type: 'subject_gate',
      subject_id: sub.id,
      subject_name: sub.name,
      label: '您是否上过该教官的课？',
      options: [ATTENDED, NOT_ATTENDED],
      required: true,
    })
    for (const t of perSubject) {
      fields.push({
        ...JSON.parse(JSON.stringify(t)),
        id: `${t.id}__${sub.id}`,
        template_id: t.id,
        subject_id: sub.id,
        subject_name: sub.name,
        // 题干不拼人名，前端用标签展示
        label: t.label,
        gate_field_id: gateId,
        hide_when_gate: NOT_ATTENDED,
        scope: 'subject',
      })
    }
  }
  for (const t of globalOnes) {
    fields.push({
      ...JSON.parse(JSON.stringify(t)),
      scope: 'global',
      subject_id: null,
      subject_name: null,
    })
  }
  return fields
}

export function validateAnswers(fields, answers) {
  if (!answers || typeof answers !== 'object') {
    return '答案格式无效'
  }
  for (const field of fields) {
    if (!isFieldVisible(field, answers)) continue

    const val = answers[field.id]

    if (field.type === 'subject_gate' || field.type === 'single') {
      if (field.required && (val == null || val === '')) {
        return `请填写：${field.label}`
      }
      if (val != null && val !== '' && typeof val !== 'string') {
        return `单选题格式错误：${field.label}`
      }
      continue
    }

    if (field.type === 'matrix') {
      const map = val && typeof val === 'object' && !Array.isArray(val) ? val : {}
      const rows = Array.isArray(field.rows) ? field.rows : []
      const cols = Array.isArray(field.columns) ? field.columns : []
      if (field.required) {
        for (const row of rows) {
          if (!map[row.id]) return `请完成：${field.label}`
        }
      }
      for (const [rowId, col] of Object.entries(map)) {
        if (cols.length && !cols.includes(col)) return `矩阵题选项无效：${field.label}`
        if (rows.length && !rows.some((r) => r.id === rowId)) return `矩阵题行无效：${field.label}`
      }
      continue
    }

    if (field.required) {
      if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) {
        return `请填写：${field.label}`
      }
    }
    if (val == null || val === '') continue
    if (field.type === 'multi' && !Array.isArray(val)) return `多选题格式错误：${field.label}`
    if ((field.type === 'text' || field.type === 'textarea') && typeof val !== 'string') {
      return `文本题格式错误：${field.label}`
    }
    if (field.type === 'rating') {
      const n = Number(val)
      const max = Number(field.maxRating) || 5
      if (!Number.isFinite(n) || n < 1 || n > max) return `评分超出范围：${field.label}`
    }
  }
  return null
}

/** 收集一份答卷中某评价对象的所有可计分分数 */
function scoresFromResponseForSubject(fields, answers, subjectId) {
  const scores = []
  for (const field of fields) {
    if (field.subject_id !== subjectId) continue
    if (field.type === 'subject_gate') continue
    if (!isFieldVisible(field, answers)) continue
    const val = answers[field.id]
    if (val == null || val === '') continue

    if (field.type === 'matrix' && typeof val === 'object' && !Array.isArray(val)) {
      for (const col of Object.values(val)) {
        const s = extractScoreValue(col)
        if (s != null) scores.push(s)
      }
    } else if (field.type === 'rating' || field.type === 'single') {
      const s = extractScoreValue(val)
      if (s != null) scores.push(s)
    }
  }
  return scores
}

/**
 * 按人汇总满意度
 * 返回每人：均分、样本数(上过并打过分)、未上课次数、样本可信度提示
 */
export function buildSatisfactionSummary(subjects, fields, responses) {
  const list = []
  for (const sub of subjects || []) {
    let attended = 0
    let notAttended = 0
    let scoredResponses = 0
    const allScores = []

    for (const resp of responses || []) {
      const answers = resp.answers || {}
      const gateId = `gate__${sub.id}`
      const gate = answers[gateId]
      if (gate === NOT_ATTENDED) {
        notAttended += 1
        continue
      }
      if (gate === ATTENDED) {
        attended += 1
        const scores = scoresFromResponseForSubject(fields, answers, sub.id)
        if (scores.length) {
          scoredResponses += 1
          allScores.push(...scores)
        }
      }
    }

    const avg =
      allScores.length > 0
        ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100
        : null

    let reliability = 'none'
    if (scoredResponses >= 5) reliability = 'good'
    else if (scoredResponses >= 3) reliability = 'ok'
    else if (scoredResponses >= 1) reliability = 'low'
    // n=1 满分会被标 low，前端显著提示

    list.push({
      subject_id: sub.id,
      name: sub.name,
      member_id: sub.member_id ?? null,
      attended,
      not_attended: notAttended,
      sample_size: scoredResponses,
      score_points: allScores.length,
      avg_score: avg,
      reliability,
      reliability_note:
        scoredResponses === 0
          ? '尚无有效评分'
          : scoredResponses === 1
            ? '仅 1 人评过分，均分极易受单人影响，不可直接当作整体口碑'
            : scoredResponses < 3
              ? `样本仅 ${scoredResponses} 人，参考意义有限`
              : null,
    })
  }

  // 有均分的按均分排序；无均分垫底
  list.sort((a, b) => {
    if (a.avg_score == null && b.avg_score == null) return 0
    if (a.avg_score == null) return 1
    if (b.avg_score == null) return -1
    return b.avg_score - a.avg_score
  })

  return list
}
