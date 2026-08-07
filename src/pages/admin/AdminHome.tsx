import { useEffect, useState, useMemo } from 'react'
import PageSkeleton from '../../components/Skeleton'
import {
  Users, UserMinus, Award, Bell, FileText, BookOpen, GraduationCap, Clock,
  LogIn, LogOut, X, AlertCircle, Mailbox, Calendar, CheckCircle2, ShieldAlert,
  LayoutGrid, LineChart,
} from 'lucide-react'
import { memberAPI, leaveAPI, blackPointAPI, reminderAPI } from '../../utils/api'
import { useNavigate } from 'react-router-dom'
import UserDropdown from '../../components/UserDropdown'
import { formatDate } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import { useBadges } from '../../contexts/BadgeContext'
import MemberAvatar from '../../components/MemberAvatar'
import { getAdminSecurityHeaders } from '../../utils/deviceIdentity'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

async function adminFetch(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || ''
  const sec = await getAdminSecurityHeaders().catch(() => ({} as Record<string, string>))
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
    ...sec,
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${API_URL}${path}`, { ...init, headers })
}

interface Statistics {
  totalMembers: number
  activeMembers: number
  leavingMembers: number
  onLeaveMembers: number
  assistantCount: number
  blackPoints: number
  reminders: number
}

interface ReminderMember {
  id: number
  member_id?: number
  member_name: string
  nickname: string
  avatar?: string | null
  qq: string
  stage_role: string
  last_training_date: string | null
  days_without_training: number
  is_leave_buffer?: number | boolean
  buffer_remaining_days?: number | null
}

interface StageDistribution {
  stage: string
  count: number
  textColor: string
}

export default function AdminHome() {
  const navigate = useNavigate()
  const badges = useBadges()
  const [dismissLeaveEndAlert, setDismissLeaveEndAlert] = useState(false)
  const [dismissOpinionAlert, setDismissOpinionAlert] = useState(false)
  const [dismissAssistantAlert, setDismissAssistantAlert] = useState(false)
  const [stats, setStats] = useState<Statistics>({
    totalMembers: 0,
    activeMembers: 0,
    leavingMembers: 0,
    onLeaveMembers: 0,
    assistantCount: 0,
    blackPoints: 0,
    reminders: 0,
  })
  const [stageDistribution, setStageDistribution] = useState<StageDistribution[]>([])
  const [reminderList, setReminderList] = useState<ReminderMember[]>([])
  const [examCandidates, setExamCandidates] = useState<any[]>([])
  const [memberAvatarById, setMemberAvatarById] = useState<Record<number, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [adminName, setAdminName] = useState('管理员')
  const [adminUsername, setAdminUsername] = useState('')
  const [onDuty, setOnDuty] = useState(false)
  const [clockedInAt, setClockedInAt] = useState<string | null>(null)
  const [dutyLoading, setDutyLoading] = useState(false)
  const [dataViewMode, setDataViewMode] = useState<'cards' | 'chart'>(() => {
    const saved = localStorage.getItem('adminHomeDataView')
    return saved === 'chart' ? 'chart' : 'cards'
  })

  useEffect(() => {
    localStorage.setItem('adminHomeDataView', dataViewMode)
  }, [dataViewMode])

  useEffect(() => {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
    let username = ''
    if (userStr) {
      const user = JSON.parse(userStr)
      username = user.username || ''
      setAdminUsername(username)
      setAdminName(user.name || user.username || '管理员')
    }
    loadStatistics()
    if (username) loadDutyStatus(username)
  }, [])

  useEffect(() => {
    if (badges.leaveEndPending > 0) setDismissLeaveEndAlert(false)
  }, [badges.leaveEndPending])

  useEffect(() => {
    if (badges.opinionPending > 0) setDismissOpinionAlert(false)
  }, [badges.opinionPending])

  useEffect(() => {
    if (badges.assistantPending > 0) setDismissAssistantAlert(false)
  }, [badges.assistantPending])

  const loadDutyStatus = async (username: string) => {
    try {
      const res = await adminFetch(`/duty/status/${encodeURIComponent(username)}`)
      const data = await res.json()
      setOnDuty(data.onDuty)
      setClockedInAt(data.clockedInAt || null)
    } catch { /* ignore */ }
  }

  const handleClockIn = async () => {
    if (!adminUsername || dutyLoading) return
    setDutyLoading(true)
    try {
      const res = await adminFetch('/duty/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, nickname: adminName }),
      })
      const data = await res.json()
      if (data.success) {
        setOnDuty(true)
        await loadDutyStatus(adminUsername)
      }
    } catch { /* ignore */ }
    setDutyLoading(false)
  }

  const handleClockOut = async () => {
    if (!adminUsername || dutyLoading) return
    setDutyLoading(true)
    try {
      const res = await adminFetch('/duty/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername }),
      })
      const data = await res.json()
      if (data.success) {
        setOnDuty(false)
        setClockedInAt(null)
      }
    } catch { /* ignore */ }
    setDutyLoading(false)
  }

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

  const loadStatistics = async () => {
    try {
      const [members, leaves, blackPoints, reminders, attendanceReminders, examCandidatesRes] = await Promise.all([
        memberAPI.getAll(),
        leaveAPI.getAll(),
        blackPointAPI.getAll(),
        reminderAPI.getAll(),
        reminderAPI.getAttendance(false).catch(() => ({ data: [] })),
        memberAPI.getExamCandidates().catch(() => ({ data: [] })),
      ])

      const membersData = members.data || []
      const leavesData = leaves.data || []
      const blackPointsData = blackPoints.data || []
      const remindersData = reminders.data || []
      const attendanceData = attendanceReminders.data || []
      const examCandidatesData = examCandidatesRes?.data || []

      setStats({
        totalMembers: membersData.length,
        activeMembers: membersData.filter((m: any) => m.status === '正常').length,
        leavingMembers: membersData.filter((m: any) => m.status === '已退队').length,
        onLeaveMembers: leavesData.filter((l: any) => l.status === '请假中').length,
        assistantCount: membersData.filter(
          (m: any) => Number(m.is_ziye_assistant) === 1 || m.stage_role === '紫夜助教'
        ).length,
        blackPoints: blackPointsData.filter((b: any) => b.status === '生效中').length,
        // 与侧栏 /badges 一致：训练催促 + 考勤催促（随本页统计一并返回，避免 badges 晚到数字闪现）
        reminders: remindersData.length + attendanceData.length,
      })

      setReminderList(remindersData.slice(0, 6))
      setExamCandidates(examCandidatesData)
      setMemberAvatarById(
        Object.fromEntries(membersData.map((m: any) => [m.id, m.avatar || null]))
      )

      const stages = [
        '未新训', '新训初期', '新训一期', '新训二期', '新训三期',
        '新训准考', '紫夜', '紫夜尖兵', '紫夜助教',
      ]
      const textColors = [
        'text-gray-300', 'text-sky-300', 'text-cyan-300', 'text-teal-300',
        'text-emerald-300', 'text-amber-300', 'text-purple-300', 'text-violet-300',
        'text-teal-200',
      ]
      setStageDistribution(
        stages.map((stage, index) => ({
          stage,
          count: membersData.filter((m: any) => m.stage_role === stage).length,
          textColor: textColors[index],
        }))
      )
    } catch (error) {
      console.error('加载统计信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStageClick = (stage: string) => {
    localStorage.setItem('memberListFilters', JSON.stringify({
      stage_role: [stage],
      status: [],
      inverseMode: false,
    }))
    navigate('/admin/members/list')
  }

  const handleViewAllMembers = () => {
    localStorage.setItem('memberListFilters', JSON.stringify({
      stage_role: [],
      status: [],
      inverseMode: false,
    }))
    navigate('/admin/members/list')
  }

  const todoTotal =
    badges.opinionPending +
    badges.assessmentPending +
    badges.leavePending +
    badges.leaveEndPending +
    stats.reminders +
    (badges.assistantPending || 0)

  const metricCards = [
    {
      label: '总成员',
      value: stats.totalMembers,
      hint: '全部账号',
      color: 'text-white',
      onClick: handleViewAllMembers,
    },
    {
      label: '正常在队',
      value: stats.activeMembers,
      hint: '状态正常',
      color: 'text-emerald-300',
      onClick: () => navigate('/admin/members/list'),
    },
    {
      label: '请假中',
      value: stats.onLeaveMembers,
      hint: '当前请假',
      color: 'text-sky-300',
      onClick: () => navigate('/admin/members/leave'),
    },
    {
      label: '助教',
      value: stats.assistantCount,
      hint: '紫夜助教人数',
      color: 'text-teal-200',
      onClick: () => navigate('/admin/members/assistants'),
    },
    {
      label: '催促名单',
      value: stats.reminders,
      hint: '需跟进训练',
      color: 'text-orange-300',
      onClick: () => navigate('/admin/leave-team/reminders'),
    },
    {
      label: '考核待审',
      value: badges.assessmentPending,
      hint: '申请审批',
      color: 'text-green-300',
      onClick: () => navigate('/admin/assessments/approval'),
    },
    {
      label: '请假待审',
      value: badges.leavePending + badges.leaveEndPending,
      hint: '含结束审批',
      color: 'text-amber-300',
      onClick: () => navigate('/admin/members/leave'),
    },
    {
      label: '意见待阅',
      value: badges.opinionPending,
      hint: '意见箱',
      color: 'text-fuchsia-300',
      onClick: () => navigate('/admin/opinion-box'),
    },
    {
      label: '助教待审',
      value: badges.assistantPending || 0,
      hint: '认领/加人/升阶',
      color: 'text-teal-300',
      onClick: () => {
        if ((badges.assistantPending || 0) > 0) {
          localStorage.setItem('assistantActiveTab', 'pending')
        }
        navigate('/admin/members/assistants')
      },
    },
    {
      label: '生效黑点',
      value: stats.blackPoints,
      hint: '未消除',
      color: 'text-red-300',
      onClick: () => navigate('/admin/members/violations'),
    },
  ]

  /** 阶梯图：核心指标 + 阶段分布 合并为一条阶梯折线 */
  const chartSeries = useMemo(() => {
    const core = metricCards.map((c) => ({
      label: c.label,
      count: c.value,
      kind: 'core' as const,
      onClick: c.onClick,
      color: '#a78bfa',
    }))
    const stages = stageDistribution.map((s, i) => {
      const colors = ['#94a3b8', '#7dd3fc', '#67e8f9', '#5eead4', '#6ee7b7', '#fcd34d', '#c4b5fd', '#a78bfa', '#5eead4']
      return {
        label: s.stage,
        count: s.count,
        kind: 'stage' as const,
        onClick: () => handleStageClick(s.stage),
        color: colors[i] || '#a78bfa',
      }
    })
    return [...core, ...stages]
  }, [stats, stageDistribution, badges])

  const chartGeom = useMemo(() => {
    const n = chartSeries.length
    if (n === 0) return null
    const W = 800
    const H = 220
    const padL = 36
    const padR = 16
    const padT = 20
    const padB = 56
    const maxY = Math.max(1, ...chartSeries.map((d) => d.count))
    const plotW = W - padL - padR
    const plotH = H - padT - padB
    const stepX = n <= 1 ? 0 : plotW / (n - 1)
    const points = chartSeries.map((d, i) => ({
      ...d,
      x: padL + i * stepX,
      y: padT + plotH - (d.count / maxY) * plotH,
    }))
    // 斜线折线：点与点之间对角过渡
    let path = ''
    points.forEach((p, i) => {
      if (i === 0) path += `M ${p.x} ${p.y}`
      else path += ` L ${p.x} ${p.y}`
    })
    const areaPath = `${path} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`
    const ticks = [0, 0.5, 1].map((t) => Math.round(maxY * t))
    return { W, H, padL, padR, padT, padB, plotH, maxY, points, path, areaPath, ticks }
  }, [chartSeries])

  return (
    <div className="p-8 min-h-screen relative">
      {/* 浮层提醒 */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-sm">
        {badges.opinionPending > 0 && !dismissOpinionAlert && (
          <div className="student-glass-panel student-glass-panel--static p-4 border-fuchsia-400/40 shadow-2xl shadow-fuchsia-900/30">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-fuchsia-600/30 rounded-lg flex-shrink-0">
                <Mailbox size={20} className="text-fuchsia-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">意见箱有新投递</p>
                <p className="text-fuchsia-200/80 text-xs mt-1">
                  共 {badges.opinionPending} 条待查阅，请及时处理
                </p>
                <button
                  onClick={() => navigate('/admin/opinion-box')}
                  className="mt-2 text-xs text-fuchsia-300 hover:text-fuchsia-200 font-medium transition-colors"
                >
                  前往意见箱 →
                </button>
              </div>
              <button
                onClick={() => setDismissOpinionAlert(true)}
                className="text-fuchsia-300/60 hover:text-fuchsia-200 transition-colors flex-shrink-0"
                aria-label="关闭提示"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {badges.leaveEndPending > 0 && !dismissLeaveEndAlert && (
          <div className="student-glass-panel student-glass-panel--static student-glass-chip--yellow p-4 shadow-2xl shadow-orange-900/30 border-orange-500/50">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-600/30 rounded-lg flex-shrink-0">
                <AlertCircle size={20} className="text-orange-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">有新的请假结束待处理</p>
                <p className="text-orange-200/80 text-xs mt-1">
                  共 {badges.leaveEndPending} 人等待结束审批，请及时处理
                </p>
                <button
                  onClick={() => {
                    localStorage.setItem('leaveActiveTab', 'endApproval')
                    navigate('/admin/members/leave')
                  }}
                  className="mt-2 text-xs text-orange-300 hover:text-orange-200 font-medium transition-colors"
                >
                  前往结束审批 →
                </button>
              </div>
              <button
                onClick={() => setDismissLeaveEndAlert(true)}
                className="text-orange-300/60 hover:text-orange-200 transition-colors flex-shrink-0"
                aria-label="关闭提示"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {badges.assistantPending > 0 && !dismissAssistantAlert && (
          <div className="student-glass-panel student-glass-panel--static p-4 border-teal-400/40 shadow-2xl shadow-teal-900/30">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-teal-600/30 rounded-lg flex-shrink-0">
                <GraduationCap size={20} className="text-teal-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">助教有待审批事项</p>
                <p className="text-teal-200/80 text-xs mt-1">
                  共 {badges.assistantPending} 条（认领 / 加人 / 升阶），请及时处理
                </p>
                <button
                  onClick={() => {
                    localStorage.setItem('assistantActiveTab', 'pending')
                    navigate('/admin/members/assistants')
                  }}
                  className="mt-2 text-xs text-teal-300 hover:text-teal-200 font-medium transition-colors"
                >
                  前往助教管理 →
                </button>
              </div>
              <button
                onClick={() => setDismissAssistantAlert(true)}
                className="text-teal-300/60 hover:text-teal-200 transition-colors flex-shrink-0"
                aria-label="关闭提示"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="student-main-center w-full">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-2 flex flex-wrap items-center gap-2">
              {getGreeting()}，
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-500">
                {adminName}
              </span>
            </h1>
            <p className="text-gray-400">
              管理后台总览
              {todoTotal > 0 && (
                <span className="ml-2 text-amber-300/90">· 当前待办 {todoTotal} 项</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 student-glass-chip px-4 py-2.5">
              <div className={`w-2 h-2 rounded-full ${onDuty ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className={`text-sm font-medium ${onDuty ? 'text-green-400' : 'text-gray-400'}`}>
                {onDuty ? '已上班' : '未上班'}
              </span>
              {onDuty && clockedInAt && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(clockedInAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {onDuty ? (
                <button
                  onClick={handleClockOut}
                  disabled={dutyLoading}
                  className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <LogOut size={13} />下班
                </button>
              ) : (
                <button
                  onClick={handleClockIn}
                  disabled={dutyLoading}
                  className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <LogIn size={13} />上班
                </button>
              )}
            </div>
            <UserDropdown userType="admin" />
          </div>
        </div>

        {loading ? (
          <PageSkeleton variant="cards" padded={false} />
        ) : (
          <div className="space-y-6">
            {/* 意见箱首页醒目提示条 */}
            {badges.opinionPending > 0 && (
              <button
                type="button"
                onClick={() => navigate('/admin/opinion-box')}
                className="w-full text-left student-glass-panel student-glass-panel--static p-4 sm:p-5 border-fuchsia-400/35 hover:border-fuchsia-400/55 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-fuchsia-500/20 border border-fuchsia-400/30">
                    <Mailbox size={22} className="text-fuchsia-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-white">意见箱待查阅</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-sm font-semibold bg-fuchsia-500/25 text-fuchsia-200">
                        {badges.opinionPending}
                      </span>
                    </div>
                    <p className="text-sm text-fuchsia-100/70 mt-0.5">
                      有新的学员反馈尚未处理，点击前往意见箱
                    </p>
                  </div>
                  <span className="text-fuchsia-300 text-sm font-medium">去处理 →</span>
                </div>
              </button>
            )}

            {/* 核心数据 + 成员阶段分布（卡片 / 阶梯图切换） */}
            <div className="student-glass-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-600/20">
                    <CheckCircle2 size={18} className="text-purple-300" />
                  </div>
                  核心数据与阶段分布
                </h2>
                <div className="inline-flex student-glass-chip student-glass-seg">
                  <button
                    type="button"
                    onClick={() => setDataViewMode('cards')}
                    className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      dataViewMode === 'cards' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid size={14} />
                    卡片
                  </button>
                  <button
                    type="button"
                    onClick={() => setDataViewMode('chart')}
                    className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      dataViewMode === 'chart' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <LineChart size={14} />
                    阶梯图
                  </button>
                </div>
              </div>

              {dataViewMode === 'cards' ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {metricCards.map((card) => (
                      <button
                        key={card.label}
                        type="button"
                        onClick={card.onClick}
                        className="student-glass-chip p-4 text-left hover:border-purple-400/30 transition-colors"
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
                      成员阶段分布
                    </div>
                    <div className="flex items-stretch gap-2 sm:gap-3 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={handleViewAllMembers}
                        className="group flex-1 min-w-[4.5rem] student-glass-chip p-3 sm:p-4"
                      >
                        <div className="text-center">
                          <div className="text-2xl sm:text-3xl font-bold text-gray-200 mb-1">{stats.totalMembers}</div>
                          <div className="text-gray-400 text-[11px] font-medium">总成员</div>
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
                    <p className="mt-3 text-center text-gray-500 text-xs">点击卡片跳转对应页面或成员筛选</p>
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
                        aria-label="核心数据与阶段分布阶梯图"
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
                        {/* 核心 / 阶段分界 */}
                        {chartGeom.points.findIndex((p) => p.kind === 'stage') > 0 && (() => {
                          const idx = chartGeom.points.findIndex((p) => p.kind === 'stage')
                          const x = (chartGeom.points[idx - 1].x + chartGeom.points[idx].x) / 2
                          return (
                            <line
                              x1={x}
                              x2={x}
                              y1={chartGeom.padT}
                              y2={chartGeom.padT + chartGeom.plotH}
                              stroke="rgba(167,139,250,0.35)"
                              strokeDasharray="4 4"
                            />
                          )
                        })()}
                        <path d={chartGeom.areaPath} fill="rgba(167,139,250,0.12)" />
                        <path
                          d={chartGeom.path}
                          fill="none"
                          stroke="#a78bfa"
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
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-purple-400 rounded" />
                      左侧：核心指标
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 border-t border-dashed border-purple-400/60" />
                      右侧：成员阶段
                    </span>
                    <span>点击节点可跳转</span>
                  </div>
                </div>
              )}
            </div>

            {/* 准考候选 */}
            {examCandidates.length > 0 && (
              <div className="student-glass-panel student-glass-panel--static student-glass-chip--yellow p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-yellow-600/20">
                      <GraduationCap size={18} className="text-yellow-400" />
                    </div>
                    新训准考候选
                    <span className="ml-1 px-2.5 py-0.5 bg-yellow-600/20 text-yellow-400 text-sm font-semibold rounded-full">
                      {examCandidates.length}
                    </span>
                  </h2>
                </div>
                <p className="text-yellow-300/90 text-sm mb-4">
                  已完成前四部分课程，达到准考标准。请审核后手动调整阶段。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {examCandidates.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        localStorage.setItem('warningMemberIds', JSON.stringify([member.id]))
                        navigate('/admin/members/list')
                      }}
                      className="group student-glass-chip student-glass-chip--yellow p-4 text-left hover:border-yellow-500/50"
                    >
                      <div className="flex items-center gap-3">
                        <MemberAvatar avatar={member.avatar} qq={member.qq} name={member.nickname} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{member.nickname}</div>
                          <div className="text-xs text-gray-400 truncate">QQ: {member.qq}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-yellow-400">当前阶段: {member.stage_role}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 催促 + 快捷操作 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 relative lg:h-0 lg:min-h-full">
                <div className="student-glass-panel p-5 sm:p-6 flex flex-col overflow-hidden lg:absolute lg:inset-0">
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-orange-600/20">
                        <Bell size={18} className="text-orange-400" />
                      </div>
                      催促名单
                      {stats.reminders > 0 && (
                        <span className="ml-1 px-2.5 py-0.5 bg-orange-600/20 text-orange-400 text-sm font-semibold rounded-full">
                          {stats.reminders}
                        </span>
                      )}
                    </h2>
                    <button
                      onClick={() => navigate('/admin/leave-team/reminders')}
                      className="text-sm text-purple-400 hover:text-purple-300 transition-colors font-medium"
                    >
                      查看全部 →
                    </button>
                  </div>

                  {reminderList.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                      <div className="inline-block p-4 bg-green-600/10 rounded-full mb-3">
                        <Users size={32} className="text-green-400" />
                      </div>
                      <p className="text-gray-400">暂无需要催促的成员</p>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 scrollbar-none">
                      {reminderList.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => navigate('/admin/leave-team/reminders')}
                          className="w-full group student-glass-chip p-4 hover:border-orange-500/50 text-left"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <MemberAvatar
                                avatar={member.avatar ?? memberAvatarById[member.member_id ?? member.id]}
                                qq={member.qq}
                                name={member.nickname || member.member_name}
                                size="md"
                                className="!w-[50px] !h-[50px] !text-base"
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-white font-medium truncate">
                                    {member.nickname || member.member_name}
                                  </span>
                                  {!!member.is_leave_buffer && (
                                    <span className="text-xs bg-cyan-600/20 text-cyan-300 px-2 py-0.5 rounded">请假缓冲</span>
                                  )}
                                  <span className="text-gray-500 text-sm">QQ: {member.qq}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className={`student-glass-badge ${getRoleColor(member.stage_role)}`}>
                                    {member.stage_role}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {member.last_training_date
                                      ? `最后新训: ${formatDate(member.last_training_date)}`
                                      : '从未新训'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              {!!member.is_leave_buffer ? (
                                <>
                                  <div className="text-2xl font-bold text-cyan-400">
                                    {member.buffer_remaining_days ?? 0}
                                  </div>
                                  <div className="text-xs text-gray-500">天缓冲</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-2xl font-bold text-orange-400">
                                    {member.days_without_training}
                                  </div>
                                  <div className="text-xs text-gray-500">天未训</div>
                                </>
                              )}
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
                  {([
                    {
                      label: '课程分配',
                      path: '/admin/courses/progress',
                      icon: FileText,
                      iconWrap: 'bg-cyan-600/20',
                      iconClass: 'text-cyan-400',
                    },
                    {
                      label: '考核审批',
                      path: '/admin/assessments/approval',
                      icon: Award,
                      iconWrap: 'bg-green-600/20',
                      iconClass: 'text-green-400',
                      count: badges.assessmentPending,
                      countHint: '待审',
                      urgent: true,
                    },
                    {
                      label: '退队审批',
                      path: '/admin/leave-team/approval',
                      icon: UserMinus,
                      iconWrap: 'bg-red-600/20',
                      iconClass: 'text-red-400',
                    },
                    {
                      label: '考核记录',
                      path: '/admin/assessments/records',
                      icon: FileText,
                      iconWrap: 'bg-blue-600/20',
                      iconClass: 'text-blue-400',
                    },
                    {
                      label: '意见箱',
                      path: '/admin/opinion-box',
                      icon: Mailbox,
                      iconWrap: 'bg-fuchsia-600/20',
                      iconClass: 'text-fuchsia-300',
                      count: badges.opinionPending,
                      countHint: '待阅',
                      urgent: true,
                    },
                    {
                      label: '助教管理',
                      path: '/admin/members/assistants',
                      icon: GraduationCap,
                      iconWrap: 'bg-teal-600/20',
                      iconClass: 'text-teal-300',
                      count: badges.assistantPending || 0,
                      countHint: '待审',
                      urgent: true,
                    },
                    {
                      label: '请假记录',
                      path: '/admin/members/leave',
                      icon: Calendar,
                      iconWrap: 'bg-amber-600/20',
                      iconClass: 'text-amber-300',
                      // 与侧栏请假角标一致：申请待审 + 结束待审
                      count: badges.leavePending + badges.leaveEndPending,
                      countHint: '待审',
                      urgent: true,
                    },
                    {
                      label: '黑点记录',
                      path: '/admin/members/violations',
                      icon: ShieldAlert,
                      iconWrap: 'bg-rose-600/20',
                      iconClass: 'text-rose-300',
                      // 生效中数量（统计信息，非待办）
                      count: stats.blackPoints,
                      countHint: '生效',
                      urgent: false,
                    },
                    {
                      label: '催促名单',
                      path: '/admin/leave-team/reminders',
                      icon: Bell,
                      iconWrap: 'bg-orange-600/20',
                      iconClass: 'text-orange-300',
                      // 与首页统计同源，避免 badges 异步晚到造成数量闪现
                      count: stats.reminders,
                      countHint: '待跟进',
                      urgent: true,
                      wide: true,
                    },
                  ] as const).map((item) => {
                    const count = 'count' in item ? item.count : 0
                    const showCount = typeof count === 'number' && count > 0
                    const urgent = 'urgent' in item && item.urgent
                    const countHint = 'countHint' in item ? item.countHint : ''
                    const wide = 'wide' in item && item.wide
                    return (
                      <button
                        key={item.path + item.label}
                        type="button"
                        onClick={() => {
                          if (item.path === '/admin/members/assistants' && (badges.assistantPending || 0) > 0) {
                            localStorage.setItem('assistantActiveTab', 'pending')
                          }
                          navigate(item.path)
                        }}
                        className={`group flex flex-col items-center gap-2.5 p-4 student-glass-chip transition-all ${
                          wide ? 'col-span-2' : ''
                        }`}
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

            {/* 文档中心 */}
            <div className="student-glass-panel p-5 sm:p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-600/20">
                  <BookOpen size={18} className="text-blue-400" />
                </div>
                文档中心
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { href: '#/docs/紫夜CQB战术公会', label: '紫夜简介', tone: 'text-purple-400 bg-purple-600/20' },
                  { href: '#/docs/紫夜战术公会公告细则', label: '紫夜规章制度', tone: 'text-blue-400 bg-blue-600/20' },
                  { href: '#/docs/紫夜新训须知', label: '加入我们', tone: 'text-green-400 bg-green-600/20' },
                  { href: '#/docs/模组详细说明', label: 'MOD说明', tone: 'text-orange-400 bg-orange-600/20' },
                ].map((doc) => (
                  <a
                    key={doc.href}
                    href={doc.href}
                    className="group flex flex-col items-center gap-3 p-5 student-glass-chip"
                  >
                    <div className={`p-3 rounded-lg ${doc.tone.split(' ')[1]}`}>
                      <FileText size={26} className={doc.tone.split(' ')[0]} />
                    </div>
                    <span className="text-gray-300 group-hover:text-white font-medium text-sm text-center">
                      {doc.label}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
