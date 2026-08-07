import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { assistantAPI, memberAPI } from '../../utils/api'
import { toast } from '../../utils/toast'
import MemberNameCell from '../../components/MemberNameCell'
import { Loader2, CheckSquare, Square, RotateCcw, Search, X, Settings, Eye, UserPlus, UserMinus, Check, XCircle, Users, UserRoundPlus, ArrowUpRight, Pencil, AlertCircle, Calendar, ShieldOff, GraduationCap, MoreHorizontal, Trash2 } from 'lucide-react'
import { getRoleColor } from '../../utils/roleColors'
import { formatDate, formatDateTime } from '../../utils/dateFormat'
import { listMemberEditDiffs, memberEditDiffCount } from '../../utils/memberEditDiff'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useBadges } from '../../contexts/BadgeContext'
import { readLocalJson } from '../../utils/persistedState'
import PageSkeleton from '../../components/Skeleton'

type PendingTabKey = 'assignments' | 'creates' | 'promotions' | 'edits' | 'blackPoints' | 'leaves'

function pendingStatusBadgeClass(status: string) {
  if (status === '待审批') return 'bg-amber-500/25 text-amber-100'
  if (status === '已通过') return 'bg-emerald-500/25 text-emerald-100'
  if (status === '已拒绝' || status === '已驳回' || status === '已解除') return 'bg-rose-500/25 text-rose-100'
  return 'bg-white/10 text-gray-300'
}

function canDeleteProcessed(status: string) {
  return ['已通过', '已驳回', '已拒绝', '已解除'].includes(status)
}

function countPending(rows: any[] = []) {
  return rows.filter((r) => r.status === '待审批').length
}

function filterApprovalRows(rows: any[] = [], hideProcessed: boolean) {
  if (!hideProcessed) return rows
  return rows.filter((r) => r.status === '待审批')
}

const PERM_LABELS: Record<string, string> = {
  view_training_roster: '查看新训花名册',
  request_student: '申请带人',
  manage_assigned_progress: '管理学员进度',
  propose_stage_promotion: '申请升阶',
  propose_member_create: '申请加人',
  propose_member_edit: '申请改学员信息',
  propose_black_point: '申请登记黑点',
  propose_leave: '申请登记请假',
  view_assigned_attendance: '查看考勤',
  propose_quit: '发起退队',
  screen_share_assistant: '屏幕共享助教能力',
}

function isZiyeAssistantRow(m: any) {
  return !!(Number(m?.is_ziye_assistant) === 1 || m?.stage_role === '紫夜助教')
}

const WORKBENCH_PERM_KEYS = Object.keys(PERM_LABELS).filter((k) => k !== 'screen_share_assistant')

function ThemeCheckbox({
  checked,
  onCheckedChange,
  label,
  className = '',
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`flex items-center gap-2 text-left group select-none ${className}`}
    >
      {checked ? (
        <CheckSquare size={18} className="text-purple-400 flex-shrink-0" />
      ) : (
        <Square size={18} className="text-gray-500 group-hover:text-gray-400 flex-shrink-0" />
      )}
      <span className="text-sm text-gray-200">{label}</span>
    </button>
  )
}

type ScreenShareDraft = {
  enabled: boolean
  unlimited: boolean
  quota: string
  guestCodeMax: string
  resetUsed: boolean
}

function buildScreenShareDraft(a: any): ScreenShareDraft {
  const isOn = !!(a?.is_assistant || a?.permissions?.screen_share_assistant)
  return {
    enabled: isOn ? !!a.screen_share_enabled : true,
    unlimited: a.screen_share_quota == null,
    quota: a.screen_share_quota == null ? '' : String(a.screen_share_quota),
    guestCodeMax: String(a.guest_code_max ?? 1),
    resetUsed: false,
  }
}

