import type { ReactNode } from 'react'
import { Award, GraduationCap, Sparkles, Star, Target, TrendingUp, Trophy } from 'lucide-react'

export type CongratsAccent = 'gold' | 'purple' | 'teal' | 'sky' | 'rose' | 'blue'

export type CongratsConfig = {
  key: string
  title: string
  subtitle?: string
  message: ReactNode
  badge?: string
  accent: CongratsAccent
  icon: ReactNode
  actionText?: string
  actionPath?: string
  isDemotion?: boolean
}

/** 专名不拆行，避免「新训一 / 期」这类断字 */
function nw(text: string) {
  return <span className="whitespace-nowrap">{text}</span>
}

const STAGE_FLOW = [
  '未新训',
  '新训初期',
  '新训一期',
  '新训二期',
  '新训三期',
  '新训准考',
  '紫夜',
  '紫夜尖兵',
]

const STAGE_CONGRATULATIONS: Record<string, Omit<CongratsConfig, 'key'>> = {
  新训初期: {
    title: '恭喜晋升',
    subtitle: '新训初期',
    message: (
      <>
        你已跨入{nw('新训初期')}，打好基础，向更高目标稳步前进。
      </>
    ),
    badge: '新训初期',
    accent: 'sky',
    icon: <Sparkles size={32} />,
  },
  新训一期: {
    title: '恭喜晋升',
    subtitle: '新训一期',
    message: (
      <>
        你已掌握基础技能，进入{nw('新训一期')}。
        <br />
        继续训练，实力会越来越稳。
      </>
    ),
    badge: '新训一期',
    accent: 'sky',
    icon: <TrendingUp size={32} />,
  },
  新训二期: {
    title: '恭喜晋升',
    subtitle: '新训二期',
    message: (
      <>
        晋升{nw('新训二期')}！节奏与配合正在成型，保持专注。
      </>
    ),
    badge: '新训二期',
    accent: 'sky',
    icon: <Star size={32} />,
  },
  新训三期: {
    title: '恭喜晋升',
    subtitle: '新训三期',
    message: (
      <>
        已达{nw('新训三期')}，准考近在眼前。把薄弱点补齐，准备冲刺。
      </>
    ),
    badge: '新训三期',
    accent: 'purple',
    icon: <Target size={32} />,
  },
  新训准考: {
    title: '恭喜达到准考',
    subtitle: '新训准考',
    message: (
      <>
        新训路上最扎实的一段，你已经走完了。
        <br />
        接下来提交{nw('新训考核')}申请，沉住气、发挥出平时的水准——祝你一次过关！
      </>
    ),
    badge: '新训准考',
    accent: 'gold',
    icon: <Trophy size={32} />,
    actionText: '去申请考核',
    actionPath: '/student/apply-assessment',
  },
  紫夜: {
    title: '成为正式队员',
    subtitle: '紫夜',
    message: (
      <>
        欢迎正式加入{nw('紫夜战术公会')}。从这一刻起，你是紫夜的一员。
      </>
    ),
    badge: '紫夜',
    accent: 'purple',
    icon: <Award size={32} />,
  },
  紫夜尖兵: {
    title: '晋升紫夜尖兵',
    subtitle: '紫夜尖兵',
    message: (
      <>
        你已成为战队{nw('紫夜尖兵')}力量。以身作则，带动更多同伴成长。
      </>
    ),
    badge: '紫夜尖兵',
    accent: 'gold',
    icon: <Award size={32} />,
  },
  紫夜助教: {
    title: '荣膺紫夜助教',
    subtitle: '紫夜助教',
    message: (
      <>
        从今天起，新训路上多了一双稳妥的手。
        <br />
        带好学员、盯紧进度，把你走过的路照亮给后来人——紫夜的下一程，有你同行。
      </>
    ),
    badge: '紫夜助教',
    accent: 'teal',
    icon: <GraduationCap size={32} />,
    actionText: '进入助教工作台',
    actionPath: '/assistant',
  },
}

const ASSISTANT_CONGRATS: Omit<CongratsConfig, 'key'> = {
  title: '荣膺紫夜助教',
  subtitle: '身份授予',
  message: (
    <>
      从今天起，新训路上多了一双稳妥的手。
      <br />
      带好学员、盯紧进度，把你走过的路照亮给后来人——紫夜的下一程，有你同行。
    </>
  ),
  badge: '紫夜助教',
  accent: 'teal',
  icon: <GraduationCap size={32} />,
  actionText: '进入助教工作台',
  actionPath: '/assistant',
}

type CongratsMember = {
  id: number
  stage_role: string
  is_ziye_assistant?: number | boolean
}

