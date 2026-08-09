import { getAdminSecurityHeaders } from './deviceIdentity'

// API 基础配置
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

// 简单的请求缓存
const requestCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 3000 // 3秒缓存

function clearStoredAuth(kind?: 'admin' | 'student' | 'all') {
  const clearAdmin = !kind || kind === 'admin' || kind === 'all'
  const clearStudent = !kind || kind === 'student' || kind === 'all'
  if (clearAdmin) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
  }
  if (clearStudent) {
    localStorage.removeItem('studentToken')
    localStorage.removeItem('studentUser')
    sessionStorage.removeItem('studentToken')
    sessionStorage.removeItem('studentUser')
  }
}

/** 账号删除 / 会话踢出后强制回登录页 */
export function forceRelogin(message?: string, kind: 'admin' | 'student' | 'all' = 'all') {
  clearStoredAuth(kind)
  clearCache()
  try {
    if (message) sessionStorage.setItem('auth_flash', message)
  } catch {
    /* ignore */
  }
  const path = window.location.pathname || ''
  if (!path.includes('/login')) {
    window.location.assign('/#/login')
  }
}

function getAdminToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || ''
}

function getStudentToken() {
  return localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken') || ''
}

/** 当前前端区域：避免管理/学员双登录时串用对方 token */
function resolveAppArea(): 'admin' | 'student' | 'assistant' | 'public' {
  try {
    const hash = String(window.location.hash || '')
    const path = String(window.location.pathname || '')
    const loc = `${hash} ${path}`
    if (/#\/admin\b|\/admin\b/.test(loc)) return 'admin'
    if (/#\/assistant\b|\/assistant\b/.test(loc)) return 'assistant'
    if (/#\/student\b|\/student\b/.test(loc)) return 'student'
  } catch {
    /* ignore */
  }
  return 'public'
}

function resolveRequestToken(headers: Record<string, string>) {
  if (headers['Authorization']) return null
  const area = resolveAppArea()
  const adminToken = getAdminToken()
  const studentToken = getStudentToken()
  // 学员/助教区优先学员 JWT，避免管理端安全策略（绑邮箱/设备指纹）误伤学员接口
  if (area === 'student' || area === 'assistant') {
    return studentToken || adminToken
  }
  if (area === 'admin') {
    return adminToken || studentToken
  }
  return adminToken || studentToken
}

function authKindFromBearer(headers: Record<string, string>): 'admin' | 'student' | 'all' {
  const raw = headers['Authorization'] || ''
  const token = raw.replace(/^Bearer\s+/i, '').trim()
  if (!token) return 'all'
  if (token === getStudentToken() && token !== getAdminToken()) return 'student'
  if (token === getAdminToken() && token !== getStudentToken()) return 'admin'
  const area = resolveAppArea()
  if (area === 'student' || area === 'assistant') return 'student'
  if (area === 'admin') return 'admin'
  return 'all'
}

// 通用请求函数
async function request(url: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  const token = resolveRequestToken(headers)
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // 仅当实际使用管理员 JWT 时附带设备指纹，避免学员区误带管理端安全头
  const bearer = (headers['Authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (bearer && bearer === getAdminToken()) {
    try {
      const sec = await getAdminSecurityHeaders()
      Object.assign(headers, sec)
    } catch {
      /* ignore */
    }
  }

  // 只缓存GET请求
  const cacheKey = `${url}_${options.method || 'GET'}`
  const isGetRequest = !options.method || options.method === 'GET'

  if (isGetRequest) {
    const cached = requestCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data
    }
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  })

  const data = await response.json()

  if (!response.ok) {
    const code = data?.code
    const msg = data?.message || '请求失败'
    if (
      response.status === 401 &&
      headers['Authorization'] &&
      (code === 'ACCOUNT_GONE' ||
        code === 'EMAIL_REQUIRED' ||
        code === 'LOGIN_DISABLED' ||
        code === 'SESSION_IP_CHANGED' ||
        code === 'SESSION_DEVICE_CHANGED' ||
        code === 'SESSION_BINDING' ||
        code === 'SESSION_SUPERSEDED' ||
        /会话已失效|账号已不存在|账号已失效|管理员账号已失效|未绑定安全邮箱|禁止登录|IP 变化|设备环境变化|其它设备登录/.test(msg))
    ) {
      forceRelogin(msg, authKindFromBearer(headers))
    }
    const err: any = new Error(msg)
    err.code = code
    err.data = data.data
    err.status = response.status
    throw err
  }

  // 缓存GET请求结果
  if (isGetRequest) {
    requestCache.set(cacheKey, { data, timestamp: Date.now() })
  }

  return data
}

// 清除缓存的辅助函数
export function clearCache(pattern?: string) {
  if (pattern) {
    for (const key of requestCache.keys()) {
      if (key.includes(pattern)) {
        requestCache.delete(key)
      }
    }
  } else {
    requestCache.clear()
  }
}

// 成员管理 API
export const memberAPI = {
  getAll: () => request('/members'),
  /** 学员端：当前登录学员资料 */
  getMe: () => request('/members/me'),
  getById: (id: number) => request(`/members/${id}`),
  lookupByQq: (qq: string) =>
    request(`/members/lookup-qq?qq=${encodeURIComponent(qq)}`),
  getArchived: () => request('/members/archived'),
  getArchivedById: (id: number) => request(`/members/archived/${id}`),
  restore: async (id: number, data: { join_date?: string; nickname?: string; stage_role?: string }) => {
    const result = await request(`/members/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/members')
    return result
  },
  purgeArchived: async (id: number) => {
    const result = await request(`/members/archived/${id}/purge`, {
      method: 'DELETE',
    })
    clearCache('/members')
    return result
  },
  create: async (data: any) => {
    const result = await request('/members', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/members')
    return result
  },
  update: async (id: number, data: any) => {
    const result = await request(`/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/members')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/members/${id}`, {
      method: 'DELETE',
    })
    clearCache('/members')
    return result
  },
  resetPassword: async (id: number) => {
    const result = await request(`/members/${id}/reset-password`, {
      method: 'PUT',
    })
    return result
  },
  batchResetPassword: async (ids: number[]) => {
    const result = await request('/members/batch/reset-password', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    })
    return result
  },
  syncStage: async (memberIds?: number[]) => {
    const result = await request('/members/sync-stage', {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    })
    clearCache('/members')
    return result
  },
  getExamCandidates: () => {
    return request('/members/exam-candidates')
  },
  updateAvatar: async (id: number, avatar: string | null) => {
    const result = await request(`/members/${id}/avatar`, {
      method: 'PUT',
      body: JSON.stringify({ avatar }),
    })
    clearCache('/members')
    return result
  },
}

