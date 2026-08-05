import { useState, useEffect } from 'react'
import { anticheatAPI } from '../../../utils/api'
import { toast } from '../../../utils/toast'
import { Loader2, Save, Shield } from 'lucide-react'

export default function AntiCheatSettings() {
  const [clientVersion, setClientVersion] = useState('1.0.0')
  const [mapPassword, setMapPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await anticheatAPI.getSettings()
        setClientVersion(res.data.client_version || '1.0.0')
        setMapPassword(res.data.map_pack_password || '')
      } catch (e: any) {
        toast.error(e.message || '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async () => {
    try {
      setSaving(true)
      await anticheatAPI.updateSettings({
        client_version: clientVersion.trim(),
        map_pack_password: mapPassword,
      })
      toast.success('已保存')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="text-purple-400" size={26} />
          反作弊系统设置
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          客户端版本与地图密码。DLL 误报白名单请到「反作弊 → DLL白名单」统一管理（与会话无关）。
        </p>
      </div>

      <div className="student-glass-panel student-glass-panel--static p-5">
        <label className="block space-y-1.5">
          <span className="text-sm text-gray-300">客户端最低版本</span>
          <input
            value={clientVersion}
            onChange={(e) => setClientVersion(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
            placeholder="例如 1.2.0"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-gray-300">考核地图压缩包密码</span>
          <input
            value={mapPassword}
            onChange={(e) => setMapPassword(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
            placeholder="可留空"
          />
          <span className="text-xs text-gray-500">学员端用此密码自动解压考核地图</span>
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          保存
        </button>
      </div>
    </div>
  )
}
