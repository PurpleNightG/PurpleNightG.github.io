import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, KeyRound, MonitorSmartphone, LogOut, Upload, Trash2, Loader2, User,
} from 'lucide-react'
import { accountSecurityAPI, clearCache } from '../utils/api'
import { toast } from '../utils/toast'
import { formatDateTime } from '../utils/dateFormat'
import { compressImageToDataUrl } from '../utils/imageCompress'
import MemberAvatar from '../components/MemberAvatar'

interface Profile {
  user_type: 'admin' | 'student'
  id: number
  username: string
  display_name: string
  avatar: string | null
  qq?: string
  email?: string
  stage_role?: string
}

interface SessionRow {
  id: number
  session_id: string
  device_name: string
  ip: string | null
  last_active_at: string | null
  created_at: string
  revoked: boolean
  expired?: boolean
  is_current: boolean
}

function syncLocalAvatar(avatar: string | null) {
  const keys = [
    ['studentUser', localStorage],
    ['studentUser', sessionStorage],
    ['user', localStorage],
    ['user', sessionStorage],
  ] as const
  for (const [key, store] of keys) {
    const raw = store.getItem(key)
    if (!raw) continue
    try {
      const obj = JSON.parse(raw)
      obj.avatar = avatar
      store.setItem(key, JSON.stringify(obj))
    } catch {
      /* ignore */
    }
  }
  try {
    window.dispatchEvent(new Event('avatar-updated'))
  } catch {
    /* ignore */
  }
}

