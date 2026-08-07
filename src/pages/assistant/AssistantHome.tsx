import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, BookOpen, Calendar, ClipboardList, GraduationCap, Bell,
  CheckCircle2, Award, LayoutGrid, LineChart, ArrowRightLeft, AlertCircle, CalendarDays,
} from 'lucide-react'
import { assistantAPI } from '../../utils/api'
import UserDropdown from '../../components/UserDropdown'
import MemberAvatar from '../../components/MemberAvatar'
import CongratsModal from '../../components/CongratsModal'
import { getRoleColor } from '../../utils/roleColors'
import { toast } from '../../utils/toast'
import {
  resolveAssistantCongrats,
  acknowledgeCongrats,
  syncCongratsBaseline,
  type CongratsConfig,
} from '../../utils/stageCongrats'
import PageSkeleton from '../../components/Skeleton'

const STAGE_ORDER = ['未新训', '新训初期', '新训一期', '新训二期', '新训三期', '新训准考']
const STAGE_TEXT = [
  'text-gray-300', 'text-sky-300', 'text-cyan-300', 'text-teal-300',
  'text-emerald-300', 'text-amber-300',
]

export default function AssistantHome() {
  const navigate = useNavigate()
  const [name, setName] = useState('助教')
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [training, setTraining] = useState<any[]>([])
  const [requests, setRequests] = useState<{ assignments: any[]; creates: any[]; promotions: any[] }>({
    assignments: [],
    creates: [],
    promotions: [],
  })
  const [dataViewMode, setDataViewMode] = useState<'cards' | 'chart'>(() => {
    const saved = localStorage.getItem('assistantHomeDataView')
    return saved === 'chart' ? 'chart' : 'cards'
  })
  const [congratsConfig, setCongratsConfig] = useState<CongratsConfig | null>(null)
  const [congratsMember, setCongratsMember] = useState<{
    id: number
    stage_role: string
    is_ziye_assistant?: number | boolean
  } | null>(null)

  useEffect(() => {
    localStorage.setItem('assistantHomeDataView', dataViewMode)
  }, [dataViewMode])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [me, stu, att, train, req] = await Promise.all([
          assistantAPI.me(),
          assistantAPI.students().catch(() => ({ data: [] })),
          assistantAPI.attendance(false).catch(() => ({ data: [] })),
          assistantAPI.trainingReminders().catch(() => ({ data: [] })),
          assistantAPI.myRequests().catch(() => ({ data: { assignments: [], creates: [], promotions: [] } })),
        ])
        setName(me.data?.member?.nickname || '助教')
        setStudents(stu.data || [])
        setAttendance(att.data || [])
        setTraining(train.data || [])
        setRequests(req.data || { assignments: [], creates: [], promotions: [] })
        const member = me.data?.member
        if (member) {
          setCongratsMember(member)
          const congrats = resolveAssistantCongrats(member)
          if (congrats) {
            setCongratsConfig({
              ...congrats,
              actionText: '查看我的学员',
              actionPath: '/assistant/students',
            })
          } else {
            syncCongratsBaseline(member)
          }
        }
      } catch (e: any) {
        toast.error(e.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 6) return '凌晨好'
    if (hour < 9) return '早上好'
    if (hour < 12) return '上午好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    if (hour < 22) return '晚上好'
    return '夜深了'
  }

  const pendingCount = useMemo(() => {
    const pend = (s: string) => s === '待审批'
    return (
      (requests.assignments || []).filter((a) => pend(a.status)).length +
      (requests.creates || []).filter((c) => pend(c.status)).length +
      (requests.promotions || []).filter((p) => pend(p.status)).length
    )
  }, [requests])

  const overdueCount = useMemo(
    () => attendance.filter((a) => a.remaining_days != null && a.remaining_days < 0).length,
    [attendance]
  )

  const urgeTotal = training.length + attendance.length

  const stageDistribution = useMemo(
    () =>
      STAGE_ORDER.map((stage, index) => ({
        stage,
        count: students.filter((s) => s.stage_role === stage).length,
        textColor: STAGE_TEXT[index],
      })),
    [students]
  )

  const handleStageClick = (stage: string) => {
    localStorage.setItem(
      'assistantStudentsFilters',
      JSON.stringify({ stage_role: [stage], assignment_type: [], inverseMode: false })
    )
    navigate('/assistant/students')
  }

  const handleViewAllStudents = () => {
    localStorage.setItem(
      'assistantStudentsFilters',
      JSON.stringify({ stage_role: [], assignment_type: [], inverseMode: false })
    )
    navigate('/assistant/students')
  }

  const metricCards = [
    {
      label: '我的学员',
      value: students.length,
      hint: '已通过归属',
      color: 'text-white',
      onClick: handleViewAllStudents,
    },
    {
      label: '新训催促',
      value: training.length,
      hint: '需跟进训练',
      color: 'text-orange-300',
      onClick: () => {
        localStorage.setItem('assistantAttendanceTab', 'training')
        navigate('/assistant/attendance')
      },
    },
    {
      label: '考勤预警',
      value: attendance.length,
      hint: '≤7 天 / 超期',
      color: 'text-amber-300',
      onClick: () => {
        localStorage.setItem('assistantAttendanceTab', 'attendance')
        navigate('/assistant/attendance')
      },
    },
    {
      label: '考勤超期',
      value: overdueCount,
      hint: '已超时',
      color: 'text-red-300',
      onClick: () => {
        localStorage.setItem('assistantAttendanceTab', 'attendance')
        navigate('/assistant/attendance')
      },
    },
    {
      label: '待审申请',
      value: pendingCount,
      hint: '带人/加人/升阶',
      color: 'text-amber-300',
      onClick: () => navigate('/assistant/requests'),
    },
    {
      label: '进度分配',
      value: '→',
      hint: '更新课程进度',
      color: 'text-cyan-300',
      onClick: () => navigate('/assistant/progress'),
      isLink: true,
    },
  ]

  const chartGeom = useMemo(() => {
    const points = [
      ...metricCards.filter((c) => typeof c.value === 'number').map((c) => ({
        label: c.label,
        count: c.value as number,
        kind: 'core' as const,
        onClick: c.onClick,
        color: '#a78bfa',
      })),
      ...stageDistribution.map((s, i) => ({
        label: s.stage,
        count: s.count,
        kind: 'stage' as const,
        onClick: () => handleStageClick(s.stage),
        color: ['#94a3b8', '#7dd3fc', '#67e8f9', '#5eead4', '#6ee7b7', '#fcd34d'][i],
      })),
    ]
    if (points.length === 0) return null
    const W = 720
    const H = 220
    const padL = 36
    const padR = 16
    const padT = 28
    const padB = 56
    const plotW = W - padL - padR
    const plotH = H - padT - padB
    const maxY = Math.max(1, ...points.map((p) => p.count))
    const step = points.length > 1 ? plotW / (points.length - 1) : 0
    const mapped = points.map((p, i) => {
      const x = padL + i * step
      const y = padT + plotH - (p.count / maxY) * plotH
      return { ...p, x, y }
    })
    let path = ''
    mapped.forEach((p, i) => {
      path += i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`
    })
    const areaPath = `${path} L ${mapped[mapped.length - 1].x} ${padT + plotH} L ${mapped[0].x} ${padT + plotH} Z`
    const ticks = [...new Set([0, Math.ceil(maxY / 2), maxY])]
    return { W, H, padL, padR, padT, padB, plotH, maxY, points: mapped, path, areaPath, ticks }
  }, [metricCards, stageDistribution])

  const quickActions = [
    { label: '我的学员', path: '/assistant/students', icon: Users, iconWrap: 'bg-purple-600/20', iconClass: 'text-purple-300' },
    { label: '新训花名册', path: '/assistant/roster', icon: GraduationCap, iconWrap: 'bg-teal-600/20', iconClass: 'text-teal-300' },
    { label: '进度分配', path: '/assistant/progress', icon: BookOpen, iconWrap: 'bg-cyan-600/20', iconClass: 'text-cyan-400' },
    { label: '催促名单', path: '/assistant/attendance', icon: Calendar, iconWrap: 'bg-orange-600/20', iconClass: 'text-orange-300', count: urgeTotal, countHint: '关注', urgent: true },
    { label: '登记黑点', path: '/assistant/black-points', icon: AlertCircle, iconWrap: 'bg-red-600/20', iconClass: 'text-red-300' },
    { label: '登记请假', path: '/assistant/leaves', icon: CalendarDays, iconWrap: 'bg-amber-600/20', iconClass: 'text-amber-300' },
    { label: '我的申请', path: '/assistant/requests', icon: ClipboardList, iconWrap: 'bg-amber-600/20', iconClass: 'text-amber-300', count: pendingCount, countHint: '待审', urgent: true },
    { label: '改阶段', path: '/assistant/students', icon: ArrowRightLeft, iconWrap: 'bg-violet-600/20', iconClass: 'text-violet-300' },
  ] as const

  return (
    <div className="p-6 md:p-8 min-h-full">
      <div className="student-main-center w-full">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex flex-wrap items-center gap-2">
              {getGreeting()}，
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-purple-400 to-pink-400">
                {name}
              </span>
            </h1>
            <p className="text-gray-400">
              助教工作台总览
              {urgeTotal + pendingCount > 0 && (
                <span className="ml-2 text-amber-300/90">
                  · 待关注 {urgeTotal + pendingCount} 项
                </span>
              )}
            </p>
          </div>
          <UserDropdown userType="student" />
        </div>

        {loading ? (
          <PageSkeleton variant="cards" padded={false} />
        ) : (
          <div className="space-y-6">
            <div className="student-glass-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-teal-600/20">
                    <CheckCircle2 size={18} className="text-teal-300" />
                  </div>
                  核心数据与学员阶段
                </h2>
                <div className="inline-flex student-glass-chip student-glass-seg">
                  <button
                    type="button"
                    onClick={() => setDataViewMode('cards')}
                    className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      dataViewMode === 'cards' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid size={14} />
                    卡片
                  </button>
                  <button
                    type="button"
                    onClick={() => setDataViewMode('chart')}
                    className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      dataViewMode === 'chart' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <LineChart size={14} />
                    阶梯图
                  </button>
                </div>
              </div>

              {dataViewMode === 'cards' ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {metricCards.map((card) => (
                      <button
                        key={card.label}
                        type="button"
                        onClick={card.onClick}
                        className="student-glass-chip p-4 text-left hover:border-teal-400/30 transition-colors"
                      >
                        <div className="text-xs text-gray-500 mb-1">{card.label}</div>
                        <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${card.color}`}>
                          {card.value}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">{card.hint}</div>
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-3 flex items-center gap-2">
                      <Users size={14} />
                      学员阶段分布
                    </div>
                    <div className="flex items-stretch gap-2 sm:gap-3 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={handleViewAllStudents}
                        className="group flex-1 min-w-[4.5rem] student-glass-chip p-3 sm:p-4"
                      >
                        <div className="text-center">
                          <div className="text-2xl sm:text-3xl font-bold text-gray-200 mb-1">{students.length}</div>
                          <div className="text-gray-400 text-[11px] font-medium">合计</div>
                        </div>
                      </button>
                      {stageDistribution.map((item) => (
                        <button
                          key={item.stage}
                          type="button"
                          onClick={() => handleStageClick(item.stage)}
                          className="group flex-1 min-w-[4.5rem] student-glass-chip p-3 sm:p-4"
                        >
                          <div className="text-center">
                            <div className={`text-2xl sm:text-3xl font-bold mb-1 ${item.textColor}`}>{item.count}</div>
                            <div className="text-gray-400 text-[11px] font-medium truncate">{item.stage}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {chartGeom && (
                    <div className="w-full overflow-x-auto">
                      <svg
                        viewBox={`0 0 ${chartGeom.W} ${chartGeom.H}`}
                        className="w-full min-w-[640px] h-auto"
                        role="img"
                        aria-label="核心数据与学员阶段阶梯图"
                      >
                        {chartGeom.ticks.map((t) => {
                          const y = chartGeom.padT + chartGeom.plotH - (t / chartGeom.maxY) * chartGeom.plotH
                          return (
                            <g key={t}>
                              <line
                                x1={chartGeom.padL}
                                x2={chartGeom.W - chartGeom.padR}
                                y1={y}
                                y2={y}
                                stroke="rgba(148,163,184,0.15)"
                                strokeWidth={1}
                              />
                              <text x={4} y={y + 3} fill="#6b7280" fontSize={10}>{t}</text>
                            </g>
                          )
                        })}
                        <path d={chartGeom.areaPath} fill="rgba(45,212,191,0.12)" />
                        <path
                          d={chartGeom.path}
                          fill="none"
                          stroke="#2dd4bf"
                          strokeWidth={2.5}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        {chartGeom.points.map((p) => (
                          <g key={`${p.kind}-${p.label}`}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={5}
                              fill={p.color}
                              stroke="#1f2937"
                              strokeWidth={2}
                              className="cursor-pointer"
                              onClick={p.onClick}
                            />
                            <text
                              x={p.x}
                              y={p.y - 10}
                              textAnchor="middle"
                              fill="#e5e7eb"
                              fontSize={11}
                              fontWeight={600}
                              className="tabular-nums pointer-events-none"
                            >
                              {p.count}
                            </text>
                            <text
                              x={p.x}
                              y={chartGeom.H - 28}
                              textAnchor="middle"
                              fill="#9ca3af"
                              fontSize={9}
                              transform={`rotate(-32 ${p.x} ${chartGeom.H - 28})`}
                              className="cursor-pointer"
                              onClick={p.onClick}
                            >
                              {p.label}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 relative lg:h-0 lg:min-h-full">
                <div className="student-glass-panel p-5 sm:p-6 flex flex-col overflow-hidden lg:absolute lg:inset-0">
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-orange-600/20">
                        <Bell size={18} className="text-orange-400" />
                      </div>
                      催促关注
                      {urgeTotal > 0 && (
                        <span className="ml-1 px-2.5 py-0.5 bg-orange-600/20 text-orange-400 text-sm font-semibold rounded-full">
                          {urgeTotal}
                        </span>
                      )}
                    </h2>
                    <button
                      type="button"
                      onClick={() => navigate('/assistant/attendance')}
                      className="text-sm text-teal-400 hover:text-teal-300 transition-colors font-medium"
                    >
                      查看全部 →
                    </button>
                  </div>

                  {urgeTotal === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                      <div className="inline-block p-4 bg-green-600/10 rounded-full mb-3">
                        <Users size={32} className="text-green-400" />
                      </div>
                      <p className="text-gray-400">暂无需要催促的学员</p>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 scrollbar-none">
                      {[
                        ...training.slice(0, 4).map((item) => ({
                          key: `t-${item.id || item.member_id}`,
                          name: item.member_name,
                          avatar: item.avatar,
                          qq: item.qq,
                          stage: item.stage_role,
                          hint: item.is_leave_buffer ? '请假缓冲' : '新训催促',
                          value: item.days_until_timeout,
                          overdue: item.days_until_timeout < 0,
                          unit: item.days_until_timeout < 0 ? '天超期' : '天剩余',
                        })),
                        ...attendance.slice(0, 4).map((item) => ({
                          key: `a-${item.member_id}`,
                          name: item.member_name,
                          avatar: item.avatar,
                          qq: item.qq,
                          stage: item.stage_role,
                          hint: item.reason_label || '考勤进度',
                          value: item.remaining_days,
                          overdue: item.remaining_days < 0,
                          unit: item.remaining_days < 0 ? '天超期' : '天剩余',
                        })),
                      ].slice(0, 6).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => navigate('/assistant/attendance')}
                          className="w-full group student-glass-chip p-4 hover:border-orange-500/50 text-left"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <MemberAvatar avatar={item.avatar} qq={item.qq} name={item.name} size="md" />
                              <div className="min-w-0">
                                <div className="text-white font-medium truncate">{item.name}</div>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  {item.stage && (
                                    <span className={`student-glass-badge ${getRoleColor(item.stage)}`}>
                                      {item.stage}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500 truncate">{item.hint}</span>
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={`text-xl font-bold ${item.overdue ? 'text-red-400' : 'text-orange-400'}`}>
                                {item.value != null ? (item.overdue ? Math.abs(item.value) : item.value) : '—'}
                              </div>
                              <div className="text-xs text-gray-500">{item.unit}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="student-glass-panel p-5 sm:p-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-600/20">
                    <Award size={18} className="text-purple-400" />
                  </div>
                  快捷操作
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {quickActions.map((item) => {
                    const count = 'count' in item ? item.count : 0
                    const showCount = typeof count === 'number' && count > 0
                    const urgent = 'urgent' in item && item.urgent
                    const countHint = 'countHint' in item ? item.countHint : ''
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => navigate(item.path)}
                        className="group flex flex-col items-center gap-2.5 p-4 student-glass-chip transition-all"
                      >
                        <div className={`p-2.5 rounded-lg ${item.iconWrap}`}>
                          <item.icon size={22} className={item.iconClass} />
                        </div>
                        <div className="flex flex-col items-center gap-1 min-w-0">
                          <span className="text-gray-300 group-hover:text-white font-medium text-xs text-center">
                            {item.label}
                          </span>
                          {showCount && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                                urgent
                                  ? 'bg-red-500/25 text-red-200 border border-red-400/35'
                                  : 'bg-white/10 text-gray-300 border border-white/15'
                              }`}
                            >
                              {countHint} {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {congratsConfig && (
        <CongratsModal
          config={congratsConfig}
          onClose={() => {
            if (congratsMember) acknowledgeCongrats(congratsMember, congratsConfig)
            setCongratsConfig(null)
          }}
          onAction={() => {
            if (congratsMember) acknowledgeCongrats(congratsMember, congratsConfig)
            if (congratsConfig.actionPath) navigate(congratsConfig.actionPath)
            setCongratsConfig(null)
          }}
        />
      )}
    </div>
  )
}