// 学员端 API
export const studentAPI = {
  login: (username: string, password: string) => request('/student/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  verify: (token: string) => request('/student/verify', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }),
  changePassword: (token: string, oldPassword: string, newPassword: string) => request('/student/change-password', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ oldPassword, newPassword }),
  }),
}

// 请假记录 API
export const leaveAPI = {
  getAll: () => request('/leaves'),
  getMy: (studentToken: string) => request('/leaves/my', {
    headers: { Authorization: `Bearer ${studentToken}` },
  }),
  getMyApplications: (studentToken: string) => request('/leaves/applications/my', {
    headers: { Authorization: `Bearer ${studentToken}` },
  }),
  getApplications: () => request('/leaves/applications'),
  applyLeave: async (studentToken: string, data: any) => {
    const result = await request('/leaves/applications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify(data),
    })
    return result
  },
  deleteApplication: async (id: number) => {
    const result = await request(`/leaves/applications/${id}`, {
      method: 'DELETE',
    })
    clearCache('/leaves')
    return result
  },
  reviewApplication: async (id: number, data: any) => {
    const result = await request(`/leaves/applications/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/leaves')
    clearCache('/members')
    return result
  },
  create: async (data: any) => {
    const result = await request('/leaves', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/leaves')
    clearCache('/members')
    return result
  },
  update: async (id: number, data: any) => {
    const result = await request(`/leaves/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/leaves')
    clearCache('/members')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/leaves/${id}`, {
      method: 'DELETE',
    })
    clearCache('/leaves')
    clearCache('/members')
    return result
  },
  autoUpdate: async () => {
    const result = await request('/leaves/auto-update', {
      method: 'POST',
    })
    clearCache('/leaves')
    clearCache('/members')
    return result
  },
  approveEndApproval: async (id: number, data: { reviewer_name: string }) => {
    const result = await request(`/leaves/${id}/end-approval`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/leaves')
    clearCache('/members')
    clearCache('/reminders')
    return result
  },
}

// 黑点记录 API
export const blackPointAPI = {
  getAll: () => request('/blackpoints'),
  getMy: (studentToken: string) => request('/blackpoints/my', {
    headers: { Authorization: `Bearer ${studentToken}` },
  }),
  create: async (data: any) => {
    const result = await request('/blackpoints', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/blackpoints')
    return result
  },
  update: async (id: number, data: any) => {
    const result = await request(`/blackpoints/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/blackpoints')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/blackpoints/${id}`, {
      method: 'DELETE',
    })
    clearCache('/blackpoints')
    return result
  },
}

