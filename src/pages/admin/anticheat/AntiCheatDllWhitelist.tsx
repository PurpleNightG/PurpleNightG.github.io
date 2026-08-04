import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anticheatAPI, memberAPI } from '../../../utils/api'
import { toast } from '../../../utils/toast'
import { formatDateTime } from '../../../utils/dateFormat'
import ConfirmDialog from '../../../components/ConfirmDialog'
import SearchableSelect from '../../../components/SearchableSelect'
import MemberNameCell from '../../../components/MemberNameCell'
import { Loader2, Plus, Trash2, Shield, RefreshCw, Search } from 'lucide-react'

interface WhitelistRow {
  id: number
  member_id: number
  dll_name: string
  dll_path?: string | null
  note?: string | null
  created_by?: string | null
  created_at?: string | null
  member_name?: string | null
  avatar?: string | null
  member_qq?: string | null
}

export default function AntiCheatDllWhitelist() {
  const [rows, setRows] = useState<WhitelistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState<{ id: number; nickname: string }[]>([])
  const [form, setForm] = useState({
    member_id: 0 as number,
    dll_name: '',
    dll_path: '',
    note: '',
  })
  const [confirmDelete, setConfirmDelete] = useState<WhitelistRow | null>(null)

  const load = async (q = search) => {
    try {
      setLoading(true)
      const res = await anticheatAPI.getDllWhitelist(undefined, q.trim() || undefined)
      setRows(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载白名单失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    ;(async () => {
      try {
        const res = await memberAPI.getAll()
        setMembers((res.data || []).map((m: any) => ({ id: m.id, nickname: m.nickname })))
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const add = async () => {
    if (!form.member_id) {
      toast.error('请选择学员')
      return
    }
    if (!form.dll_name.trim()) {
      toast.error('请填写 DLL 文件名')
      return
    }
    try {
      setBusy(true)
      await anticheatAPI.addDllWhitelist({
        member_id: form.member_id,
        dll_name: form.dll_name.trim(),
        dll_path: form.dll_path.trim() || undefined,
        note: form.note.trim() || undefined,
      })
      toast.success('已加入白名单')
      setForm({ member_id: form.member_id, dll_name: '', dll_path: '', note: '' })
      await load()
    } catch (e: any) {
      toast.error(e.message || '添加失败')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: WhitelistRow) => {
    try {
      setBusy(true)
      await anticheatAPI.deleteDllWhitelist(row.id)
      toast.success('已移除')
      setConfirmDelete(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="text-purple-400" size={26} />
            DLL 白名单
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            全局按学员管理误报 DLL。与会话无关，删除考试会话后仍可在此查看与维护。
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-700 text-gray-100 hover:bg-gray-600"
        >
          <RefreshCw size={15} />
          刷新
        </button>
      </div>

      <div className="student-glass-panel student-glass-panel--static p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">手动添加</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">学员 *</label>
            <SearchableSelect
              options={members.map((m) => ({
                id: m.id,
                label: m.nickname,
                subLabel: `ID ${m.id}`,
              }))}
              value={form.member_id || ''}
              onChange={(value) => {
                const memberId = typeof value === 'string' ? parseInt(value, 10) : Number(value)
                setForm((prev) => ({ ...prev, member_id: memberId || 0 }))
              }}
              placeholder="搜索学员"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">DLL 文件名 *</label>
            <input
              value={form.dll_name}
              onChange={(e) => setForm((prev) => ({ ...prev, dll_name: e.target.value }))}
              className="student-glass-field text-sm py-2"
              placeholder="例如 xxx.dll"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">路径（可选）</label>
            <input
              value={form.dll_path}
              onChange={(e) => setForm((prev) => ({ ...prev, dll_path: e.target.value }))}
              className="student-glass-field text-sm py-2"
              placeholder="完整路径"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">备注（可选）</label>
            <input
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              className="student-glass-field text-sm py-2"
              placeholder="误报原因等"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={add}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          加入白名单
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(search)}
            className="student-glass-field text-sm py-2 pl-9"
            placeholder="搜索 DLL / 学员昵称 / 学员 ID"
          />
        </div>
        <button
          type="button"
          onClick={() => load(search)}
          className="px-3 py-2 rounded-lg bg-gray-700 text-gray-100 text-sm hover:bg-gray-600"
        >
          搜索
        </button>
        <span className="text-xs text-gray-500">共 {rows.length} 条</span>
      </div>

      <div className="student-glass-panel student-glass-panel--static overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-gray-500 py-14 text-sm">暂无白名单记录</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-300">
              <tr>
                <th className="px-3 py-2.5 text-left">学员</th>
                <th className="px-3 py-2.5 text-left">DLL</th>
                <th className="px-3 py-2.5 text-left">路径</th>
                <th className="px-3 py-2.5 text-left">备注</th>
                <th className="px-3 py-2.5 text-left">添加</th>
                <th className="px-3 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-t border-white/5 text-gray-200">
                  <td className="px-3 py-2.5">
                    <MemberNameCell name={w.member_name || `学员 #${w.member_id}`} avatar={w.avatar} qq={w.member_qq} />
                    <div className="text-[11px] text-gray-500">
                      ID {w.member_id}
                      {w.member_qq ? ` · QQ ${w.member_qq}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-purple-200">{w.dll_name}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 break-all max-w-xs">
                    {w.dll_path || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{w.note || '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {w.created_by || '-'}
                    <div>{formatDateTime(w.created_at)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(w)}
                      className="text-red-400 hover:text-red-300"
                      title="移除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-500">
        也可在{' '}
        <Link to="/admin/anticheat/monitor" className="text-purple-400 hover:text-purple-300">
          考试监控 → 会话详情
        </Link>{' '}
        中从注入日志一键加入某学员白名单。
      </p>

      {confirmDelete && (
        <ConfirmDialog
          title="移除白名单"
          message={`确定移除「${confirmDelete.dll_name}」（学员 ${confirmDelete.member_name || confirmDelete.member_id}）？`}
          confirmText="移除"
          cancelText="取消"
          type="danger"
          onConfirm={() => remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
