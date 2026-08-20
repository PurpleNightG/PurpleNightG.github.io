import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, CheckSquare, Square, HelpCircle, ChevronRight } from 'lucide-react'
import { reminderAPI } from '../utils/api'
import { toast } from '../utils/toast'
import StyledSelect from './StyledSelect'
import ConfirmDialog from './ConfirmDialog'

export type BadgeColor = 'yellow' | 'orange' | 'purple' | 'sky' | 'green' | 'rose' | 'amber' | 'slate'

export type AttendanceRule =
  | {
      id: string
      enabled: boolean
      type: 'until_stage'
      reasonCode: string
      label: string
      title?: string
      /** 名单短标签，可与规则名称不同 */
      badge?: string
      badgeColor?: BadgeColor
      startAnchor: 'join_date' | 'phase3_reached_at' | 'last_training_date'
      deadlineDays: number
      capFromJoinDays: number | null
      doneWhenStages: string[]
      milestoneStages: string[]
    }
  | {
      id: string
      enabled: boolean
      type: 'training_idle'
      reasonCode: string
      label: string
      title?: string
      badge?: string
      badgeColor?: BadgeColor
      deadlineDays: number
      activeWhenStages: string[]
      skipWhenFormalShortCycle: boolean
    }

export const BADGE_COLOR_OPTIONS: { value: BadgeColor; label: string; className: string }[] = [
  { value: 'yellow', label: '黄', className: 'bg-yellow-600/30 text-yellow-300 ring-yellow-500/50' },
  { value: 'orange', label: '橙', className: 'bg-orange-600/30 text-orange-300 ring-orange-500/50' },
  { value: 'purple', label: '紫', className: 'bg-purple-600/30 text-purple-300 ring-purple-500/50' },
  { value: 'sky', label: '蓝', className: 'bg-sky-600/30 text-sky-300 ring-sky-500/50' },
  { value: 'green', label: '绿', className: 'bg-green-600/30 text-green-300 ring-green-500/50' },
  { value: 'rose', label: '粉', className: 'bg-rose-600/30 text-rose-300 ring-rose-500/50' },
  { value: 'amber', label: '琥珀', className: 'bg-amber-600/30 text-amber-300 ring-amber-500/50' },
  { value: 'slate', label: '灰', className: 'bg-slate-600/30 text-slate-300 ring-slate-500/50' },
]

const KNOWN_RULE_BADGES: Record<string, string> = {
  to_phase3: '达三期',
  to_exam: '准考',
  to_formal: '准考',
  formal_idle: '半年新训',
}

const KNOWN_RULE_BADGE_COLORS: Record<string, BadgeColor> = {
  to_phase3: 'yellow',
  to_exam: 'orange',
  to_formal: 'orange',
  formal_idle: 'purple',
}

export function badgeColorClass(color?: string) {
  const hit = BADGE_COLOR_OPTIONS.find((o) => o.value === color)
  return hit?.className || BADGE_COLOR_OPTIONS.find((o) => o.value === 'sky')!.className
}

function ruleBadgeText(rule: AttendanceRule): string {
  const custom = String(rule.badge || '').trim()
  if (custom) return custom
  if (KNOWN_RULE_BADGES[rule.reasonCode]) return KNOWN_RULE_BADGES[rule.reasonCode]
  if (KNOWN_RULE_BADGES[rule.id]) return KNOWN_RULE_BADGES[rule.id]
  const title = String(rule.title || '').trim()
  if (title) return title.slice(0, 16)
  return rule.type === 'training_idle' ? '闲置再训' : '进度'
}

function ruleBadgeColor(rule: AttendanceRule): BadgeColor {
  if (rule.badgeColor && BADGE_COLOR_OPTIONS.some((o) => o.value === rule.badgeColor)) {
    return rule.badgeColor
  }
  return KNOWN_RULE_BADGE_COLORS[rule.reasonCode]
    || KNOWN_RULE_BADGE_COLORS[rule.id]
    || (rule.type === 'training_idle' ? 'purple' : 'sky')
}