export default function AssistantManagement() {
  const { refreshBadges } = useBadges()
  const [tab, setTab] = useState<'list' | 'pending'>(() =>
    localStorage.getItem('assistantActiveTab') === 'pending' ? 'pending' : 'list'
  )
  const [pendingTab, setPendingTab] = useState<PendingTabKey>(() => {
    const saved = localStorage.getItem('assistantPendingTab')
    const ok = ['assignments', 'creates', 'promotions', 'edits', 'blackPoints', 'leaves']
    return ok.includes(saved || '') ? (saved as PendingTabKey) : 'assignments'
  })
  const [hideProcessed, setHideProcessed] = useState(() =>
    readLocalJson('assistantPendingHideProcessed', false)
  )
  const [reviewBusyId, setReviewBusyId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ type: PendingTabKey; id: number; status?: string } | null>(null)
  const [assistants, setAssistants] = useState<any[]>([])
  const [pending, setPending] = useState<{
    assignments: any[]
    creates: any[]
    promotions: any[]
    edits: any[]
    blackPoints: any[]
    leaves: any[]
  }>({
    assignments: [],
    creates: [],
    promotions: [],
    edits: [],
    blackPoints: [],
    leaves: [],
  })
  const [showEnableModal, setShowEnableModal] = useState(false)
  const [enableCandidates, setEnableCandidates] = useState<any[]>([])
  const [enableSearch, setEnableSearch] = useState('')
  const [enableBusyId, setEnableBusyId] = useState<number | null>(null)
  const [disableTarget, setDisableTarget] = useState<any | null>(null)
  const [editDetail, setEditDetail] = useState<any | null>(null)
  const [editDetailMember, setEditDetailMember] = useState<Record<string, unknown> | null>(null)
  const [editDetailLoading, setEditDetailLoading] = useState(false)
  const [actionMenu, setActionMenu] = useState<{
    id: number
    top: number
    right: number
  } | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const actionBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({})

  const closeActionMenu = () => setActionMenu(null)

  const openActionMenu = (id: number) => {
    if (actionMenu?.id === id) {
      closeActionMenu()
      return
    }
    const btn = actionBtnRefs.current[id]
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setActionMenu({
      id,
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }

  useEffect(() => {
    if (!actionMenu) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (actionMenuRef.current?.contains(target)) return
      if (actionBtnRefs.current[actionMenu.id]?.contains(target)) return
      closeActionMenu()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeActionMenu()
    }
    const onRepositionClose = () => closeActionMenu()
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onRepositionClose, true)
    window.addEventListener('resize', onRepositionClose)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onRepositionClose, true)
      window.removeEventListener('resize', onRepositionClose)
    }
  }, [actionMenu])
  const [loading, setLoading] = useState(true)
  const [permTarget, setPermTarget] = useState<any | null>(null)
  const [perms, setPerms] = useState<Record<string, boolean>>({})
  const [screenDraft, setScreenDraft] = useState<ScreenShareDraft | null>(null)
  const [assignTarget, setAssignTarget] = useState<any | null>(null)
  const [assignMode, setAssignMode] = useState<'view' | 'assign' | 'daily'>('assign')
  const [assignLoading, setAssignLoading] = useState(false)
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set())
  const [selectedUnassignIds, setSelectedUnassignIds] = useState<Set<number>>(new Set())
  const [assignSearch, setAssignSearch] = useState('')
  const [assignments, setAssignments] = useState<any[]>([])
  const [dailyAssignments, setDailyAssignments] = useState<any[]>([])
  const [dailyToday, setDailyToday] = useState('')
  const [busy, setBusy] = useState(false)

  const loadList = async () => {
    const res = await assistantAPI.adminList()
    setAssistants(res.data || [])
  }

  const loadPending = async () => {
    const res = await assistantAPI.adminPending()
    setPending(
      res.data || {
        assignments: [],
        creates: [],
        promotions: [],
        edits: [],
        blackPoints: [],
        leaves: [],
      }
    )
    void refreshBadges()
  }

  const openEnableModal = async () => {
    setShowEnableModal(true)
    setEnableSearch('')
    try {
      const res = await memberAPI.getAll()
      setEnableCandidates((res.data || []).filter((m: any) => m.status !== '已退队' && !isZiyeAssistantRow(m)))
    } catch (e: any) {
      toast.error(e.message || '加载成员失败')
    }
  }

  const enableAssistant = async (id: number) => {
    setEnableBusyId(id)
    try {
      await assistantAPI.adminEnable(id)
      toast.success('已授予紫夜助教（保留原阶段）')
      setShowEnableModal(false)
      loadList()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setEnableBusyId(null)
    }
  }

  const disableAssistant = async () => {
    if (!disableTarget) return
    const a = disableTarget
    setDisableTarget(null)
    setBusy(true)
    try {
      await assistantAPI.adminDisable(a.id)
      toast.success('已撤销助教身份')
      // 撤销会清归属与各类申请，列表与审批中心都要重载
      await Promise.all([loadList(), loadPending()])
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    setLoading(true)
    try {
      await Promise.all([loadList(), loadPending()])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (localStorage.getItem('assistantActiveTab') === 'pending') {
      localStorage.removeItem('assistantActiveTab')
      setTab('pending')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('assistantPendingHideProcessed', JSON.stringify(hideProcessed))
  }, [hideProcessed])

  useEffect(() => {
    localStorage.setItem('assistantPendingTab', pendingTab)
  }, [pendingTab])

  const openPerms = (a: any) => {
    setPermTarget(a)
    setPerms({
      ...a.permissions,
      screen_share_assistant: !!(a.permissions?.screen_share_assistant || a.is_assistant),
    })
    setScreenDraft(buildScreenShareDraft(a))
  }

  const closePerms = () => {
    setPermTarget(null)
    setScreenDraft(null)
  }

  const savePerms = async () => {
    if (!permTarget || !screenDraft) return
    setBusy(true)
    try {
      const screen_share = perms.screen_share_assistant
        ? {
            screen_share_enabled: screenDraft.enabled,
            screen_share_quota: screenDraft.unlimited
              ? null
              : (parseInt(screenDraft.quota, 10) || 0),
            guest_code_max: Math.max(0, parseInt(screenDraft.guestCodeMax, 10) || 0),
            reset_used: screenDraft.resetUsed || !permTarget.is_assistant,
          }
        : undefined
      await assistantAPI.adminSetPermissions(permTarget.id, perms, screen_share)
      toast.success('权限已保存')
      closePerms()
      loadList()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const openAssign = async (a: any, mode: 'view' | 'assign' | 'daily' = 'assign') => {
    setAssignTarget(a)
    setAssignMode(mode)
    setSelectedStudentIds(new Set())
    setSelectedUnassignIds(new Set())
    setAssignSearch('')
    setAssignLoading(true)
    try {
      const tasks: Promise<any>[] = [assistantAPI.adminAssignmentsByAssistant(a.id)]
      if (mode === 'assign' || mode === 'daily') tasks.push(memberAPI.getAll())
      const [asgRes, membersRes] = await Promise.all(tasks)
      setAssignments(asgRes.data || [])
      setDailyAssignments(asgRes.daily || [])
      setDailyToday(asgRes.meta?.today || '')
      if ((mode === 'assign' || mode === 'daily') && membersRes) {
        setAllMembers((membersRes.data || []).filter((m: any) => !isZiyeAssistantRow(m)))
      }
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setAssignLoading(false)
    }
  }

  const closeAssign = () => {
    setAssignTarget(null)
    setAssignMode('assign')
    setSelectedUnassignIds(new Set())
    setDailyAssignments([])
  }

  const refreshAssign = async () => {
    if (!assignTarget) return
    await openAssign(assignTarget, assignMode)
    loadList()
  }

  const handleUnassign = async (assignmentId: number) => {
    try {
      await assistantAPI.adminUnassign(assignmentId)
      toast.success('已解除')
      await refreshAssign()
    } catch (e: any) {
      toast.error(e.message || '解除失败')
    }
  }

  const handleDailyUnassign = async (id: number) => {
    try {
      await assistantAPI.adminDailyUnassign(id)
      toast.success('已取消当日分配')
      await refreshAssign()
    } catch (e: any) {
      toast.error(e.message || '取消失败')
    }
  }

  const viewAssignments = useMemo(
    () => assignments.filter((a) => a.status === '已通过' || a.status === '待审批'),
    [assignments]
  )

  const unassignableIds = useMemo(
    () => viewAssignments.filter((a) => a.status === '已通过').map((a) => a.id),
    [viewAssignments]
  )

  const toggleUnassign = (id: number) => {
    setSelectedUnassignIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllUnassign = () => {
    const allSelected = unassignableIds.length > 0 && unassignableIds.every((id) => selectedUnassignIds.has(id))
    setSelectedUnassignIds(allSelected ? new Set() : new Set(unassignableIds))
  }

  const doBatchUnassign = async () => {
    if (selectedUnassignIds.size === 0) return
    setBusy(true)
    try {
      const ids = Array.from(selectedUnassignIds)
      const results = await Promise.allSettled(ids.map((id) => assistantAPI.adminUnassign(id)))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const fail = results.length - ok
      if (ok) toast.success(`已解除 ${ok} 人${fail ? `，${fail} 人失败` : ''}`)
      else toast.error('批量解除失败')
      setSelectedUnassignIds(new Set())
      await refreshAssign()
    } catch (e: any) {
      toast.error(e.message || '批量解除失败')
    } finally {
      setBusy(false)
    }
  }

  const assignedIdSet = useMemo(() => {
    return new Set(
      assignments
        .filter((a) => a.status === '已通过' || a.status === '待审批')
        .map((a) => a.student_member_id)
    )
  }, [assignments])

  const dailyIdSet = useMemo(
    () => new Set(dailyAssignments.map((a) => a.student_member_id)),
    [dailyAssignments]
  )

  const assignCandidates = useMemo(() => {
    const q = assignSearch.trim().toLowerCase()
    const exclude = assignMode === 'daily'
      ? new Set([...assignedIdSet, ...dailyIdSet])
      : assignedIdSet
    return allMembers
      .filter((m) => !exclude.has(m.id))
      .filter((m) => {
        if (!q) return true
        return `${m.nickname} ${m.qq} ${m.stage_role || ''}`.toLowerCase().includes(q)
      })
  }, [allMembers, assignedIdSet, dailyIdSet, assignSearch, assignMode])

  const toggleStudent = (id: number) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllCandidates = () => {
    const ids = assignCandidates.map((m) => m.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedStudentIds.has(id))
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const doAssign = async () => {
    if (!assignTarget || selectedStudentIds.size === 0) return
    setBusy(true)
    try {
      const ids = Array.from(selectedStudentIds)
      const isDaily = assignMode === 'daily'
      const results = await Promise.allSettled(
        ids.map((sid) =>
          isDaily
            ? assistantAPI.adminDailyAssign(assignTarget.id, sid)
            : assistantAPI.adminAssign(assignTarget.id, sid)
        )
      )
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const fail = results.length - ok
      if (ok) {
        toast.success(
          isDaily
            ? `已分配当日学员 ${ok} 人${fail ? `，${fail} 人失败` : ''}（过零点失效）`
            : `已分配 ${ok} 人${fail ? `，${fail} 人失败` : ''}`
        )
      } else toast.error('分配失败')
      setSelectedStudentIds(new Set())
      await openAssign(assignTarget, assignMode)
      loadList()
    } catch (e: any) {
      toast.error(e.message || '失败')
    } finally {
      setBusy(false)
    }
  }

  const visiblePending = useMemo(
    () => ({
      assignments: filterApprovalRows(pending.assignments, hideProcessed),
      creates: filterApprovalRows(pending.creates, hideProcessed),
      promotions: filterApprovalRows(pending.promotions, hideProcessed),
      edits: filterApprovalRows(pending.edits, hideProcessed),
      blackPoints: filterApprovalRows(pending.blackPoints, hideProcessed),
      leaves: filterApprovalRows(pending.leaves, hideProcessed),
    }),
    [pending, hideProcessed]
  )

  const pendingCount =
    countPending(pending.assignments) +
    countPending(pending.creates) +
    countPending(pending.promotions) +
    countPending(pending.edits) +
    countPending(pending.blackPoints) +
    countPending(pending.leaves)

  const confirmDeleteProcessed = async () => {
    if (!confirmDelete) return
    const { type, id } = confirmDelete
    setConfirmDelete(null)
    const key = `${type}-${id}`
    setDeletingId(key)
    try {
      await assistantAPI.adminDeleteRequest(type, id)
      toast.success('已删除')
      setPending((prev) => ({
        ...prev,
        [type]: (prev[type] || []).filter((r: any) => r.id !== id),
      }))
      loadPending()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const enableFiltered = useMemo(() => {
    const q = enableSearch.trim().toLowerCase()
    if (!q) return enableCandidates
    return enableCandidates.filter(
      (m) =>
        String(m.nickname || '').toLowerCase().includes(q) ||
        String(m.qq || '').includes(q)
    )
  }, [enableCandidates, enableSearch])

  const runReview = async (id: number, action: () => Promise<void>) => {
    setReviewBusyId(id)
    try {
      await action()
    } catch (e: any) {
      toast.error(e.message || '操作失败')
    } finally {
      setReviewBusyId(null)
    }
  }

  const renderStatusCell = (status: string) => (
    <span className={`status-badge ${pendingStatusBadgeClass(status || '')}`}>
      {status || '-'}
    </span>
  )

  const renderDeleteBtn = (type: PendingTabKey, row: any) => {
    if (!canDeleteProcessed(row.status)) return null
    const key = `${type}-${row.id}`
    const busy = deletingId === key
    return (
      <button
        type="button"
        disabled={!!deletingId}
        title="删除已处理记录"
        className="text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-40"
        onClick={() => setConfirmDelete({ type, id: row.id, status: row.status })}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
      </button>
    )
  }

  const openEditDetail = async (row: any) => {
    setEditDetail(row)
    setEditDetailMember(null)
    setEditDetailLoading(true)
    try {
      if (row.student_member_id) {
        const res = await memberAPI.getById(row.student_member_id)
        setEditDetailMember(res.data || null)
      }
    } catch {
      setEditDetailMember(null)
    } finally {
      setEditDetailLoading(false)
    }
  }

  const closeEditDetail = () => {
    setEditDetail(null)
    setEditDetailMember(null)
  }

  const editDetailDiffs = useMemo(
    () => (editDetail ? listMemberEditDiffs(editDetail.changes_json, editDetailMember) : []),
    [editDetail, editDetailMember]
  )

  // 进入审批中心时，落到第一个有待审的分类（有记忆 tab 且该 tab 仍有内容时保留）
  useEffect(() => {
    if (tab !== 'pending') return
    const hasPending = (key: PendingTabKey) => countPending(pending[key]) > 0
    if (hasPending(pendingTab)) return
    if (hasPending('assignments')) setPendingTab('assignments')
    else if (hasPending('creates')) setPendingTab('creates')
    else if (hasPending('promotions')) setPendingTab('promotions')
    else if (hasPending('edits')) setPendingTab('edits')
    else if (hasPending('blackPoints')) setPendingTab('blackPoints')
    else if (hasPending('leaves')) setPendingTab('leaves')
    // 仅在切换到审批 Tab 时自动定位，避免打断手动切换
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const quotaRemaining =
    permTarget && screenDraft
      ? screenDraft.unlimited
        ? null
        : Math.max(0, (parseInt(screenDraft.quota, 10) || 0) - (Number(permTarget.screen_share_used) || 0))
      : null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GraduationCap className="text-purple-400" size={26} />
            助教管理
          </h1>
          <p className="text-gray-500 text-sm mt-1">助教身份与阶段独立，尖兵等可同时担任助教</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openEnableModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-teal-600/80 hover:bg-teal-600 text-white"
          >
            <GraduationCap size={15} />
            授予助教
          </button>
          <div className="flex student-glass-chip student-glass-seg">
            <button
              type="button"
              onClick={() => setTab('list')}
              className={`px-4 py-1.5 text-sm ${tab === 'list' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}
            >
              助教列表
            </button>
            <button
              type="button"
              onClick={() => setTab('pending')}
              className={`px-4 py-1.5 text-sm relative ${tab === 'pending' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}
            >
              审批中心
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex min-w-[1.1rem] h-4 px-1 items-center justify-center rounded-full bg-red-500 text-white text-[10px]">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : tab === 'list' ? (
        <div className="student-glass-panel student-glass-panel--static overflow-hidden rounded-xl">
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>助教</th>
                  <th>阶段</th>
                  <th>QQ</th>
                  <th>学员数</th>
                  <th>屏幕共享</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {assistants.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <MemberNameCell name={a.nickname} avatar={a.avatar} qq={a.qq} />
                        <span className="student-glass-badge bg-teal-500/25 text-teal-100 text-[10px]">助教</span>
                      </div>
                    </td>
                    <td>
                      <span className={`student-glass-badge ${getRoleColor(a.stage_role)}`}>
                        {a.stage_role}
                      </span>
                    </td>
                    <td>{a.qq}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openAssign(a, 'view')}
                        className="text-purple-300 hover:text-purple-200 transition-colors"
                        title="查看已分配学员"
                      >
                        {a.student_count || 0}
                      </button>
                    </td>
                    <td className="text-sm text-gray-400">
                      {a.permissions?.screen_share_assistant || a.is_assistant ? '开' : '关'}
                    </td>
                    <td>
                      <button
                        ref={(el) => {
                          actionBtnRefs.current[a.id] = el
                        }}
                        type="button"
                        onClick={() => openActionMenu(a.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                        aria-expanded={actionMenu?.id === a.id}
                        aria-haspopup="menu"
                      >
                        操作
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {assistants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-8">
                      暂无紫夜助教（点击「授予助教」，或将阶段设为「紫夜助教」）
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'assignments' as const, label: '认领学员', count: countPending(pending.assignments), icon: Users },
              { key: 'creates' as const, label: '添加成员', count: countPending(pending.creates), icon: UserRoundPlus },
              { key: 'promotions' as const, label: '升阶申请', count: countPending(pending.promotions), icon: ArrowUpRight },
              { key: 'edits' as const, label: '信息修改', count: countPending(pending.edits), icon: Pencil },
              { key: 'blackPoints' as const, label: '黑点登记', count: countPending(pending.blackPoints), icon: AlertCircle },
              { key: 'leaves' as const, label: '请假登记', count: countPending(pending.leaves), icon: Calendar },
            ]).map(({ key, label, count, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPendingTab(key)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm transition-colors border ${
                  pendingTab === key
                    ? 'bg-purple-600/90 border-purple-400/40 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/8'
                }`}
              >
                <Icon size={15} />
                {label}
                <span
                  className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center ${
                    count > 0
                      ? pendingTab === key
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-500/90 text-white'
                      : 'bg-white/10 text-gray-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-3">
              <ThemeCheckbox
                checked={hideProcessed}
                onCheckedChange={setHideProcessed}
                label="隐藏已处理"
              />
              {pendingCount === 0 && (
                <span className="text-sm text-gray-500">当前没有待审批事项</span>
              )}
            </div>
          </div>

          <div className="student-glass-panel student-glass-panel--static overflow-hidden rounded-xl">
            {pendingTab === 'assignments' && (
              visiblePending.assignments.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">
                  {hideProcessed ? '暂无待审批认领' : '暂无认领申请'}
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>助教</th>
                        <th>申请学员</th>
                        <th>学员阶段</th>
                        <th>状态</th>
                        <th>申请时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePending.assignments.map((r) => (
                        <tr key={r.id}>
                          <td className="text-gray-200">{r.assistant_name || '-'}</td>
                          <td>
                            <div className="text-white">{r.student_name || '-'}</div>
                            <div className="text-xs text-gray-500">{r.student_qq || ''}</div>
                          </td>
                          <td>
                            <span className={`student-glass-badge ${getRoleColor(r.student_stage || '')}`}>
                              {r.student_stage || '-'}
                            </span>
                          </td>
                          <td>{renderStatusCell(r.status)}</td>
                          <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                          <td>
                            <div className="flex gap-2 items-center">
                              {r.status === '待审批' ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    title="通过"
                                    className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewAssignment(r.id, '已通过')
                                      toast.success('已通过认领')
                                      loadPending()
                                      loadList()
                                    })}
                                  >
                                    {reviewBusyId === r.id ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    title="拒绝"
                                    className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewAssignment(r.id, '已拒绝')
                                      toast.success('已拒绝')
                                      loadPending()
                                    })}
                                  >
                                    <XCircle size={18} />
                                  </button>
                                </>
                              ) : (
                                renderDeleteBtn('assignments', r)
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {pendingTab === 'creates' && (
              visiblePending.creates.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">
                  {hideProcessed ? '暂无待审批添加' : '暂无添加成员申请'}
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>助教</th>
                        <th>类型</th>
                        <th>拟添加成员</th>
                        <th>QQ</th>
                        <th>游戏 ID</th>
                        <th>入队日期</th>
                        <th>初始阶段</th>
                        <th>状态</th>
                        <th>申请时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePending.creates.map((r) => (
                        <tr key={r.id}>
                          <td className="text-gray-200">{r.assistant_name || '-'}</td>
                          <td>
                            {r.restore_member_id ? (
                              <span className="status-badge bg-teal-600/25 text-teal-200">恢复档案</span>
                            ) : (
                              <span className="status-badge bg-sky-600/20 text-sky-200">新建</span>
                            )}
                          </td>
                          <td className="text-white font-medium">{r.nickname || '-'}</td>
                          <td className="text-gray-400">{r.qq || '-'}</td>
                          <td className="text-gray-400 text-sm">{r.game_id || '-'}</td>
                          <td className="text-gray-400 text-sm">{r.join_date ? formatDate(r.join_date) : '-'}</td>
                          <td>
                            <span className={`student-glass-badge ${getRoleColor(r.stage_role || '未新训')}`}>
                              {r.stage_role || '未新训'}
                            </span>
                          </td>
                          <td>{renderStatusCell(r.status)}</td>
                          <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                          <td>
                            <div className="flex gap-2 items-center">
                              {r.status === '待审批' ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    title={r.restore_member_id ? '通过并恢复' : '通过并创建'}
                                    className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      const res = await assistantAPI.adminReviewCreate(r.id, '已通过')
                                      toast.success(res.message || (r.restore_member_id ? '已恢复成员' : '已创建成员'))
                                      loadPending()
                                      loadList()
                                    })}
                                  >
                                    {reviewBusyId === r.id ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    title="驳回"
                                    className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewCreate(r.id, '已驳回')
                                      toast.success('已驳回')
                                      loadPending()
                                    })}
                                  >
                                    <XCircle size={18} />
                                  </button>
                                </>
                              ) : (
                                renderDeleteBtn('creates', r)
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {pendingTab === 'promotions' && (
              visiblePending.promotions.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">
                  {hideProcessed ? '暂无待审批升阶' : '暂无升阶申请'}
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>助教</th>
                        <th>学员</th>
                        <th>升阶</th>
                        <th>原因</th>
                        <th>状态</th>
                        <th>申请时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePending.promotions.map((r) => (
                        <tr key={r.id}>
                          <td className="text-gray-200">{r.assistant_name || '-'}</td>
                          <td>
                            <div className="text-white">{r.student_name || '-'}</div>
                            <div className="text-xs text-gray-500">{r.student_qq || ''}</div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5 text-sm flex-wrap">
                              <span className={`student-glass-badge ${getRoleColor(r.from_stage || '')}`}>{r.from_stage || '-'}</span>
                              <span className="text-purple-400">→</span>
                              <span className={`student-glass-badge ${getRoleColor(r.to_stage || '')}`}>{r.to_stage || '-'}</span>
                            </div>
                          </td>
                          <td className="text-gray-400 text-sm max-w-[12rem] truncate" title={r.reason || ''}>
                            {r.reason || '-'}
                          </td>
                          <td>{renderStatusCell(r.status)}</td>
                          <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                          <td>
                            <div className="flex gap-2 items-center">
                              {r.status === '待审批' ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    title="通过升阶"
                                    className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewPromotion(r.id, '已通过')
                                      toast.success('已升阶')
                                      loadPending()
                                    })}
                                  >
                                    {reviewBusyId === r.id ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    title="驳回"
                                    className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewPromotion(r.id, '已驳回')
                                      toast.success('已驳回')
                                      loadPending()
                                    })}
                                  >
                                    <XCircle size={18} />
                                  </button>
                                </>
                              ) : (
                                renderDeleteBtn('promotions', r)
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {pendingTab === 'edits' && (
              visiblePending.edits.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">
                  {hideProcessed ? '暂无待审批修改' : '暂无信息修改申请'}
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>助教</th>
                        <th>学员</th>
                        <th>变更概要</th>
                        <th>状态</th>
                        <th>申请时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePending.edits.map((r) => {
                        const n = memberEditDiffCount(r.changes_json)
                        return (
                          <tr key={r.id}>
                            <td className="text-gray-200">{r.assistant_name || '-'}</td>
                            <td>
                              <div className="text-white">{r.student_name || '-'}</div>
                              <div className="text-xs text-gray-500">{r.student_qq || ''}</div>
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => openEditDetail(r)}
                                className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 transition-colors"
                              >
                                <Eye size={14} />
                                查看详情
                                <span className="text-gray-500">· {n > 0 ? `${n} 项` : '全部字段'}</span>
                              </button>
                            </td>
                            <td>{renderStatusCell(r.status)}</td>
                            <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                            <td>
                              <div className="flex gap-2 items-center">
                                {r.status === '待审批' ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={reviewBusyId === r.id}
                                      title="通过"
                                      className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
                                      onClick={() => runReview(r.id, async () => {
                                        await assistantAPI.adminReviewEdit(r.id, '已通过')
                                        toast.success('已通过修改')
                                        loadPending()
                                      })}
                                    >
                                      {reviewBusyId === r.id ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={reviewBusyId === r.id}
                                      title="驳回"
                                      className="text-red-400 hover:text-red-300 disabled:opacity-40"
                                      onClick={() => runReview(r.id, async () => {
                                        await assistantAPI.adminReviewEdit(r.id, '已驳回')
                                        toast.success('已驳回')
                                        loadPending()
                                      })}
                                    >
                                      <XCircle size={18} />
                                    </button>
                                  </>
                                ) : (
                                  renderDeleteBtn('edits', r)
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {pendingTab === 'blackPoints' && (
              visiblePending.blackPoints.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">
                  {hideProcessed ? '暂无待审批黑点' : '暂无黑点登记申请'}
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>助教</th>
                        <th>学员</th>
                        <th>原因</th>
                        <th>登记日</th>
                        <th>状态</th>
                        <th>申请时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePending.blackPoints.map((r) => (
                        <tr key={r.id}>
                          <td className="text-gray-200">{r.assistant_name || '-'}</td>
                          <td>
                            <div className="text-white">{r.student_name || '-'}</div>
                            <div className="text-xs text-gray-500">{r.student_qq || ''}</div>
                          </td>
                          <td className="text-gray-300 text-sm max-w-[14rem] truncate" title={r.reason || ''}>
                            {r.reason || '-'}
                          </td>
                          <td className="text-gray-400 text-sm">{formatDate(r.register_date)}</td>
                          <td>{renderStatusCell(r.status)}</td>
                          <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                          <td>
                            <div className="flex gap-2 items-center">
                              {r.status === '待审批' ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewBlackPoint(r.id, '已通过')
                                      toast.success('已登记黑点')
                                      loadPending()
                                    })}
                                  >
                                    {reviewBusyId === r.id ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    className="text-red-400 hover:text-red-300 disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewBlackPoint(r.id, '已驳回')
                                      toast.success('已驳回')
                                      loadPending()
                                    })}
                                  >
                                    <XCircle size={18} />
                                  </button>
                                </>
                              ) : (
                                renderDeleteBtn('blackPoints', r)
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {pendingTab === 'leaves' && (
              visiblePending.leaves.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm">
                  {hideProcessed ? '暂无待审批请假' : '暂无请假登记申请'}
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>助教</th>
                        <th>学员</th>
                        <th>起止</th>
                        <th>原因</th>
                        <th>状态</th>
                        <th>申请时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePending.leaves.map((r) => (
                        <tr key={r.id}>
                          <td className="text-gray-200">{r.assistant_name || '-'}</td>
                          <td>
                            <div className="text-white">{r.student_name || '-'}</div>
                            <div className="text-xs text-gray-500">{r.student_qq || ''}</div>
                          </td>
                          <td className="text-gray-300 text-sm">
                            {formatDate(r.start_date)} ~ {formatDate(r.end_date)}
                          </td>
                          <td className="text-gray-400 text-sm max-w-[12rem] truncate" title={r.reason || ''}>
                            {r.reason || '-'}
                          </td>
                          <td>{renderStatusCell(r.status)}</td>
                          <td className="text-gray-400 text-sm">{formatDateTime(r.created_at)}</td>
                          <td>
                            <div className="flex gap-2 items-center">
                              {r.status === '待审批' ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewLeave(r.id, '已通过')
                                      toast.success('已登记请假')
                                      loadPending()
                                    })}
                                  >
                                    {reviewBusyId === r.id ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewBusyId === r.id}
                                    className="text-red-400 hover:text-red-300 disabled:opacity-40"
                                    onClick={() => runReview(r.id, async () => {
                                      await assistantAPI.adminReviewLeave(r.id, '已驳回')
                                      toast.success('已驳回')
                                      loadPending()
                                    })}
                                  >
                                    <XCircle size={18} />
                                  </button>
                                </>
                              ) : (
                                renderDeleteBtn('leaves', r)
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {actionMenu &&
        (() => {
          const a = assistants.find((item) => item.id === actionMenu.id)
          if (!a) return null
          return createPortal(
            <div
              ref={actionMenuRef}
              role="menu"
              style={{
                position: 'fixed',
                top: actionMenu.top,
                right: actionMenu.right,
                zIndex: 9999,
              }}
              className="min-w-[10rem] overflow-hidden rounded-lg border border-white/15 bg-gray-900/95 shadow-xl shadow-black/50 backdrop-blur-sm"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeActionMenu()
                  openPerms(a)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sky-300 hover:bg-white/10"
              >
                <Settings size={14} /> 权限设置
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeActionMenu()
                  openAssign(a, 'view')
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-300 hover:bg-white/10"
              >
                <Eye size={14} /> 查看学员
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeActionMenu()
                  openAssign(a, 'assign')
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-purple-300 hover:bg-white/10"
              >
                <UserPlus size={14} /> 分配长期
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeActionMenu()
                  openAssign(a, 'daily')
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-300 hover:bg-white/10"
              >
                <Calendar size={14} /> 分配当日
              </button>
              <div className="border-t border-white/10" />
              {a.stage_role === '紫夜助教' ? (
                <div
                  className="px-3 py-2 text-xs text-gray-500 leading-relaxed"
                  title="阶段为紫夜助教时不可撤销，请先调整阶段"
                >
                  阶段为「紫夜助教」时不可撤销身份
                </div>
              ) : (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    closeActionMenu()
                    setDisableTarget(a)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/10"
                >
                  <ShieldOff size={14} /> 撤销助教
                </button>
              )}
            </div>,
            document.body
          )
        })()}

      {editDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={closeEditDetail} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 border-b border-white/10 px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">信息修改详情</h2>
                <p className="text-sm text-gray-400 mt-1">
                  助教 <span className="text-gray-200">{editDetail.assistant_name || '-'}</span>
                  {' · '}
                  学员 <span className="text-gray-200">{editDetail.student_name || '-'}</span>
                  {editDetail.student_qq ? (
                    <span className="text-gray-500">（QQ {editDetail.student_qq}）</span>
                  ) : null}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  申请时间 {formatDateTime(editDetail.created_at)}
                </p>
              </div>
              <button type="button" onClick={closeEditDetail} className="text-gray-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sidebar-scrollbar">
              {editDetailLoading ? (
                <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 size={18} className="animate-spin" /> 加载对比中…
                </div>
              ) : editDetailDiffs.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">没有可展示的变更（或与当前档案一致）</div>
              ) : (
                <>
                  {editDetailDiffs.some((d) => d.fromInferred) && (
                    <p className="text-xs text-amber-200/80 mb-3 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
                      部分原值为打开详情时从当前档案补全（旧申请未记录申请时原值）；若档案已变动，请以实际为准。
                    </p>
                  )}
                  <div className="overflow-hidden rounded-lg border border-white/10">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-[18%]" />
                        <col className="w-[32%]" />
                        <col className="w-10" />
                        <col className="w-[auto]" />
                      </colgroup>
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">字段</th>
                          <th className="px-4 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">原值</th>
                          <th className="px-2 py-2.5 text-center text-gray-500 font-medium">→</th>
                          <th className="px-4 py-2.5 text-left text-gray-400 font-medium whitespace-nowrap">拟改为</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {editDetailDiffs.map((d) => (
                          <tr key={d.key} className="hover:bg-white/[0.03]">
                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap align-top">{d.label}</td>
                            <td className="px-4 py-3 align-top break-words">
                              <span className="text-rose-300/95 line-through decoration-rose-400/40">
                                {d.from || '（未记录）'}
                              </span>
                              {d.fromInferred && (
                                <span className="ml-1.5 text-[10px] text-amber-200/70 whitespace-nowrap">当前档案</span>
                              )}
                            </td>
                            <td className="px-2 py-3 text-center text-gray-600 align-top">→</td>
                            <td className="px-4 py-3 align-top break-words">
                              <span className="text-emerald-300 font-medium">{d.to}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 px-5 py-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={reviewBusyId === editDetail.id}
                onClick={() => runReview(editDetail.id, async () => {
                  await assistantAPI.adminReviewEdit(editDetail.id, '已通过')
                  toast.success('已通过修改')
                  closeEditDetail()
                  loadPending()
                })}
                className="flex-1 min-w-[7rem] inline-flex items-center justify-center gap-2 bg-emerald-600/90 hover:bg-emerald-600 text-white py-2.5 rounded-lg disabled:opacity-50"
              >
                {reviewBusyId === editDetail.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                通过
              </button>
              <button
                type="button"
                disabled={reviewBusyId === editDetail.id}
                onClick={() => runReview(editDetail.id, async () => {
                  await assistantAPI.adminReviewEdit(editDetail.id, '已驳回')
                  toast.success('已驳回')
                  closeEditDetail()
                  loadPending()
                })}
                className="flex-1 min-w-[7rem] inline-flex items-center justify-center gap-2 bg-rose-600/80 hover:bg-rose-600 text-white py-2.5 rounded-lg disabled:opacity-50"
              >
                <XCircle size={16} />
                驳回
              </button>
              <button
                type="button"
                onClick={closeEditDetail}
                className="px-4 py-2.5 rounded-lg bg-gray-600 text-white"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {disableTarget && (
        <ConfirmDialog
          title="撤销紫夜助教"
          message={`确认撤销「${disableTarget.nickname}」的紫夜助教身份？\n阶段不会改变。\n\n将同时清除其全部学员归属（含当日临时）、助教权限，以及带人/加人/升阶/改信息/黑点/请假等申请记录。`}
          confirmText="确认撤销"
          cancelText="取消"
          type="danger"
          onConfirm={disableAssistant}
          onCancel={() => setDisableTarget(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="删除审批记录"
          message={
            confirmDelete.type === 'assignments' && confirmDelete.status === '已通过'
              ? '确定从审批中心移除这条已通过认领记录？'
              : '确定删除这条已处理的审批记录？删除后不可恢复。'
          }
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={confirmDeleteProcessed}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {showEnableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={() => setShowEnableModal(false)} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">授予紫夜助教</h2>
                <p className="text-xs text-gray-500 mt-0.5">不改阶段，尖兵等可同时担任助教</p>
              </div>
              <button type="button" onClick={() => setShowEnableModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="relative mb-3 shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="student-glass-field pl-9 py-2 text-sm"
                placeholder="搜索昵称 / QQ"
                value={enableSearch}
                onChange={(e) => setEnableSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 sidebar-scrollbar">
              {enableFiltered.length === 0 ? (
                <div className="text-center text-gray-500 py-10 text-sm">没有可授予的成员</div>
              ) : (
                enableFiltered.slice(0, 80).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <div className="text-white text-sm truncate">{m.nickname}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>QQ {m.qq}</span>
                        <span className={`student-glass-badge ${getRoleColor(m.stage_role)}`}>{m.stage_role}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={enableBusyId === m.id}
                      onClick={() => enableAssistant(m.id)}
                      className="shrink-0 text-sm px-3 py-1 rounded-md bg-teal-600/80 hover:bg-teal-600 text-white disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {enableBusyId === m.id && <Loader2 size={14} className="animate-spin" />}
                      授予
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {permTarget && screenDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={closePerms} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4">权限 · {permTarget.nickname}</h2>

            <div className="space-y-2.5 mb-5">
              {WORKBENCH_PERM_KEYS.map((key) => (
                <ThemeCheckbox
                  key={key}
                  checked={!!perms[key]}
                  label={PERM_LABELS[key]}
                  onCheckedChange={(v) => setPerms({ ...perms, [key]: v })}
                />
              ))}
            </div>

            <div className="border-t border-white/10 pt-4 mb-5 space-y-3">
              <ThemeCheckbox
                checked={!!perms.screen_share_assistant}
                label={PERM_LABELS.screen_share_assistant}
                onCheckedChange={(v) => {
                  setPerms({ ...perms, screen_share_assistant: v })
                  if (v) {
                    setScreenDraft((prev) => prev ? {
                      ...prev,
                      enabled: true,
                      unlimited: prev.unlimited || permTarget.screen_share_quota == null,
                      guestCodeMax: prev.guestCodeMax || '1',
                      resetUsed: !permTarget.is_assistant,
                    } : buildScreenShareDraft({ ...permTarget, is_assistant: false }))
                  }
                }}
              />

              {perms.screen_share_assistant && (
                <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg p-3 space-y-3">
                  <div className="text-emerald-400/80 text-xs">
                    已用 {Number(permTarget.screen_share_used) || 0} 次
                    {screenDraft.resetUsed ? ' · 保存后将重置为 0' : ''}
                    {' · '}剩余{' '}
                    {screenDraft.unlimited
                      ? '不限'
                      : `${quotaRemaining ?? 0} / ${parseInt(screenDraft.quota, 10) || 0}`}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <ThemeCheckbox
                      checked={screenDraft.enabled}
                      label="允许使用声网/火山引擎"
                      onCheckedChange={(enabled) => setScreenDraft({ ...screenDraft, enabled })}
                    />
                    <ThemeCheckbox
                      checked={screenDraft.unlimited}
                      label="不限次数"
                      onCheckedChange={(unlimited) => setScreenDraft({ ...screenDraft, unlimited })}
                    />
                    {!screenDraft.unlimited && (
                      <input
                        type="number"
                        min={0}
                        value={screenDraft.quota}
                        onChange={(e) =>
                          setScreenDraft({ ...screenDraft, quota: e.target.value, unlimited: false })
                        }
                        placeholder="次数上限"
                        className="w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/40"
                      />
                    )}
                    <label className="flex items-center gap-1.5 text-gray-300">
                      <span className="text-xs text-gray-500 whitespace-nowrap">访客码上限</span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={screenDraft.guestCodeMax}
                        onChange={(e) =>
                          setScreenDraft({ ...screenDraft, guestCodeMax: e.target.value })
                        }
                        title="一次最多可同时持有几个未使用访客码"
                        className="w-16 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/40"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setScreenDraft({ ...screenDraft, resetUsed: true })}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-md transition-colors"
                    >
                      <RotateCcw size={12} /> 重置次数
                    </button>
                  </div>

                  <p className="text-gray-600 text-xs leading-relaxed">
                    开启后即可使用声网/火山引擎分享屏幕，无需管理员逐次审批。次数在发起共享或生成访客码时扣除。「访客码上限」控制一次可同时持有多少枚未使用访客码。
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={savePerms} className="flex-1 bg-purple-600 text-white py-2 rounded-lg flex justify-center gap-2">
                {busy && <Loader2 size={16} className="animate-spin" />} 保存
              </button>
              <button type="button" onClick={closePerms} className="flex-1 bg-gray-600 text-white py-2 rounded-lg">取消</button>
            </div>
          </div>
        </div>
      )}

      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-modal-backdrop" onClick={closeAssign} />
          <div className="relative z-10 student-glass-panel student-glass-panel--static student-glass-modal w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-6">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white truncate">
                  {assignMode === 'view'
                    ? '已分配学员'
                    : assignMode === 'daily'
                      ? '当日学员'
                      : '长期归属'}{' '}
                  · {assignTarget.nickname}
                </h2>
                {assignMode === 'daily' && (
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    仅 {dailyToday || '今日'} 有效，过零点自动失去管理权
                  </p>
                )}
              </div>
              <div className="flex student-glass-chip student-glass-seg shrink-0">
                <button
                  type="button"
                  onClick={() => openAssign(assignTarget, 'view')}
                  className={`px-3 py-1 text-xs ${assignMode === 'view' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}
                >
                  查看
                </button>
                <button
                  type="button"
                  onClick={() => openAssign(assignTarget, 'assign')}
                  className={`px-3 py-1 text-xs ${assignMode === 'assign' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}
                >
                  长期
                </button>
                <button
                  type="button"
                  onClick={() => openAssign(assignTarget, 'daily')}
                  className={`px-3 py-1 text-xs ${assignMode === 'daily' ? 'bg-amber-600 text-white' : 'text-gray-400'}`}
                >
                  当日
                </button>
              </div>
            </div>

            {assignLoading ? (
              <PageSkeleton variant="table" padded={false} rows={5} />
            ) : assignMode === 'view' ? (
              <>
                <div className="text-xs text-gray-500 mb-1 shrink-0">长期归属</div>
                {viewAssignments.length > 0 && (
                  <div className="flex items-center justify-between mb-2 text-xs text-gray-500 shrink-0">
                    <button type="button" onClick={toggleAllUnassign} className="flex items-center gap-1.5 hover:text-gray-300">
                      {unassignableIds.length > 0 && unassignableIds.every((id) => selectedUnassignIds.has(id)) ? (
                        <CheckSquare size={16} className="text-purple-400" />
                      ) : (
                        <Square size={16} />
                      )}
                      全选可解除
                    </button>
                    <span>共 {viewAssignments.length} 人 · 已选 {selectedUnassignIds.size}</span>
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 border border-white/5 rounded-lg p-2 mb-3 sidebar-scrollbar">
                  {viewAssignments.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-6">暂无长期归属学员</p>
                  ) : (
                    viewAssignments.map((a) => {
                      const canUnassign = a.status === '已通过'
                      const checked = selectedUnassignIds.has(a.id)
                      return (
                        <div
                          key={a.id}
                          className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/5"
                        >
                          {canUnassign ? (
                            <button
                              type="button"
                              className="shrink-0"
                              onClick={() => toggleUnassign(a.id)}
                              title="选择"
                            >
                              {checked ? (
                                <CheckSquare size={18} className="text-purple-400" />
                              ) : (
                                <Square size={18} className="text-gray-500" />
                              )}
                            </button>
                          ) : (
                            <span className="w-[18px] shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <MemberNameCell
                              name={a.student_name}
                              avatar={a.avatar}
                              qq={a.student_qq}
                            />
                            <div className="text-xs text-gray-500 mt-1 pl-9">
                              {a.student_qq || '-'} · {a.stage_role || '-'} · {a.status}
                            </div>
                          </div>
                          {canUnassign && (
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-300 transition-colors shrink-0 p-1"
                              title="解除归属"
                              onClick={() => handleUnassign(a.id)}
                            >
                              <UserMinus size={18} />
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="text-xs text-amber-200/80 mb-1 shrink-0">
                  当日临时（{dailyToday || '今日'}）· {dailyAssignments.length} 人
                </div>
                <div className="max-h-36 min-h-0 overflow-y-auto space-y-1 border border-amber-500/20 rounded-lg p-2 mb-3 sidebar-scrollbar">
                  {dailyAssignments.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">暂无当日学员</p>
                  ) : (
                    dailyAssignments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/5">
                        <div className="min-w-0 flex-1">
                          <MemberNameCell name={a.student_name} avatar={a.avatar} qq={a.student_qq} />
                          <div className="text-xs text-gray-500 mt-1 pl-9">
                            {a.student_qq || '-'} · {a.stage_role || '-'} · 当日
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-red-400 hover:text-red-300 shrink-0 p-1"
                          title="取消当日分配"
                          onClick={() => handleDailyUnassign(a.id)}
                        >
                          <UserMinus size={18} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={busy || selectedUnassignIds.size === 0}
                    onClick={doBatchUnassign}
                    className="flex-1 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white py-2 rounded-lg flex items-center justify-center gap-2"
                  >
                    {busy && <Loader2 size={16} className="animate-spin" />}
                    批量解除长期（{selectedUnassignIds.size}）
                  </button>
                  <button type="button" onClick={closeAssign} className="flex-1 bg-gray-600 text-white py-2 rounded-lg">
                    关闭
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="mb-3 relative shrink-0">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder="搜索昵称 / QQ / 阶段"
                    className="w-full bg-gray-800/80 border border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                  />
                  {assignSearch && (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      onClick={() => setAssignSearch('')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between mb-2 text-xs text-gray-500 shrink-0">
                  <button type="button" onClick={toggleAllCandidates} className="flex items-center gap-1.5 hover:text-gray-300">
                    {assignCandidates.length > 0 && assignCandidates.every((m) => selectedStudentIds.has(m.id)) ? (
                      <CheckSquare size={16} className={assignMode === 'daily' ? 'text-amber-400' : 'text-purple-400'} />
                    ) : (
                      <Square size={16} />
                    )}
                    全选当前列表
                  </button>
                  <span>已选 {selectedStudentIds.size} 人</span>
                </div>

                <div className="mb-3 flex-1 min-h-0 max-h-52 overflow-y-auto space-y-1 border border-white/5 rounded-lg p-2 sidebar-scrollbar">
                  {assignCandidates.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      {assignMode === 'daily' ? '没有可分配的当日学员' : '没有可分配的学员'}
                    </p>
                  ) : (
                    assignCandidates.map((m) => {
                      const checked = selectedStudentIds.has(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleStudent(m.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-left"
                        >
                          {checked ? (
                            <CheckSquare
                              size={18}
                              className={`shrink-0 ${assignMode === 'daily' ? 'text-amber-400' : 'text-purple-400'}`}
                            />
                          ) : (
                            <Square size={18} className="text-gray-500 shrink-0" />
                          )}
                          <span className="text-sm text-gray-200 truncate flex-1">{m.nickname}</span>
                          <span className="text-xs text-gray-500 shrink-0">{m.qq} · {m.stage_role}</span>
                        </button>
                      )
                    })
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy || selectedStudentIds.size === 0}
                  onClick={doAssign}
                  className={`w-full mb-4 disabled:opacity-50 text-white py-2 rounded-lg flex items-center justify-center gap-2 shrink-0 ${
                    assignMode === 'daily' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-purple-600'
                  }`}
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  {assignMode === 'daily'
                    ? `分配当日（${selectedStudentIds.size}）`
                    : `批量分配长期（${selectedStudentIds.size}）`}
                </button>

                {assignMode === 'daily' ? (
                  <>
                    <div className="text-xs text-amber-200/70 mb-1 shrink-0">
                      今日已分配（{dailyAssignments.length}）
                    </div>
                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto mb-4 sidebar-scrollbar">
                      {dailyAssignments.length === 0 ? (
                        <p className="text-gray-500 text-sm">暂无</p>
                      ) : (
                        dailyAssignments.map((a) => (
                          <div key={a.id} className="flex justify-between text-sm border-b border-white/5 py-2">
                            <span className="text-gray-300">{a.student_name} · 当日</span>
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-300 transition-colors"
                              onClick={() => handleDailyUnassign(a.id)}
                            >
                              取消
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-gray-500 mb-1 shrink-0">已归属 / 待审批（{assignments.length}）</div>
                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto mb-4 sidebar-scrollbar">
                      {assignments.length === 0 ? (
                        <p className="text-gray-500 text-sm">暂无</p>
                      ) : (
                        assignments.map((a) => (
                          <div key={a.id} className="flex justify-between text-sm border-b border-white/5 py-2">
                            <span className="text-gray-300">{a.student_name} · {a.status}</span>
                            {a.status === '已通过' && (
                              <button
                                type="button"
                                className="text-red-400 hover:text-red-300 transition-colors"
                                title="解除归属"
                                onClick={() => handleUnassign(a.id)}
                              >
                                <UserMinus size={16} />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
                <button type="button" onClick={closeAssign} className="w-full bg-gray-600 text-white py-2 rounded-lg shrink-0">
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
