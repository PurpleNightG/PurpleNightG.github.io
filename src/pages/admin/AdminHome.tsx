import { useEffect, useState } from 'react'
import { Users, UserMinus, Award, Bell, FileText, BookOpen, GraduationCap, Clock, LogIn, LogOut } from 'lucide-react'
import { memberAPI, leaveAPI, blackPointAPI, reminderAPI } from '../../utils/api'
import { useNavigate } from 'react-router-dom'
import UserDropdown from '../../components/UserDropdown'
import { formatDate } from '../../utils/dateFormat'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface Statistics {
  totalMembers: number
  activeMembers: number
  leavingMembers: number
  onLeaveMembers: number
  blackPoints: number
  reminders: number
}

interface ReminderMember {
  id: number
  member_name: string
  nickname: string
  qq: string
  stage_role: string
  last_training_date: string | null
  days_without_training: number
}

interface StageDistribution {
  stage: string
  count: number
  color: string
  bgColor: string
  textColor: string
}

export default function AdminHome() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Statistics>({
    totalMembers: 0,
    activeMembers: 0,
    leavingMembers: 0,
    onLeaveMembers: 0,
    blackPoints: 0,
    reminders: 0
  })
  const [stageDistribution, setStageDistribution] = useState<StageDistribution[]>([])
  const [reminderList, setReminderList] = useState<ReminderMember[]>([])
  const [examCandidates, setExamCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adminName, setAdminName] = useState('管理员')
  const [adminUsername, setAdminUsername] = useState('')
  const [onDuty, setOnDuty] = useState(false)
  const [clockedInAt, setClockedInAt] = useState<string | null>(null)
  const [dutyLoading, setDutyLoading] = useState(false)

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

  const loadDutyStatus = async (username: string) => {
    try {
      const res = await fetch(`${API_URL}/duty/status/${encodeURIComponent(username)}`)
      const data = await res.json()
      setOnDuty(data.onDuty)
      setClockedInAt(data.clockedInAt || null)
    } catch {}
  }

  const handleClockIn = async () => {
    if (!adminUsername || dutyLoading) return
    setDutyLoading(true)
    try {
      const res = await fetch(`${API_URL}/duty/clock-in`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, nickname: adminName }),
      })
      const data = await res.json()
      if (data.success) { setOnDuty(true); await loadDutyStatus(adminUsername) }
    } catch {}
    setDutyLoading(false)
  }

  const handleClockOut = async () => {
    if (!adminUsername || dutyLoading) return
    setDutyLoading(true)
    try {
      const res = await fetch(`${API_URL}/duty/clock-out`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername }),
      })
      const data = await res.json()
      if (data.success) { setOnDuty(false); setClockedInAt(null) }
    } catch {}
    setDutyLoading(false)
  }

  // 时间问候函数
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
      const [members, leaves, blackPoints, reminders, examCandidatesRes] = await Promise.all([
        memberAPI.getAll(),
        leaveAPI.getAll(),
        blackPointAPI.getAll(),
        reminderAPI.getAll(),
        memberAPI.getExamCandidates().catch(err => {
          console.error('获取准考候选成员失败:', err)
          return { data: [] }
        })
      ])

      const membersData = members.data || []
      const leavesData = leaves.data || []
      const blackPointsData = blackPoints.data || []
      const remindersData = reminders.data || []
      const examCandidatesData = examCandidatesRes?.data || []

      setStats({
        totalMembers: membersData.length,
        activeMembers: membersData.filter((m: any) => m.status === '正常').length,
        leavingMembers: membersData.filter((m: any) => m.status === '已退队').length,
        onLeaveMembers: leavesData.filter((l: any) => l.status === '请假中').length,
        blackPoints: blackPointsData.filter((b: any) => b.status === '生效中').length,
        reminders: remindersData.length
      })

      // 设置催促名单（只显示前5个）
      setReminderList(remindersData.slice(0, 5))
      
      // 设置准考候选成员
      setExamCandidates(examCandidatesData)

      // 计算阶段分布
      const stages = [
        '未新训', '新训初期', '新训一期', '新训二期', '新训三期', 
        '新训准考', '紫夜', '紫夜尖兵'
      ]
      
      const distribution: StageDistribution[] = stages.map((stage, index) => {
        const colors = [
          { color: 'from-gray-600 to-gray-800', bgColor: 'bg-gray-600/20', textColor: 'text-gray-300' },
          { color: 'from-blue-600 to-blue-800', bgColor: 'bg-blue-600/20', textColor: 'text-blue-300' },
          { color: 'from-cyan-600 to-cyan-800', bgColor: 'bg-cyan-600/20', textColor: 'text-cyan-300' },
          { color: 'from-teal-600 to-teal-800', bgColor: 'bg-teal-600/20', textColor: 'text-teal-300' },
          { color: 'from-green-600 to-green-800', bgColor: 'bg-green-600/20', textColor: 'text-green-300' },
          { color: 'from-yellow-600 to-yellow-800', bgColor: 'bg-yellow-600/20', textColor: 'text-yellow-300' },
          { color: 'from-purple-600 to-purple-800', bgColor: 'bg-purple-600/20', textColor: 'text-purple-300' },
          { color: 'from-pink-600 to-pink-800', bgColor: 'bg-pink-600/20', textColor: 'text-pink-300' }
        ]
        
        return {
          stage,
          count: membersData.filter((m: any) => m.stage_role === stage).length,
          color: colors[index].color,
          bgColor: colors[index].bgColor,
          textColor: colors[index].textColor
        }
      })
      
      setStageDistribution(distribution)
    } catch (error) {
      console.error('加载统计信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 跳转到成员列表并筛选指定阶段
  const handleStageClick = (stage: string) => {
    // 保存筛选条件到localStorage
    localStorage.setItem('memberListFilters', JSON.stringify({
      stage_role: [stage],
      status: [],
      inverseMode: false
    }))
    // 跳转到成员列表
    navigate('/admin/members/list')
  }

  // 跳转到成员列表并清空筛选
  const handleViewAllMembers = () => {
    // 清空筛选条件
    localStorage.setItem('memberListFilters', JSON.stringify({
      stage_role: [],
      status: [],
      inverseMode: false
    }))
    // 跳转到成员列表
    navigate('/admin/members/list')
  }

  return (
    <div className="p-8 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* 欢迎标题和用户菜单 */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-bold text-white mb-3 flex items-center gap-3">
              {getGreeting()}，
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-500 animate-pulse">
                {adminName}
              </span>
            </h1>
            <p className="text-gray-400 text-lg">欢迎使用紫夜战术公会管理后台</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 上班/下班按鈕 */}
            <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-2.5">
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
                <button onClick={handleClockOut} disabled={dutyLoading}
                  className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  <LogOut size={13} />下班
                </button>
              ) : (
                <button onClick={handleClockIn} disabled={dutyLoading}
                  className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  <LogIn size={13} />上班
                </button>
              )}
            </div>
            <UserDropdown userType="admin" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-700 border-t-purple-600"></div>
            <p className="text-gray-400 mt-6 text-lg">加载中...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 成员阶段分布 - 横向一行 */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gray-600/20">
                  <Users size={22} className="text-gray-400" />
                </div>
                成员阶段分布
              </h2>
              
              <div className="flex items-center gap-3">
                {/* 总成员数 */}
                <div
                  onClick={handleViewAllMembers}
                  className="group flex-1 bg-gradient-to-br from-gray-700/40 to-gray-800/40 hover:from-gray-700/60 hover:to-gray-800/60 backdrop-blur-sm rounded-lg p-4 cursor-pointer border border-gray-600/30 hover:border-gray-500/50 transition-all min-w-0"
                >
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-300 mb-1">
                      {stats.totalMembers}
                    </div>
                    <div className="text-gray-400 text-xs font-medium">总成员</div>
                  </div>
                </div>
                
                {/* 各阶段分布 */}
                {stageDistribution.length === 0 ? (
                  <div className="text-gray-400 text-sm">加载阶段分布中...</div>
                ) : (
                  stageDistribution.map((item, index) => (
                    <div
                      key={index}
                      onClick={() => handleStageClick(item.stage)}
                      className="group flex-1 bg-gradient-to-br from-gray-700/40 to-gray-800/40 hover:from-gray-700/60 hover:to-gray-800/60 backdrop-blur-sm rounded-lg p-4 cursor-pointer border border-gray-600/30 hover:border-gray-500/50 transition-all min-w-0"
                    >
                      <div className="text-center">
                        <div className={`text-3xl font-bold mb-1 ${item.textColor}`}>
                          {item.count}
                        </div>
                        <div className="text-gray-400 text-xs font-medium truncate">{item.stage}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="mt-3 text-center">
                <p className="text-gray-500 text-xs inline-flex items-center gap-1">
                  💡 点击卡片可跳转到成员列表并自动筛选对应阶段
                </p>
              </div>
            </div>

            {/* 准考候选成员提示 */}
            {examCandidates.length > 0 && (
              <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 backdrop-blur-sm rounded-xl p-6 border border-yellow-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-yellow-600/20">
                      <GraduationCap size={22} className="text-yellow-400" />
                    </div>
                    新训准考候选成员
                    <span className="ml-2 px-2.5 py-0.5 bg-yellow-600/20 text-yellow-400 text-sm font-semibold rounded-full">
                      {examCandidates.length}
                    </span>
                  </h2>
                </div>
                
                <p className="text-yellow-300 text-sm mb-4">
                  🎓 以下成员已完成前四部分的所有课程，达到新训准考标准。请管理员审核后手动调整阶段。
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {examCandidates.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => {
                        // 将成员ID保存到localStorage并跳转
                        localStorage.setItem('warningMemberIds', JSON.stringify([member.id]))
                        navigate('/admin/members/list')
                      }}
                      className="group bg-yellow-900/20 hover:bg-yellow-900/30 rounded-lg p-4 border border-yellow-700/30 hover:border-yellow-500/50 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center">
                          <span className="text-yellow-400 font-bold">
                            {member.nickname.charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{member.nickname}</div>
                          <div className="text-xs text-gray-400 truncate">QQ: {member.qq}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-yellow-400">
                        当前阶段: {member.stage_role}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 text-center">
                  <p className="text-yellow-500/70 text-xs">
                    💡 点击成员卡片可跳转到成员列表并自动选中该成员
                  </p>
                </div>
              </div>
            )}

            {/* 下方左右布局 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 左侧：催促名单 */}
              <div className="lg:col-span-2 bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-orange-600/20">
                      <Bell size={22} className="text-orange-400" />
                    </div>
                    催促名单
                    {stats.reminders > 0 && (
                      <span className="ml-2 px-2.5 py-0.5 bg-orange-600/20 text-orange-400 text-sm font-semibold rounded-full">
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
                  <div className="text-center py-12">
                    <div className="inline-block p-4 bg-green-600/10 rounded-full mb-3">
                      <Users size={32} className="text-green-400" />
                    </div>
                    <p className="text-gray-400">暂无需要催促的成员</p>
                    <p className="text-gray-500 text-sm mt-1">所有成员训练状态正常 ✨</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reminderList.map((member) => (
                      <div
                        key={member.id}
                        onClick={() => navigate('/admin/leave-team/reminders')}
                        className="group bg-gray-700/30 hover:bg-gray-700/50 rounded-lg p-4 border border-gray-600/30 hover:border-orange-500/50 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0">
                              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                {member.nickname?.charAt(0) || member.member_name?.charAt(0) || '?'}
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{member.nickname || member.member_name}</span>
                                <span className="text-gray-500 text-sm">QQ: {member.qq}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-0.5 rounded">
                                  {member.stage_role}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {member.last_training_date ? `最后新训: ${formatDate(member.last_training_date)}` : '从未新训'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-2xl font-bold text-orange-400">
                              {member.days_without_training}
                            </div>
                            <div className="text-xs text-gray-500">天未训</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 右侧：快捷操作 2x2 */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-600/20">
                    <Award size={22} className="text-purple-400" />
                  </div>
                  快捷操作
                </h2>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => navigate('/admin/courses/progress')}
                    className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-cyan-500/50"
                  >
                    <div className="p-3 bg-cyan-600/20 rounded-lg group-hover:bg-cyan-600/30 transition-colors">
                      <FileText size={28} className="text-cyan-400" />
                    </div>
                    <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">课程分配</span>
                  </button>
                  
                  <button
                    onClick={() => navigate('/admin/assessments/approval')}
                    className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-green-500/50"
                  >
                    <div className="p-3 bg-green-600/20 rounded-lg group-hover:bg-green-600/30 transition-colors">
                      <Award size={28} className="text-green-400" />
                    </div>
                    <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">考核审批</span>
                  </button>
                  
                  <button
                    onClick={() => navigate('/admin/leave-team/approval')}
                    className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-red-500/50"
                  >
                    <div className="p-3 bg-red-600/20 rounded-lg group-hover:bg-red-600/30 transition-colors">
                      <UserMinus size={28} className="text-red-400" />
                    </div>
                    <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">退队审批</span>
                  </button>
                  
                  <button
                    onClick={() => navigate('/admin/assessments/manage')}
                    className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-blue-500/50"
                  >
                    <div className="p-3 bg-blue-600/20 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                      <FileText size={28} className="text-blue-400" />
                    </div>
                    <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">考核记录</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 文档快捷方式 */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mt-6">
              <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-600/20">
                  <BookOpen size={22} className="text-blue-400" />
                </div>
                文档中心
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <a
                  href="#/docs/PNG"
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-purple-500/50"
                >
                  <div className="p-3 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                    <FileText size={28} className="text-purple-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">紫夜简介</span>
                </a>
                
                <a
                  href="#/docs/PNGrule"
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-blue-500/50"
                >
                  <div className="p-3 bg-blue-600/20 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                    <FileText size={28} className="text-blue-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">紫夜规章制度</span>
                </a>
                
                <a
                  href="#/docs/HTJ"
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-green-500/50"
                >
                  <div className="p-3 bg-green-600/20 rounded-lg group-hover:bg-green-600/30 transition-colors">
                    <FileText size={28} className="text-green-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">加入我们</span>
                </a>
                
                <a
                  href="#/docs/mod-explan"
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-orange-500/50"
                >
                  <div className="p-3 bg-orange-600/20 rounded-lg group-hover:bg-orange-600/30 transition-colors">
                    <FileText size={28} className="text-orange-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors text-sm text-center">MOD说明</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
