import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileText, FolderOpen, Search } from 'lucide-react'

interface DocItem {
  name: string
  path: string
}

export default function Docs() {
  const [docs, setDocs] = useState<DocItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    // 获取所有文档列表
    fetchDocs()
  }, [])

  const fetchDocs = async () => {
    try {
      // 尝试从 public/docs 目录获取文档列表
      const response = await fetch('/docs/index.json')
      const data = await response.json()
      setDocs(data)
    } catch (error) {
      // 如果没有 index.json，使用默认列表
      console.log('未找到文档索引，使用默认示例')
      setDocs([
        { name: '欢迎使用', path: '欢迎使用.md' },
        { name: '战术基础', path: '战术基础.md' },
      ])
    }
  }

  const filteredDocs = docs.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700">
        <div className="flex items-center space-x-3 mb-4">
          <FolderOpen className="text-purple-500" size={32} />
          <h1 className="text-4xl font-bold text-white">紫夜文档</h1>
        </div>
        <p className="text-gray-300">
          这里收录了紫夜公会的所有相关文档，包括公会介绍、战术教学、入队须知和相关规定
        </p>
      </div>

      {/* Search */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="搜索文档..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 text-white pl-10 pr-4 py-3 rounded-lg border border-gray-700 focus:border-purple-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {filteredDocs.length > 0 ? (
          filteredDocs.map((doc) => (
            <Link
              key={doc.path}
              to={`/docs/${encodeURIComponent(doc.path.replace('.md', ''))}`}
              className="block bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 hover:border-purple-600 transition-colors group"
            >
              <div className="flex items-center space-x-4">
                <div className="bg-purple-600 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText size={24} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors">
                    {doc.name}
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">
                    点击查看详细内容
                  </p>
                </div>
                <div className="text-gray-400 group-hover:text-purple-400 transition-colors">
                  →
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-12 border border-gray-700 text-center">
            <FileText size={48} className="text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">
              {searchTerm ? '未找到匹配的文档' : '暂无文档'}
            </h3>
            <p className="text-gray-500">
              {searchTerm
                ? '尝试使用其他关键词搜索'
                : '请在 public/docs 目录下添加 Markdown 文档'}
            </p>
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="bg-blue-900/20 backdrop-blur-sm rounded-xl p-6 border border-blue-800">
        <h3 className="text-lg font-semibold text-blue-300 mb-2">💡 如何添加文档？</h3>
        <p className="text-blue-200 text-sm">
          将 Markdown 格式的文档放置在 <code className="bg-blue-950 px-2 py-1 rounded">public/docs/</code> 目录下，
          然后更新 <code className="bg-blue-950 px-2 py-1 rounded">public/docs/index.json</code> 文件即可。
        </p>
      </div>
    </div>
  )
}
