import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { anticheatAPI } from '../../../utils/api'
import { toast } from '../../../utils/toast'
import { formatDateTime } from '../../../utils/dateFormat'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { Loader2, ArrowLeft, Camera, ChevronLeft, ChevronRight, Download, ChevronDown, CheckSquare, Square, Plus, Trash2, Shield } from 'lucide-react'
import { buildZipStore, base64ToUint8Array } from '../../../utils/zipStore'

type Tab = 'info' | 'logs' | 'screenshots' | 'snapshots' | 'processes' | 'client' | 'dll'

const LOG_TYPES = [
  '',
  '窗口切换',
  '任务切换',
  'Steam窗口',
  '文件变更',
  '进程检测',
  '作弊行为',
  '系统消息',
  'DLL注入',
  '严重违规',
]

function severityRowClass(severity: string, logType?: string) {
  const s = (severity || '').toLowerCase()
  const t = logType || ''
  // 用 inset shadow 标严重级别，避免 border-l 把行挤开导致表头左侧露缝
  if (s === 'error' || t === '严重违规' || t === '作弊行为' || t === 'DLL注入') {
    return 'bg-red-500/10 text-red-200 shadow-[inset_3px_0_0_#ef4444]'
  }
  if (s === 'warning' || t === '窗口切换' || t === '任务切换') {
    return 'bg-amber-500/10 text-amber-100 shadow-[inset_3px_0_0_#f59e0b]'
  }
  return 'text-gray-300'
}

