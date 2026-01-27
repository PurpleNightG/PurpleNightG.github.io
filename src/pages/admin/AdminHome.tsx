import { useEffect, useState } from 'react'
import { Users, UserMinus, AlertCircle, Calendar, Award, Bell, FileText, Settings, BookOpen } from 'lucide-react'
import { memberAPI, leaveAPI, blackPointAPI, reminderAPI } from '../../utils/api'
import { useNavigate } from 'react-router-dom'
import UserDropdown from '../../components/UserDropdown'

interface Statistics {
  totalMembers: number
  activeMembers: number
  leavingMembers: number
  onLeaveMembers: number
  blackPoints: number
  reminders: number
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
  const [loading, setLoading] = useState(true)
  const [adminName, setAdminName] = useState('管理员')

  useEffect(() => {
    // 获取管理员姓名
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr)
      setAdminName(user.name || user.username || '管理员')
    }
    loadStatistics()
  }, [])

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
      const [members, leaves, blackPoints, reminders] = await Promise.all([
        memberAPI.getAll(),
        leaveAPI.getAll(),
        blackPointAPI.getAll(),
        reminderAPI.getAll()
      ])

      const membersData = members.data || []
      const leavesData = leaves.data || []
      const blackPointsData = blackPoints.data || []
      const remindersData = reminders.data || []

      setStats({
        totalMembers: membersData.length,
        activeMembers: membersData.filter((m: any) => m.status === '正常').length,
        leavingMembers: membersData.filter((m: any) => m.status === '已退队').length,
        onLeaveMembers: leavesData.filter((l: any) => l.status === '请假中').length,
        blackPoints: blackPointsData.filter((b: any) => b.status === '生效中').length,
        reminders: remindersData.length
      })

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
          <UserDropdown userType="admin" />
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-700 border-t-purple-600"></div>
            <p className="text-gray-400 mt-6 text-lg">加载中...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 用户等级分布 */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gray-600/20">
                  <Users size={28} className="text-gray-400" />
                </div>
                成员阶段分布
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {/* 总用户数卡片 */}
                <div
                  onClick={handleViewAllMembers}
                  className="group relative bg-gray-700/30 backdrop-blur-sm rounded-xl p-6 cursor-pointer hover:bg-gray-700/50 border border-gray-600/30 hover:border-gray-500/50 transition-all overflow-hidden"
                >
                  <div className="relative text-center">
                    <div className="text-4xl font-bold text-gray-300 mb-2">
                      {stats.totalMembers}
                    </div>
                    <div className="text-gray-400 text-sm font-medium">总成员数</div>
                  </div>
                </div>
                
                {/* 各阶段分布卡片 */}
                {stageDistribution.map((item, index) => (
                  <div
                    key={index}
                    onClick={() => handleStageClick(item.stage)}
                    className="group relative bg-gray-700/30 backdrop-blur-sm rounded-xl p-6 cursor-pointer hover:bg-gray-700/50 border border-gray-600/30 hover:border-gray-500/50 transition-all overflow-hidden"
                  >
                    <div className="relative text-center">
                      <div className="text-4xl font-bold text-gray-300 mb-2">
                        {item.count}
                      </div>
                      <div className="text-gray-400 text-sm font-medium">{item.stage}</div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 text-center">
                <p className="text-gray-400 text-sm inline-flex items-center gap-2 bg-gray-700/30 px-4 py-2 rounded-full">
                  <span className="text-gray-500">💡</span>
                  点击卡片可跳转到成员列表并自动筛选对应阶段
                </p>
              </div>
            </div>

            {/* 快捷操作 */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-r from-yellow-600 to-orange-600 bg-opacity-20">
                  <Award size={28} className="text-yellow-400" />
                </div>
                快捷操作
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => navigate('/admin/members/list')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-purple-500/50"
                >
                  <div className="p-3 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                    <Users size={24} className="text-purple-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">成员管理</span>
                </button>
                
                <button
                  onClick={() => navigate('/admin/training/courses')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-blue-500/50"
                >
                  <div className="p-3 bg-blue-600/20 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                    <BookOpen size={24} className="text-blue-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">课程管理</span>
                </button>
                
                <button
                  onClick={() => navigate('/admin/training/progress')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-cyan-500/50"
                >
                  <div className="p-3 bg-cyan-600/20 rounded-lg group-hover:bg-cyan-600/30 transition-colors">
                    <FileText size={24} className="text-cyan-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">课程分配</span>
                </button>
                
                <button
                  onClick={() => navigate('/admin/members/leave')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-yellow-500/50"
                >
                  <div className="p-3 bg-yellow-600/20 rounded-lg group-hover:bg-yellow-600/30 transition-colors">
                    <Calendar size={24} className="text-yellow-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">请假记录</span>
                </button>
                
                <button
                  onClick={() => navigate('/admin/leave-team/reminders')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-orange-500/50"
                >
                  <div className="p-3 bg-orange-600/20 rounded-lg group-hover:bg-orange-600/30 transition-colors">
                    <Bell size={24} className="text-orange-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">催促名单</span>
                </button>
                
                <button
                  onClick={() => navigate('/admin/leave-team/approval')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-red-500/50"
                >
                  <div className="p-3 bg-red-600/20 rounded-lg group-hover:bg-red-600/30 transition-colors">
                    <UserMinus size={24} className="text-red-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">退队审批</span>
                </button>
                
                <button
                  onClick={() => navigate('/admin/members/blackpoints')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-red-500/50"
                >
                  <div className="p-3 bg-red-600/20 rounded-lg group-hover:bg-red-600/30 transition-colors">
                    <AlertCircle size={24} className="text-red-500" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">黑点记录</span>
                </button>
                
                <button
                  onClick={() => navigate('/admin/assessments/manage')}
                  className="group flex flex-col items-center gap-3 p-5 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-all border border-gray-600/30 hover:border-gray-500/50"
                >
                  <div className="p-3 bg-gray-600/20 rounded-lg group-hover:bg-gray-600/30 transition-colors">
                    <Settings size={24} className="text-gray-400" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white font-medium transition-colors">考核管理</span>
                </button>
              </div>
            </div>

            {/* 提示信息 */}
            {stats.reminders > 0 && (
              <div className="bg-orange-900/20 backdrop-blur-sm border border-orange-600/30 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-600/20 rounded-lg">
                    <AlertCircle size={24} className="text-orange-400" />
                  </div>
                  <span className="text-orange-300 font-medium text-lg">
                    ⚠️ 提醒：当前有 <span className="font-bold">{stats.reminders}</span> 名成员需要催促训练
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
