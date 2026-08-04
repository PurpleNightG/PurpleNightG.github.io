import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { anticheatAPI } from '../../../utils/api'
import { toast } from '../../../utils/toast'
import { formatDate, formatDateTime } from '../../../utils/dateFormat'
import ConfirmDialog from '../../../components/ConfirmDialog'
import MemberNameCell from '../../../components/MemberNameCell'
import { Loader2, RefreshCw, Download, CheckSquare, Square } from 'lucide-react'

interface Ticket {
  id: number
  member_id: number
  member_name: string
  avatar?: string | null
  qq?: string | null
  admission_ticket: string
  preferred_date: string
  approved_at: string
  imported: number
}

export default function AntiCheatTickets() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number[]>([])
  const [validDays, setValidDays] = useState(7)
  const [processing, setProcessing] = useState(false)
  const [configPrompt, setConfigPrompt] = useState<number | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const res = await anticheatAPI.getAvailableTickets()
      setTickets(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const available = tickets.filter((t) => !t.imported)
  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const toggleAll = () => {
    if (selected.length === available.length) setSelected([])
    else setSelected(available.map((t) => t.id))
  }

  const importOne = async (t: Ticket) => {
    try {
      setProcessing(true)
      const res = await anticheatAPI.importTicket({
        admission_ticket: t.admission_ticket,
        member_id: t.member_id,
        member_name: t.member_name,
        valid_days: validDays,
      })
      toast.success(`已导入 ${t.admission_ticket}`)
      await load()
      if (res.data?.id) {
        setConfigPrompt(res.data.id)
      }
    } catch (e: any) {
      toast.error(e.message || '导入失败')
    } finally {
      setProcessing(false)
    }
  }

  const importBatch = async () => {
    const list = available.filter((t) => selected.includes(t.id))
    if (!list.length) {
      toast.error('请先选择准考证')
      return
    }
    try {
      setProcessing(true)
      const res = await anticheatAPI.importTicketsBatch(
        list.map((t) => ({
          admission_ticket: t.admission_ticket,
          member_id: t.member_id,
          member_name: t.member_name,
        })),
        validDays
      )
      toast.success(`成功 ${res.data.successCount}，跳过 ${res.data.skipCount}`)
      setSelected([])
      await load()
    } catch (e: any) {
      toast.error(e.message || '批量导入失败')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">准考证导入</h1>
          <p className="text-sm text-gray-400 mt-1">从已通过的考核审批写入反作弊考核配置</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700/50 text-gray-200 hover:bg-gray-700"
        >
          <RefreshCw size={16} /> 刷新
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 student-glass-chip p-4">
        <label className="text-sm text-gray-300 flex items-center gap-2">
          有效天数
          <input
            type="number"
            min={1}
            max={365}
            value={validDays}
            onChange={(e) => setValidDays(Number(e.target.value) || 7)}
            className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
          />
        </label>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-700/60 text-gray-200"
        >
          {selected.length === available.length && available.length > 0 ? (
            <CheckSquare size={16} />
          ) : (
            <Square size={16} />
          )}
          全选未导入
        </button>
        <button
          onClick={importBatch}
          disabled={processing || !selected.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50"
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          批量导入 ({selected.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="student-glass-panel student-glass-panel--static overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-300">
              <tr>
                <th className="px-3 py-3 text-left w-10" />
                <th className="px-3 py-3 text-left">准考证</th>
                <th className="px-3 py-3 text-left">学员</th>
                <th className="px-3 py-3 text-left">期望日期</th>
                <th className="px-3 py-3 text-left">通过时间</th>
                <th className="px-3 py-3 text-left">状态</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t border-gray-700/40 text-gray-200">
                  <td className="px-3 py-2">
                    {!t.imported && (
                      <button onClick={() => toggle(t.id)} className="text-purple-400">
                        {selected.includes(t.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">{t.admission_ticket}</td>
                  <td className="px-3 py-2"><MemberNameCell name={t.member_name} avatar={t.avatar} qq={t.qq} /></td>
                  <td className="px-3 py-2">{formatDate(t.preferred_date)}</td>
                  <td className="px-3 py-2">{formatDateTime(t.approved_at)}</td>
                  <td className="px-3 py-2">
                    {t.imported ? (
                      <span className="text-emerald-400">已导入</span>
                    ) : (
                      <span className="text-amber-400">待导入</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!t.imported && (
                      <button
                        onClick={() => importOne(t)}
                        disabled={processing}
                        className="text-purple-400 hover:text-purple-300"
                      >
                        导入
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!tickets.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                    暂无已通过且带准考证的申请
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {configPrompt != null && (
        <ConfirmDialog
          title="配置考核"
          message="是否立即配置模组与开关？"
          confirmText="去配置"
          cancelText="稍后再说"
          type="info"
          onConfirm={() => {
            const id = configPrompt
            setConfigPrompt(null)
            navigate(`/admin/anticheat/configs?edit=${id}`)
          }}
          onCancel={() => setConfigPrompt(null)}
        />
      )}
    </div>
  )
}
