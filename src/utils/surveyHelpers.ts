/** 前端：满意度按人展开 / 条件显示（与 server/utils/surveyHelpers 对齐） */

export const ATTENDED = '上过'
export const NOT_ATTENDED = '我没有上过这个教官的课'

export type SurveySubject = { id: string; name: string; member_id?: number | null }

export function isFieldVisible(
  field: { gate_field_id?: string; hide_when_gate?: string },
  answers: Record<string, unknown>
) {
  if (!field?.gate_field_id) return true
  const gate = answers?.[field.gate_field_id]
  if (!gate) return false
  if (field.hide_when_gate && gate === field.hide_when_gate) return false
  return true
}

export function expandSurveyFields(subjects: SurveySubject[] | undefined, templates: any[]) {
  const subs = Array.isArray(subjects) ? subjects : []
  const tpls = Array.isArray(templates) ? templates.filter((f) => f.type !== 'subject_gate') : []
  if (!subs.length) return tpls

  const perSubject = tpls.filter((t) => t.scope !== 'global')
  const globalOnes = tpls.filter((t) => t.scope === 'global')

  const fields: any[] = []
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
