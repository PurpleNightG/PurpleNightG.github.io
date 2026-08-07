import { useState, useEffect } from 'react'
import { Users, TrendingUp, TrendingDown } from 'lucide-react'
import { formatDate } from '../utils/dateFormat'
import { getRoleColor } from '../utils/roleColors'
import MemberAvatar from '../components/MemberAvatar'
import PageSkeleton from '../components/Skeleton'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface Member {
  id: number
  nickname: string
  qq: string
  avatar?: string | null
  stage_role: string
  join_date: string
  last_training_date: string
}

interface ClassmatesData {
  currentMember: Member
  sameStage: {
    stage: string
    members: Member[]
  }
  seniorStage: {
    stage: string | null
    members: Member[]
  }
  juniorStage: {
    stage: string | null
    members: Member[]
  }
}

export default function StudentClassmates() {
  const [data, setData] = useState<ClassmatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadClassmates()
  }, [])

  const loadClassmates = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const userStr = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
      if (!userStr) {
        setError('未找到登录信息')
        return
      }
      
      const user = JSON.parse(userStr)
      const response = await fetch(`${API_URL}/classmates/my-classmates/${user.id}`)
      const result = await response.json()
      
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.message || '加载失败')
      }
    } catch (err: any) {
      console.error('加载同期学员失败:', err)
      setError('加载同期学员失败')
    } finally {
      setLoading(false)
    }
  }

  const getStageColor = (stage: string) => {
    if (stage === '紫夜' || stage === '紫夜尖兵') {
      return 'from-purple-600 to-purple-400'
    }
    if (stage === '新训准考') {
      return 'from-yellow-600 to-yellow-400'
    }
    if (stage?.includes('新训')) {
      return 'from-blue-600 to-blue-400'
    }
    return 'from-gray-600 to-gray-400'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <PageSkeleton variant="cards" padded={false} />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="student-glass-panel p-8 text-center border-red-500/30">
          <h2 className="text-xl font-bold text-red-300 mb-2">加载失败</h2>
          <p className="text-red-200/80 mb-6">{error || '未知错误'}</p>
          <button
            onClick={loadClassmates}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  const MemberCard = ({ member }: { member: Member }) => (
    <div className="student-glass-chip p-4">
      <div className="flex items-center gap-3 mb-3">
        <MemberAvatar
          avatar={member.avatar}
          qq={member.qq}
          name={member.nickname}
          size="md"
          className="!w-12 !h-12 !text-base"
        />
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold truncate">{member.nickname}</div>
          <div className="text-sm text-gray-400">QQ: {member.qq}</div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">阶段</span>
          <span className={`student-glass-badge ${getRoleColor(member.stage_role)}`}>
            {member.stage_role}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">加入日期</span>
          <span className="text-gray-300">{formatDate(member.join_date)}</span>
        </div>
        {member.last_training_date && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">新训日期</span>
            <span className="text-gray-300">{formatDate(member.last_training_date)}</span>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <Users size={40} className="text-purple-400" />
          同期学员
        </h1>
        <p className="text-gray-400">找到你的同期伙伴，一起训练成长</p>
      </div>

      <div className="student-glass-panel p-6 mb-6">
        <div className="flex items-center gap-4">
          <MemberAvatar
            avatar={data.currentMember.avatar}
            qq={data.currentMember.qq}
            name={data.currentMember.nickname}
            size="lg"
            className="!w-16 !h-16 !rounded-xl !text-xl shadow-lg"
          />
          <div>
            <div className="text-sm text-gray-400 mb-1">你的当前阶段</div>
            <div className={`text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${getStageColor(data.currentMember.stage_role)}`}>
              {data.currentMember.stage_role}
            </div>
          </div>
        </div>
      </div>

      <div className="student-glass-panel p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getStageColor(data.sameStage.stage)} flex items-center justify-center`}>
            <Users size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">同期学员</h2>
            <p className="text-sm text-gray-400">与你同阶段的伙伴 · {data.sameStage.stage}</p>
          </div>
        </div>

        {data.sameStage.members.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.sameStage.members.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Users size={48} className="mx-auto mb-4 text-gray-600" />
            <p>暂无同期学员</p>
          </div>
        )}
      </div>

      {data.seniorStage.stage && (
        <div className="student-glass-panel p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getStageColor(data.seniorStage.stage)} flex items-center justify-center`}>
              <TrendingUp size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">大一期学员</h2>
              <p className="text-sm text-gray-400">比你高一阶段的学长 · {data.seniorStage.stage}</p>
            </div>
          </div>

          {data.seniorStage.members.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.seniorStage.members.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Users size={48} className="mx-auto mb-4 text-gray-600" />
              <p>暂无大一期学员</p>
            </div>
          )}
        </div>
      )}

      {data.juniorStage.stage && (
        <div className="student-glass-panel p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getStageColor(data.juniorStage.stage)} flex items-center justify-center`}>
              <TrendingDown size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">小一期学员</h2>
              <p className="text-sm text-gray-400">比你低一阶段的学弟 · {data.juniorStage.stage}</p>
            </div>
          </div>

          {data.juniorStage.members.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.juniorStage.members.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Users size={48} className="mx-auto mb-4 text-gray-600" />
              <p>暂无小一期学员</p>
            </div>
          )}
        </div>
      )}

      <div className="student-glass-chip student-glass-chip--blue p-4">
        <p className="text-blue-200 text-sm">
          <strong>提示：</strong>你可以联系这些同期或相近阶段的学员，一起组队训练，互相学习进步！
        </p>
      </div>
    </div>
  )
}