// 催促名单 API
export const reminderAPI = {
  getAll: (mode?: 'remaining' | 'kick_cycle') =>
    request(`/reminders${mode ? `?mode=${mode}` : ''}`),
  getAttendance: (showAll = false) =>
    request(`/reminders/attendance?showAll=${showAll ? '1' : '0'}`),
  getAttendanceMe: (memberId: number) =>
    request(`/reminders/attendance/me/${memberId}`),
  getTrainingMe: (memberId: number) =>
    request(`/reminders/training/me/${memberId}`),
  ignoreAttendance: async (memberId: number, ignored_by?: string) => {
    const result = await request(`/reminders/attendance/ignore/${memberId}`, {
      method: 'POST',
      body: JSON.stringify({ ignored_by }),
    })
    clearCache('/reminders')
    return result
  },
  unignoreAttendance: async (memberId: number) => {
    const result = await request(`/reminders/attendance/ignore/${memberId}`, {
      method: 'DELETE',
    })
    clearCache('/reminders')
    return result
  },
  updateAttendanceTimeout: async (
    memberId: number,
    remaining_days: number | null,
    reason_code?: string
  ) => {
    const result = await request(`/reminders/attendance/${memberId}/timeout`, {
      method: 'PUT',
      body: JSON.stringify({ remaining_days, reason_code }),
    })
    clearCache('/reminders')
    return result
  },
  batchUpdateAttendanceTimeout: async (member_ids: number[], remaining_days: number | null) => {
    const result = await request('/reminders/attendance/batch/timeout', {
      method: 'PUT',
      body: JSON.stringify({ member_ids, remaining_days }),
    })
    clearCache('/reminders')
    return result
  },
  getTimeoutDays: () => request('/settings/reminder_timeout_days'),
  updateTimeoutDays: (days: number) => request('/settings/reminder_timeout_days', {
    method: 'PUT',
    body: JSON.stringify({ value: days }),
  }),
  getFormalTimeoutDays: () => request('/settings/reminder_formal_timeout_days'),
  updateFormalTimeoutDays: (days: number) => request('/settings/reminder_formal_timeout_days', {
    method: 'PUT',
    body: JSON.stringify({ value: days }),
  }),
  getRulesConfig: () => request('/reminders/rules-config'),
  saveRulesConfig: async (config: unknown) => {
    const result = await request('/reminders/rules-config', {
      method: 'PUT',
      body: JSON.stringify({ config }),
    })
    clearCache('/reminders')
    clearCache('/settings')
    return result
  },
  /** 正式队员取消短周期考勤 → 180 天 */
  cancelFormalAttendance: async (memberId: number) => {
    const result = await request(`/reminders/formal/${memberId}/use-180`, { method: 'POST' })
    clearCache('/reminders')
    return result
  },
  /** 恢复正式队员短周期考勤 */
  restoreFormalAttendance: async (memberId: number) => {
    const result = await request(`/reminders/formal/${memberId}/use-180`, { method: 'DELETE' })
    clearCache('/reminders')
    return result
  },
  getKickSettings: async () => {
    const [weekday, lead, mode, formal] = await Promise.all([
      request('/settings/reminder_kick_weekday'),
      request('/settings/reminder_kick_lead_days'),
      request('/settings/reminder_display_mode'),
      request('/settings/reminder_formal_timeout_days').catch(() => ({ data: { setting_value: '0' } })),
    ])
    return {
      kickWeekday: parseInt(weekday.data?.setting_value, 10) || 1,
      leadDays: parseInt(lead.data?.setting_value, 10) || 3,
      displayMode: (mode.data?.setting_value === 'kick_cycle' ? 'kick_cycle' : 'remaining') as 'remaining' | 'kick_cycle',
      formalTimeoutDays: Math.max(0, parseInt(formal.data?.setting_value, 10) || 0),
    }
  },
  updateKickSettings: async (opts: {
    kickWeekday?: number
    leadDays?: number
    displayMode?: 'remaining' | 'kick_cycle'
    formalTimeoutDays?: number
  }) => {
    const tasks: Promise<unknown>[] = []
    if (opts.kickWeekday != null) {
      tasks.push(request('/settings/reminder_kick_weekday', {
        method: 'PUT',
        body: JSON.stringify({ value: opts.kickWeekday }),
      }))
    }
    if (opts.leadDays != null) {
      tasks.push(request('/settings/reminder_kick_lead_days', {
        method: 'PUT',
        body: JSON.stringify({ value: opts.leadDays }),
      }))
    }
    if (opts.displayMode != null) {
      tasks.push(request('/settings/reminder_display_mode', {
        method: 'PUT',
        body: JSON.stringify({ value: opts.displayMode }),
      }))
    }
    if (opts.formalTimeoutDays != null) {
      tasks.push(request('/settings/reminder_formal_timeout_days', {
        method: 'PUT',
        body: JSON.stringify({ value: Math.max(0, opts.formalTimeoutDays) }),
      }))
    }
    await Promise.all(tasks)
    clearCache('/reminders')
  },
  autoUpdate: async (timeoutDays: number = 7) => {
    const result = await request('/reminders/auto-update', {
      method: 'POST',
      body: JSON.stringify({ timeoutDays }),
    })
    clearCache('/reminders')
    return result
  },
  updateTimeout: async (id: number, custom_timeout_days: number | null) => {
    const result = await request(`/reminders/${id}/timeout`, {
      method: 'PUT',
      body: JSON.stringify({ custom_timeout_days }),
    })
    clearCache('/reminders')
    return result
  },
  batchUpdateTimeout: async (ids: number[], custom_timeout_days: number | null) => {
    const result = await request('/reminders/batch/timeout', {
      method: 'PUT',
      body: JSON.stringify({ ids, custom_timeout_days }),
    })
    clearCache('/reminders')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/reminders/${id}`, {
      method: 'DELETE',
    })
    clearCache('/reminders')
    return result
  }
}

// 退队审批 API
export const quitAPI = {
  getAll: () => request('/quit'),
  create: async (data: any) => {
    const result = await request('/quit', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/quit')
    clearCache('/members')
    return result
  },
  approve: async (id: number, data: any) => {
    const result = await request(`/quit/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/quit')
    clearCache('/members')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/quit/${id}`, {
      method: 'DELETE',
    })
    clearCache('/quit')
    clearCache('/members')
    return result
  },
  autoGenerate: async () => {
    const result = await request('/quit/auto-generate', {
      method: 'POST',
    })
    clearCache('/quit')
    return result
  },
}

// 留队管理 API
export const retentionAPI = {
  getAll: () => request('/retention'),
  create: (data: any) => request('/retention', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => request(`/retention/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: number) => request(`/retention/${id}`, {
    method: 'DELETE',
  }),
}

