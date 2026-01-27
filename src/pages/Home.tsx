import { Link } from 'react-router-dom'
import { BookOpen, Users, FileText, Shield, ChevronLeft, ChevronRight, Wrench } from 'lucide-react'
import { useState, useEffect } from 'react'

const carouselImages = [
  'https://s41.ax1x.com/2026/01/27/pZR6Bzq.jpg',
  'https://s41.ax1x.com/2026/01/27/pZR6rQ0.jpg'
]

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0)

  // 自动轮播
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselImages.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % carouselImages.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + carouselImages.length) % carouselImages.length)
  }

  return (
    <div>
      {/* Hero Section with Carousel */}
      <section 
        className="relative h-[650px] left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen -mt-8 overflow-hidden"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)'
        }}
      >
        {/* 图片轮播 */}
        <div className="absolute inset-0">
          {carouselImages.map((image, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={image}
                alt={`紫夜公会 ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {/* 左右渐变遮罩 */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent"></div>
            </div>
          ))}
        </div>

        {/* 左侧内容：Logo和按钮 */}
        <div className="relative z-10 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-8 sm:px-12 lg:px-16 w-full">
            <div className="max-w-xl">
              {/* Logo */}
              <img
                src="https://s21.ax1x.com/2024/12/08/pA72i5R.png"
                alt="紫夜公会"
                className="h-32 w-32 mb-6 rounded-2xl shadow-2xl shadow-purple-500/50 animate-float"
              />
              
              {/* 标题 */}
              <h1 className="text-5xl font-bold text-white mb-4 animate-fade-in">
                紫夜公会
              </h1>
              <p className="text-xl text-gray-200 mb-8 animate-slide-in-up animate-delay-100">
                专注于《严阵以待》的战术教学与实战演练
              </p>

              {/* 按钮组 */}
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/docs"
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-300 flex items-center space-x-2 animate-slide-in-left animate-delay-200 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/50"
                >
                  <BookOpen size={20} />
                  <span>浏览文档</span>
                </Link>
                <Link
                  to="/docs/HTJ"
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-cyan-500/50 animate-slide-in-right animate-delay-200 hover:scale-105"
                >
                  加入公会
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 轮播控制按钮 */}
        <button
          onClick={prevSlide}
          className="absolute left-6 sm:left-8 lg:left-12 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-all duration-300 backdrop-blur-sm hover:scale-110"
        >
          <ChevronLeft size={24} />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-6 sm:right-8 lg:right-12 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-all duration-300 backdrop-blur-sm hover:scale-110"
        >
          <ChevronRight size={24} />
        </button>

        {/* 轮播指示器 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {carouselImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentSlide
                  ? 'bg-purple-500 w-8'
                  : 'bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      </section>

      {/* 左右结构：公会介绍 + 快速导航 */}
      <section className="mt-12 mb-12">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* 左侧：公会介绍 */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-gray-800/50 to-purple-900/20 backdrop-blur-sm rounded-xl p-8 border border-gray-700 h-full flex flex-col justify-center animate-fade-in hover-glow">
              <div className="flex flex-col items-center text-center mb-6">
                <img
                  src="https://s21.ax1x.com/2024/12/08/pA72i5R.png"
                  alt="紫夜公会"
                  className="w-24 h-24 rounded-2xl shadow-2xl shadow-purple-500/50 mb-4"
                />
                <h2 className="text-3xl font-bold text-white mb-2">
                  关于紫夜公会
                </h2>
                <div className="w-16 h-1 bg-gradient-to-r from-purple-400 to-cyan-400 rounded-full"></div>
              </div>
              
              <div className="text-gray-300 space-y-3 text-sm">
                <p className="leading-relaxed">
                  紫夜公会是一个专注于《Ready Or Not》（严阵以待）游戏的专业战术团队。
                  我们致力于为成员提供最优质的游戏体验和最专业的战术指导。
                </p>
                <p className="leading-relaxed">
                  无论你是新手还是老兵，在紫夜都能找到适合自己的学习路径和志同道合的战友。
                  通过严格的训练、科学的战术体系和默契的团队协作，成为出色的战术专家。
                </p>
                <div className="pt-3 border-t border-gray-600/50">
                  <p className="text-purple-300 font-semibold">
                    加入紫夜公会，一起征服每一个任务挑战！
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：快速导航 */}
          <div className="lg:col-span-2">
            <h2 className="text-3xl font-bold text-white mb-6">快速导航</h2>
            <div className="grid md:grid-cols-2 gap-6">
          {/* 新人入队 */}
          <Link
            to="/docs/HTJ"
            className="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 backdrop-blur-sm rounded-xl p-6 border border-cyan-700/50 hover:border-cyan-500 transition-all duration-300 group hover-lift animate-slide-in-up"
          >
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <Users size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
              新人入队
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              了解入队流程、装备要求、MOD安装和基础准备工作
            </p>
          </Link>

          {/* 战术教学 */}
          <Link
            to="/docs/PNG"
            className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 backdrop-blur-sm rounded-xl p-6 border border-purple-700/50 hover:border-purple-500 transition-all duration-300 group hover-lift animate-slide-in-up animate-delay-100"
          >
            <div className="bg-gradient-to-br from-purple-500 to-pink-600 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <Shield size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
              公会信息
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              认识紫夜教官团队和核心成员，了解加入方式
            </p>
          </Link>

          {/* 公会规定 */}
          <Link
            to="/docs/PNGrule"
            className="bg-gradient-to-br from-orange-600/20 to-red-600/20 backdrop-blur-sm rounded-xl p-6 border border-orange-700/50 hover:border-orange-500 transition-all duration-300 group hover-lift animate-slide-in-up animate-delay-200"
          >
            <div className="bg-gradient-to-br from-orange-500 to-red-600 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <FileText size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-orange-400 transition-colors">
              公会规定
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              队员行为规范、请假制度、新训考核等详细细则
            </p>
          </Link>

          {/* MOD说明 */}
          <Link
            to="/docs/mod-explan"
            className="bg-gradient-to-br from-emerald-600/20 to-teal-600/20 backdrop-blur-sm rounded-xl p-6 border border-emerald-700/50 hover:border-emerald-500 transition-all duration-300 group hover-lift animate-slide-in-up animate-delay-300"
          >
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <Wrench size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
              MOD说明
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              游戏模组安装指南、推荐MOD列表和配置说明
            </p>
          </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
