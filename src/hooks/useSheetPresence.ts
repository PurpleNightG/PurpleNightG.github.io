import { useCallback, useEffect, useRef, useState } from 'react'
import { sheetAPI } from '../utils/api'

export type SheetPresenceUser = {
  key: string
  userId: number | string
  role: 'admin' | 'student'
  name: string
  editing: boolean
  at: number
}

function getOrCreateSessionId() {
  const key = 'sheetPresenceSessionId'
  try {
    let id = sessionStorage.getItem(key)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(key, id)
    }
    return id
  } catch {
    return `s_${Date.now().toString(36)}`
  }
}

/**
 * 轻量在场：约 20s 心跳，进程内存，不写 MySQL。
 * othersEditing：除自己外正在编辑的人数，用于冲突提示。
 */
export function useSheetPresence(opts: {
  workbookId: number
  enabled?: boolean
  /** 当前标签页是否处于可编辑模式 */
  editing: boolean
  asStudent?: boolean
}) {
  const { workbookId, enabled = true, editing, asStudent = false } = opts
  const [presence, setPresence] = useState<SheetPresenceUser[]>([])
  const sessionIdRef = useRef(getOrCreateSessionId())
  const editingRef = useRef(editing)
  editingRef.current = editing

  const beat = useCallback(async () => {
    if (!workbookId || !enabled) return
    try {
      const api = asStudent ? sheetAPI.studentPresence : sheetAPI.presence
      const res = await api(workbookId, {
        session_id: sessionIdRef.current,
        editing: editingRef.current,
      })
      setPresence(Array.isArray(res.data?.presence) ? res.data.presence : [])
    } catch {
      /* 忽略网络抖动 */
    }
  }, [workbookId, enabled, asStudent])

  useEffect(() => {
    if (!workbookId || !enabled) return
    void beat()
    const id = setInterval(() => {
      void beat()
    }, 20_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void beat()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      const leave = asStudent ? sheetAPI.studentLeavePresence : sheetAPI.leavePresence
      void leave(workbookId, sessionIdRef.current).catch(() => {})
    }
  }, [workbookId, enabled, asStudent, beat])

  // 进入/退出编辑模式时立刻刷新在场标记
  useEffect(() => {
    if (!workbookId || !enabled) return
    void beat()
  }, [editing, workbookId, enabled, beat])

  const others = presence.filter((p) => {
    // 无法精确匹配自己时，用「同名同角色且 editing 对齐」不够稳；用 session key 后缀
    return !String(p.key).endsWith(`:${sessionIdRef.current}`)
  })
  const othersEditing = others.filter((p) => p.editing)
  const othersViewing = others.filter((p) => !p.editing)

  return {
    presence,
    others,
    othersEditing,
    othersViewing,
    sessionId: sessionIdRef.current,
  }
}
