import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Download, Tag, Clock, FileText, PackageOpen, Layers, HardDrive, Settings2 } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface VersionInfo {
  id: number
  version: string
  changelog: string
  download_url: string
  created_at?: string
  create_time?: string
  release_date?: string
  update_time?: string
  [key: string]: unknown
}

const features = [
  { icon: <PackageOpen size={20} />, label: '一键安装 / 卸载 MOD' },
  { icon: <HardDrive size={20} />, label: '备份恢复' },
  { icon: <Layers size={20} />, label: '多线程下载器' },
  { icon: <Settings2 size={20} />, label: 'MOD 配置管理' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } }),
}

export default function Downloads() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [versionLoading, setVersionLoading] = useState(true)
  const [versionError, setVersionError] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/versions/latest`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setVersionInfo(res.data)
        else setVersionError(true)
      })
      .catch(() => setVersionError(true))
      .finally(() => setVersionLoading(false))
  }, [])

  return (
    <div className="min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center pt-36 pb-28 px-6">
        {/* 背景光晕（仅光晕层羽化，内容不受影响） */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)',
            maskComposite: 'intersect',
            WebkitMaskComposite: 'source-in',
          }}
        >
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-purple-700/20 rounded-full blur-[100px]" />
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute top-1/4 right-1/4 w-48 h-48 bg-pink-600/10 rounded-full blur-3xl" />
        </div>

        {/* 页面标题 */}
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-purple-400 text-sm font-semibold tracking-widest uppercase mb-4"
        >
          下载中心
        </motion.p>

        {/* 浮动图标 */}
        <motion.div
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="relative mb-8"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/50 to-pink-500/50 rounded-full blur-2xl scale-125 opacity-60" />
          <img
            src="/mod-manager-icon.png"
            alt="模组管理器"
            className="relative w-36 h-36 drop-shadow-2xl"
          />
        </motion.div>

        {/* 标题 */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-5xl md:text-6xl font-extrabold text-white tracking-tight text-center mb-3"
        >
          模组管理器
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="text-gray-400 text-lg text-center mb-10"
        >
          紫夜公会自制 · 专为《严阵以待》打造的 MOD 管理工具
        </motion.p>

        {/* 下载按钮组 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <a
            href="https://wwww.lanzoue.com/b0138zm34d"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl transition-all duration-200 shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:-translate-y-1 text-base"
          >
            <Download size={20} />
            蓝奏云下载
          </a>
          <div className="flex items-center gap-2 px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-sm text-gray-400">
            访问密码：<span className="font-mono font-bold text-purple-300 text-base">ndyian</span>
          </div>
        </motion.div>
      </section>

      {/* ── 功能特性 ─────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/10"
          >
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                custom={i}
                variants={fadeUp}
                className="flex flex-col items-center gap-3 py-8 px-4 bg-gray-900/60 hover:bg-purple-900/20 transition-colors duration-300 group"
              >
                <span className="text-purple-400 group-hover:text-purple-300 transition-colors">{f.icon}</span>
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors text-center font-medium">{f.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 最新版本 ─────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={fadeUp}
          >
            {/* 区块标题 */}
            <div className="flex items-center gap-3 mb-10">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-purple-700/50" />
              <span className="flex items-center gap-2 text-purple-400 text-sm font-semibold tracking-widest uppercase">
                <Tag size={14} />
                最新版本
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-purple-700/50" />
            </div>

            {versionLoading && (
              <div className="flex items-center justify-center gap-3 py-16 text-gray-500">
                <div className="w-5 h-5 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
                <span>正在获取版本信息…</span>
              </div>
            )}

            {versionError && (
              <p className="text-center text-gray-600 py-16">暂时无法获取版本信息，请稍后重试。</p>
            )}

            {!versionLoading && !versionError && !versionInfo && (
              <p className="text-center text-gray-600 py-16">暂无版本发布记录。</p>
            )}

            {!versionLoading && versionInfo && (
              <div className="space-y-10">
                {/* 版本号行 */}
                <div className="flex flex-wrap items-end gap-4">
                  <span className="text-6xl font-extrabold text-white font-mono tracking-tight leading-none">
                    {versionInfo.version}
                  </span>
                  {(versionInfo.created_at || versionInfo.create_time || versionInfo.release_date || versionInfo.update_time) && (
                    <span className="flex items-center gap-1.5 text-gray-500 text-sm pb-2">
                      <Clock size={13} />
                      {new Date((versionInfo.created_at || versionInfo.create_time || versionInfo.release_date || versionInfo.update_time) as string).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  )}
                </div>

                {/* 更新日志 */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={15} className="text-purple-400" />
                    <span className="text-sm font-semibold text-gray-400 uppercase tracking-widest">更新日志</span>
                  </div>
                  <div className="pl-4 border-l-2 border-purple-700/50 text-gray-300 text-sm leading-loose whitespace-pre-line">
                    {versionInfo.changelog}
                  </div>
                </div>

                {/* 直链下载 */}
                <motion.a
                  href={versionInfo.download_url}
                  download
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-xl shadow-purple-500/20 hover:shadow-purple-500/40 transition-shadow text-base"
                >
                  <Download size={20} />
                  直接下载 {versionInfo.version}
                </motion.a>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── 底部提示 ─────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        className="py-12 px-6"
      >
        <div className="max-w-3xl mx-auto text-center space-y-2 text-sm text-gray-600">
          <p>下载后解压文件，按照工具内说明文档操作 · 如遇问题请联系公会管理员</p>
          <p className="text-yellow-600/70">蓝奏云访问密码：<span className="font-mono text-yellow-500/80">ndyian</span></p>
        </div>
      </motion.section>
    </div>
  )
}
