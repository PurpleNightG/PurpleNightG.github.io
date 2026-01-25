import { Link } from 'react-router-dom'
import { BookOpen, Target, Trophy, Users, LogIn } from 'lucide-react'

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-12">
        <img
          src="https://s21.ax1x.com/2024/12/08/pA72i5R.png"
          alt="紫夜公会"
          className="h-32 w-32 mx-auto mb-6 rounded-2xl shadow-2xl shadow-purple-500/50 animate-float"
        />
        <h1 className="text-5xl font-bold text-white mb-4 animate-fade-in">
          欢迎来到紫夜公会
        </h1>
        <p className="text-xl text-gray-300 mb-8 animate-slide-in-up animate-delay-100">
          专注于 Ready Or Not（严阵以待）游戏的教学与交流
        </p>
        <div className="flex justify-center gap-4">
          <Link
            to="/docs"
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-300 flex items-center space-x-2 animate-slide-in-left animate-delay-200 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/50"
          >
            <BookOpen size={20} />
            <span>查看紫夜文档</span>
          </Link>
          <Link
            to="/docs/HTJ"
            className="bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-300 shadow-lg shadow-purple-500/50 hover:shadow-purple-600/60 animate-slide-in-right animate-delay-200 hover:scale-105"
          >
            加入公会
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="grid md:grid-cols-3 gap-8">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 hover:border-purple-600 transition-all duration-300 animate-slide-in-up animate-delay-300 hover-lift">
          <div className="bg-purple-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
            <Target size={24} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">专业教学</h3>
          <p className="text-gray-400">
            系统化的战术教学，从基础到进阶，帮助你快速提升游戏技能
          </p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 hover:border-purple-600 transition-all duration-300 animate-slide-in-up animate-delay-400 hover-lift">
          <div className="bg-purple-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
            <Users size={24} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">团队协作</h3>
          <p className="text-gray-400">
            强调团队配合，培养默契，打造最强战术小队
          </p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 hover:border-purple-600 transition-all duration-300 animate-slide-in-up animate-delay-500 hover-lift">
          <div className="bg-purple-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
            <Trophy size={24} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">追求卓越</h3>
          <p className="text-gray-400">
            不断精进战术，挑战高难度任务，创造最佳战绩
          </p>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-8 border border-gray-700 animate-fade-in animate-delay-300 hover-glow">
        <h2 className="text-3xl font-bold text-white mb-4">关于紫夜</h2>
        <div className="text-gray-300 space-y-4">
          <p>
            紫夜公会是一个专注于《Ready Or Not》（严阵以待）游戏的专业团队。
            我们致力于为成员提供最优质的游戏体验和最专业的战术指导。
          </p>
          <p>
            无论你是新手还是老兵，在这里都能找到适合自己的学习内容和交流伙伴。
            我们相信，通过系统化的学习和团队协作，每个人都能成为出色的战术专家。
          </p>
          <p className="text-purple-400 font-semibold">
            加入紫夜，一起征服每一个任务挑战！
          </p>
        </div>
      </section>

      {/* Quick Links */}
      <section>
        <h2 className="text-3xl font-bold text-white mb-6">快速开始</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <Link
            to="/docs"
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 hover:border-purple-600 transition-all duration-300 group hover-lift animate-slide-in-left animate-delay-200"
          >
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400">
              浏览紫夜文档 →
            </h3>
            <p className="text-gray-400">
              了解公会信息、战术教学和相关规定
            </p>
          </Link>
          <Link
            to="/login"
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 hover:border-purple-600 transition-all duration-300 group hover-lift animate-slide-in-right animate-delay-200"
          >
            <div className="flex items-center space-x-3 mb-2">
              <LogIn size={24} className="text-purple-400" />
              <h3 className="text-xl font-bold text-white group-hover:text-purple-400">
                登录系统 →
              </h3>
            </div>
            <p className="text-gray-400">
              学员和管理员登录后台管理系统
            </p>
          </Link>
        </div>
      </section>
    </div>
  )
}