export type ReminderRulesConfig = {
  version: number
  training: {
    stages: string[]
    warnDays: number
    defaultTimeoutDays: number
    formalTimeoutDays: number
    formalStages: string[]
  }
  attendance: {
    warnDays: number
    rules: AttendanceRule[]
  }
}

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: (config: ReminderRulesConfig) => void
}

const START_ANCHOR_LABEL: Record<string, string> = {
  join_date: '从加入日开始算',
  phase3_reached_at: '从首次达到里程碑阶段开始算',
  last_training_date: '从上次训练日开始算',
}

const KNOWN_RULE_TITLES: Record<string, string> = {
  to_phase3: '升到三期',
  to_exam: '升到准考',
  to_formal: '升到准考',
  formal_idle: '正式队员再训',
}

function summarizeStages(stages: string[], max = 3) {
  if (!stages?.length) return '（未选阶段）'
  const shown = stages.slice(0, max).join('、')
  return stages.length > max ? `${shown}等` : shown
}

/** 给人看的规则说明（保存时写入 label，学员端直接显示） */
function buildFriendlyLabel(rule: AttendanceRule): string {
  if (rule.type === 'training_idle') {
    return `${summarizeStages(rule.activeWhenStages)}：${rule.deadlineDays} 天内需至少参加一次新训`
  }
  const start =
    rule.startAnchor === 'phase3_reached_at'
      ? '达到里程碑后'
      : rule.startAnchor === 'last_training_date'
        ? '自上次训练起'
        : '加入后'
  let text = `${start} ${rule.deadlineDays} 天内需达到${summarizeStages(rule.doneWhenStages)}`
  if (rule.capFromJoinDays != null && rule.capFromJoinDays > 0) {
    text += `（自加入日起总上限 ${rule.capFromJoinDays} 天）`
  }
  return text
}

function ruleDisplayTitle(rule: AttendanceRule, index: number): string {
  const custom = String(rule.title || '').trim()
  if (custom) return custom
  if (KNOWN_RULE_TITLES[rule.reasonCode]) return KNOWN_RULE_TITLES[rule.reasonCode]
  if (KNOWN_RULE_TITLES[rule.id]) return KNOWN_RULE_TITLES[rule.id]
  return rule.type === 'until_stage' ? `晋升期限 ${index + 1}` : `闲置再训 ${index + 1}`
}

