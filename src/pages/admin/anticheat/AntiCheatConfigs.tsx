import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { anticheatAPI } from '../../../utils/api'
import { toast } from '../../../utils/toast'
import { formatDateTime } from '../../../utils/dateFormat'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { filterPakFiles, hashPakFiles, type ModFileMeta } from '../../../utils/modHash'
import {
  Loader2,
  RefreshCw,
  Trash2,
  Settings2,
  CheckSquare,
  Square,
  FolderOpen,
  FilePlus,
  RotateCcw,
  X,
  Clock,
} from 'lucide-react'

function isTicketExpired(validUntil: string) {
  if (!validUntil) return false
  const t = new Date(validUntil.includes('T') ? validUntil : validUntil.replace(' ', 'T')).getTime()
  return !Number.isNaN(t) && t < Date.now()
}

interface ExamConfig {
  id: number
  admission_ticket: string
  member_name: string
  member_id: number
  valid_from: string
  valid_until: string
  exam_status: string
  map_pack_required: number | boolean
  require_antivirus_check: number | boolean
  focus_screenshot_enabled: number | boolean
  mod_count: number
  created_at: string
}

interface ModRow {
  id: number
  mod_filename: string
  mod_hash: string
  mod_size: number
  mod_path: string
}

function StyledCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-start gap-2 text-left group"
    >
      {checked ? (
        <CheckSquare size={18} className="text-purple-400 flex-shrink-0 mt-0.5" />
      ) : (
        <Square size={18} className="text-gray-500 group-hover:text-gray-400 flex-shrink-0 mt-0.5" />
      )}
      {label && <span className="text-sm text-gray-200">{label}</span>}
    </button>
  )
}

