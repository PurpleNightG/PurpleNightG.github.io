import { useState, useEffect, useRef, memo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { FileText, Search, FolderOpen } from 'lucide-react'
import UpdateNotification from '../components/UpdateNotification'

interface DocItem {
  name: string
  path: string
}

// 使用 memo 包装 Markdown 内容，避免滚动时重新渲染导致 iframe 重新加载
const MarkdownContent = memo(({ content }: { content: string }) => (
  <article className="px-12 py-10 animate-fade-in animate-delay-200">
    <div className="markdown-content">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          iframe: ({ node, ...props }) => {
            const { allowfullscreen, ...rest } = props as any
            return <iframe {...rest} allowFullScreen />
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  </article>
))

MarkdownContent.displayName = 'MarkdownContent'

export default function DocsLayout() {
  const { docName } = useParams<{ docName?: string }>()
  const navigate = useNavigate()
  const [docs, setDocs] = useState<DocItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [images, setImages] = useState<string[]>([])
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([])
  const [activeHeading, setActiveHeading] = useState('')
  const [showUpdateNotification, setShowUpdateNotification] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const isFirstCheck = useRef(true)

  useEffect(() => {
    fetchDocs()
    checkVersion()
    // 每30秒检查一次版本更新
    const versionCheckInterval = setInterval(checkVersion, 30000)
    return () => clearInterval(versionCheckInterval)
  }, [])

  useEffect(() => {
    if (docName) {
      loadDocument(docName)
    } else if (docs.length > 0) {
      // 默认加载第一个文档
      const firstDoc = docs[0].path.replace('.md', '')
      navigate(`/docs/${encodeURIComponent(firstDoc)}`, { replace: true })
    }
  }, [docName, docs])

  const checkVersion = async () => {
    try {
      const response = await fetch('/version.json?t=' + Date.now())
      const data = await response.json()
      
      if (isFirstCheck.current) {
        // 页面刚加载，保存当前版本，不显示提示
        // 因为刚加载的页面内容已经是最新的
        isFirstCheck.current = false
        setCurrentVersion(data.version)
        localStorage.setItem('docVersion', data.version)
      } else if (data.version !== currentVersion && currentVersion !== '') {
        // 用户停留期间检测到版本变化，显示更新提示
        setCurrentVersion(data.version)
        setShowUpdateNotification(true)
      }
    } catch (error) {
      console.log('版本检查失败，跳过更新提示')
    }
  }

  const handleRefresh = () => {
    // 更新本地版本号
    localStorage.setItem('docVersion', currentVersion)
    // 关闭提示
    setShowUpdateNotification(false)
    // 重新拉取文档列表和当前文档（无需刷新页面）
    fetchDocs()
    if (docName) {
      loadDocument(docName)
    }
  }

  const handleDismiss = () => {
    setShowUpdateNotification(false)
  }

  const fetchDocs = async () => {
    try {
      const response = await fetch('/docs/index.json?t=' + Date.now())
      const data = await response.json()
      setDocs(data)
    } catch (error) {
      console.log('未找到文档索引，使用默认示例')
      setDocs([
        { name: '欢迎使用', path: '欢迎使用.md' },
        { name: '战术基础', path: '战术基础.md' },
      ])
    }
  }

  const loadDocument = async (name: string) => {
    setLoading(true)
    try {
      // 添加时间戳参数绕过缓存
      const response = await fetch(`/docs/${name}.md?t=${Date.now()}`)
      if (!response.ok) {
        throw new Error('文档未找到')
      }
      const text = await response.text()
      setContent(text)
    } catch (err) {
      console.error('加载文档失败:', err)
      setContent('# 文档未找到\n\n无法加载该文档，请检查文档是否存在。')
    } finally {
      setLoading(false)
    }
  }

  // 收集文档中的所有图片
  useEffect(() => {
    const imgElements = document.querySelectorAll('.markdown-content img')
    const imgSrcs = Array.from(imgElements).map((img) => (img as HTMLImageElement).src)
    setImages(imgSrcs)
  }, [content])

  // 延迟提取标题，等待ReactMarkdown渲染完成
  useEffect(() => {
    const timer = setTimeout(() => {
      const headingElements = document.querySelectorAll('.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4')
      const headingsData = Array.from(headingElements).map((heading, index) => {
        const id = `heading-${index}`
        heading.id = id
        return {
          id,
          text: heading.textContent || '',
          level: parseInt(heading.tagName.substring(1))
        }
      })
      setHeadings(headingsData)
      console.log('提取到的标题:', headingsData)
    }, 100) // 延迟100ms等待渲染完成

    return () => clearTimeout(timer)
  }, [content])

  // 监听滚动，高亮当前章节
  useEffect(() => {
    const handleScroll = () => {
      if (headings.length === 0) return
      
      // 从后往前找到第一个在视口顶部的标题
      for (let i = headings.length - 1; i >= 0; i--) {
        const element = document.getElementById(headings[i].id)
        if (element) {
          const rect = element.getBoundingClientRect()
          // 如果标题在视口顶部150px范围内
          if (rect.top <= 150) {
            setActiveHeading(headings[i].id)
            return
          }
        }
      }
      // 如果都不符合，默认高亮第一个
      if (headings.length > 0) {
        setActiveHeading(headings[0].id)
      }
    }

    if (headings.length > 0) {
      // 监听页面滚动（scrollIntoView会触发页面滚动）
      window.addEventListener('scroll', handleScroll, true)
      handleScroll() // 初始化时执行一次
      return () => window.removeEventListener('scroll', handleScroll, true)
    }
  }, [headings])

  // 添加图片点击lightbox功能
  useEffect(() => {
    const handleImageClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'IMG' && target.closest('.markdown-content')) {
        const img = target as HTMLImageElement
        const imgIndex = images.indexOf(img.src)
        if (imgIndex !== -1) {
          setCurrentImageIndex(imgIndex)
          setLightboxOpen(true)
        }
      }
    }

    document.addEventListener('click', handleImageClick)
    return () => document.removeEventListener('click', handleImageClick)
  }, [images])

  // Lightbox键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return
      
      if (e.key === 'Escape') {
        setLightboxOpen(false)
      } else if (e.key === 'ArrowLeft') {
        setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
      } else if (e.key === 'ArrowRight') {
        setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxOpen, images.length])

  const filteredDocs = docs.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const currentDocName = docName ? decodeURIComponent(docName) : ''

  return (
    <>
      {showUpdateNotification && (
        <UpdateNotification
          onRefresh={handleRefresh}
          onDismiss={handleDismiss}
        />
      )}
      {lightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300 transition-colors z-50"
            onClick={() => setLightboxOpen(false)}
          >
            ×
          </button>
          
          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 text-white text-4xl hover:text-gray-300 transition-colors z-50 bg-black bg-opacity-50 rounded-full w-12 h-12 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
                }}
              >
                ‹
              </button>
              <button
                className="absolute right-4 text-white text-4xl hover:text-gray-300 transition-colors z-50 bg-black bg-opacity-50 rounded-full w-12 h-12 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
                }}
              >
                ›
              </button>
            </>
          )}
          
          <img
            src={images[currentImageIndex]}
            alt="查看大图"
            className="max-w-[90%] max-h-[90%] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-4 py-2 rounded">
              {currentImageIndex + 1} / {images.length}
            </div>
          )}
        </div>
      )}

      <div className="flex">
      {/* Left Sidebar - Sticky */}
      <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 animate-slide-in-left">
        <div className="sticky top-16 h-[calc(100vh-4rem)] flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-gray-800">
            <div className="flex items-center space-x-3 mb-2">
              <FolderOpen className="text-purple-500 animate-scale-in animate-delay-200" size={22} />
              <h2 className="text-lg font-bold text-white animate-fade-in animate-delay-200">紫夜文档</h2>
            </div>
            <p className="text-gray-500 text-xs">
              选择文档了解相关内容
            </p>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-800 animate-fade-in animate-delay-300">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                placeholder="搜索文档..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-800 text-white pl-9 pr-3 py-2 text-sm border border-gray-700 focus:border-purple-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Document List */}
          <div className="flex-1 overflow-y-auto animate-fade-in animate-delay-400">
            {filteredDocs.length > 0 ? (
              filteredDocs.map((doc) => {
                const docPath = doc.path.replace('.md', '')
                const isActive = currentDocName === docPath
                return (
                  <Link
                    key={doc.path}
                    to={`/docs/${encodeURIComponent(docPath)}`}
                    className={`flex items-center space-x-3 px-5 py-3 transition-all duration-300 border-l-2 ${
                      isActive
                        ? 'bg-gray-800 border-purple-600 text-white'
                        : 'border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-gray-300'
                    }`}
                  >
                    <FileText size={16} className={isActive ? 'text-purple-400' : 'text-gray-600'} />
                    <span className="text-sm font-medium truncate">{doc.name}</span>
                  </Link>
                )
              })
            ) : (
              <div className="text-center py-8 px-4 text-gray-600 text-sm">
                {searchTerm ? '未找到匹配的文档' : '暂无文档'}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Right Content Area */}
      <main className="flex-1 bg-gray-900 flex">
        <div className="flex-1 overflow-y-auto doc-content-scroll">
          {loading ? (
            <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-400">加载文档中...</p>
              </div>
            </div>
          ) : (
            <MarkdownContent content={content} />
          )}
        </div>

        {/* Table of Contents */}
        {!loading && headings.length > 0 && (
          <aside className="w-64 flex-shrink-0 border-l border-gray-800 animate-slide-in-right">
            <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-6 toc-scrollbar-hidden">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 animate-fade-in animate-delay-300">
                本页目录
              </h3>
              <nav className="space-y-1 border-l-2 border-gray-700 pl-4 relative animate-fade-in animate-delay-400">
                {headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      const element = document.getElementById(heading.id)
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    }}
                    className={`block text-sm transition-all duration-200 py-1.5 relative ${
                      activeHeading === heading.id
                        ? 'text-purple-400 font-medium'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    style={{
                      paddingLeft: `${(heading.level - 1) * 0.75}rem`
                    }}
                  >
                    {activeHeading === heading.id && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-purple-400 rounded-full -ml-[1.3rem] ring-4 ring-gray-900"></span>
                    )}
                    {heading.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </main>
    </div>
    </>
  )
}