function formatFileSize(n: number | string | null | undefined) {
  const num = typeof n === 'string' ? Number(n) : Number(n ?? 0)
  if (!Number.isFinite(num) || num < 0) return '-'
  if (num < 1024) return `${num} B`
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
  if (num < 1024 * 1024 * 1024) return `${(num / 1024 / 1024).toFixed(1)} MB`
  return `${(num / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function snapshotTypeLabel(t: string) {
  if (t === 'mod') return '模组'
  if (t === 'binary') return '二进制'
  return t || '其他'
}

function severityBadge(severity: string) {
  const s = (severity || 'info').toLowerCase()
  if (s === 'error') return 'bg-red-500/20 text-red-300'
  if (s === 'warning') return 'bg-amber-500/20 text-amber-300'
  return 'bg-gray-600/40 text-gray-300'
}

function yn(v: unknown) {
  return v ? '是' : '否'
}

function durationText(start?: string, end?: string | null) {
  if (!start) return '-'
  const a = new Date(start.replace(' ', 'T')).getTime()
  const b = end ? new Date(end.replace(' ', 'T')).getTime() : Date.now()
  if (Number.isNaN(a) || Number.isNaN(b)) return '-'
  const sec = Math.max(0, Math.floor((b - a) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function AntiCheatSessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const sessionId = Number(id)
  const [tab, setTab] = useState<Tab>('info')
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [logs, setLogs] = useState<any[]>([])
  const [logPage, setLogPage] = useState(1)
  const [logTotal, setLogTotal] = useState(0)
  const [logType, setLogType] = useState('')

  const [shots, setShots] = useState<any[]>([])
  const [shotUrls, setShotUrls] = useState<Record<number, string>>({})
  const [loadingShots, setLoadingShots] = useState(false)
  const [shotsLoadProgress, setShotsLoadProgress] = useState({ done: 0, total: 0 })
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const [snapshots, setSnapshots] = useState<any[]>([])
  const [processes, setProcesses] = useState<any[]>([])
  const [procPage, setProcPage] = useState(1)
  const [procTotal, setProcTotal] = useState(0)
  const [clientLogs, setClientLogs] = useState<any[]>([])
  const [clientPage, setClientPage] = useState(1)
  const [clientTotal, setClientTotal] = useState(0)
  const [clientShowAll, setClientShowAll] = useState(false)
  const [logTypeOpen, setLogTypeOpen] = useState(false)
  const [downloadingShot, setDownloadingShot] = useState<number | null>(null)
  const [shotSelected, setShotSelected] = useState<number[]>([])
  const [batchDownloading, setBatchDownloading] = useState(false)
  const [injectionDlls, setInjectionDlls] = useState<any[]>([])
  const [memberDllWhitelist, setMemberDllWhitelist] = useState<any[]>([])
  const [dllBusy, setDllBusy] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    type?: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  } | null>(null)

  const loadSession = async () => {
    const res = await anticheatAPI.getSession(sessionId)
    setSession(res.data)
  }

  useEffect(() => {
    if (!sessionId) return
    ;(async () => {
      try {
        setLoading(true)
        await loadSession()
      } catch (e: any) {
        toast.error(e.message || '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || tab !== 'logs') return
    ;(async () => {
      try {
        const res = await anticheatAPI.getSessionLogs(sessionId, {
          page: logPage,
          limit: 50,
          log_type: logType || undefined,
        })
        setLogs(res.data || [])
        setLogTotal(res.pagination?.total || 0)
      } catch (e: any) {
        toast.error(e.message || '加载日志失败')
      }
    })()
  }, [sessionId, tab, logPage, logType])

  useEffect(() => {
    if (!sessionId || tab !== 'screenshots') return
    let cancelled = false
    ;(async () => {
      try {
        setLoadingShots(true)
        setShotUrls({})
        setPreviewIndex(null)
        const res = await anticheatAPI.getSessionScreenshots(sessionId)
        if (cancelled) return
        const list = res.data || []
        setShots(list)
        setShotSelected([])
        setShotsLoadProgress({ done: 0, total: list.length })
        if (!list.length) {
          setLoadingShots(false)
          return
        }
        const urls: Record<number, string> = {}
        const concurrency = 4
        for (let i = 0; i < list.length; i += concurrency) {
          if (cancelled) return
          const batch = list.slice(i, i + concurrency)
          await Promise.all(
            batch.map(async (shot: any) => {
              try {
                const img = await anticheatAPI.getScreenshot(shot.id)
                if (cancelled) return
                urls[shot.id] = `data:${img.data.contentType || 'image/png'};base64,${img.data.base64}`
              } catch {
                /* skip */
              }
            })
          )
          if (!cancelled) {
            setShotUrls({ ...urls })
            setShotsLoadProgress({ done: Math.min(i + batch.length, list.length), total: list.length })
          }
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e.message || '加载截图列表失败')
      } finally {
        if (!cancelled) setLoadingShots(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, tab])

  useEffect(() => {
    if (previewIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewIndex(null)
      if (e.key === 'ArrowLeft') {
        setPreviewIndex((i) => (i == null || !shots.length ? i : (i - 1 + shots.length) % shots.length))
      }
      if (e.key === 'ArrowRight') {
        setPreviewIndex((i) => (i == null || !shots.length ? i : (i + 1) % shots.length))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewIndex, shots.length])

  useEffect(() => {
    if (!sessionId || tab !== 'snapshots') return
    ;(async () => {
      try {
        const res = await anticheatAPI.getSessionSnapshots(sessionId)
        setSnapshots(res.data || [])
      } catch (e: any) {
        toast.error(e.message || '加载快照失败')
      }
    })()
  }, [sessionId, tab])

  useEffect(() => {
    if (!sessionId || tab !== 'processes') return
    ;(async () => {
      try {
        const res = await anticheatAPI.getSessionProcesses(sessionId, procPage, 50)
        setProcesses(res.data || [])
        setProcTotal(res.pagination?.total || 0)
      } catch (e: any) {
        toast.error(e.message || '加载进程失败')
      }
    })()
  }, [sessionId, tab, procPage])

  useEffect(() => {
    if (!sessionId || tab !== 'client') return
    ;(async () => {
      try {
        const limit = clientShowAll ? 5000 : 50
        const page = clientShowAll ? 1 : clientPage
        const res = await anticheatAPI.getClientLogs(sessionId, page, limit)
        setClientLogs(res.data || [])
        setClientTotal(res.pagination?.total || 0)
      } catch (e: any) {
        toast.error(e.message || '加载学员端日志失败')
      }
    })()
  }, [sessionId, tab, clientPage, clientShowAll])

  const getShotUrl = async (shotId: number) => {
    if (shotUrls[shotId]) return shotUrls[shotId]
    const res = await anticheatAPI.getScreenshot(shotId)
    const url = `data:${res.data.contentType || 'image/png'};base64,${res.data.base64}`
    setShotUrls((prev) => ({ ...prev, [shotId]: url }))
    return url
  }

  const downloadShot = async (shotId: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      setDownloadingShot(shotId)
      const url = await getShotUrl(shotId)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${sessionId}-screenshot-${shotId}.png`
      a.click()
      toast.success('已开始下载')
    } catch (err: any) {
      toast.error(err.message || '下载失败')
    } finally {
      setDownloadingShot(null)
    }
  }

  const batchDownloadShots = async () => {
    const ids = shotSelected.length ? shotSelected : shots.map((s: any) => s.id)
    if (!ids.length) {
      toast.error('没有可下载的截图')
      return
    }
    try {
      setBatchDownloading(true)
      const files: Array<{ name: string; data: Uint8Array }> = []
      for (const id of ids) {
        const url = await getShotUrl(id)
        const base64 = url.split(',')[1]
        files.push({
          name: `screenshot-${id}.png`,
          data: base64ToUint8Array(base64),
        })
      }
      const blob = buildZipStore(files)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `session-${sessionId}-screenshots.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success(`已打包 ${files.length} 张截图`)
    } catch (e: any) {
      toast.error(e.message || '批量下载失败')
    } finally {
      setBatchDownloading(false)
    }
  }

  const requestShot = async () => {
    try {
      await anticheatAPI.requestScreenshot(sessionId)
      toast.success('已请求截图，稍候刷新列表')
    } catch (e: any) {
      toast.error(e.message || '请求失败')
    }
  }

  useEffect(() => {
    if (!sessionId || tab !== 'dll' || !session?.member_id) return
    ;(async () => {
      try {
        const [inj, wl] = await Promise.all([
          anticheatAPI.getSessionInjectionDlls(sessionId),
          anticheatAPI.getDllWhitelist(session.member_id),
        ])
        setInjectionDlls(inj.data?.dlls || [])
        setMemberDllWhitelist(wl.data || [])
      } catch (e: any) {
        toast.error(e.message || '加载 DLL 白名单失败')
      }
    })()
  }, [sessionId, tab, session?.member_id])

  const addDllToMemberWhitelist = async (dll_name: string, dll_path?: string | null) => {
    if (!session?.member_id) {
      toast.error('会话缺少学员 ID')
      return
    }
    try {
      setDllBusy(true)
      await anticheatAPI.addDllWhitelist({
        member_id: session.member_id,
        dll_name,
        dll_path: dll_path || undefined,
        note: `会话 #${sessionId} 误报放行`,
      })
      toast.success(`已为 ${session.member_name} 加入白名单：${dll_name}`)
      const wl = await anticheatAPI.getDllWhitelist(session.member_id)
      setMemberDllWhitelist(wl.data || [])
    } catch (e: any) {
      toast.error(e.message || '添加失败')
    } finally {
      setDllBusy(false)
    }
  }

  const removeDllFromWhitelist = (id: number) => {
    setConfirmDialog({
      title: '移除白名单',
      message: '确认移除该学员的此白名单条目？',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          setDllBusy(true)
          await anticheatAPI.deleteDllWhitelist(id)
          toast.success('已移除')
          if (session?.member_id) {
            const wl = await anticheatAPI.getDllWhitelist(session.member_id)
            setMemberDllWhitelist(wl.data || [])
          }
        } catch (e: any) {
          toast.error(e.message || '删除失败')
        } finally {
          setDllBusy(false)
        }
      },
    })
  }

  const exportSummary = async () => {
    if (!session) return
    try {
      setExporting(true)
      const [alertLogs, allShots, snaps] = await Promise.all([
        anticheatAPI.getSessionLogs(sessionId, { page: 1, limit: 200 }),
        anticheatAPI.getSessionScreenshots(sessionId),
        anticheatAPI.getSessionSnapshots(sessionId),
      ])
      const important = (alertLogs.data || []).filter(
        (l: any) =>
          l.severity === 'warning' ||
          l.severity === 'error' ||
          ['作弊行为', '严重违规', 'DLL注入', '窗口切换'].includes(l.log_type)
      )

      const lines = [
        '===== 紫夜反作弊 · 考核会话留证摘要 =====',
        `导出时间: ${formatDateTime(new Date().toISOString())}`,
        '',
        '【基本信息】',
        `会话ID: ${session.id}`,
        `准考证: ${session.admission_ticket}`,
        `学员: ${session.member_name} (ID ${session.member_id})`,
        `Steam: ${session.steam_username || '-'}`,
        `考核状态: ${session.exam_status}`,
        `开始时间: ${formatDateTime(session.start_time)}`,
        `结束时间: ${formatDateTime(session.end_time)}`,
        `考核时长: ${durationText(session.start_time, session.end_time)}`,
        `最后心跳: ${formatDateTime(session.last_heartbeat)}`,
        `心跳在线: ${yn(session.is_alive)}`,
        `结束原因: ${session.end_reason || '-'}`,
        `游戏路径: ${session.game_path || '-'}`,
        '',
        '【考核开关】',
        `地图包: ${yn(session.map_pack_required)}`,
        `杀毒检测: ${yn(session.require_antivirus_check)}`,
        `焦点截图: ${yn(session.focus_screenshot_enabled)}`,
        `准考证有效期: ${formatDateTime(session.valid_from)} ~ ${formatDateTime(session.valid_until)}`,
        '',
        '【数量统计】',
        `监控日志: ${session.log_count ?? '-'}（告警级约 ${session.alert_log_count ?? '-'}）`,
        `截图: ${session.screenshot_count ?? (allShots.data || []).length}`,
        `文件快照: ${session.snapshot_count ?? (snaps.data || []).length}`,
        `学员端日志: ${session.client_log_count ?? '-'}`,
        '',
        '【重要监控日志】',
        ...(important.length
          ? important.map(
              (l: any) =>
                `[${formatDateTime(l.created_at)}] (${l.severity}/${l.log_type}) ${l.log_content}`
            )
          : ['（无 warning/error/严重类型日志，或需在监控日志页查看全文）']),
        '',
        '【截图清单】',
        ...((allShots.data || []).length
          ? (allShots.data || []).map(
              (s: any) => `#${s.id}  ${formatDateTime(s.screenshot_time)}  ${s.file_size} bytes`
            )
          : ['（无截图）']),
        '',
        '【文件快照摘要】',
        ...((snaps.data || []).slice(0, 100).map(
          (s: any) =>
            `[${s.file_type}] ${s.file_name}  size=${s.file_size}  hash=${s.file_hash || '-'}`
        )),
        (snaps.data || []).length > 100 ? `… 另有 ${(snaps.data || []).length - 100} 条未列出` : '',
        '',
        '===== 摘要结束 =====',
      ].filter(Boolean)

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `anticheat-session-${session.id}-${session.admission_ticket}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已导出留证摘要')
    } catch (e: any) {
      toast.error(e.message || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: '基本信息' },
    { key: 'logs', label: '监控日志' },
    { key: 'screenshots', label: '截图' },
    { key: 'snapshots', label: '文件快照' },
    { key: 'processes', label: '进程' },
    { key: 'client', label: '学员端日志' },
    { key: 'dll', label: 'DLL白名单' },
  ]

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (!session) {
    return <div className="p-6 text-gray-400">会话不存在</div>
  }

  const InfoItem = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/40">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm text-gray-100 break-all ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate('/admin/anticheat/monitor')}
          className="p-2 rounded-lg bg-gray-700/50 text-gray-300 hover:text-white"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">
            会话 #{session.id} · {session.member_name}
          </h1>
          <p className="text-sm text-gray-400 font-mono">{session.admission_ticket}</p>
        </div>
        <button
          onClick={exportSummary}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-700 text-gray-100 disabled:opacity-50"
        >
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          导出总结
        </button>
        {!session.end_time && (
          <button
            onClick={requestShot}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white"
          >
            <Camera size={16} /> 请求截图
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              tab === t.key ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <InfoItem label="准考证号" value={session.admission_ticket} mono />
            <InfoItem label="学员" value={`${session.member_name}（ID ${session.member_id}）`} />
            <InfoItem label="Steam 用户名" value={session.steam_username || '-'} />
            <InfoItem label="考核状态" value={session.exam_status} />
            <InfoItem
              label="连接状态"
              value={
                session.end_time ? (
                  <span className="text-gray-400">已结束</span>
                ) : session.is_alive ? (
                  <span className="text-emerald-400">心跳在线</span>
                ) : (
                  <span className="text-red-400">心跳断连</span>
                )
              }
            />
            <InfoItem label="考核时长" value={durationText(session.start_time, session.end_time)} />
            <InfoItem label="开始时间" value={formatDateTime(session.start_time)} />
            <InfoItem label="结束时间" value={formatDateTime(session.end_time)} />
            <InfoItem label="最后心跳" value={formatDateTime(session.last_heartbeat)} />
            <InfoItem label="准考证有效期起" value={formatDateTime(session.valid_from)} />
            <InfoItem label="准考证有效期止" value={formatDateTime(session.valid_until)} />
            <InfoItem label="截图请求中" value={yn(session.screenshot_requested)} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InfoItem label="监控日志" value={session.log_count ?? 0} />
            <InfoItem label="告警日志" value={session.alert_log_count ?? 0} />
            <InfoItem label="截图数量" value={session.screenshot_count ?? 0} />
            <InfoItem label="文件快照" value={session.snapshot_count ?? 0} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <InfoItem label="需解压考核地图" value={yn(session.map_pack_required)} />
            <InfoItem label="需关闭杀毒软件" value={yn(session.require_antivirus_check)} />
            <InfoItem label="焦点变化截图" value={yn(session.focus_screenshot_enabled)} />
          </div>
          <InfoItem label="结束原因" value={session.end_reason || '-'} />
          <InfoItem label="游戏路径" value={session.game_path || '-'} mono />
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setLogTypeOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-sm text-gray-200 hover:border-purple-500/60 hover:bg-gray-700/80 min-w-[160px] justify-between"
            >
              <span>{logType || '全部类型'}</span>
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${logTypeOpen ? 'rotate-180' : ''}`} />
            </button>
            {logTypeOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLogTypeOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-gray-600 bg-gray-800 shadow-xl py-1 max-h-64 overflow-y-auto">
                  {LOG_TYPES.map((t) => {
                    const label = t || '全部类型'
                    const active = logType === t
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setLogType(t)
                          setLogPage(1)
                          setLogTypeOpen(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          active
                            ? 'bg-purple-600/30 text-purple-200'
                            : 'text-gray-300 hover:bg-gray-700/80'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-gray-800 sticky top-0 text-gray-300">
                <tr>
                  <th className="px-2 py-2 text-left">时间</th>
                  <th className="px-2 py-2 text-left">类型</th>
                  <th className="px-2 py-2 text-left">级别</th>
                  <th className="px-2 py-2 text-left">内容</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className={`border-t border-gray-700/40 ${severityRowClass(l.severity, l.log_type)}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-2 py-1.5">{l.log_type}</td>
                    <td className="px-2 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${severityBadge(l.severity)}`}>
                        {(l.severity || 'info').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 break-all">{l.log_content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={logPage} total={logTotal} limit={50} onChange={setLogPage} />
        </div>
      )}

      {tab === 'screenshots' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-800/40 border border-gray-700/50 rounded-xl px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-gray-400">
                共 {shots.length} 张
                {loadingShots && shotsLoadProgress.total > 0 && (
                  <span className="text-purple-300 ml-2">
                    加载中 {shotsLoadProgress.done}/{shotsLoadProgress.total}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() =>
                  setShotSelected(
                    shotSelected.length === shots.length ? [] : shots.map((s: any) => s.id)
                  )
                }
                disabled={!shots.length}
                className="text-xs px-2 py-1 rounded-lg bg-gray-700 text-gray-200 inline-flex items-center gap-1 disabled:opacity-40"
              >
                {shotSelected.length === shots.length && shots.length > 0 ? (
                  <CheckSquare size={14} className="text-purple-400" />
                ) : (
                  <Square size={14} />
                )}
                全选
              </button>
              <button
                type="button"
                onClick={batchDownloadShots}
                disabled={!shots.length || batchDownloading}
                className="text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
              >
                {batchDownloading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                {shotSelected.length ? `批量下载 (${shotSelected.length})` : '全部打包下载'}
              </button>
            </div>
            <button
              type="button"
              onClick={requestShot}
              disabled={!!session.end_time}
              title={session.end_time ? '会话已结束，无法再请求截图' : '向学员端请求立即截图'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Camera size={14} /> 请求截图
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {shots.map((s, index) => {
              const checked = shotSelected.includes(s.id)
              const url = shotUrls[s.id]
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border overflow-hidden bg-gray-800/40 group ${
                    checked ? 'border-purple-500' : 'border-gray-700 hover:border-purple-500/60'
                  }`}
                >
                  <div className="relative aspect-video bg-gray-900 cursor-pointer" onClick={() => setPreviewIndex(index)}>
                    {url ? (
                      <img src={url} alt={`#${s.id}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShotSelected((p) =>
                          p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]
                        )
                      }}
                      className="absolute top-2 left-2 p-1 rounded bg-black/50"
                    >
                      {checked ? (
                        <CheckSquare size={16} className="text-purple-400" />
                      ) : (
                        <Square size={16} className="text-gray-300" />
                      )}
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                      <div className="text-xs text-white">#{s.id}</div>
                      <div className="text-[10px] text-gray-300">{formatDateTime(s.screenshot_time)}</div>
                    </div>
                  </div>
                  <div className="p-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600"
                    >
                      放大
                    </button>
                    <button
                      type="button"
                      onClick={(e) => downloadShot(s.id, e)}
                      disabled={downloadingShot === s.id}
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-purple-600/80 text-white hover:bg-purple-600 inline-flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {downloadingShot === s.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      下载
                    </button>
                  </div>
                </div>
              )
            })}
            {!shots.length && !loadingShots && (
              <p className="text-gray-500 col-span-full text-center py-8">暂无截图</p>
            )}
          </div>

          {previewIndex != null &&
            shots[previewIndex] &&
            createPortal(
              <div
                className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 m-0"
                onClick={() => setPreviewIndex(null)}
              >
                <button
                  type="button"
                  className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-gray-800/90 text-white hover:bg-purple-600 border border-gray-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreviewIndex((i) =>
                      i == null ? i : (i - 1 + shots.length) % shots.length
                    )
                  }}
                  title="上一张"
                >
                  <ChevronLeft size={28} />
                </button>

                <div
                  className="flex flex-col items-center gap-3 max-w-[90vw]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {shotUrls[shots[previewIndex].id] ? (
                    <img
                      src={shotUrls[shots[previewIndex].id]}
                      alt={`screenshot-${shots[previewIndex].id}`}
                      className="max-w-full max-h-[80vh] rounded-lg object-contain"
                    />
                  ) : (
                    <div className="w-64 h-40 flex items-center justify-center text-gray-400">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <span>
                      #{shots[previewIndex].id} · {formatDateTime(shots[previewIndex].screenshot_time)}
                    </span>
                    <span className="text-gray-500">
                      {previewIndex + 1} / {shots.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadShot(shots[previewIndex].id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white"
                    >
                      <Download size={14} /> 下载
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">← → 键切换 · Esc 关闭</p>
                </div>

                <button
                  type="button"
                  className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-gray-800/90 text-white hover:bg-purple-600 border border-gray-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreviewIndex((i) => (i == null ? i : (i + 1) % shots.length))
                  }}
                  title="下一张"
                >
                  <ChevronRight size={28} />
                </button>
              </div>,
              document.body
            )}
        </div>
      )}

      {tab === 'snapshots' && (
        <div className="space-y-4">
          {(['mod', 'binary'] as const).map((typeKey) => {
            const list = snapshots.filter((s) => s.file_type === typeKey)
            return (
              <div key={typeKey} className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[40vh]">
                <div className="sticky top-0 z-10 px-3 py-2 bg-gray-800 border-b border-gray-700/50 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white">
                    {typeKey === 'mod' ? '模组文件' : '二进制文件'}
                    <span className="ml-2 text-xs text-gray-400 font-normal">({list.length})</span>
                  </h3>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-900/80 text-gray-400">
                    <tr>
                      <th className="px-2 py-2 text-left">文件名</th>
                      <th className="px-2 py-2 text-left">路径</th>
                      <th className="px-2 py-2 text-left whitespace-nowrap">大小</th>
                      <th className="px-2 py-2 text-left">哈希</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.id} className="border-t border-gray-700/40 text-gray-300">
                        <td className="px-2 py-1.5 text-white">{s.file_name}</td>
                        <td className="px-2 py-1.5 break-all">{s.file_path}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                          {formatFileSize(s.file_size)}
                        </td>
                        <td className="px-2 py-1.5 font-mono">
                          {s.file_hash ? `${s.file_hash.slice(0, 16)}…` : '-'}
                        </td>
                      </tr>
                    ))}
                    {!list.length && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-gray-500">
                          暂无{typeKey === 'mod' ? '模组' : '二进制'}快照
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          })}
          {(() => {
            const others = snapshots.filter((s) => s.file_type !== 'mod' && s.file_type !== 'binary')
            if (!others.length) return null
            return (
              <div className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[30vh]">
                <div className="sticky top-0 z-10 px-3 py-2 bg-gray-800 border-b border-gray-700/50">
                  <h3 className="text-sm font-medium text-white">
                    其他文件
                    <span className="ml-2 text-xs text-gray-400 font-normal">({others.length})</span>
                  </h3>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-900/80 text-gray-400">
                    <tr>
                      <th className="px-2 py-2 text-left">类型</th>
                      <th className="px-2 py-2 text-left">文件名</th>
                      <th className="px-2 py-2 text-left">路径</th>
                      <th className="px-2 py-2 text-left whitespace-nowrap">大小</th>
                      <th className="px-2 py-2 text-left">哈希</th>
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((s) => (
                      <tr key={s.id} className="border-t border-gray-700/40 text-gray-300">
                        <td className="px-2 py-1.5">{snapshotTypeLabel(s.file_type)}</td>
                        <td className="px-2 py-1.5 text-white">{s.file_name}</td>
                        <td className="px-2 py-1.5 break-all">{s.file_path}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                          {formatFileSize(s.file_size)}
                        </td>
                        <td className="px-2 py-1.5 font-mono">
                          {s.file_hash ? `${s.file_hash.slice(0, 16)}…` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
          {!snapshots.length && (
            <p className="text-center text-gray-500 py-8 text-sm">暂无文件快照</p>
          )}
        </div>
      )}

      {tab === 'processes' && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-gray-800 sticky top-0 text-gray-300">
                <tr>
                  <th className="px-2 py-2 text-left">时间</th>
                  <th className="px-2 py-2 text-left">内容</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-t border-gray-700/40 ${severityRowClass(p.severity, '进程检测')}`}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                    <td className="px-2 py-1.5 break-all">{p.log_content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={procPage} total={procTotal} limit={50} onChange={setProcPage} />
        </div>
      )}

      {tab === 'client' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-400">
              {clientShowAll
                ? `已加载全部 ${clientLogs.length} / ${clientTotal} 条`
                : `分页显示 · 共 ${clientTotal} 条`}
            </p>
            <button
              type="button"
              onClick={() => {
                setClientShowAll((v) => !v)
                setClientPage(1)
              }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                clientShowAll
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {clientShowAll ? '切换为分页' : '显示全部（不分页）'}
            </button>
          </div>
          <div
            className={`overflow-x-auto rounded-xl border border-gray-700/50 ${
              clientShowAll ? 'max-h-[75vh]' : 'max-h-[60vh]'
            }`}
          >
            <table className="w-full text-xs">
              <thead className="bg-gray-800 sticky top-0 text-gray-300">
                <tr>
                  <th className="px-2 py-2 text-left">时间</th>
                  <th className="px-2 py-2 text-left">级别</th>
                  <th className="px-2 py-2 text-left">消息</th>
                </tr>
              </thead>
              <tbody>
                {clientLogs.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-t border-gray-700/40 ${severityRowClass(
                      String(l.log_level || '').toLowerCase().includes('err')
                        ? 'error'
                        : String(l.log_level || '').toLowerCase().includes('warn')
                          ? 'warning'
                          : 'info'
                    )}`}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-2 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${severityBadge(
                        String(l.log_level || '').toLowerCase().includes('err')
                          ? 'error'
                          : String(l.log_level || '').toLowerCase().includes('warn')
                            ? 'warning'
                            : 'info'
                      )}`}>
                        {l.log_level}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 break-all">{l.log_message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!clientShowAll && (
            <Pager page={clientPage} total={clientTotal} limit={50} onChange={setClientPage} />
          )}
        </div>
      )}

      {tab === 'dll' && (
        <div className="space-y-5">
          <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-white text-sm font-medium">
              <Shield size={16} className="text-purple-400" />
              学员误报白名单 · {session.member_name}（ID {session.member_id}）
            </div>
            <p className="text-xs text-gray-500">
              仅对该学员生效。从本会话「DLL注入」日志中选择误报 DLL 加入后，该学员重新开考时将不再因此 DLL 被终止。
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm text-white font-medium">本会话触发的注入 DLL</h3>
            {injectionDlls.length ? (
              <div className="space-y-2">
                {injectionDlls.map((d) => {
                  const already = memberDllWhitelist.some(
                    (w) => String(w.dll_name).toLowerCase() === String(d.dll_name).toLowerCase()
                  )
                  return (
                    <div
                      key={`${d.dll_name}-${d.log_id || 'end'}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-red-200">{d.dll_name}</div>
                        {d.dll_path && (
                          <div className="text-[11px] text-gray-500 break-all">{d.dll_path}</div>
                        )}
                        {d.created_at && (
                          <div className="text-[11px] text-gray-500">{formatDateTime(d.created_at)}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={dllBusy || already}
                        onClick={() => addDllToMemberWhitelist(d.dll_name, d.dll_path)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-40"
                      >
                        <Plus size={12} />
                        {already ? '已在白名单' : '加入该学员白名单'}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center border border-gray-700/40 rounded-xl">
                本会话暂无 DLL 注入记录
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm text-white font-medium">
              当前白名单（{memberDllWhitelist.length}）
            </h3>
            <div className="overflow-x-auto rounded-xl border border-gray-700/50">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-300">
                  <tr>
                    <th className="px-3 py-2 text-left">DLL</th>
                    <th className="px-3 py-2 text-left">路径</th>
                    <th className="px-3 py-2 text-left">备注</th>
                    <th className="px-3 py-2 text-left">添加</th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {memberDllWhitelist.map((w) => (
                    <tr key={w.id} className="border-t border-gray-700/40 text-gray-200">
                      <td className="px-3 py-2 font-mono text-xs">{w.dll_name}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 break-all max-w-xs">
                        {w.dll_path || '-'}
                      </td>
                      <td className="px-3 py-2 text-xs">{w.note || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {w.created_by || '-'}
                        <div>{formatDateTime(w.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={dllBusy}
                          onClick={() => removeDllFromWhitelist(w.id)}
                          className="text-red-400 hover:text-red-300"
                          title="移除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!memberDllWhitelist.length && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                        该学员尚无误报白名单
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type || 'danger'}
          confirmText="确认"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}

function Pager({
  page,
  total,
  limit,
  onChange,
}: {
  page: number
  total: number
  limit: number
  onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (total <= limit) return null
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="p-1 rounded bg-gray-800 disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      <span>
        {page} / {pages}（共 {total}）
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="p-1 rounded bg-gray-800 disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