// 课程管理 API
export const courseAPI = {
  // 获取所有课程
  getAll: () => request('/courses'),
  
  // 获取单个课程
  getById: (id: string) => request(`/courses/${id}`),
  
  // 创建课程
  create: async (data: any) => {
    const result = await request('/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/courses')
    return result
  },
  
  // 更新课程
  update: async (id: string, data: any) => {
    const result = await request(`/courses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/courses')
    return result
  },
  
  // 删除课程
  delete: async (id: string) => {
    const result = await request(`/courses/${id}`, {
      method: 'DELETE',
    })
    clearCache('/courses')
    return result
  },
  
  // 批量删除课程
  batchDelete: async (ids: string[]) => {
    const result = await request('/courses/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/courses')
    return result
  },
  
  // 批量更新课程
  batchUpdate: async (ids: string[], updates: any) => {
    const result = await request('/courses/batch/update', {
      method: 'PUT',
      body: JSON.stringify({ ids, updates }),
    })
    clearCache('/courses')
    return result
  },
  
  // 更新课程顺序
  updateOrder: async (courses: any[]) => {
    const result = await request('/courses/order', {
      method: 'PUT',
      body: JSON.stringify({ courses }),
    })
    clearCache('/courses')
    return result
  },
  
  // 获取类别配置
  getCategories: () => request('/courses/config/categories'),
  
  // 更新类别配置
  updateCategories: async (categories: Array<string | { name: string; color?: string }>) => {
    const result = await request('/courses/config/categories', {
      method: 'PUT',
      body: JSON.stringify({ categories }),
    })
    clearCache('/courses')
    clearCache('/courses/config/categories')
    return result
  },
  
  // 获取难度配置
  getDifficulties: () => request('/courses/config/difficulties'),
  
  // 更新难度配置
  updateDifficulties: async (difficulties: Array<string | { name: string; color?: string }>) => {
    const result = await request('/courses/config/difficulties', {
      method: 'PUT',
      body: JSON.stringify({ difficulties }),
    })
    clearCache('/courses')
    clearCache('/courses/config/difficulties')
    return result
  }
}

// 进度管理 API
export const progressAPI = {
  // 获取所有成员及其进度信息
  getMembers: () => request('/progress/members'),

  // 学员端：自己的课程进度
  getMy: () => request('/progress/my'),
  
  // 获取单个成员的所有课程进度
  getMemberProgress: (memberId: string) => request(`/progress/member/${memberId}`),

  /** 批量预览：多成员进度汇总（一致则 progress，不一致则 mixed） */
  getBatchCoursesPreview: (memberIds: string[] | number[]) =>
    request('/progress/batch/courses', {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    }),
  
  // 更新单个成员的单个课程进度
  updateProgress: async (memberId: string, courseId: string, progress: number) => {
    const result = await request(`/progress/member/${memberId}/course/${courseId}`, {
      method: 'PUT',
      body: JSON.stringify({ progress }),
    })
    clearCache('/progress')
    return result
  },
  
  // 批量更新多个成员的单个课程进度
  batchUpdateCourse: async (courseId: string, memberIds: string[], progress: number) => {
    const result = await request(`/progress/batch/course/${courseId}`, {
      method: 'PUT',
      body: JSON.stringify({ memberIds, progress }),
    })
    clearCache('/progress')
    return result
  },
  
  // 批量更新单个成员的多个课程进度
  batchUpdateMember: async (memberId: string, updates: { courseId: string; progress: number }[]) => {
    const result = await request(`/progress/batch/member/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    })
    clearCache('/progress')
    return result
  }
}

// 认证 API
export const authAPI = {
  login: (username: string, password: string, userType: 'admin' | 'student') =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, userType }),
    }),
}

function accountSecurityToken() {
  return (
    localStorage.getItem('studentToken') ||
    sessionStorage.getItem('studentToken') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    ''
  )
}

/** 账户安全（学员 / 管理共用） */
export const accountSecurityAPI = {
  getProfile: () => {
    const token = accountSecurityToken()
    return request('/account-security/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
  },
  changePassword: async (oldPassword: string, newPassword: string) => {
    const token = accountSecurityToken()
    const result = await request('/account-security/password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ oldPassword, newPassword }),
    })
    clearCache('/account-security/sessions')
    return result
  },
  updateAvatar: (avatar: string | null) => {
    const token = accountSecurityToken()
    return request('/account-security/avatar', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatar }),
    })
  },
  getSessions: () => {
    const token = accountSecurityToken()
    return request('/account-security/sessions', {
      headers: { Authorization: `Bearer ${token}` },
    })
  },
  /** 退出当前设备（服务端标记会话失效） */
  logoutCurrent: () => {
    const token = accountSecurityToken()
    return request('/account-security/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  },
  revokeSession: async (id: number) => {
    const token = accountSecurityToken()
    const result = await request(`/account-security/sessions/${id}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    clearCache('/account-security/sessions')
    return result
  },
  deleteSession: async (id: number) => {
    const token = accountSecurityToken()
    const result = await request(`/account-security/sessions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    clearCache('/account-security/sessions')
    return result
  },
  revokeOtherSessions: async () => {
    const token = accountSecurityToken()
    const result = await request('/account-security/sessions/others', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    clearCache('/account-security/sessions')
    return result
  },
  /** 未记住登录时的标签页保活 */
  heartbeat: () => {
    const token = accountSecurityToken()
    return request('/account-security/heartbeat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  },
}

/** 管理端安全中心（审计 / 全管理员会话 / 账号管理） */
export const securityAPI = {
  getMe: () => request('/security/me'),
  getAuditLogs: (params?: {
    page?: number
    pageSize?: number
    limit?: number
    offset?: number
    q?: string
    admin_id?: number
    from?: string
    to?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.page != null) qs.set('page', String(params.page))
    if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize))
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    if (params?.q) qs.set('q', params.q)
    if (params?.admin_id != null) qs.set('admin_id', String(params.admin_id))
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    const q = qs.toString()
    return request(`/security/audit-logs${q ? `?${q}` : ''}`)
  },
  getAdminSessions: () => request('/security/admin-sessions'),
  getAdmins: () => request('/security/admins'),
  revokeAdminSessions: (adminId: number, superKey: string) =>
    request(`/security/admins/${adminId}/revoke-sessions`, {
      method: 'POST',
      body: JSON.stringify({ super_key: superKey }),
    }),
  revokeSession: (rowId: number, adminId: number, superKey: string) =>
    request(`/security/sessions/${rowId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ admin_id: adminId, super_key: superKey }),
    }),
  setAdminEmail: (adminId: number, email: string, superKey: string) =>
    request(`/security/admins/${adminId}/email`, {
      method: 'PUT',
      body: JSON.stringify({ email, super_key: superKey }),
    }),
  createAdmin: (data: {
    username: string
    password: string
    name?: string
    email: string
    is_super_admin?: boolean
    super_key: string
  }) =>
    request('/security/admins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  setSuperAdmin: (adminId: number, is_super_admin: boolean, superKey: string) =>
    request(`/security/admins/${adminId}/super`, {
      method: 'PUT',
      body: JSON.stringify({ is_super_admin, super_key: superKey }),
    }),
  setLoginDisabled: (adminId: number, login_disabled: boolean, superKey: string) =>
    request(`/security/admins/${adminId}/login-disabled`, {
      method: 'PUT',
      body: JSON.stringify({ login_disabled, super_key: superKey }),
    }),
  deleteAdmin: (adminId: number, superKey: string) =>
    request(`/security/admins/${adminId}`, {
      method: 'DELETE',
      headers: { 'x-super-key': superKey },
      body: JSON.stringify({ super_key: superKey }),
    }),
}

// 考核记录 API
export const assessmentAPI = {
  getAll: () => request('/assessments'),
  getByMemberId: (memberId: number) => request(`/assessments/member/${memberId}`),
  create: async (data: any) => {
    const result = await request('/assessments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/assessments')
    return result
  },
  update: async (id: number, data: any) => {
    const result = await request(`/assessments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/assessments')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/assessments/${id}`, {
      method: 'DELETE',
    })
    clearCache('/assessments')
    return result
  },
  batchDelete: async (ids: number[]) => {
    const result = await request('/assessments/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/assessments')
    return result
  },
}

// 公开视频 API
export const publicVideoAPI = {
  getAll: () => request('/public-videos'),
  getById: (id: number) => request(`/public-videos/${id}`),
  create: async (data: any) => {
    const result = await request('/public-videos', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/public-videos')
    return result
  },
  update: async (id: number, data: any) => {
    const result = await request(`/public-videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    clearCache('/public-videos')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/public-videos/${id}`, {
      method: 'DELETE',
    })
    clearCache('/public-videos')
    return result
  },
  batchDelete: async (ids: number[]) => {
    const result = await request('/public-videos/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/public-videos')
    return result
  },
}

// 视频上传 API
export const videoUploadAPI = {
  upload: async (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            onProgress(progress)
          }
        })
      }

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch (e) {
            reject(new Error('服务器返回格式错误'))
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText)
            reject(new Error(errorData.message || `上传失败 (${xhr.status})`))
          } catch (e) {
            reject(new Error(`上传失败 (${xhr.status}): ${xhr.responseText || xhr.statusText}`))
          }
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('网络错误'))
      })
      
      xhr.addEventListener('abort', () => {
        reject(new Error('上传已取消'))
      })
      
      xhr.addEventListener('timeout', () => {
        reject(new Error('上传超时'))
      })

      xhr.open('POST', `${API_BASE_URL}/video-upload/upload`)
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }
      xhr.send(formData)
    })
  },
  importDrive: async (driveId: string) => {
    return request('/video-upload/import-drive', {
      method: 'POST',
      body: JSON.stringify({ driveId }),
    })
  },
  list: async (page: number = 1, folderId: string = '') => {
    let url = `/video-upload/list?page=${page}`
    if (folderId) {
      url += `&folderId=${folderId}`
    }
    return request(url)
  },
  getStatus: async (slug: string) => {
    return request(`/video-upload/status/${slug}`)
  },
  copy: async (slug: string) => {
    return request(`/video-upload/copy/${slug}`, {
      method: 'POST',
    })
  },
  delete: async (slug: string) => {
    return request(`/video-upload/delete/${slug}`, {
      method: 'DELETE',
    })
  },
  addSubtitle: async (slug: string, label: string, url: string) => {
    return request(`/video-upload/subtitle/${slug}`, {
      method: 'POST',
      body: JSON.stringify({ label, url }),
    })
  },
}

