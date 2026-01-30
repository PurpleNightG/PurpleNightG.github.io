// API 基础配置
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

// 简单的请求缓存
const requestCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 3000 // 3秒缓存

// 通用请求函数
async function request(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
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
    throw new Error(data.message || '请求失败')
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
  getById: (id: number) => request(`/members/${id}`),
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
  }
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
}

// 黑点记录 API
export const blackPointAPI = {
  getAll: () => request('/blackpoints'),
  create: (data: any) => request('/blackpoints', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => request(`/blackpoints/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: number) => request(`/blackpoints/${id}`, {
    method: 'DELETE',
  }),
}

// 催促名单 API
export const reminderAPI = {
  getAll: () => request('/reminders'),
  getTimeoutDays: () => request('/settings/reminder_timeout_days'),
  updateTimeoutDays: (days: number) => request('/settings/reminder_timeout_days', {
    method: 'PUT',
    body: JSON.stringify({ value: days }),
  }),
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
  updateCategories: async (categories: string[]) => {
    const result = await request('/courses/config/categories', {
      method: 'PUT',
      body: JSON.stringify({ categories }),
    })
    clearCache('/courses')
    return result
  },
  
  // 获取难度配置
  getDifficulties: () => request('/courses/config/difficulties'),
  
  // 更新难度配置
  updateDifficulties: async (difficulties: string[]) => {
    const result = await request('/courses/config/difficulties', {
      method: 'PUT',
      body: JSON.stringify({ difficulties }),
    })
    clearCache('/courses')
    return result
  }
}

// 进度管理 API
export const progressAPI = {
  // 获取所有成员及其进度信息
  getMembers: () => request('/progress/members'),
  
  // 获取单个成员的所有课程进度
  getMemberProgress: (memberId: string) => request(`/progress/member/${memberId}`),
  
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
