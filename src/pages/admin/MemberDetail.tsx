import { useState, useEffect } from 'react'
import { X, Calendar, AlertCircle, UserMinus, LogOut, Save, Key } from 'lucide-react'
import { memberAPI, blackPointAPI, leaveAPI, quitAPI, retentionAPI } from '../../utils/api'
import { formatDate, formatDateTime } from '../../utils/dateFormat'
import { toast } from '../../utils/toast'
import ConfirmDialog from '../../components/ConfirmDialog'

interface MemberDetailProps {
  memberId: number
  onClose: () => void
  onUpdate: () => void
}

interface BlackPoint {
  id: number
  reason: string
  register_date: string
  status: string
}

interface LeaveRecord {
  id: number
  start_date: string
  end_date: string
  status: string
  reason: string
}

interface RetentionRecord {
  id: number
  retention_reason: string
  approver_remarks: string
  approver_name: string
  approval_date: string
}

export default function MemberDetail({ memberId, onClose, onUpdate }: MemberDetailProps) {
  const [member, setMember] = useState<any>(null)
  const [blackPoints, setBlackPoints] = useState<BlackPoint[]>([])
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([])
  const [retentionRecord, setRetentionRecord] = useState<RetentionRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [remarks, setRemarks] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editedMember, setEditedMember] = useState<any>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [showBlackPointModal, setShowBlackPointModal] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false)
  const [blackPointForm, setBlackPointForm] = useState({ reason: '', register_date: new Date().toISOString().split('T')[0] })
  const [leaveForm, setLeaveForm] = useState({ reason: '', start_date: new Date().toISOString().split('T')[0], end_date: new Date().toISOString().split('T')[0] })

  useEffect(() => {
    const load = async () => {
      await loadMemberDetail()
    }
    load()
  }, [memberId])

  const loadMemberDetail = async () => {
    setLoading(true)
    try {
      // 加载成员信息
      const memberRes = await memberAPI.getById(memberId)
      setMember(memberRes.data)
      setEditedMember(memberRes.data)
      setRemarks(memberRes.data.remarks || '')

      // 加载黑点记录
      const blackPointsRes = await blackPointAPI.getAll()
      const memberBlackPoints = blackPointsRes.data.filter((bp: any) => bp.member_id === memberId)
      setBlackPoints(memberBlackPoints)

      // 加载请假记录
      const leavesRes = await leaveAPI.getAll()
      const memberLeaves = leavesRes.data.filter((l: any) => l.member_id === memberId)
      setLeaveRecords(memberLeaves)

      // 加载留队记录
      const retentionRes = await retentionAPI.getAll()
      const memberRetention = retentionRes.data.find((r: any) => r.member_id === memberId)
      setRetentionRecord(memberRetention || null)
    } catch (error) {
      console.error('加载成员详情失败:', error)
      toast.error('加载成员详情失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      // 格式化日期为 YYYY-MM-DD
      const formatDateForDB = (dateStr: string | null | undefined) => {
        if (!dateStr) return null
        return dateStr.split('T')[0]
      }
      
      await memberAPI.update(memberId, {
        nickname: editedMember.nickname,
        qq: editedMember.qq,
        game_id: editedMember.game_id || null,
        join_date: formatDateForDB(editedMember.join_date),
        stage_role: editedMember.stage_role,
        status: editedMember.status,
        last_training_date: formatDateForDB(editedMember.last_training_date),
        remarks: remarks || null
      })
      toast.success('保存成功')
      setIsEditing(false)
      loadMemberDetail()
      onUpdate()
    } catch (error: any) {
      console.error('保存失败:', error)
      toast.error(error.message || '保存失败')
    }
  }

  const handleSetTodayTraining = () => {
    setShowConfirm(true)
  }

  const confirmSetTodayTraining = async () => {
    setShowConfirm(false)
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // 格式化日期
      const formatDateForDB = (dateStr: string | null | undefined) => {
        if (!dateStr) return null
        return dateStr.split('T')[0]
      }
      
      await memberAPI.update(memberId, {
        nickname: member.nickname,
        qq: member.qq,
        game_id: member.game_id || null,
        join_date: formatDateForDB(member.join_date),
        stage_role: member.stage_role,
        status: member.status,
        last_training_date: today,
        remarks: member.remarks || null
      })
      toast.success(`已设为今日新训（${today}）`)
      loadMemberDetail()
      onUpdate()
    } catch (error: any) {
      console.error('设置今日新训失败:', error)
      toast.error(error.message || '设置失败')
    }
  }

  // 添加黑点
  const handleAddBlackPoint = () => {
    setBlackPointForm({ reason: '', register_date: new Date().toISOString().split('T')[0] })
    setShowBlackPointModal(true)
  }

  const submitBlackPoint = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const adminId = localStorage.getItem('userId')
      const adminName = localStorage.getItem('userName') || '管理员'
      
      await blackPointAPI.create({
        member_id: memberId,
        reason: blackPointForm.reason,
        register_date: blackPointForm.register_date,
        recorder_id: adminId ? parseInt(adminId) : 1,
        recorder_name: adminName
      })
      
      toast.success('黑点添加成功')
      setShowBlackPointModal(false)
      await loadMemberDetail()
      onUpdate()
    } catch (error: any) {
      toast.error(error.message || '添加黑点失败')
    }
  }

  // 登记请假
  const handleAddLeave = () => {
    setLeaveForm({ reason: '', start_date: new Date().toISOString().split('T')[0], end_date: new Date().toISOString().split('T')[0] })
    setShowLeaveModal(true)
  }

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await leaveAPI.create({
        member_id: memberId,
        reason: leaveForm.reason,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date
      })
      
      toast.success('请假登记成功')
      setShowLeaveModal(false)
      await loadMemberDetail()
      onUpdate()
    } catch (error: any) {
      toast.error(error.message || '登记请假失败')
    }
  }

  // 退队处理
  const handleQuit = () => {
    setShowQuitConfirm(true)
  }

  // 重置密码处理
  const handleResetPassword = async () => {
    setShowResetPasswordConfirm(false)
    try {
      await memberAPI.resetPassword(memberId)
      toast.success(`已将 ${member.nickname} 的密码重置为QQ号`)
    } catch (error: any) {
      toast.error(error.message || '重置密码失败')
    }
  }

  const confirmQuit = async () => {
    setShowQuitConfirm(false)
    
    const adminId = localStorage.getItem('userId')
    const adminName = localStorage.getItem('userName') || '管理员'
    let approvalCreated = false
    
    try {
      // 添加退队审批
      await quitAPI.create({
        member_id: memberId,
        source_admin_id: adminId ? parseInt(adminId) : 1,
        source_admin_name: adminName,
        remarks: '从成员详情快捷操作添加'
      })
      approvalCreated = true
      
      // 更新成员状态为已退队
      try {
        const formatDateForDB = (dateStr: string | null | undefined) => {
          if (!dateStr) return null
          return dateStr.split('T')[0]
        }
        
        await memberAPI.update(memberId, {
          nickname: member.nickname,
          qq: member.qq,
          game_id: member.game_id || null,
          join_date: formatDateForDB(member.join_date),
          stage_role: member.stage_role,
          status: '已退队',
          last_training_date: formatDateForDB(member.last_training_date),
          remarks: member.remarks || null
        })
        toast.success('已添加到退队审批，成员状态已更新')
      } catch (updateError: any) {
        console.error('更新成员状态失败:', updateError)
        toast.warning('退队审批已添加，但成员状态更新失败')
      }
      
      onClose()
      onUpdate()
    } catch (error: any) {
      if (approvalCreated) {
        toast.warning('退队审批已添加，但后续操作失败')
        onClose()
        onUpdate()
      } else {
        toast.error(error.message || '退队处理失败')
      }
    }
  }

  const activeBlackPoints = blackPoints.filter(bp => bp.status === '生效中').length

  // 根据阶段角色返回对应的颜色类
  const getRoleColor = (role: string) => {
    if (role === '紫夜' || role === '紫夜尖兵') return 'bg-purple-600/20 text-purple-300'
    if (role === '会长' || role === '执行官') return 'bg-amber-600/20 text-amber-300'
    if (role === '总教' || role === '尖兵教官' || role === '教官') return 'bg-green-600/20 text-green-300'
    if (role === '人事') return 'bg-cyan-600/20 text-cyan-300'
    if (role === '工程师') return 'bg-sky-600/20 text-sky-300'
    if (role.includes('新训')) return 'bg-blue-600/20 text-blue-300'
    return 'bg-gray-600/20 text-gray-300'
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-8">
          <div className="text-white">加载中...</div>
        </div>
      </div>
    )
  }

  if (!member) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 modal-scrollbar">
        {/* 头部 */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">成员详细信息</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 基本信息 */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">基本信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">昵称：</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedMember.nickname || ''}
                    onChange={(e) => setEditedMember({...editedMember, nickname: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                  />
                ) : (
                  <span className="text-white">{member.nickname}</span>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">QQ号：</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedMember.qq || ''}
                    onChange={(e) => setEditedMember({...editedMember, qq: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                  />
                ) : (
                  <span className="text-white">{member.qq}</span>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">游戏ID：</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedMember.game_id || ''}
                    onChange={(e) => setEditedMember({...editedMember, game_id: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                  />
                ) : (
                  <span className="text-white">{member.game_id || '-'}</span>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">阶段&角色：</label>
                {isEditing ? (
                  <select
                    value={editedMember.stage_role || ''}
                    onChange={(e) => setEditedMember({...editedMember, stage_role: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded pl-2 pr-8 py-1 text-white text-sm"
                  >
                    <option value="未新训">未新训</option>
                    <option value="新训初期">新训初期</option>
                    <option value="新训一期">新训一期</option>
                    <option value="新训二期">新训二期</option>
                    <option value="新训三期">新训三期</option>
                    <option value="新训准考">新训准考</option>
                    <option value="紫夜">紫夜</option>
                    <option value="紫夜尖兵">紫夜尖兵</option>
                    <option value="会长">会长</option>
                    <option value="执行官">执行官</option>
                    <option value="人事">人事</option>
                    <option value="总教">总教</option>
                    <option value="尖兵教官">尖兵教官</option>
                    <option value="教官">教官</option>
                    <option value="工程师">工程师</option>
                  </select>
                ) : (
                  <span className={`px-2 py-1 rounded text-xs ${getRoleColor(member.stage_role)}`}>
                    {member.stage_role}
                  </span>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">加入时间：</label>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedMember.join_date?.split('T')[0] || ''}
                    onChange={(e) => setEditedMember({...editedMember, join_date: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                  />
                ) : (
                  <span className="text-white">{formatDate(member.join_date)}</span>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">最后新训日期：</label>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedMember.last_training_date?.split('T')[0] || ''}
                    onChange={(e) => setEditedMember({...editedMember, last_training_date: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                  />
                ) : (
                  <span className="text-white">{formatDate(member.last_training_date)}</span>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">状态：</label>
                {isEditing ? (
                  <select
                    value={editedMember.status || ''}
                    onChange={(e) => setEditedMember({...editedMember, status: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded pl-2 pr-8 py-1 text-white text-sm"
                  >
                    <option value="正常">正常</option>
                    <option value="其他">其他</option>
                  </select>
                ) : (
                  <span className={`px-2 py-1 rounded text-xs ${
                    member.status === '正常' ? 'bg-green-600/20 text-green-300' :
                    member.status === '请假中' ? 'bg-yellow-600/20 text-yellow-300' :
                    member.status === '已退队' ? 'bg-red-600/20 text-red-300' :
                    'bg-gray-600/20 text-gray-300'
                  }`}>
                    {member.status}
                  </span>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">是否留队：</label>
                <span className={`px-2 py-1 rounded text-xs ${
                  retentionRecord ? 'bg-blue-600/20 text-blue-300' : 'bg-gray-600/20 text-gray-300'
                }`}>
                  {retentionRecord ? '是' : '否'}
                </span>
                {retentionRecord && (
                  <div className="mt-2 text-xs text-gray-400">
                    <div className="line-clamp-2" title={retentionRecord.retention_reason}>
                      原因：{retentionRecord.retention_reason}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm">黑点数量：</label>
                <span className={`px-2 py-1 rounded text-xs ml-2 ${
                  activeBlackPoints > 0 ? 'bg-red-600/20 text-red-300' : 'bg-green-600/20 text-green-300'
                }`}>
                  {activeBlackPoints}
                </span>
              </div>
              <div className="md:col-span-2">
                <label className="text-gray-400 text-sm">创建时间：</label>
                <span className="text-white ml-2">{formatDateTime(member.created_at)}</span>
              </div>
            </div>
          </section>

          {/* 备注信息 */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">备注信息</h3>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              onFocus={() => setIsEditing(true)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white h-24"
              placeholder="可在此添加备注信息..."
            />
          </section>

          {/* 黑点记录 */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">黑点记录</h3>
            {blackPoints.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">时间</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">原因</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {blackPoints.map((bp) => (
                      <tr key={bp.id}>
                        <td className="px-4 py-2 text-sm text-gray-300">{formatDate(bp.register_date)}</td>
                        <td className="px-4 py-2 text-sm text-gray-300">{bp.reason}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            bp.status === '生效中' ? 'bg-red-600/20 text-red-300' : 'bg-gray-600/20 text-gray-300'
                          }`}>
                            {bp.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">暂无黑点记录</div>
            )}
          </section>

          {/* 请假记录 */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">请假记录</h3>
            {leaveRecords.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">开始日期</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">结束日期</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">原因</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {leaveRecords.map((lr) => (
                      <tr key={lr.id}>
                        <td className="px-4 py-2 text-sm text-gray-300">{formatDate(lr.start_date)}</td>
                        <td className="px-4 py-2 text-sm text-gray-300">{formatDate(lr.end_date)}</td>
                        <td className="px-4 py-2 text-sm text-gray-300">{lr.reason || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            lr.status === '请假中' ? 'bg-yellow-600/20 text-yellow-300' : 'bg-gray-600/20 text-gray-300'
                          }`}>
                            {lr.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar size={48} className="mx-auto mb-2 opacity-50" />
                <p>暂无请假记录</p>
              </div>
            )}
          </section>

          {/* 快捷操作 */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">快捷操作</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <button
                onClick={handleSetTodayTraining}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <Calendar size={16} className="text-blue-400" />
                <span className="text-gray-300 text-sm">设为今日新训</span>
              </button>
              <button
                onClick={handleAddBlackPoint}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <AlertCircle size={16} className="text-red-400" />
                <span className="text-gray-300 text-sm">添加黑点</span>
              </button>
              <button
                onClick={handleAddLeave}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <Calendar size={16} className="text-yellow-400" />
                <span className="text-gray-300 text-sm">登记请假</span>
              </button>
              <button
                onClick={handleQuit}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <UserMinus size={16} className="text-orange-400" />
                <span className="text-gray-300 text-sm">退队处理</span>
              </button>
              <button
                onClick={() => setShowResetPasswordConfirm(true)}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <Key size={16} className="text-purple-400" />
                <span className="text-gray-300 text-sm">重置密码</span>
              </button>
            </div>
          </section>
        </div>

        {/* 底部操作按钮 */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            <LogOut size={16} />
            <span>关闭</span>
          </button>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
            >
              <Save size={16} />
              <span>编辑信息</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditedMember(member)
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                <Save size={16} />
                <span>保存</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 确认对话框 */}
      {showConfirm && (
        <ConfirmDialog
          title="设为今日新训"
          message={`确认将 ${member.nickname} 的最后新训日期设置为今天（${new Date().toLocaleDateString('zh-CN')}）吗？`}
          confirmText="确认设置"
          cancelText="取消"
          type="info"
          onConfirm={confirmSetTodayTraining}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* 添加黑点模态框 */}
      {showBlackPointModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">添加黑点</h2>
            
            <form onSubmit={submitBlackPoint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">黑点原因 *</label>
                <textarea
                  value={blackPointForm.reason}
                  onChange={(e) => setBlackPointForm({...blackPointForm, reason: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="请填写黑点原因"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">登记日期 *</label>
                <input
                  type="date"
                  value={blackPointForm.register_date}
                  onChange={(e) => setBlackPointForm({...blackPointForm, register_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition-colors"
                >
                  添加黑点
                </button>
                <button
                  type="button"
                  onClick={() => setShowBlackPointModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 登记请假模态框 */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">登记请假</h2>
            
            <form onSubmit={submitLeave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">请假原因</label>
                <textarea
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({...leaveForm, reason: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white h-24"
                  placeholder="可选填写"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">开始日期 *</label>
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({...leaveForm, start_date: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">结束日期 *</label>
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({...leaveForm, end_date: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    required
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg transition-colors"
                >
                  登记请假
                </button>
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 退队确认对话框 */}
      {showQuitConfirm && (
        <ConfirmDialog
          title="退队处理"
          message={`确认要将 ${member.nickname} 添加到退队审批吗？添加后该成员状态将变为"已退队"。`}
          confirmText="确认退队"
          cancelText="取消"
          type="warning"
          onConfirm={confirmQuit}
          onCancel={() => setShowQuitConfirm(false)}
        />
      )}

      {/* 重置密码确认对话框 */}
      {showResetPasswordConfirm && member && (
        <ConfirmDialog
          title="重置密码"
          message={`确认要将 ${member.nickname} 的密码重置为QQ号（${member.qq}）吗？`}
          confirmText="确认重置"
          cancelText="取消"
          type="warning"
          onConfirm={handleResetPassword}
          onCancel={() => setShowResetPasswordConfirm(false)}
        />
      )}
    </div>
  )
}