function StageMultiSelect({
  allStages,
  value,
  onChange,
}: {
  allStages: string[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto picker-scrollbar p-2 rounded-lg bg-black/20 border border-gray-700">
      {allStages.map((stage) => {
        const on = value.includes(stage)
        return (
          <button
            key={stage}
            type="button"
            onClick={() => {
              onChange(on ? value.filter((s) => s !== stage) : [...value, stage])
            }}
            className={`reminder-rules-stage-chip px-2 py-0.5 rounded text-xs ${
              on ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {stage}
          </button>
        )
      })}
    </div>
  )
}

function newRule(type: 'until_stage' | 'training_idle'): AttendanceRule {
  const id = `rule_${Date.now().toString(36)}`
  if (type === 'training_idle') {
    const rule: AttendanceRule = {
      id,
      enabled: true,
      type: 'training_idle',
      reasonCode: id.slice(0, 32),
      title: '正式队员再训',
      badge: '半年新训',
      badgeColor: 'purple',
      label: '',
      deadlineDays: 180,
      activeWhenStages: ['紫夜', '紫夜尖兵'],
      skipWhenFormalShortCycle: true,
    }
    rule.label = buildFriendlyLabel(rule)
    return rule
  }
  const rule: AttendanceRule = {
    id,
    enabled: true,
    type: 'until_stage',
    reasonCode: id.slice(0, 32),
    title: '晋升期限',
    badge: '晋升',
    badgeColor: 'sky',
    label: '',
    startAnchor: 'join_date',
    deadlineDays: 60,
    capFromJoinDays: null,
    doneWhenStages: ['新训三期', '新训准考', '紫夜', '紫夜尖兵'],
    milestoneStages: [],
  }
  rule.label = buildFriendlyLabel(rule)
  return rule
}

/** 保存前整理：名称兜底；说明文案可自定义，留空则自动生成 */
function prepareConfigForSave(config: ReminderRulesConfig): ReminderRulesConfig {
  return {
    ...config,
    attendance: {
      ...config.attendance,
      rules: config.attendance.rules.map((r, i) => {
        const custom = String(r.label || '').trim()
        const badge = String(r.badge || '').trim().slice(0, 16)
        return {
          ...r,
          title: String(r.title || ruleDisplayTitle(r, i)).trim() || undefined,
          badge: badge || undefined,
          badgeColor: ruleBadgeColor(r),
          label: custom || buildFriendlyLabel(r),
        }
      }),
    },
  }
}

export default function ReminderRulesSettings({ open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'training' | 'attendance'>('training')
  const [allStages, setAllStages] = useState<string[]>([])
  const [defaults, setDefaults] = useState<ReminderRulesConfig | null>(null)
  const [config, setConfig] = useState<ReminderRulesConfig | null>(null)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showMilestoneHelp, setShowMilestoneHelp] = useState(false)

  // 仅在打开时加载；勿依赖 onClose（父组件每次渲染都会换新函数，会导致反复请求、模态闪烁）
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      // 已有缓存时不整页切「加载中」，避免再闪一下
      if (!config) setLoading(true)
      try {
        const res = await reminderAPI.getRulesConfig()
        if (cancelled) return
        setConfig(res.data)
        setAllStages(res.meta?.allStages || [])
        setDefaults(res.meta?.defaults || null)
        setExpandedRule((prev) => prev || res.data?.attendance?.rules?.[0]?.id || null)
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e.message || '加载规则配置失败')
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟 open 挂钩，避免闪烁
  }, [open])

  if (!open) return null

  const updateTraining = (patch: Partial<ReminderRulesConfig['training']>) => {
    setConfig((prev) => prev ? { ...prev, training: { ...prev.training, ...patch } } : prev)
  }

  const updateAttendance = (patch: Partial<ReminderRulesConfig['attendance']>) => {
    setConfig((prev) => prev ? { ...prev, attendance: { ...prev.attendance, ...patch } } : prev)
  }

  const updateRule = (index: number, patch: Partial<AttendanceRule>) => {
    setConfig((prev) => {
      if (!prev) return prev
      const rules = prev.attendance.rules.map((r, i) => {
        if (i !== index) return r
        const oldAuto = buildFriendlyLabel(r)
        const next = { ...r, ...patch } as AttendanceRule
        // 未自定义（空或仍等于旧自动文案）时，随天数/阶段自动同步；已手改的则保留
        if (!('label' in patch)) {
          const cur = String(r.label || '').trim()
          if (!cur || cur === oldAuto) {
            next.label = buildFriendlyLabel(next)
          }
        }
        return next
      })
      return { ...prev, attendance: { ...prev.attendance, rules } }
    })
  }

  const moveRule = (index: number, dir: -1 | 1) => {
    setConfig((prev) => {
      if (!prev) return prev
      const rules = [...prev.attendance.rules]
      const j = index + dir
      if (j < 0 || j >= rules.length) return prev
      ;[rules[index], rules[j]] = [rules[j], rules[index]]
      return { ...prev, attendance: { ...prev.attendance, rules } }
    })
  }

  const removeRule = (index: number) => {
    setConfig((prev) => {
      if (!prev) return prev
      const rules = prev.attendance.rules.filter((_, i) => i !== index)
      return { ...prev, attendance: { ...prev.attendance, rules } }
    })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      const payload = prepareConfigForSave(config)
      const res = await reminderAPI.saveRulesConfig(payload)
      toast.success('规则总设置已保存')
      setConfig(res.data)
      onSaved?.(res.data)
      onClose()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!defaults) return
    setConfirmReset(true)
  }

  const confirmDoReset = () => {
    if (!defaults) return
    setConfig(structuredClone(defaults))
    setConfirmReset(false)
    toast.info('已载入默认规则，请点击保存生效')
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 glass-modal-backdrop reminder-rules-backdrop-enter"
        aria-hidden
        onClick={onClose}
      />
      <div className="relative z-10 glass-modal-frame w-full max-w-3xl max-h-[90vh] flex flex-col">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full flex-1 min-h-0 flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-4 shrink-0 reminder-rules-content-enter">
              <div>
                <h2 className="text-xl font-bold text-white">催促规则总设置</h2>
                <p className="text-xs text-gray-400 mt-1">
                  用中文配置天数与阶段即可；说明文案会自动生成。
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="group text-xs text-gray-400 hover:text-white flex items-center gap-1 shrink-0 transition-colors"
                title="恢复默认"
              >
                <RotateCcw size={14} className="transition-transform duration-300 group-hover:-rotate-45" />
                恢复默认
              </button>
            </div>

            <div className="inline-flex rounded-lg overflow-hidden border border-gray-600 text-sm mb-4 shrink-0 self-start reminder-rules-content-enter" style={{ animationDelay: '40ms' }}>
              <button
                type="button"
                onClick={() => setTab('training')}
                className={`px-4 py-1.5 transition-colors duration-200 ${tab === 'training' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:text-white'}`}
              >
                训练催促
              </button>
              <button
                type="button"
                onClick={() => setTab('attendance')}
                className={`px-4 py-1.5 transition-colors duration-200 ${tab === 'attendance' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:text-white'}`}
              >
                进度催促规则
              </button>
            </div>

            {loading || !config ? (
              <div className="text-gray-400 py-12 text-center reminder-rules-content-enter">加载中…</div>
            ) : (
              <div
                key={tab}
                className="flex-1 min-h-0 overflow-y-auto modal-scrollbar space-y-4 pr-0.5 reminder-rules-tab-panel"
              >
                {tab === 'training' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">新训多久未训算超时（天）</label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={config.training.defaultTimeoutDays}
                          onChange={(e) => updateTraining({ defaultTimeoutDays: parseInt(e.target.value, 10) || 7 })}
                          className="student-glass-field"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">训练催促提前几天提醒</label>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={config.training.warnDays}
                          onChange={(e) => updateTraining({ warnDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className="student-glass-field"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">还剩不超过这么多天时，出现在训练催促名单。</p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">正式队员考勤周期（天）</label>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={config.training.formalTimeoutDays}
                          onChange={(e) => updateTraining({ formalTimeoutDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className="student-glass-field"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">填 0 表示关闭：正式队员改走进度催促里的「闲置再训」。填写后学员端常驻显示倒计时。</p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">进度催促提前几天提醒</label>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={config.attendance.warnDays}
                          onChange={(e) => updateAttendance({ warnDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className="student-glass-field"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-1">哪些阶段要进训练催促</label>
                      <StageMultiSelect
                        allStages={allStages}
                        value={config.training.stages}
                        onChange={(stages) => updateTraining({ stages })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">哪些算正式队员（短周期考勤）</label>
                      <StageMultiSelect
                        allStages={allStages}
                        value={config.training.formalStages}
                        onChange={(formalStages) => updateTraining({ formalStages })}
                      />
                    </div>
                  </>
                )}

                {tab === 'attendance' && (
                  <>
                    <p className="text-xs text-gray-400">
                      按列表从上到下检查；同一个人可能命中多条，以「还剩天数最少」那条为准显示。
                    </p>

                    <div className={`rounded-lg border border-gray-700 bg-black/25 overflow-hidden reminder-rules-card ${showMilestoneHelp ? 'is-open' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setShowMilestoneHelp((v) => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-white/5 transition-colors"
                      >
                        <HelpCircle size={16} className="text-purple-400 shrink-0" />
                        <span className="flex-1 font-medium">「里程碑」是什么？点这里看说明</span>
                        <ChevronRight
                          size={16}
                          className={`text-gray-500 shrink-0 transition-transform duration-200 ${showMilestoneHelp ? 'rotate-90' : ''}`}
                        />
                      </button>
                      <div className={`reminder-rules-expand ${showMilestoneHelp ? 'is-open' : ''}`}>
                        <div className="reminder-rules-expand-inner">
                          <div className="px-3 pb-3 pt-0 text-xs text-gray-400 leading-relaxed space-y-3 border-t border-gray-700/80">
                            <p className="text-gray-300 pt-3">
                              可以把「里程碑」理解成：系统在成员<strong className="text-gray-200 font-medium">第一次升到某些阶段时，自动记下当天的日期</strong>。
                              这个日期专门给后面的规则当「计时起点」用。
                            </p>
                            <div>
                              <div className="text-purple-300 font-medium mb-1">用默认规则举例（最常见）</div>
                              <ol className="list-decimal list-inside space-y-1.5">
                                <li>
                                  规则「升到三期」：从<strong className="text-gray-300">加入日</strong>起算，60 天内要达到「新训三期」等阶段。
                                </li>
                                <li>
                                  当他第一次变成「新训三期」（或你勾选的其它里程碑阶段）时，系统记下这一天，叫<strong className="text-gray-300">里程碑日</strong>。
                                </li>
                                <li>
                                  规则「升到准考」：从<strong className="text-gray-300">这个里程碑日</strong>起再算 45 天，要求达到准考等阶段；同时还有「自加入日起总上限 105 天」封顶。
                                </li>
                              </ol>
                            </div>
                            <div>
                              <div className="text-purple-300 font-medium mb-1">怎么算、记不记？</div>
                              <ul className="list-disc list-inside space-y-1.5">
                                <li>只记<strong className="text-gray-300">第一次</strong>进入勾选阶段的日期；之后降级再升回来，一般不会改这个日期。</li>
                                <li>计时起点选「从首次达到里程碑阶段开始算」的规则，才会用到这个日期。</li>
                                <li>若选「从加入日开始算」，跟里程碑无关，始终从加入那天起算。</li>
                                <li>若人选了里程碑阶段，但历史上没记下日期，系统会暂时用加入日兜底，避免算不出来。</li>
                              </ul>
                            </div>
                            <div>
                              <div className="text-purple-300 font-medium mb-1">你在设置里要勾什么？</div>
                              <ul className="list-disc list-inside space-y-1.5">
                                <li>
                                  <strong className="text-gray-300">达到哪些阶段算完成</strong>：到了这些阶段，这条晋升规则就停表（目标达成）。
                                </li>
                                <li>
                                  <strong className="text-gray-300">哪些阶段记为里程碑</strong>：第一次到这些阶段时写日期；通常勾「新训三期」及更高阶段即可（默认已勾好）。
                                </li>
                              </ul>
                            </div>
                            <p className="text-gray-500">
                              不懂细节时：保持默认「升到三期 → 升到准考 → 正式队员再训」即可，一般不用改里程碑勾选。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const r = newRule('until_stage')
                          updateAttendance({ rules: [...config.attendance.rules, r] })
                          setExpandedRule(r.id)
                        }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-700 text-white inline-flex items-center gap-1"
                      >
                        <Plus size={14} /> 添加晋升期限
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const r = newRule('training_idle')
                          updateAttendance({ rules: [...config.attendance.rules, r] })
                          setExpandedRule(r.id)
                        }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-600 hover:bg-gray-500 text-white inline-flex items-center gap-1"
                      >
                        <Plus size={14} /> 添加闲置再训
                      </button>
                    </div>

                    <div className="space-y-2">
                      {config.attendance.rules.map((rule, index) => {
                        const openRule = expandedRule === rule.id
                        const title = ruleDisplayTitle(rule, index)
                        const badgeText = ruleBadgeText(rule)
                        const badgeTone = ruleBadgeColor(rule)
                        const autoLabel = buildFriendlyLabel(rule)
                        const displayLabel = String(rule.label || '').trim() || autoLabel
                        const isCustomLabel = !!(String(rule.label || '').trim() && String(rule.label).trim() !== autoLabel)
                        return (
                          <div
                            key={rule.id}
                            className={`reminder-rules-card rounded-lg border border-gray-700 bg-black/20 overflow-hidden ${openRule ? 'is-open' : ''}`}
                          >
                            <div className="flex items-center gap-2 px-3 py-2">
                              <button
                                type="button"
                                className="text-left flex-1 min-w-0"
                                onClick={() => setExpandedRule(openRule ? null : rule.id)}
                              >
                                <div className="text-sm text-white truncate flex items-center gap-1.5">
                                  {!rule.enabled && <span className="text-gray-500">（已停用）</span>}
                                  <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded shrink-0 ${badgeColorClass(badgeTone)}`}>
                                    {badgeText}
                                  </span>
                                  <span className="truncate">{title}</span>
                                  <span className="text-gray-400 font-normal shrink-0"> · {rule.deadlineDays} 天</span>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate mt-0.5">{displayLabel}</div>
                              </button>
                              <button
                                type="button"
                                onClick={() => updateRule(index, { enabled: !rule.enabled })}
                                className="text-xs text-gray-300 flex items-center gap-1.5 shrink-0 hover:text-white transition-colors"
                              >
                                {rule.enabled
                                  ? <CheckSquare size={16} className="text-purple-400" />
                                  : <Square size={16} className="text-gray-500" />}
                                启用
                              </button>
                              <button type="button" className="text-gray-400 hover:text-white p-1" onClick={() => moveRule(index, -1)} disabled={index === 0}>
                                <ChevronUp size={16} />
                              </button>
                              <button type="button" className="text-gray-400 hover:text-white p-1" onClick={() => moveRule(index, 1)} disabled={index === config.attendance.rules.length - 1}>
                                <ChevronDown size={16} />
                              </button>
                              <button type="button" className="text-red-400 hover:text-red-300 p-1" onClick={() => removeRule(index)}>
                                <Trash2 size={16} />
                              </button>
                            </div>

                            <div className={`reminder-rules-expand ${openRule ? 'is-open' : ''}`}>
                              <div className="reminder-rules-expand-inner">
                              <div className="px-3 pb-3 space-y-3 border-t border-gray-700/80 pt-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">规则名称</label>
                                    <input
                                      className="student-glass-field text-sm"
                                      value={rule.title ?? title}
                                      placeholder="例如：升到三期"
                                      onChange={(e) => updateRule(index, { title: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">期限（天）</label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={3650}
                                      className="student-glass-field text-sm"
                                      value={rule.deadlineDays}
                                      onChange={(e) => updateRule(index, { deadlineDays: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">名单标签（短名）</label>
                                    <input
                                      className="student-glass-field text-sm"
                                      value={rule.badge ?? ''}
                                      placeholder={badgeText}
                                      maxLength={16}
                                      onChange={(e) => updateRule(index, { badge: e.target.value })}
                                    />
                                    <p className="text-[11px] text-gray-500 mt-1">催促名单上的彩色小标签，可与规则名称不同。</p>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">标签颜色</label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {BADGE_COLOR_OPTIONS.map((opt) => {
                                        const on = badgeTone === opt.value
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            title={opt.label}
                                            onClick={() => updateRule(index, { badgeColor: opt.value })}
                                            className={`inline-flex items-center justify-center min-w-[2.25rem] h-7 px-1.5 rounded text-[11px] leading-none transition-shadow ${opt.className} ${
                                              on ? 'ring-2 ring-offset-1 ring-offset-[#12101c]' : 'opacity-70 hover:opacity-100'
                                            }`}
                                          >
                                            {opt.label}
                                          </button>
                                        )
                                      })}
                                    </div>
                                    <div className="mt-2">
                                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${badgeColorClass(badgeTone)}`}>
                                        {String(rule.badge || '').trim() || badgeText}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <label className="block text-xs text-gray-400">学员端显示文案</label>
                                    <button
                                      type="button"
                                      onClick={() => updateRule(index, { label: autoLabel })}
                                      className="text-[11px] text-purple-300 hover:text-purple-200 shrink-0"
                                    >
                                      {isCustomLabel ? '恢复为自动生成' : '重新生成'}
                                    </button>
                                  </div>
                                  <textarea
                                    rows={2}
                                    className="student-glass-field text-sm resize-y min-h-[2.75rem]"
                                    value={displayLabel}
                                    placeholder={autoLabel}
                                    onChange={(e) => updateRule(index, { label: e.target.value })}
                                  />
                                  <p className="text-[11px] text-gray-500 mt-1">
                                    {isCustomLabel
                                      ? '已自定义；改天数/阶段时不会自动覆盖。可点「恢复为自动生成」。'
                                      : '当前为自动生成；也可直接改成你想要的句子。'}
                                  </p>
                                </div>

                                {rule.type === 'until_stage' ? (
                                  <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-xs text-gray-400 mb-1">从什么时候开始计时</label>
                                        <StyledSelect
                                          size="sm"
                                          value={rule.startAnchor}
                                          onChange={(v) => updateRule(index, {
                                            startAnchor: v as 'join_date' | 'phase3_reached_at' | 'last_training_date',
                                          })}
                                          options={[
                                            { value: 'join_date', label: START_ANCHOR_LABEL.join_date },
                                            { value: 'phase3_reached_at', label: START_ANCHOR_LABEL.phase3_reached_at },
                                            { value: 'last_training_date', label: START_ANCHOR_LABEL.last_training_date },
                                          ]}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-gray-400 mb-1">自加入日起总上限（天，可不填）</label>
                                        <input
                                          type="number"
                                          min={1}
                                          max={3650}
                                          className="student-glass-field text-sm"
                                          value={rule.capFromJoinDays ?? ''}
                                          placeholder="例如 105，留空表示不设上限"
                                          onChange={(e) => {
                                            const v = e.target.value
                                            updateRule(index, {
                                              capFromJoinDays: v === '' ? null : Math.max(1, parseInt(v, 10) || 1),
                                            })
                                          }}
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-400 mb-1">达到哪些阶段算完成（选中任一即停表）</label>
                                      <StageMultiSelect
                                        allStages={allStages}
                                        value={rule.doneWhenStages}
                                        onChange={(doneWhenStages) => updateRule(index, { doneWhenStages })}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-400 mb-1">哪些阶段记为「里程碑」（可选）</label>
                                      <StageMultiSelect
                                        allStages={allStages}
                                        value={rule.milestoneStages}
                                        onChange={(milestoneStages) => updateRule(index, { milestoneStages })}
                                      />
                                      <p className="text-[11px] text-gray-500 mt-1">
                                        第一次升到勾选阶段时记下日期。详见上方「里程碑是什么」说明。
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <label className="block text-xs text-gray-400 mb-1">哪些阶段要遵守这条</label>
                                      <StageMultiSelect
                                        allStages={allStages}
                                        value={rule.activeWhenStages}
                                        onChange={(activeWhenStages) => updateRule(index, { activeWhenStages })}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => updateRule(index, { skipWhenFormalShortCycle: !rule.skipWhenFormalShortCycle })}
                                      className="flex items-start gap-2 text-xs text-gray-300 text-left hover:text-white transition-colors w-full"
                                    >
                                      {rule.skipWhenFormalShortCycle
                                        ? <CheckSquare size={16} className="text-purple-400 shrink-0 mt-0.5" />
                                        : <Square size={16} className="text-gray-500 shrink-0 mt-0.5" />}
                                      <span>
                                        若已开启「正式队员考勤周期」，则这条先不生效（改走训练常驻倒计时；单人「取消考勤」后仍走本条）
                                      </span>
                                    </button>
                                  </>
                                )}
                              </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {config.attendance.rules.length === 0 && (
                        <div className="text-center text-gray-500 text-sm py-8">暂无规则，请添加</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4 shrink-0 border-t border-gray-700 mt-4">
              <button
                type="button"
                disabled={saving || loading || !config}
                onClick={() => void handleSave()}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-lg transition-colors"
              >
                {saving ? '保存中…' : '保存'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="恢复默认规则？"
          message="将载入系统默认的训练与进度催促规则，覆盖当前弹窗里未保存的修改。需要再点「保存」才会真正生效到服务器。"
          confirmText="恢复默认"
          cancelText="再想想"
          type="warning"
          zClassName="z-[10020]"
          onConfirm={confirmDoReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>,
    document.body
  )
}
