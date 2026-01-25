import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, AlertCircle } from 'lucide-react'

export default function DocViewer() {
  const { docName } = useParams<{ docName: string }>()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadDocument()
  }, [docName])

  const loadDocument = async () => {
    setLoading(true)
    setError(false)

    try {
      const response = await fetch(`/docs/${docName}.md`)
      if (!response.ok) {
        throw new Error('文档未找到')
      }
      const text = await response.text()
      setContent(text)
    } catch (err) {
      console.error('加载文档失败:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-400">加载文档中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link
          to="/docs"
          className="inline-flex items-center space-x-2 text-gray-400 hover:text-purple-400 mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>返回文档列表</span>
        </Link>

        <div className="bg-red-900/20 backdrop-blur-sm rounded-xl p-12 border border-red-800 text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">文档未找到</h2>
          <p className="text-gray-400 mb-6">
            无法找到名为 "{docName}" 的文档
          </p>
          <Link
            to="/docs"
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            返回文档列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/docs"
        className="inline-flex items-center space-x-2 text-gray-400 hover:text-purple-400 mb-6 transition-colors"
      >
        <ArrowLeft size={20} />
        <span>返回文档列表</span>
      </Link>

      <article className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700">
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  )
}