// 考核申请 API
export const assessmentApplicationAPI = {
  getAll: () => request('/assessment-applications'),
  getByMemberId: (memberId: number) => request(`/assessment-applications/member/${memberId}`),
  create: async (data: any) => {
    const result = await request('/assessment-applications', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/assessment-applications')
    return result
  },
  approve: async (id: number, approved_by?: string) => {
    const result = await request(`/assessment-applications/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_by }),
    })
    clearCache('/assessment-applications')
    return result
  },
  reject: async (id: number, reject_reason: string, approved_by?: string) => {
    const result = await request(`/assessment-applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reject_reason, approved_by }),
    })
    clearCache('/assessment-applications')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/assessment-applications/${id}`, {
      method: 'DELETE',
    })
    clearCache('/assessment-applications')
    return result
  },
}

// 考核须知 API
export const assessmentGuidelinesAPI = {
  get: () => request('/assessment-guidelines'),
  update: async (content: string, updated_by?: string) => {
    const result = await request('/assessment-guidelines', {
      method: 'PUT',
      body: JSON.stringify({ content, updated_by }),
    })
    clearCache('/assessment-guidelines')
    return result
  },
}

// 反作弊管理 API
export const anticheatAPI = {
  getAvailableTickets: () => request('/anticheat/tickets/available'),
  importTicket: async (data: {
    admission_ticket: string
    member_id: number
    member_name: string
    valid_days?: number
  }) => {
    const result = await request('/anticheat/tickets/import', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/anticheat')
    return result
  },
  importTicketsBatch: async (tickets: any[], valid_days = 7) => {
    const result = await request('/anticheat/tickets/import/batch', {
      method: 'POST',
      body: JSON.stringify({ tickets, valid_days }),
    })
    clearCache('/anticheat')
    return result
  },

  getConfigs: () => request('/anticheat/configs'),
  getConfig: (id: number) => request(`/anticheat/configs/${id}`),
  updateConfig: async (id: number, data: Record<string, unknown>) => {
    const result = await request(`/anticheat/configs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    clearCache('/anticheat')
    return result
  },
  reactivateConfig: async (id: number, extend_days = 7) => {
    const result = await request(`/anticheat/configs/${id}/reactivate`, {
      method: 'POST',
      body: JSON.stringify({ extend_days }),
    })
    clearCache('/anticheat')
    return result
  },
  deleteConfig: async (id: number) => {
    const result = await request(`/anticheat/configs/${id}`, { method: 'DELETE' })
    clearCache('/anticheat')
    return result
  },
  batchDeleteConfigs: async (ids: number[]) => {
    const result = await request('/anticheat/configs/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/anticheat')
    return result
  },

  getMods: (configId: number) => request(`/anticheat/configs/${configId}/mods`),
  addMods: async (
    configId: number,
    mods: Array<{ filename: string; hash: string; size: number; path?: string; relativePath?: string }>
  ) => {
    const result = await request(`/anticheat/configs/${configId}/mods`, {
      method: 'POST',
      body: JSON.stringify({ mods }),
    })
    clearCache('/anticheat')
    return result
  },
  deleteMod: async (id: number) => {
    const result = await request(`/anticheat/mods/${id}`, { method: 'DELETE' })
    clearCache('/anticheat')
    return result
  },
  batchDeleteMods: async (ids: number[]) => {
    const result = await request('/anticheat/mods/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/anticheat')
    return result
  },

  getSessions: (limit = 100) => request(`/anticheat/sessions?limit=${limit}`),
  getSession: (id: number) => request(`/anticheat/sessions/${id}`),
  endSession: async (id: number, reason?: string) => {
    const result = await request(`/anticheat/sessions/${id}/end`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    clearCache('/anticheat')
    return result
  },
  terminateSession: async (id: number, reason?: string) => {
    const result = await request(`/anticheat/sessions/${id}/terminate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    clearCache('/anticheat')
    return result
  },
  deleteSession: async (id: number) => {
    const result = await request(`/anticheat/sessions/${id}`, { method: 'DELETE' })
    clearCache('/anticheat')
    return result
  },
  batchEndSessions: async (ids: number[]) => {
    const result = await request('/anticheat/sessions/batch-end', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/anticheat')
    return result
  },
  batchTerminateSessions: async (ids: number[]) => {
    const result = await request('/anticheat/sessions/batch-terminate', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/anticheat')
    return result
  },
  batchDeleteSessions: async (ids: number[]) => {
    const result = await request('/anticheat/sessions/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    clearCache('/anticheat')
    return result
  },
  requestScreenshot: (id: number) =>
    request(`/anticheat/sessions/${id}/request-screenshot`, { method: 'POST' }),
  batchRequestScreenshot: (ids: number[]) =>
    request('/anticheat/sessions/batch-request-screenshot', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  getSessionLogs: (id: number, params: { page?: number; limit?: number; log_type?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
    if (params.log_type) q.set('log_type', params.log_type)
    const qs = q.toString()
    return request(`/anticheat/sessions/${id}/logs${qs ? `?${qs}` : ''}`)
  },
  getSessionScreenshots: (id: number) => request(`/anticheat/sessions/${id}/screenshots`),
  getScreenshot: (id: number) => request(`/anticheat/screenshots/${id}`),
  getSessionSnapshots: (id: number, file_type?: string) =>
    request(`/anticheat/sessions/${id}/snapshots${file_type ? `?file_type=${encodeURIComponent(file_type)}` : ''}`),
  getSessionProcesses: (id: number, page = 1, limit = 50) =>
    request(`/anticheat/sessions/${id}/processes?page=${page}&limit=${limit}`),
  getClientLogs: (id: number, page = 1, limit = 50) =>
    request(`/anticheat/sessions/${id}/client-logs?page=${page}&limit=${limit}`),

  getSettings: () => request('/anticheat/settings'),
  updateSettings: (data: { client_version?: string; map_pack_password?: string }) =>
    request('/anticheat/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getDllWhitelist: (memberId?: number, q?: string) => {
    const params = new URLSearchParams()
    if (memberId) params.set('member_id', String(memberId))
    if (q) params.set('q', q)
    const qs = params.toString()
    return request(`/anticheat/dll-whitelist${qs ? `?${qs}` : ''}`)
  },
  addDllWhitelist: async (data: {
    member_id: number
    dll_name: string
    dll_path?: string
    note?: string
  }) => {
    const result = await request('/anticheat/dll-whitelist', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/anticheat')
    return result
  },
  deleteDllWhitelist: async (id: number) => {
    const result = await request(`/anticheat/dll-whitelist/${id}`, { method: 'DELETE' })
    clearCache('/anticheat')
    return result
  },
  getSessionInjectionDlls: (sessionId: number) =>
    request(`/anticheat/sessions/${sessionId}/injection-dlls`),
}

function getStudentAuthToken() {
  return localStorage.getItem('studentToken') || sessionStorage.getItem('studentToken') || ''
}

// 填表 / 调查问卷 API
export const surveyAPI = {
  // 管理端（使用 admin token）
  list: () => request('/surveys'),
  get: (id: number) => request(`/surveys/${id}`),
  create: async (data: any) => {
    const result = await request('/surveys', { method: 'POST', body: JSON.stringify(data) })
    clearCache('/surveys')
    return result
  },
  update: async (id: number, data: any) => {
    const result = await request(`/surveys/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    clearCache('/surveys')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/surveys/${id}`, { method: 'DELETE' })
    clearCache('/surveys')
    return result
  },
  deleteResponse: async (surveyId: number, responseId: number) => {
    const result = await request(`/surveys/${surveyId}/responses/${responseId}`, {
      method: 'DELETE',
    })
    clearCache('/surveys')
    return result
  },
  results: (id: number) => request(`/surveys/${id}/results`),
  publicResults: (id: number) =>
    request(`/surveys/${id}/public-results`, {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),

  // 学员端（显式带 studentToken）
  available: () =>
    request('/surveys/available', {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),
  availableDetail: (id: number) =>
    request(`/surveys/available/${id}`, {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),
  claim: (id: number) =>
    request(`/surveys/${id}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
      body: JSON.stringify({}),
    }),
  /** 匿名交卷：不带 Authorization，仅 token + answers */
  submitAnonymous: async (id: number, token: string, answers: Record<string, unknown>) => {
    const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'
    const response = await fetch(`${base}/surveys/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, answers }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || '提交失败')
    return data
  },
  submitNamed: (id: number, answers: Record<string, unknown>) =>
    request(`/surveys/${id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
      body: JSON.stringify({ answers }),
    }),
}

/** 在线表格文档 */
export const sheetAPI = {
  list: () => request('/sheets'),
  get: (id: number) => request(`/sheets/${id}`),
  create: async (data: any) => {
    const result = await request('/sheets', { method: 'POST', body: JSON.stringify(data) })
    clearCache('/sheets')
    return result
  },
  update: async (id: number, data: any) => {
    const result = await request(`/sheets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    clearCache('/sheets')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/sheets/${id}`, { method: 'DELETE' })
    clearCache('/sheets')
    return result
  },
  pin: async (id: number, pinned?: boolean) => {
    const result = await request(`/sheets/${id}/pin`, {
      method: 'POST',
      body: JSON.stringify(pinned === undefined ? {} : { pinned }),
    })
    clearCache('/sheets')
    return result
  },
  reorder: async (ids: number[]) => {
    const result = await request('/sheets/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    })
    clearCache('/sheets')
    return result
  },
  presence: async (id: number, data: { session_id: string; editing?: boolean }) => {
    return request(`/sheets/${id}/presence`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  leavePresence: async (id: number, sessionId: string) => {
    return request(`/sheets/${id}/presence?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
  },
  studentPresence: async (id: number, data: { session_id: string; editing?: boolean }) => {
    return request(`/sheets/student/${id}/presence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
      body: JSON.stringify(data),
    })
  },
  studentLeavePresence: async (id: number, sessionId: string) => {
    return request(
      `/sheets/student/${id}/presence?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
      }
    )
  },
  copy: async (
    id: number,
    data: {
      title?: string
      description?: string
      access_mode?: string
      status?: string
      assignee_ids?: number[]
    }
  ) => {
    const result = await request(`/sheets/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    clearCache('/sheets')
    return result
  },
  studentList: () =>
    request('/sheets/student/list', {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),
  studentGet: (id: number) =>
    request(`/sheets/student/${id}`, {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),
  studentSave: async (id: number, content: any) => {
    const result = await request(`/sheets/student/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
      body: JSON.stringify({ content }),
    })
    clearCache('/sheets')
    return result
  },
  revisions: (id: number) => request(`/sheets/${id}/revisions`),
  revisionDetail: (id: number, revId: number) => request(`/sheets/${id}/revisions/${revId}`),
  restoreRevision: async (id: number, revId: number) => {
    const result = await request(`/sheets/${id}/revisions/${revId}/restore`, { method: 'POST' })
    clearCache('/sheets')
    return result
  },
  studentRevisions: (id: number) =>
    request(`/sheets/student/${id}/revisions`, {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),
  studentRevisionDetail: (id: number, revId: number) =>
    request(`/sheets/student/${id}/revisions/${revId}`, {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),
}

/** 意见箱 */
export const opinionBoxAPI = {
  submit: async (data: { content: string; is_anonymous?: boolean; category?: string }) => {
    const result = await request('/opinion-box', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
      body: JSON.stringify(data),
    })
    clearCache('/opinion-box')
    return result
  },
  my: () =>
    request('/opinion-box/my', {
      headers: { Authorization: `Bearer ${getStudentAuthToken()}` },
    }),
  list: (status?: string) =>
    request(`/opinion-box${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  update: async (id: number, data: { status?: string; admin_note?: string | null }) => {
    const result = await request(`/opinion-box/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    clearCache('/opinion-box')
    return result
  },
  delete: async (id: number) => {
    const result = await request(`/opinion-box/${id}`, { method: 'DELETE' })
    clearCache('/opinion-box')
    return result
  },
}

function studentAuthHeaders() {
  return { Authorization: `Bearer ${getStudentAuthToken()}` }
}

/** 紫夜助教 API（学员 token） / 管理审批（管理员 token） */
export const assistantAPI = {
  me: () => request('/assistant/me', { headers: studentAuthHeaders() }),
  roster: () => request('/assistant/roster', { headers: studentAuthHeaders() }),
  students: () => request('/assistant/students', { headers: studentAuthHeaders() }),
  requestStudent: async (student_member_id: number, remarks?: string) => {
    const result = await request('/assistant/assignments/request', {
      method: 'POST',
      headers: studentAuthHeaders(),
      body: JSON.stringify({ student_member_id, remarks }),
    })
    clearCache('/assistant/roster')
    clearCache('/assistant/my-requests')
    clearCache('/assistant/students')
    return result
  },
  setStudentStage: (id: number, data: { stage_role: string; reason?: string }) =>
    request(`/assistant/students/${id}/stage`, {
      method: 'PUT',
      headers: studentAuthHeaders(),
      body: JSON.stringify(data),
    }),
  proposeMember: async (data: any) => {
    const result = await request('/assistant/members', {
      method: 'POST',
      headers: studentAuthHeaders(),
      body: JSON.stringify(data),
    })
    clearCache('/assistant/roster')
    clearCache('/assistant/my-requests')
    return result
  },
  lookupMemberByQq: (qq: string) =>
    request(`/assistant/members/lookup-qq?qq=${encodeURIComponent(qq)}`, {
      headers: studentAuthHeaders(),
    }),
  progressMembers: () =>
    request('/assistant/progress/members', { headers: studentAuthHeaders() }),
  progressMember: (memberId: number) =>
    request(`/assistant/progress/member/${memberId}`, { headers: studentAuthHeaders() }),
  setProgress: (memberId: number, courseId: number, progress: number) =>
    request(`/assistant/progress/member/${memberId}/course/${courseId}`, {
      method: 'PUT',
      headers: studentAuthHeaders(),
      body: JSON.stringify({ progress }),
    }),
  syncStageAfterProgress: (memberIds: number[]) =>
    request('/assistant/progress/sync-stage', {
      method: 'POST',
      headers: studentAuthHeaders(),
      body: JSON.stringify({ memberIds }),
    }),
  attendance: (showAll = false) =>
    request(`/assistant/attendance?showAll=${showAll ? '1' : '0'}`, { headers: studentAuthHeaders() }),
  trainingReminders: (mode?: string) =>
    request(`/assistant/reminders/training${mode ? `?mode=${mode}` : ''}`, { headers: studentAuthHeaders() }),
  proposeQuit: (member_id: number, remarks: string) =>
    request('/assistant/quit', {
      method: 'POST',
      headers: studentAuthHeaders(),
      body: JSON.stringify({ member_id, remarks }),
    }),
  myRequests: () => request('/assistant/my-requests', { headers: studentAuthHeaders() }),
  studentDetail: (id: number) =>
    request(`/assistant/students/${id}/detail`, { headers: studentAuthHeaders() }),
  proposeEdit: (id: number, data: Record<string, unknown>) =>
    request(`/assistant/students/${id}/propose-edit`, {
      method: 'POST',
      headers: studentAuthHeaders(),
      body: JSON.stringify(data),
    }),
  proposeBlackPoint: (id: number, data: { reason: string; register_date?: string }) =>
    request(`/assistant/students/${id}/propose-black-point`, {
      method: 'POST',
      headers: studentAuthHeaders(),
      body: JSON.stringify(data),
    }),
  proposeLeave: (id: number, data: { reason?: string; start_date: string; end_date: string }) =>
    request(`/assistant/students/${id}/propose-leave`, {
      method: 'POST',
      headers: studentAuthHeaders(),
      body: JSON.stringify(data),
    }),
  activeLeaves: () =>
    request('/assistant/leaves/active', { headers: studentAuthHeaders() }),
  endLeaveEarly: async (id: number) => {
    const result = await request(`/assistant/leaves/${id}/end-early`, {
      method: 'PUT',
      headers: studentAuthHeaders(),
    })
    clearCache('/assistant')
    clearCache('/leaves')
    return result
  },
  setLastTrainingDate: (id: number, last_training_date?: string) =>
    request(`/assistant/students/${id}/last-training-date`, {
      method: 'PUT',
      headers: studentAuthHeaders(),
      body: JSON.stringify({ last_training_date }),
    }),

  adminList: () => request('/assistant/admin/list'),
  adminEnable: async (id: number) => {
    const result = await request(`/assistant/admin/${id}/enable`, { method: 'POST' })
    clearCache('/assistant')
    return result
  },
  adminDisable: async (id: number) => {
    const result = await request(`/assistant/admin/${id}/disable`, { method: 'POST' })
    clearCache('/assistant')
    return result
  },
  adminDefaults: () => request('/assistant/admin/defaults'),
  adminSetPermissions: async (
    id: number,
    permissions: Record<string, boolean>,
    screen_share?: {
      screen_share_enabled?: boolean
      screen_share_quota?: number | null
      guest_code_max?: number
      reset_used?: boolean
    }
  ) => {
    const result = await request(`/assistant/admin/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, screen_share }),
    })
    clearCache('/assistant')
    return result
  },
  adminAssign: async (assistant_member_id: number, student_member_id: number) => {
    const result = await request('/assistant/admin/assignments', {
      method: 'POST',
      body: JSON.stringify({ assistant_member_id, student_member_id }),
    })
    clearCache('/assistant')
    return result
  },
  adminDailyAssign: async (assistant_member_id: number, student_member_id: number, remarks?: string) => {
    const result = await request('/assistant/admin/daily-assignments', {
      method: 'POST',
      body: JSON.stringify({ assistant_member_id, student_member_id, remarks }),
    })
    clearCache('/assistant')
    return result
  },
  adminDailyUnassign: async (id: number) => {
    const result = await request(`/assistant/admin/daily-assignments/${id}`, { method: 'DELETE' })
    clearCache('/assistant')
    return result
  },
  adminUnassign: async (id: number) => {
    const result = await request(`/assistant/admin/assignments/${id}`, { method: 'DELETE' })
    clearCache('/assistant')
    return result
  },
  adminPending: () => request('/assistant/admin/pending'),
  adminDeleteRequest: async (type: string, id: number) => {
    const result = await request(`/assistant/admin/requests/${type}/${id}`, { method: 'DELETE' })
    clearCache('/assistant')
    return result
  },
  adminReviewAssignment: async (id: number, status: string, remarks?: string) => {
    const result = await request(`/assistant/admin/assignments/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify({ status, remarks }),
    })
    clearCache('/assistant')
    return result
  },
  adminReviewCreate: async (id: number, status: string, reject_reason?: string) => {
    const result = await request(`/assistant/admin/member-creates/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify({ status, reject_reason }),
    })
    clearCache('/assistant')
    return result
  },
  adminReviewPromotion: async (id: number, status: string, reject_reason?: string) => {
    const result = await request(`/assistant/admin/stage-promotions/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify({ status, reject_reason }),
    })
    clearCache('/assistant')
    return result
  },
  adminReviewEdit: async (id: number, status: string, reject_reason?: string) => {
    const result = await request(`/assistant/admin/member-edits/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify({ status, reject_reason }),
    })
    clearCache('/assistant')
    return result
  },
  adminReviewBlackPoint: async (id: number, status: string, reject_reason?: string) => {
    const result = await request(`/assistant/admin/black-points/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify({ status, reject_reason }),
    })
    clearCache('/assistant')
    return result
  },
  adminReviewLeave: async (id: number, status: string, reject_reason?: string) => {
    const result = await request(`/assistant/admin/leaves/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify({ status, reject_reason }),
    })
    clearCache('/assistant')
    return result
  },
  adminAssignmentsByAssistant: (id: number) =>
    request(`/assistant/admin/assignments-by-assistant/${id}`),
}