export default function AntiCheatConfigs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [configs, setConfigs] = useState<ExamConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [editConfig, setEditConfig] = useState<ExamConfig | null>(null)
  const [mods, setMods] = useState<ModRow[]>([])
  const [modSelected, setModSelected] = useState<number[]>([])
  const [scanned, setScanned] = useState<ModFileMeta[]>([])
  const [scanSelected, setScanSelected] = useState<number[]>([])
  const scannedRef = useRef<ModFileMeta[]>([])
  scannedRef.current = scanned
  const [hashing, setHashing] = useState(false)
  const [hashProgress, setHashProgress] = useState('')
  const [saving, setSaving] = useState(false)
  const [reactivateId, setReactivateId] = useState<number | null>(null)
  const [extendDays, setExtendDays] = useState(7)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    type?: 'danger' | 'warning' | 'info'
    confirmText?: string
    showCancel?: boolean
    onConfirm: () => void
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement | null>(null)

  const dirInputRef = useCallback((node: HTMLInputElement | null) => {
    dirRef.current = node
    if (node) {
      node.setAttribute('webkitdirectory', '')
      node.setAttribute('directory', '')
      ;(node as any).webkitdirectory = true
    }
  }, [])

  const showAlert = (title: string, message: string, type: 'danger' | 'warning' | 'info' = 'info') => {
    setConfirmDialog({
      title,
      message,
      type,
      confirmText: '知道了',
      showCancel: false,
      onConfirm: () => setConfirmDialog(null),
    })
  }

  const load = async () => {
    try {
      setLoading(true)
      const res = await anticheatAPI.getConfigs()
      setConfigs(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const edit = searchParams.get('edit')
    if (edit) {
      openEdit(Number(edit))
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const openEdit = async (id: number) => {
    try {
      setEditId(id)
      const [cfgRes, modsRes] = await Promise.all([
        anticheatAPI.getConfig(id),
        anticheatAPI.getMods(id),
      ])
      setEditConfig(cfgRes.data)
      setMods(modsRes.data || [])
      setModSelected([])
      setScanned([])
      scannedRef.current = []
      setScanSelected([])
    } catch (e: any) {
      toast.error(e.message || '打开配置失败')
      setEditId(null)
    }
  }

  const closeEdit = () => {
    setEditId(null)
    setEditConfig(null)
    load()
  }

  const patchSwitch = async (field: string, value: boolean) => {
    if (!editId || !editConfig) return
    try {
      await anticheatAPI.updateConfig(editId, { [field]: value })
      setEditConfig({ ...editConfig, [field]: value })
      toast.success('已保存')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    }
  }

  const onPickFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    const paks = filterPakFiles(fileList)
    if (!paks.length) {
      showAlert('未找到模组', '未找到可导入的 .pak（根目录原版 pakchunk0~24 已排除）', 'warning')
      return
    }
    try {
      setHashing(true)
      const metas = await hashPakFiles(paks, (done, total, name) => {
        setHashProgress(total ? `${done}/${total} ${name}` : '完成')
      })

      const prev = scannedRef.current
      const hashes = new Set(prev.map((m) => m.hash))
      const added = metas.filter((m) => !hashes.has(m.hash))
      const next = [...prev, ...added]
      scannedRef.current = next
      setScanned(next)
      setScanSelected((sel) => [
        ...new Set([...sel, ...added.map((_, i) => prev.length + i)]),
      ])

      const parts = [`本次识别 ${metas.length} 个 .pak`]
      if (added.length) parts.push(`新追加 ${added.length} 个`)
      const skipped = metas.length - added.length
      if (skipped) parts.push(`跳过重复 ${skipped} 个`)
      showAlert('扫描完成', parts.join('，') + '。', 'info')
    } catch (e: any) {
      showAlert('哈希计算失败', e.message || '哈希计算失败', 'danger')
    } finally {
      setHashing(false)
      setHashProgress('')
    }
  }

  const addSelectedMods = async () => {
    if (!editId) return
    const list = scanned.filter((_, i) => scanSelected.includes(i))
    if (!list.length) {
      showAlert('提示', '请先勾选要添加的模组', 'warning')
      return
    }
    try {
      setSaving(true)
      const res = await anticheatAPI.addMods(
        editId,
        list.map((m) => ({
          filename: m.filename,
          hash: m.hash,
          size: m.size,
          path: m.path,
        }))
      )
      toast.success(`已添加 ${res.data.successCount} 个`)
      const modsRes = await anticheatAPI.getMods(editId)
      setMods(modsRes.data || [])
      setScanned((prev) => prev.filter((_, i) => !scanSelected.includes(i)))
      setScanSelected([])
    } catch (e: any) {
      toast.error(e.message || '添加失败')
    } finally {
      setSaving(false)
    }
  }

  const removeMods = async (ids?: number[]) => {
    const target = ids || modSelected
    if (!target.length) return
    setConfirmDialog({
      title: '移除模组',
      message: `确认移除 ${target.length} 个模组？`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          setSaving(true)
          await anticheatAPI.batchDeleteMods(target)
          setMods((prev) => prev.filter((m) => !target.includes(m.id)))
          setModSelected((prev) => prev.filter((id) => !target.includes(id)))
          toast.success('已移除')
        } catch (e: any) {
          toast.error(e.message || '移除失败')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  const batchDelete = async () => {
    if (!selected.length) return
    setConfirmDialog({
      title: '删除考核配置',
      message: `确认删除 ${selected.length} 个考核配置？此操作不可恢复。`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          await anticheatAPI.batchDeleteConfigs(selected)
          setSelected([])
          toast.success('已删除')
          await load()
        } catch (e: any) {
          toast.error(e.message || '删除失败')
        }
      },
    })
  }

  const confirmReactivate = async () => {
    if (reactivateId == null) return
    try {
      const days = Math.min(365, Math.max(1, extendDays || 7))
      await anticheatAPI.reactivateConfig(reactivateId, days)
      toast.success(`已重新激活（延长 ${days} 天）`)
      setReactivateId(null)
      load()
    } catch (e: any) {
      toast.error(e.message || '激活失败')
    }
  }

  const formatSize = (n: number) => {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  }

  const allModsSelected = mods.length > 0 && modSelected.length === mods.length
  const allScanSelected = scanned.length > 0 && scanSelected.length === scanned.length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">考核配置</h1>
          <p className="text-sm text-gray-400 mt-1">开关、模组哈希（浏览器本地计算，不上传文件）</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={batchDelete}
            disabled={!selected.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/80 text-white disabled:opacity-40"
          >
            <Trash2 size={16} /> 批量删除
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700/50 text-gray-200"
          >
            <RefreshCw size={16} /> 刷新
          </button>
        </div>
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
                <th className="px-3 py-3 w-10" />
                <th className="px-3 py-3 text-left">准考证</th>
                <th className="px-3 py-3 text-left">学员</th>
                <th className="px-3 py-3 text-left">状态</th>
                <th className="px-3 py-3 text-left">有效期</th>
                <th className="px-3 py-3 text-left">模组数</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => {
                const expired = isTicketExpired(c.valid_until)
                return (
                <tr
                  key={c.id}
                  className={`border-t text-gray-200 ${
                    expired
                      ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/15'
                      : 'border-gray-700/40'
                  }`}
                >
                  <td className="px-3 py-2">
                    <StyledCheck
                      checked={selected.includes(c.id)}
                      onChange={() =>
                        setSelected((p) =>
                          p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <span className={expired ? 'text-red-200' : ''}>{c.admission_ticket}</span>
                      {expired && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/25 text-red-300 border border-red-500/50 font-sans">
                          <Clock size={10} /> 已过期
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.member_name}</td>
                  <td className="px-3 py-2">
                    <span className={expired ? 'text-red-300' : ''}>{c.exam_status}</span>
                    {expired && (
                      <div className="text-[10px] text-red-400/90 mt-0.5">有效期已过，需重新激活</div>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-xs ${expired ? 'text-red-300/90' : 'text-gray-400'}`}>
                    {formatDateTime(c.valid_from)} ~ {formatDateTime(c.valid_until)}
                  </td>
                  <td className="px-3 py-2">{c.mod_count}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button
                      onClick={() => openEdit(c.id)}
                      className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
                    >
                      <Settings2 size={14} /> 配置
                    </button>
                    {(c.exam_status !== '待开始' || expired) && (
                      <button
                        onClick={() => {
                          setExtendDays(7)
                          setReactivateId(c.id)
                        }}
                        className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                        title={expired ? '准考证已过期，可重新激活' : '重新激活'}
                      >
                        <RotateCcw size={14} /> 激活
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setConfirmDialog({
                          title: '删除考核配置',
                          message: `确认删除准考证 ${c.admission_ticket}（${c.member_name}）的考核配置？`,
                          type: 'danger',
                          onConfirm: async () => {
                            setConfirmDialog(null)
                            try {
                              await anticheatAPI.deleteConfig(c.id)
                              setConfigs((prev) => prev.filter((x) => x.id !== c.id))
                              toast.success('已删除')
                              await load()
                            } catch (e: any) {
                              toast.error(e.message || '删除失败')
                            }
                          },
                        })
                      }
                      className="text-red-400 hover:text-red-300 inline-flex items-center gap-1"
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  </td>
                </tr>
                )
              })}
              {!configs.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                    暂无考核配置，请先导入准考证
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editId && editConfig && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-5xl">
            <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 z-10 bg-[rgba(12,10,20,0.85)] backdrop-blur-md">
              <div>
                <h2 className="text-lg font-bold text-white">
                  配置 · {editConfig.admission_ticket} · {editConfig.member_name}
                </h2>
                <p className="text-xs text-gray-400">模组仅提交文件名 / SHA-256 / 大小，不上传 .pak</p>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-3 student-glass-panel student-glass-panel--static p-4">
                <StyledCheck
                  checked={!!editConfig.map_pack_required}
                  onChange={() => patchSwitch('map_pack_required', !editConfig.map_pack_required)}
                  label="需要学员解压考核地图"
                />
                <StyledCheck
                  checked={!!editConfig.require_antivirus_check}
                  onChange={() =>
                    patchSwitch('require_antivirus_check', !editConfig.require_antivirus_check)
                  }
                  label="需要学员关闭杀毒软件"
                />
                <StyledCheck
                  checked={!!editConfig.focus_screenshot_enabled}
                  onChange={() =>
                    patchSwitch('focus_screenshot_enabled', !editConfig.focus_screenshot_enabled)
                  }
                  label="窗口焦点变化时自动截图"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-gray-700 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-white">已配置模组 ({mods.length})</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setModSelected(allModsSelected ? [] : mods.map((m) => m.id))
                        }
                        className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-200 inline-flex items-center gap-1"
                      >
                        {allModsSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                        全选
                      </button>
                      <button
                        onClick={() => removeMods()}
                        disabled={!modSelected.length || saving}
                        className="text-xs px-2 py-1 rounded bg-red-600/70 text-white disabled:opacity-40"
                      >
                        批量移除
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {mods.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start gap-2 text-xs text-gray-300 p-1.5 rounded hover:bg-white/5"
                      >
                        <StyledCheck
                          checked={modSelected.includes(m.id)}
                          onChange={() =>
                            setModSelected((p) =>
                              p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]
                            )
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-white truncate">{m.mod_filename}</div>
                          <div className="text-gray-500 font-mono truncate">
                            {m.mod_hash.slice(0, 16)}… · {formatSize(m.mod_size)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMods([m.id])}
                          className="text-red-400 hover:text-red-300 p-0.5 flex-shrink-0"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {!mods.length && <p className="text-gray-500 text-xs py-4 text-center">暂无模组</p>}
                  </div>
                </div>

                <div className="border border-gray-700 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <h3 className="text-sm font-medium text-white">本地扫描结果</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={hashing}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-700 text-gray-200"
                      >
                        <FilePlus size={14} /> 选 .pak
                      </button>
                      <button
                        onClick={() => dirRef.current?.click()}
                        disabled={hashing}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-700 text-white"
                      >
                        <FolderOpen size={14} /> 选文件夹
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setScanSelected(allScanSelected ? [] : scanned.map((_, i) => i))
                        }
                        disabled={!scanned.length}
                        className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-200 inline-flex items-center gap-1 disabled:opacity-40"
                      >
                        {allScanSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                        全选
                      </button>
                      <button
                        onClick={addSelectedMods}
                        disabled={!scanSelected.length || saving || hashing}
                        className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-40"
                      >
                        批量添加
                      </button>
                    </div>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".pak"
                    className="hidden"
                    onChange={(e) => {
                      onPickFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <input
                    ref={dirInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => {
                      onPickFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  {hashing && (
                    <p className="text-xs text-purple-300 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> 计算哈希中… {hashProgress}
                    </p>
                  )}
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {scanned.map((m, i) => (
                      <div
                        key={`${m.hash}-${i}`}
                        className="flex items-start gap-2 text-xs text-gray-300 p-1.5 rounded hover:bg-white/5"
                      >
                        <StyledCheck
                          checked={scanSelected.includes(i)}
                          onChange={() =>
                            setScanSelected((p) =>
                              p.includes(i) ? p.filter((x) => x !== i) : [...p, i]
                            )
                          }
                        />
                        <div className="min-w-0">
                          <div className="text-white truncate">{m.path}</div>
                          <div className="text-gray-500 font-mono truncate">
                            {m.hash.slice(0, 16)}… · {formatSize(m.size)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!scanned.length && !hashing && (
                      <p className="text-gray-500 text-xs py-4 text-center">
                        选择 Paks 目录或 .pak 文件后在此显示
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {reactivateId != null && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" aria-hidden />
          <div className="relative z-10 glass-modal-frame w-full max-w-sm">
            <div className="glass-modal-tilt">
          <div className="student-glass-panel student-glass-panel--static student-glass-modal w-full p-5 space-y-4">
            <h3 className="text-lg font-bold text-white">重新激活准考证</h3>
            <p className="text-sm text-gray-400">将状态改为「待开始」，并延长有效期。</p>
            <label className="block space-y-1.5">
              <span className="text-sm text-gray-300">延长天数</span>
              <input
                type="number"
                min={1}
                max={365}
                value={extendDays}
                onChange={(e) => setExtendDays(Number(e.target.value) || 7)}
                className="student-glass-field"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReactivateId(null)}
                className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-200"
              >
                取消
              </button>
              <button
                onClick={confirmReactivate}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white"
              >
                确认激活
              </button>
            </div>
          </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type || 'danger'}
          confirmText={confirmDialog.confirmText || '确认'}
          showCancel={confirmDialog.showCancel !== false}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
