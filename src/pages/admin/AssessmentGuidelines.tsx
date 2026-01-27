import { useState, useEffect } from 'react'
import { assessmentGuidelinesAPI } from '../../utils/api'
import { toast } from 'react-hot-toast'
import { FileText, Save, Eye, EyeOff } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Guidelines {
  id: number
  content: string
  updated_by: string | null
  updated_at: string | null
}

export default function AssessmentGuidelines() {
  const [guidelines, setGuidelines] = useState<Guidelines | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [content, setContent] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  useEffect(() => {
    loadGuidelines()
  }, [])

  const loadGuidelines = async () => {
    try {
      setLoading(true)
      const response = await assessmentGuidelinesAPI.get()
      setGuidelines(response.data)
      setContent(response.data.content)
    } catch (error: any) {
      toast.error('加载考核须知失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!content || content.trim() === '') {
      toast.error('须知内容不能为空')
      return
    }

    try {
      setSaving(true)
      const adminUserStr = localStorage.getItem('adminUser') || sessionStorage.getItem('adminUser')
      const adminUser = adminUserStr ? JSON.parse(adminUserStr) : null
      const updated_by = adminUser?.username || '管理员'

      await assessmentGuidelinesAPI.update(content, updated_by)
      toast.success('保存成功！')
      loadGuidelines()
    } catch (error: any) {
      toast.error('保存失败: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <FileText className="text-purple-400" size={32} />
              考核须知管理
            </h1>
            <p className="text-gray-400">编辑学员申请考核时看到的须知内容</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              {showPreview ? (
                <>
                  <EyeOff size={20} />
                  隐藏预览
                </>
              ) : (
                <>
                  <Eye size={20} />
                  显示预览
                </>
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || content === guidelines?.content}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors font-semibold"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  保存中...
                </>
              ) : (
                <>
                  <Save size={20} />
                  保存更改
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 提示信息 */}
      {content !== guidelines?.content && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mb-6">
          <div className="text-yellow-300 text-sm">
            ⚠️ 您有未保存的更改，请记得点击"保存更改"按钮
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：编辑器 */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
          <div className="bg-gray-900/50 px-4 py-3 border-b border-gray-700">
            <h2 className="text-white font-semibold">Markdown 编辑器</h2>
            <p className="text-gray-400 text-sm mt-1">支持 Markdown 语法</p>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-gray-900/30 text-white p-6 font-mono text-sm min-h-[600px] focus:outline-none resize-none"
            placeholder="在此输入考核须知内容，支持 Markdown 格式..."
            style={{ height: 'calc(100vh - 280px)' }}
          />
        </div>

        {/* 右侧：预览 */}
        {showPreview && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-gray-900/50 px-4 py-3 border-b border-gray-700">
              <h2 className="text-white font-semibold">预览</h2>
              <p className="text-gray-400 text-sm mt-1">学员将看到的效果</p>
            </div>
            <div className="p-6 overflow-y-auto" style={{ height: 'calc(100vh - 280px)' }}>
              <div className="markdown-content prose prose-invert max-w-none">
                {content ? (
                  <ReactMarkdown>{content}</ReactMarkdown>
                ) : (
                  <div className="text-gray-500">暂无内容</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 更新信息 */}
      {guidelines?.updated_at && (
        <div className="mt-6 bg-gray-800/30 rounded-lg p-4 text-sm text-gray-400">
          最后更新：{new Date(guidelines.updated_at).toLocaleString('zh-CN')}
          {guidelines.updated_by && ` by ${guidelines.updated_by}`}
        </div>
      )}

      {/* Markdown 快速帮助 */}
      <div className="mt-6 bg-gray-800/30 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">Markdown 快速参考</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-gray-400">标题</div>
            <code className="text-purple-400"># 一级标题</code>
          </div>
          <div>
            <div className="text-gray-400">粗体</div>
            <code className="text-purple-400">**粗体文本**</code>
          </div>
          <div>
            <div className="text-gray-400">斜体</div>
            <code className="text-purple-400">*斜体文本*</code>
          </div>
          <div>
            <div className="text-gray-400">列表</div>
            <code className="text-purple-400">- 列表项</code>
          </div>
          <div>
            <div className="text-gray-400">有序列表</div>
            <code className="text-purple-400">1. 列表项</code>
          </div>
          <div>
            <div className="text-gray-400">链接</div>
            <code className="text-purple-400">[文字](URL)</code>
          </div>
          <div>
            <div className="text-gray-400">引用</div>
            <code className="text-purple-400">&gt; 引用文本</code>
          </div>
          <div>
            <div className="text-gray-400">代码</div>
            <code className="text-purple-400">`代码`</code>
          </div>
        </div>
      </div>
    </div>
  )
}
