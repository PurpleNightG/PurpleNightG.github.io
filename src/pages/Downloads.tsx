import { Download, Key } from 'lucide-react'

export default function Downloads() {
  return (
    <div className="min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-6">
        {/* 页面标题 */}
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl font-bold text-white mb-4">
            下载中心
          </h1>
          <p className="text-gray-400 text-lg">
            下载紫夜公会自制的实用工具
          </p>
          <div className="w-24 h-1 bg-gradient-to-r from-purple-400 to-cyan-400 rounded-full mx-auto mt-4"></div>
        </div>

        {/* 访问密码提示 */}
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4 mb-8 animate-slide-in-up">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-600/20 p-2 rounded-lg">
              <Key size={24} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-yellow-300 font-semibold">访问密码</p>
              <p className="text-yellow-200/80 text-sm">所有下载链接的访问密码均为：<span className="font-mono font-bold">ndyian</span></p>
            </div>
          </div>
        </div>

        {/* 下载卡片网格 */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* 模组管理器 */}
          <a
            href="https://wwww.lanzoue.com/b0138zm34d"
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-gradient-to-br from-purple-600/20 to-indigo-600/20 backdrop-blur-sm rounded-xl p-8 border border-purple-700/50 hover:border-purple-500 transition-all duration-300 hover-lift animate-slide-in-up"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-gradient-to-br from-purple-500 to-indigo-600 w-16 h-16 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-purple-500/50">
                <Download size={32} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
                  模组管理器
                </h3>
                <p className="text-purple-300 text-sm">Mod Manager</p>
              </div>
            </div>
            
            <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
              <p>
                紫夜公会自制的《严阵以待》模组管理器，专为简化MOD安装和管理流程而设计。
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">•</span>
                  <span>一键安装和卸载MOD</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">•</span>
                  <span>自动检测MOD冲突</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">•</span>
                  <span>支持MOD配置管理</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-6 border-t border-purple-700/30">
              <div className="flex items-center justify-between">
                <span className="text-purple-400 font-semibold">点击下载</span>
                <Download size={20} className="text-purple-400 group-hover:translate-y-1 transition-transform" />
              </div>
            </div>
          </a>

          {/* 进房修复程序 */}
          <a
            href="https://wwbji.lanzoue.com/b0139joxyf"
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-gradient-to-br from-cyan-600/20 to-blue-600/20 backdrop-blur-sm rounded-xl p-8 border border-cyan-700/50 hover:border-cyan-500 transition-all duration-300 hover-lift animate-slide-in-up animate-delay-100"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-gradient-to-br from-cyan-500 to-blue-600 w-16 h-16 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-cyan-500/50">
                <Download size={32} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                  进房修复程序
                </h3>
                <p className="text-cyan-300 text-sm">Room Fix Tool</p>
              </div>
            </div>
            
            <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
              <p>
                解决《严阵以待》联机时无法进入房间的问题，修复常见的网络连接错误。
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">•</span>
                  <span>修复无法加入房间问题</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">•</span>
                  <span>优化网络连接设置</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-1">•</span>
                  <span>简单易用，一键修复</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-6 border-t border-cyan-700/30">
              <div className="flex items-center justify-between">
                <span className="text-cyan-400 font-semibold">点击下载</span>
                <Download size={20} className="text-cyan-400 group-hover:translate-y-1 transition-transform" />
              </div>
            </div>
          </a>
        </div>

        {/* 使用说明 */}
        <div className="mt-8 bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 animate-slide-in-up animate-delay-200">
          <h3 className="text-xl font-bold text-white mb-4">使用说明</h3>
          <div className="space-y-2 text-gray-300 text-sm">
            <p>1. 点击上方对应工具的卡片，将跳转至蓝奏云下载页面</p>
            <p>2. 在下载页面输入访问密码：<span className="font-mono font-bold text-purple-400">ndyian</span></p>
            <p>3. 下载完成后解压文件，按照工具内的说明文档进行操作</p>
            <p className="text-yellow-400">⚠️ 如遇到任何问题，请联系公会管理员获取帮助</p>
          </div>
        </div>
      </div>
    </div>
  )
}
