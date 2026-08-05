import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, AlertCircle, Calendar, Save, Loader2, Pencil, CalendarDays } from 'lucide-react'
import { assistantAPI } from '../../utils/api'
import { formatDate, formatDateTime, toInputDate, formatDateForDB } from '../../utils/dateFormat'
import { getRoleColor } from '../../utils/roleColors'
import { toast } from '../../utils/toast'
import DateInput from '../../components/DateInput'
import StyledSelect from '../../components/StyledSelect'
import MemberAvatar from '../../components/MemberAvatar'
import ConfirmDialog from '../../components/ConfirmDialog'

const MEMBER_EDIT_STATUSES = ['正常', '其他']

interface Props {
  memberId: number
  onClose: () => void
  onUpdate?: () => void
}

export default function AssistantStudentDetail({ memberId, onClose, onUpdate }: Props) {
  const [member, setMember] = useState<any>(null)
  const [blackPoints, setBlackPoints] = useState<any[]>([])
  const [leaveRecords, setLeaveRecords] = useState<any[]>([])
  const [endLeaveTarget, setEndLeaveTarget] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedMember, setEditedMember] = useState<any>({})
  const [remarks, setRemarks] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await assistantAPI.studentDetail(memberId)
      const m = res.data?.member
      setMember(m)
      setEditedMember({
        ...m,
        join_date: toInputDate(m.join_date),
        last_training_date: toInputDate(m.last_training_date),
        phase3_reached_at: toInputDate(m.phase3_reached_at),
      })
      setRemarks(m.remarks || '')
      setBlackPoints(res.data?.blackPoints || [])
      setLeaveRecords(res.data?.leaveRecords || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [memberId])

  const cancelEdit = () => {
    setIsEditing(false)
    setEditedMember({
      ...member,
      join_date: toInputDate(member.join_date),
      last_training_date: toInputDate(member.last_training_date),
      phase3_reached_at: toInputDate(member.phase3_reached_at),
    })
    setRemarks(member.remarks || '')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      const nextNick = (editedMember.nickname || '').trim()
      const nextQq = (editedMember.qq || '').trim()
      const nextGame = (editedMember.game_id || '').trim() || null
      const nextJoin = formatDateForDB(editedMember.join_date)
      const nextPhase3 = formatDateForDB(editedMember.phase3_reached_at)
      const nextTraining = formatDateForDB(editedMember.last_training_date)
      const nextStatus = editedMember.status || '正常'
      const nextRemarks = (remarks || '').trim() || null

      if (nextNick !== (member.nickname || '')) payload.nickname = nextNick
      if (nextQq !== (member.qq || '')) payload.qq = nextQq
      if ((nextGame || null) !== (member.game_id || null)) payload.game_id = nextGame
      if ((nextJoin || null) !== (formatDateForDB(member.join_date) || null)) payload.join_date = nextJoin
      if ((nextPhase3 || null) !== (formatDateForDB(member.phase3_reached_at) || null)) {
        payload.phase3_reached_at = nextPhase3
      }
      if (nextStatus !== (member.status || '')) payload.status = nextStatus
      if ((nextRemarks || null) !== (member.remarks || null)) payload.remarks = nextRemarks

      const trainingChanged =
        (nextTraining || null) !== (formatDateForDB(member.last_training_date) || null)

      if (Object.keys(payload).length === 0 && !trainingChanged) {
        toast.error('没有实际变更的字段')
        return
      }

      if (trainingChanged) {
        await assistantAPI.setLastTrainingDate(memberId, nextTraining || undefined)
        setMember((prev: any) => (prev ? { ...prev, last_training_date: nextTraining } : prev))
      }

      if (Object.keys(payload).length > 0) {
        const res = await assistantAPI.proposeEdit(memberId, payload)
        toast.success(
          trainingChanged
            ? `${res.message || '已提交审批'}；最后新训日已直接更新`
            : res.message || '已提交，等待管理审批'
        )
      } else {
        toast.success('已更新最后新训日期')
      }

      setIsEditing(false)
      onUpdate?.()
    } catch (e: any) {
      toast.error(e.message || '提交失败')
    } finally {
      setSaving(false)
    }
  }

  const activeBlackPoints = blackPoints.filter((bp) => bp.status === '生效中').length

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
        <div className="relative z-10 glass-modal-frame w-full max-w-sm">
          <div className="glass-modal-tilt">
            <div className="student-glass-panel student-glass-panel--static student-glass-modal p-8">
              <div className="text-white">加载中...</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!member) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 glass-modal-backdrop" aria-hidden onClick={onClose} />
      <div className="relative z-10 glass-modal-frame w-full max-w-4xl">
        <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full max-h-[90vh] flex flex-col">
            <div className="shrink-0 border-b border-white/10 px-6 py-4 flex justify-between items-center bg-white/[0.04]">
              <div className="min-w-0 pr-3">
                <h2 className="text-xl font-bold text-white truncate">学员详细信息</h2>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  编辑后保存：最后新训日直接生效，其他字段需审批；黑点/请假请用侧栏独立页面
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="student-glass-chip inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5 text-sm text-blue-200 hover:text-white"
                  >
                    <Pencil size={14} />
                    编辑
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="student-glass-chip inline-flex items-center shrink-0 whitespace-nowrap px-3 py-1.5 text-sm text-gray-300 hover:text-white"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="student-glass-chip inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5 text-sm text-purple-200 hover:text-white border-purple-400/35 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {saving ? '提交中...' : '提交审批'}
                    </button>
                  </>
                )}
                <button type="button" onClick={onClose} className="text-gray-400 hover:text-white p-1">
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 sidebar-scrollbar">
              <section>
                <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">基本信息</h3>
                <div className="mb-5 flex flex-wrap items-center gap-4">
                  <MemberAvatar avatar={member.avatar} qq={member.qq} name={member.nickname} size="lg" />
                  <p className="text-xs text-gray-500">头像仅供查看，助教不可修改</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">昵称：</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedMember.nickname || ''}
                        onChange={(e) => setEditedMember({ ...editedMember, nickname: e.target.value })}
                        className="student-glass-field text-sm py-1.5"
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
                        onChange={(e) => setEditedMember({ ...editedMember, qq: e.target.value })}
                        className="student-glass-field text-sm py-1.5"
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
                        onChange={(e) => setEditedMember({ ...editedMember, game_id: e.target.value })}
                        className="student-glass-field text-sm py-1.5"
                      />
                    ) : (
                      <span className="text-white">{member.game_id || '-'}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">阶段&角色：</label>
                    <span className={`student-glass-badge ${getRoleColor(member.stage_role)}`}>
                      {member.stage_role}
                    </span>
                    <p className="text-[11px] text-gray-500 mt-1">阶段请使用列表中的「改阶段」</p>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">加入时间：</label>
                    {isEditing ? (
                      <DateInput
                        size="sm"
                        value={toInputDate(editedMember.join_date)}
                        onChange={(value) => setEditedMember({ ...editedMember, join_date: value })}
                      />
                    ) : (
                      <span className="text-white">{formatDate(member.join_date)}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">最后新训日期：</label>
                    {isEditing ? (
                      <DateInput
                        size="sm"
                        value={toInputDate(editedMember.last_training_date)}
                        onChange={(value) => setEditedMember({ ...editedMember, last_training_date: value })}
                      />
                    ) : (
                      <span className="text-white">{formatDate(member.last_training_date)}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">首次达三期日期：</label>
                    {isEditing ? (
                      <DateInput
                        size="sm"
                        value={toInputDate(editedMember.phase3_reached_at)}
                        onChange={(value) => setEditedMember({ ...editedMember, phase3_reached_at: value })}
                      />
                    ) : (
                      <span className="text-white">{formatDate(member.phase3_reached_at)}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">状态：</label>
                    {isEditing ? (
                      <StyledSelect
                        size="sm"
                        options={MEMBER_EDIT_STATUSES}
                        value={editedMember.status || '正常'}
                        onChange={(value) => setEditedMember({ ...editedMember, status: value })}
                      />
                    ) : (
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          member.status === '正常'
                            ? 'bg-green-600/20 text-green-300'
                            : member.status === '请假中'
                              ? 'bg-yellow-600/20 text-yellow-300'
                              : 'bg-gray-600/20 text-gray-300'
                        }`}
                      >
                        {member.status}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm">黑点数量：</label>
                    <span
                      className={`px-2 py-1 rounded text-xs ml-2 ${
                        activeBlackPoints > 0 ? 'bg-red-600/20 text-red-300' : 'bg-green-600/20 text-green-300'
                      }`}
                    >
                      {activeBlackPoints}
                    </span>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-gray-400 text-sm">创建时间：</label>
                    <span className="text-white ml-2">{formatDateTime(member.created_at)}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">备注信息</h3>
                <textarea
                  value={remarks}
                  onChange={(e) => {
                    setRemarks(e.target.value)
                    if (!isEditing) setIsEditing(true)
                  }}
                  className="student-glass-field h-24"
                  placeholder="可在此添加备注（修改后需提交审批）..."
                />
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">黑点记录</h3>
                {blackPoints.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">时间</th>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">原因</th>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {blackPoints.map((bp) => (
                          <tr key={bp.id}>
                            <td className="px-4 py-2 text-sm text-gray-300">{formatDate(bp.register_date)}</td>
                            <td className="px-4 py-2 text-sm text-gray-300">{bp.reason}</td>
                            <td className="px-4 py-2 text-sm">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  bp.status === '生效中' ? 'bg-red-600/20 text-red-300' : 'bg-gray-600/20 text-gray-300'
                                }`}
                              >
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

              <section>
                <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">请假记录</h3>
                {leaveRecords.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">开始</th>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">结束</th>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">原因</th>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">状态</th>
                          <th className="px-4 py-2 text-left text-sm text-gray-300">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {leaveRecords.map((lr) => (
                          <tr key={lr.id}>
                            <td className="px-4 py-2 text-sm text-gray-300">{formatDate(lr.start_date)}</td>
                            <td className="px-4 py-2 text-sm text-gray-300">{formatDate(lr.end_date)}</td>
                            <td className="px-4 py-2 text-sm text-gray-300">{lr.reason || '-'}</td>
                            <td className="px-4 py-2 text-sm">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  lr.status === '请假中'
                                    ? 'bg-yellow-600/20 text-yellow-300'
                                    : lr.status === '待结束审批'
                                      ? 'bg-orange-600/20 text-orange-300'
                                      : 'bg-gray-600/20 text-gray-300'
                                }`}
                              >
                                {lr.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {(lr.status === '请假中' || lr.status === '待结束审批') ? (
                                <button
                                  type="button"
                                  className="text-rose-300 hover:text-rose-200 text-xs"
                                  onClick={() => setEndLeaveTarget(lr)}
                                >
                                  提前结束
                                </button>
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar size={40} className="mx-auto mb-2 opacity-50" />
                    <p>暂无请假记录</p>
                  </div>
                )}
              </section>
            </div>

            <div className="shrink-0 border-t border-white/10 px-6 py-4 flex flex-wrap gap-3 bg-white/[0.03]">
              <Link
                to="/assistant/black-points"
                onClick={onClose}
                className="student-glass-chip inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-200 hover:text-white"
              >
                <AlertCircle size={14} />
                去登记黑点
              </Link>
              <Link
                to="/assistant/leaves"
                onClick={onClose}
                className="student-glass-chip inline-flex items-center gap-1.5 px-3 py-2 text-sm text-amber-200 hover:text-white"
              >
                <CalendarDays size={14} />
                去登记请假
              </Link>
            </div>
          </div>
        </div>
      </div>

      {endLeaveTarget && (
        <ConfirmDialog
          title="提前结束请假"
          message="确认提前结束该请假？结束后学员状态恢复正常，并进入 7 天缓冲期。"
          confirmText="提前结束"
          type="danger"
          onConfirm={async () => {
            try {
              const res = await assistantAPI.endLeaveEarly(endLeaveTarget.id)
              toast.success(res.message || '已提前结束')
              setEndLeaveTarget(null)
              load()
              onUpdate?.()
            } catch (e: any) {
              toast.error(e.message || '操作失败')
            }
          }}
          onCancel={() => setEndLeaveTarget(null)}
        />
      )}
    </div>
  )
}