function isZiyeAssistant(member: { stage_role?: string; is_ziye_assistant?: number | boolean }) {
  return !!(Number(member.is_ziye_assistant) === 1 || member.stage_role === '紫夜助教')
}

function lastStageKey(id: number) {
  return `last_stage_${id}`
}

function stageShownKey(id: number, stage: string) {
  return stage === '紫夜助教'
    ? `congrats_shown_${id}_ziye_assistant`
    : `congrats_shown_${id}_${stage}`
}

function stageUiAckKey(id: number, stage: string) {
  return stage === '紫夜助教'
    ? `congrats_ui_ack_${id}_ziye_assistant`
    : `congrats_ui_ack_${id}_${stage}`
}

function asstFlagKey(id: number) {
  return `last_is_ziye_assistant_${id}`
}

function asstShownKey(id: number) {
  return `congrats_shown_${id}_ziye_assistant`
}

function pendingSessionKey(id: number) {
  return `congrats_pending_${id}`
}

type PendingPayload =
  | { kind: 'stage'; stage: string; key: string }
  | { kind: 'assistant'; key: string }
  | {
      kind: 'demotion'
      key: string
      lastStage: string
      currentStage: string
    }

function readPending(id: number): CongratsConfig | null {
  try {
    const raw = sessionStorage.getItem(pendingSessionKey(id))
    if (!raw) return null
    const p = JSON.parse(raw) as PendingPayload
    if (p.kind === 'stage') {
      const base = STAGE_CONGRATULATIONS[p.stage]
      return base ? { ...base, key: p.key } : null
    }
    if (p.kind === 'assistant') {
      return { ...ASSISTANT_CONGRATS, key: p.key }
    }
    if (p.kind === 'demotion') {
      return {
        key: p.key,
        title: '阶段调整',
        subtitle: `${p.lastStage} → ${p.currentStage}`,
        message: (
          <>
            阶段从「{nw(p.lastStage)}」调整为「{nw(p.currentStage)}」。
            <br />
            这只是暂时的挫折，继续训练，你一定能再升上去。
          </>
        ),
        badge: p.currentStage,
        accent: 'blue',
        icon: <Trophy size={32} />,
        actionText: '查看课程进度',
        actionPath: '/student/progress',
        isDemotion: true,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writePending(id: number, payload: PendingPayload) {
  try {
    sessionStorage.setItem(pendingSessionKey(id), JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

function clearPending(id: number) {
  try {
    sessionStorage.removeItem(pendingSessionKey(id))
  } catch {
    /* ignore */
  }
}

function hasUiAck(id: number, stage: string) {
  return !!localStorage.getItem(stageUiAckKey(id, stage))
}

/** 降级后清掉更高阶段的「已看过」，以便再升回来时重新恭喜 */
function clearHigherStageAcks(id: number, currentIndex: number) {
  if (currentIndex < 0) return
  for (let i = currentIndex + 1; i < STAGE_FLOW.length; i++) {
    const stage = STAGE_FLOW[i]
    localStorage.removeItem(stageUiAckKey(id, stage))
    localStorage.removeItem(stageShownKey(id, stage))
  }
}

/**
 * 只读判断是否应弹出恭喜（可写 session 中的 pending 以便重试）。
 * 正式的「已看过」标记只在 acknowledgeCongrats 时写入，避免重复请求提前消费晋升恭喜。
 */
export function resolveCongratsToShow(member: CongratsMember): CongratsConfig | null {
  if (!member?.id || !member.stage_role) return null

  const existing = readPending(member.id)
  if (existing) {
    if (existing.isDemotion) return existing
    if (existing.key.includes('ziye_assistant') && isZiyeAssistant(member)) return existing
    if (existing.badge === member.stage_role || existing.subtitle === member.stage_role) return existing
  }

  const currentStage = member.stage_role
  const lastStage = localStorage.getItem(lastStageKey(member.id))
  const currentIndex = STAGE_FLOW.indexOf(currentStage)
  const lastIndex = lastStage ? STAGE_FLOW.indexOf(lastStage) : -1

  let pending: CongratsConfig | null = null
  let pendingPayload: PendingPayload | null = null

  if (lastStage && lastStage !== currentStage) {
    if (currentIndex !== -1 && lastIndex !== -1) {
      if (currentIndex < lastIndex) {
        clearHigherStageAcks(member.id, currentIndex)
        const key = `demotion_${member.id}_${currentStage}_${Date.now()}`
        pending = {
          key,
          title: '阶段调整',
          subtitle: `${lastStage} → ${currentStage}`,
          message: (
            <>
              阶段从「{nw(lastStage)}」调整为「{nw(currentStage)}」。
              <br />
              这只是暂时的挫折，继续训练，你一定能再升上去。
            </>
          ),
          badge: currentStage,
          accent: 'blue',
          icon: <Trophy size={32} />,
          actionText: '查看课程进度',
          actionPath: '/student/progress',
          isDemotion: true,
        }
        pendingPayload = { kind: 'demotion', key, lastStage, currentStage }
      } else if (currentIndex > lastIndex) {
        // 晋升（含降级后再升回）：只要阶段往上走就恭喜，不看历史已读
        const storageKey = stageShownKey(member.id, currentStage)
        const base = STAGE_CONGRATULATIONS[currentStage]
        if (base) {
          pending = { ...base, key: storageKey }
          pendingPayload = { kind: 'stage', stage: currentStage, key: storageKey }
        }
      }
    } else if (currentStage === '紫夜助教' && !hasUiAck(member.id, '紫夜助教')) {
      const storageKey = asstShownKey(member.id)
      pending = { ...STAGE_CONGRATULATIONS['紫夜助教'], key: storageKey }
      pendingPayload = { kind: 'assistant', key: storageKey }
    }
  } else if (!lastStage) {
    const storageKey = stageShownKey(member.id, currentStage)
    const base = STAGE_CONGRATULATIONS[currentStage]
    if (base && !hasUiAck(member.id, currentStage)) {
      pending = { ...base, key: storageKey }
      pendingPayload =
        currentStage === '紫夜助教'
          ? { kind: 'assistant', key: storageKey }
          : { kind: 'stage', stage: currentStage, key: storageKey }
    }
  } else if (
    // 补偿：新训准考曾被提前标记「已展示」但用户实际没看到弹窗
    lastStage === currentStage &&
    currentStage === '新训准考' &&
    !hasUiAck(member.id, '新训准考')
  ) {
    const storageKey = stageShownKey(member.id, currentStage)
    const base = STAGE_CONGRATULATIONS['新训准考']
    pending = { ...base, key: storageKey }
    pendingPayload = { kind: 'stage', stage: currentStage, key: storageKey }
  }

  if (!pending && isZiyeAssistant(member) && !hasUiAck(member.id, '紫夜助教')) {
    const storageKey = asstShownKey(member.id)
    pending = { ...ASSISTANT_CONGRATS, key: storageKey }
    pendingPayload = { kind: 'assistant', key: storageKey }
  }

  if (pending && pendingPayload) {
    writePending(member.id, pendingPayload)
  }

  return pending
}

/** 无弹窗时同步基线（上次阶段 / 助教标记），避免重复误判 */
export function syncCongratsBaseline(member: CongratsMember) {
  if (!member?.id || !member.stage_role) return
  clearPending(member.id)
  localStorage.setItem(lastStageKey(member.id), member.stage_role)
  if (isZiyeAssistant(member)) {
    localStorage.setItem(asstFlagKey(member.id), '1')
  } else {
    localStorage.setItem(asstFlagKey(member.id), '0')
    // 撤销助教后允许再次授予时弹窗
    localStorage.removeItem(asstShownKey(member.id))
    localStorage.removeItem(stageUiAckKey(member.id, '紫夜助教'))
  }
}

/** 用户关闭 / 确认恭喜后，标记已展示并同步基线 */
export function acknowledgeCongrats(member: CongratsMember, config: CongratsConfig) {
  if (!member?.id) return
  clearPending(member.id)
  if (config.key && !config.isDemotion) {
    localStorage.setItem(config.key, 'true')
    const stage =
      config.badge && STAGE_CONGRATULATIONS[config.badge]
        ? config.badge
        : config.key.includes('ziye_assistant')
          ? '紫夜助教'
          : member.stage_role
    localStorage.setItem(stageUiAckKey(member.id, stage), 'true')
  }
  syncCongratsBaseline(member)
}

/** 仅检查助教身份恭喜（助教工作台首页用；同样不提前写入永久标记） */
export function resolveAssistantCongrats(member: {
  id: number
  stage_role?: string
  is_ziye_assistant?: number | boolean
}): CongratsConfig | null {
  if (!member?.id || !isZiyeAssistant(member)) return null
  if (hasUiAck(member.id, '紫夜助教')) return null
  const existing = readPending(member.id)
  if (existing?.key?.includes('ziye_assistant')) return existing
  const config = { ...ASSISTANT_CONGRATS, key: asstShownKey(member.id) }
  writePending(member.id, { kind: 'assistant', key: config.key })
  return config
}