export default function AccountSecurity() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [revokingId, setRevokingId] = useState<number | null>(null)

  const isStudent = profile?.user_type === 'student' || !!localStorage.getItem('studentToken') || !!sessionStorage.getItem('studentToken')

  const load = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true)
      const [p, s] = await Promise.all([
        accountSecurityAPI.getProfile(),
        accountSecurityAPI.getSessions(),
      ])
      setProfile(p.data)
      setSessions(s.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  const refreshSessions = async () => {
    try {
      clearCache('/account-security/sessions')
      const s = await accountSecurityAPI.getSessions()
      setSessions(s.data || [])
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    try {
      setSavingPwd(true)
      const res = await accountSecurityAPI.changePassword(oldPassword, newPassword)
      toast.success(res.message || '密码修改成功')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await load({ silent: true })
    } catch (err: any) {
      toast.error(err.message || '修改失败')
    } finally {
      setSavingPwd(false)
    }
  }

  const handleAvatarFile = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    try {
      setUploading(true)
      const dataUrl = await compressImageToDataUrl(file)
      const res = await accountSecurityAPI.updateAvatar(dataUrl)
      setProfile((prev) => (prev ? { ...prev, avatar: res.data.avatar } : prev))
      syncLocalAvatar(res.data.avatar)
      toast.success(res.message || '头像已更新')
    } catch (err: any) {
      toast.error(err.message || '上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const clearAvatar = async () => {
    try {
      setUploading(true)
      await accountSecurityAPI.updateAvatar(null)
      setProfile((prev) => (prev ? { ...prev, avatar: null } : prev))
      syncLocalAvatar(null)
      toast.success('头像已清除')
    } catch (err: any) {
      toast.error(err.message || '清除失败')
    } finally {
      setUploading(false)
    }
  }

  const logoutOne = async (id: number) => {
    try {
      setRevokingId(id)
      const res = await accountSecurityAPI.revokeSession(id)
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, revoked: true } : s))
      )
      toast.success(res.message || '已登出')
      await refreshSessions()
    } catch (err: any) {
      toast.error(err.message || '操作失败')
    } finally {
      setRevokingId(null)
    }
  }

  const deleteOne = async (id: number) => {
    try {
      setRevokingId(id)
      const res = await accountSecurityAPI.deleteSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      toast.success(res.message || '已删除')
      await refreshSessions()
    } catch (err: any) {
      toast.error(err.message || '操作失败')
    } finally {
      setRevokingId(null)
    }
  }

  const revokeOthers = async () => {
    try {
      setRevokingId(-1)
      const res = await accountSecurityAPI.revokeOtherSessions()
      setSessions((prev) =>
        prev.map((s) => (s.is_current ? s : { ...s, revoked: true }))
      )
      toast.success(res.message || '已登出其它设备')
      await refreshSessions()
    } catch (err: any) {
      toast.error(err.message || '操作失败')
    } finally {
      setRevokingId(null)
    }
  }

  const handleLogout = async () => {
    try {
      await accountSecurityAPI.logoutCurrent()
    } catch {
      /* ignore */
    }
    if (isStudent) {
      localStorage.removeItem('studentToken')
      localStorage.removeItem('studentUser')
      sessionStorage.removeItem('studentToken')
      sessionStorage.removeItem('studentUser')
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
    }
    navigate('/login')
  }

  const activeSessions = sessions.filter((s) => !s.revoked)
  const shownSessions = sessions.slice(0, 10)

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="text-purple-400" size={26} />
          账户安全
        </h1>
        <p className="text-sm text-gray-400 mt-1">管理头像、密码与登录设备</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 左侧：头像 + 密码 */}
        <div className="space-y-6 min-w-0">
          <section className="student-glass-panel student-glass-panel--static p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <User size={18} className="text-purple-300" />
              头像
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              <MemberAvatar
                avatar={profile?.avatar}
                qq={profile?.qq}
                name={profile?.display_name}
                size="lg"
                className="!w-20 !h-20 !rounded-2xl !text-2xl"
              />
              <div className="min-w-0 flex-1">
                <div className="text-white font-medium truncate">{profile?.display_name}</div>
                <div className="text-sm text-gray-400 truncate">@{profile?.username}</div>
                {profile?.stage_role && (
                  <div className="text-xs text-gray-500 mt-1">{profile.stage_role}</div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    上传头像
                  </button>
                  {profile?.avatar && (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => void clearAvatar()}
                      className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm inline-flex items-center gap-1.5"
                    >
                      <Trash2 size={14} />
                      清除
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleAvatarFile(e.target.files?.[0] || null)}
                />
                <p className="text-[11px] text-gray-500 mt-2">支持常见图片，上传后自动压缩为方形缩略图</p>
              </div>
            </div>
          </section>

          <section className="student-glass-panel student-glass-panel--static p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <KeyRound size={18} className="text-purple-300" />
              修改密码
            </h2>
            <form onSubmit={handlePassword} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">当前密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="student-glass-field"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="student-glass-field"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="student-glass-field"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                disabled={savingPwd}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm disabled:opacity-50"
              >
                {savingPwd ? '保存中…' : '保存新密码'}
              </button>
              <p className="text-[11px] text-gray-500">修改成功后将自动登出其它设备上的登录</p>
            </form>
          </section>
        </div>

        {/* 右侧：登录记录 */}
        <section className="student-glass-panel student-glass-panel--static p-5 sm:p-6 lg:sticky lg:top-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MonitorSmartphone size={18} className="text-purple-300" />
              登录记录
            </h2>
            {activeSessions.some((s) => !s.is_current) && (
              <button
                type="button"
                disabled={revokingId !== null}
                onClick={() => void revokeOthers()}
                className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <LogOut size={14} />
                登出其它设备
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            最多保留 10 条。勾选「记住登录」：7 天内有效。未勾选：关掉标签页约 15 分钟后显示「已登出」；标签页还开着会自动保活，挂机也算在线。
          </p>

          {shownSessions.length === 0 ? (
            <p className="text-sm text-gray-500">
              暂无设备记录。重新登录后将开始记录（当前会话若在本次更新前登录，请重新登录一次）。
            </p>
          ) : (
            <ul className="space-y-2 max-h-[min(70vh,720px)] overflow-y-auto sidebar-scrollbar pr-1">
              {shownSessions.map((s) => (
                <li
                  key={s.id}
                  className={`student-glass-chip px-4 py-3 flex items-start justify-between gap-3 ${
                    s.revoked ? 'opacity-60' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium flex flex-wrap items-center gap-2">
                      {s.device_name}
                      {s.is_current && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          当前设备
                        </span>
                      )}
                      {s.revoked && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600/40 text-gray-400">
                          已登出
                        </span>
                      )}
                      {!s.revoked && !s.is_current && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                          登录中
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      {s.ip && <div>IP {s.ip}</div>}
                      <div>
                        最近活跃 {s.last_active_at ? formatDateTime(s.last_active_at) : formatDateTime(s.created_at)}
                      </div>
                      <div>首次登录 {formatDateTime(s.created_at)}</div>
                    </div>
                  </div>
                  {!s.is_current && (
                    <div className="shrink-0 flex flex-col gap-1.5">
                      {!s.revoked && (
                        <button
                          type="button"
                          disabled={revokingId !== null}
                          onClick={() => void logoutOne(s.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-orange-600/80 hover:bg-orange-600 text-white transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                          title="强制该设备下线，保留登录记录"
                        >
                          <LogOut size={12} />
                          {revokingId === s.id ? '…' : '登出'}
                        </button>
                      )}
                      {s.revoked && (
                        <button
                          type="button"
                          disabled={revokingId !== null}
                          onClick={() => void deleteOne(s.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600/80 text-gray-200 hover:text-white transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                          title="从列表中删除此记录"
                        >
                          <Trash2 size={12} />
                          {revokingId === s.id ? '…' : '删除'}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm inline-flex items-center gap-1.5"
        >
          <LogOut size={16} />
          退出登录
        </button>
        <button
          type="button"
          onClick={() => navigate(isStudent ? '/student' : '/admin')}
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          ← 返回首页
        </button>
      </div>
    </div>
  )
}
