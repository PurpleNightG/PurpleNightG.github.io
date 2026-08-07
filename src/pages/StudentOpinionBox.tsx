import { useEffect, useState } from 'react'
import { Mailbox, Send, Loader2, EyeOff, User } from 'lucide-react'
import { opinionBoxAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { formatDateTime } from '../utils/dateFormat'
import PageSkeleton from '../components/Skeleton'

const CATEGORIES = ['建议', '问题反馈', '表扬', '其他'] as const

const STATUS_LABEL: Record<string, string> = {
  pending: '待查阅',
  read: '已读',
  archived: '已归档',
}

interface MyOpinion {
  id: number
  is_anonymous: boolean
  category: string
  content: string
  status: string
  admin_note: string | null
  created_at: string
}

export default function StudentOpinionBox() {
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('建议')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<MyOpinion[]>([])

  const load = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true)
      const res = await opinionBoxAPI.my()
      setList(res.data || [])
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = content.trim()
    if (!text) {
      toast.error('请填写意见内容')
      return
    }
    try {
      setSubmitting(true)
      await opinionBoxAPI.submit({
        content: text,
        category,
        is_anonymous: isAnonymous,
      })
      toast.success(isAnonymous ? '已匿名投入意见箱' : '已实名投入意见箱')
      setContent('')
      setCategory('建议')
      setIsAnonymous(true)
      await load({ silent: true })
    } catch (err: any) {
      toast.error(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 student-main-center w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Mailbox className="text-purple-400" size={32} />
          意见箱
        </h1>
        <p className="text-gray-400">
          向管理组反馈建议或问题。可选择匿名；匿名投递管理端不会看到你的身份。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="student-glass-panel p-6 space-y-5">
        <div>
          <label className="block text-sm text-gray-300 mb-2">分类</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  category === c
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-2">意见内容 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="请尽量具体描述，方便我们跟进…"
            className="student-glass-field min-h-[9rem] resize-y"
          />
          <div className="text-xs text-gray-500 mt-1 text-right">{content.length}/2000</div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="text-sm text-gray-300">投递方式</label>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                isAnonymous
                  ? 'bg-purple-500/25 text-purple-200 border border-purple-400/35'
                  : 'bg-sky-500/25 text-sky-200 border border-sky-400/35'
              }`}
            >
              当前：{isAnonymous ? '匿名' : '实名'}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsAnonymous(true)}
              aria-pressed={isAnonymous}
              className={`relative p-4 rounded-xl text-left transition-all border ${
                isAnonymous
                  ? 'bg-purple-500/20 border-purple-400/60 shadow-[0_0_0_1px_rgba(167,139,250,0.35)]'
                  : 'bg-white/[0.03] border-white/10 opacity-55 hover:opacity-80'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isAnonymous ? 'border-purple-300 bg-purple-500' : 'border-gray-500'
                  }`}
                >
                  {isAnonymous && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-white font-semibold mb-1">
                    <EyeOff size={16} className={isAnonymous ? 'text-purple-200' : 'text-gray-400'} />
                    匿名投递
                    {isAnonymous && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/40 text-purple-100">已选</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    管理端仅显示「匿名学员」，看不到你是谁
                  </p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setIsAnonymous(false)}
              aria-pressed={!isAnonymous}
              className={`relative p-4 rounded-xl text-left transition-all border ${
                !isAnonymous
                  ? 'bg-sky-500/20 border-sky-400/60 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                  : 'bg-white/[0.03] border-white/10 opacity-55 hover:opacity-80'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    !isAnonymous ? 'border-sky-300 bg-sky-500' : 'border-gray-500'
                  }`}
                >
                  {!isAnonymous && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-white font-semibold mb-1">
                    <User size={16} className={!isAnonymous ? 'text-sky-200' : 'text-gray-400'} />
                    实名投递
                    {!isAnonymous && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/40 text-sky-100">已选</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    管理端可见你的昵称，便于回访沟通
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          投入意见箱
        </button>
      </form>

      <div className="student-glass-panel p-6">
        <h2 className="text-lg font-semibold text-white mb-4">我的投递</h2>
        {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : list.length === 0 ? (
          <p className="text-center text-gray-500 py-8 text-sm">还没有投递记录</p>
        ) : (
          <div className="space-y-3">
            {list.map((item) => (
              <div key={item.id} className="student-glass-chip p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200">{item.category}</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 text-gray-300">
                    {item.is_anonymous ? '匿名' : '实名'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 text-gray-400">
                    {STATUS_LABEL[item.status] || item.status}
                  </span>
                  <span className="text-gray-500 ml-auto">{formatDateTime(item.created_at)}</span>
                </div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{item.content}</p>
                {item.admin_note && (
                  <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    管理回复：{item.admin_note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
