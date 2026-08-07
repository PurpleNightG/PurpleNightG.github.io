import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { anticheatAPI } from '../../../utils/api'
import { toast } from '../../../utils/toast'
import { formatDateTime } from '../../../utils/dateFormat'
import ConfirmDialog from '../../../components/ConfirmDialog'
import MemberNameCell from '../../../components/MemberNameCell'
import PageSkeleton from '../../../components/Skeleton'
import { Loader2, RefreshCw, CheckSquare, Square, Eye, Camera, Trash2, StopCircle, CheckCircle, Monitor } from 'lucide-react'

interface Session {
  id: number
  exam_config_id: number
  steam_username: string
  start_time: string
  end_time: string | null
  end_reason: string | null
  last_heartbeat: string | null
  admission_ticket: string
  member_name: string
  avatar?: string | null
  qq?: string | null
  exam_status: string
  is_alive: number
}

const POLL_MS = 8000

export default function AntiCheatMonitor() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    type?: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  } | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await anticheatAPI.getSessions(100)
      setSessions(res.data || [])
    } catch (e: any) {
      if (!silent) toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    timer.current = setInterval(() => load(true), POLL_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  const toggle = (id: number) => {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const runBatch = async (action: string) => {
    if (!selected.length) {
      toast.error('请先选择会话')
      return
    }
    const labels: Record<string, string> = {
      end: '批量结束',
      terminate: '批量强制终止',
      delete: '批量删除',
      screenshot: '请求截图',
    }
    const doRun = async () => {
      try {
        setBusy(true)
        if (action === 'end') await anticheatAPI.batchEndSessions(selected)
        else if (action === 'terminate') await anticheatAPI.batchTerminateSessions(selected)
        else if (action === 'delete') {
          await anticheatAPI.batchDeleteSessions(selected)
          setSelected([])
        } else if (action === 'screenshot') await anticheatAPI.batchRequestScreenshot(selected)
        toast.success('操作完成')
        await load(true)
      } catch (e: any) {
        toast.error(e.message || '操作失败')
      } finally {
        setBusy(false)
      }
    }
    if (action === 'screenshot') {
      await doRun()
      return
    }
    setConfirmDialog({
      title: labels[action] || '确认操作',
      message: `确认${labels[action]} ${selected.length} 个会话？`,
      type: action === 'delete' ? 'danger' : 'warning',
      onConfirm: () => {
        setConfirmDialog(null)
        doRun()
      },
    })
  }

  const askConfirm = (
    title: string,
    message: string,
    type: 'danger' | 'warning' | 'info',
    fn: () => Promise<void>
  ) => {
    setConfirmDialog({
      title,
      message,
      type,
      onConfirm: () => {
        setConfirmDialog(null)
        fn().catch((e: any) => toast.error(e.message || '操作失败'))
      },
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Monitor className="text-purple-400" size={26} />
            考试监控
          </h1>
          <p className="text-sm text-gray-400 mt-1">约 {POLL_MS / 1000}s 自动刷新 · 心跳超时 30s 视为断连</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700/50 text-gray-200"
        >
          <RefreshCw size={16} /> 刷新
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => runBatch('end')}
          disabled={busy}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50"
        >
          <CheckCircle size={14} /> 批量结束
        </button>
        <button
          onClick={() => runBatch('terminate')}
          disabled={busy}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-orange-600 text-white disabled:opacity-50"
        >
          <StopCircle size={14} /> 批量强制终止
        </button>
        <button
          onClick={() => runBatch('delete')}
          disabled={busy}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50"
        >
          <Trash2 size={14} /> 批量删除
        </button>
        <button
          onClick={() => runBatch('screenshot')}
          disabled={busy}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50"
        >
          <Camera size={14} /> 请求截图
        </button>
      </div>

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : (
        <div className="student-glass-panel student-glass-panel--static overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-300">
              <tr>
                <th className="px-3 py-3 w-10" />
                <th className="px-3 py-3 text-left">学员</th>
                <th className="px-3 py-3 text-left">准考证</th>
                <th className="px-3 py-3 text-left">Steam</th>
                <th className="px-3 py-3 text-left">开始</th>
                <th className="px-3 py-3 text-left">心跳</th>
                <th className="px-3 py-3 text-left">状态</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const active = !s.end_time
                return (
                  <tr key={s.id} className="border-t border-gray-700/40 text-gray-200">
                    <td className="px-3 py-2">
                      <button onClick={() => toggle(s.id)}>
                        {selected.includes(s.id) ? (
                          <CheckSquare size={16} className="text-purple-400" />
                        ) : (
                          <Square size={16} className="text-gray-500" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2"><MemberNameCell name={s.member_name} avatar={s.avatar} qq={s.qq} /></td>
                    <td className="px-3 py-2 font-mono text-xs">{s.admission_ticket}</td>
                    <td className="px-3 py-2">{s.steam_username || '-'}</td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(s.start_time)}</td>
                    <td className="px-3 py-2 text-xs">
                      {active ? (
                        s.is_alive ? (
                          <span className="text-emerald-400">在线</span>
                        ) : (
                          <span className="text-red-400">断连</span>
                        )
                      ) : (
                        <span className="text-gray-500">已结束</span>
                      )}
                      <div className="text-gray-500">{formatDateTime(s.last_heartbeat)}</div>
                    </td>
                    <td className="px-3 py-2">
                      {s.end_time ? (
                        <span className="text-gray-400" title={s.end_reason || ''}>
                          {s.exam_status}
                        </span>
                      ) : (
                        <span className="text-amber-400">{s.exam_status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/admin/anticheat/sessions/${s.id}`)}
                        className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
                      >
                        <Eye size={14} /> 详情
                      </button>
                      {active && (
                        <>
                          <button
                            onClick={() =>
                              askConfirm('结束考核', '确认结束该考核会话？', 'warning', async () => {
                                await anticheatAPI.endSession(s.id)
                                toast.success('已结束')
                                await load(true)
                              })
                            }
                            className="text-emerald-400 inline-flex items-center gap-1"
                          >
                            <CheckCircle size={14} /> 结束
                          </button>
                          <button
                            onClick={() =>
                              askConfirm('强制终止', '确认强制终止该考核会话？', 'warning', async () => {
                                await anticheatAPI.terminateSession(s.id)
                                toast.success('已终止')
                                await load(true)
                              })
                            }
                            className="text-orange-400 inline-flex items-center gap-1"
                          >
                            <StopCircle size={14} /> 终止
                          </button>
                        </>
                      )}
                      <button
                        onClick={() =>
                          askConfirm(
                            '删除会话',
                            '确认删除会话及关联日志/截图？此操作不可恢复。',
                            'danger',
                            async () => {
                              await anticheatAPI.deleteSession(s.id)
                              setSessions((prev) => prev.filter((x) => x.id !== s.id))
                              toast.success('已删除')
                              await load(true)
                            }
                          )
                        }
                        className="text-red-400 inline-flex items-center gap-1"
                      >
                        <Trash2 size={14} /> 删除
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!sessions.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                    暂无考试会话
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type || 'warning'}
          confirmText="确认"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
