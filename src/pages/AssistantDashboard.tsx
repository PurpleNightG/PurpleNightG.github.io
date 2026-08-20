import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import ProtectedRoute from '../components/ProtectedRoute'
import { useStudentGlassPointer } from '../hooks/useStudentGlassPointer'
import { assistantAPI } from '../utils/api'
import { NavItem, AnimatedMenuToggle } from '../components/ui/sidebar'
import {
  Home, Users, BookOpen, Calendar, ClipboardList, GraduationCap, AlertCircle, CalendarDays, KeyRound,
} from 'lucide-react'
import AssistantHome from './assistant/AssistantHome'
import AssistantStudents from './assistant/AssistantStudents'
import AssistantRoster from './assistant/AssistantRoster'
import AssistantProgress from './assistant/AssistantProgress'
import AssistantAttendance from './assistant/AssistantAttendance'
import AssistantRequests from './assistant/AssistantRequests'
import AssistantBlackPoints from './assistant/AssistantBlackPoints'
import AssistantLeaves from './assistant/AssistantLeaves'
import AssistantCheckin from './assistant/AssistantCheckin'

function AssistantNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 scrollbar-none" onClick={onNavigate}>
      <NavItem path="/assistant" icon={<Home size={20} />} label="首页" />
      <NavItem path="/assistant/students" icon={<Users size={20} />} label="我的学员" />
      <NavItem path="/assistant/roster" icon={<GraduationCap size={20} />} label="新训花名册" />
      <NavItem path="/assistant/progress" icon={<BookOpen size={20} />} label="进度分配" />
      <NavItem path="/assistant/attendance" icon={<Calendar size={20} />} label="催促名单" />
      <NavItem path="/assistant/checkin" icon={<KeyRound size={20} />} label="签到任务" />
      <NavItem path="/assistant/black-points" icon={<AlertCircle size={20} />} label="登记黑点" />
      <NavItem path="/assistant/leaves" icon={<CalendarDays size={20} />} label="登记请假" />
      <NavItem path="/assistant/requests" icon={<ClipboardList size={20} />} label="我的申请" />
    </nav>
  )
}

function AssistantSidebarChrome({
  name,
  onNavigate,
}: {
  name: string
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="h-16 flex items-center px-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜" className="w-9 h-9 rounded-lg" />
          <div>
            <div className="text-white font-bold text-lg">紫夜助教</div>
            <div className="text-gray-500 text-xs truncate max-w-[9rem]">{name}</div>
          </div>
        </div>
      </div>
      <AssistantNav onNavigate={onNavigate} />
      <div className="p-3 border-t border-white/10 space-y-1 shrink-0">
        <Link
          to="/student"
          onClick={onNavigate}
          className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5"
        >
          返回学员端
        </Link>
        <p className="text-xs text-gray-500 text-center pt-1">紫夜战术公会 · 助教系统</p>
      </div>
    </>
  )
}

function AssistantShell() {
  const { onGlassPointerMove, resetGlassTilt } = useStudentGlassPointer()
  const [ok, setOk] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    assistantAPI
      .me()
      .then((res) => {
        setName(res.data?.member?.nickname || '')
        setOk(true)
      })
      .catch(() => setOk(false))
  }, [])

  if (ok === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900 text-gray-300">
        验证助教身份...
      </div>
    )
  }
  if (!ok) {
    return <Navigate to="/student" replace />
  }

  return (
    <div
      className="flex h-screen overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900"
      onMouseMove={onGlassPointerMove}
      onMouseLeave={resetGlassTilt}
    >
      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            key="assistant-mobile-sidebar"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{ hidden: { x: '-100%' }, visible: { x: 0 } }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="md:hidden fixed inset-0 z-50 student-glass-sidebar flex flex-col"
          >
            <AssistantSidebarChrome
              name={name}
              onNavigate={() => setMobileOpen(false)}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 h-14 student-glass-sidebar border-b border-white/10 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-2">
          <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="w-7 h-7 rounded-md" />
          <span className="text-white font-bold text-sm">助教中心</span>
        </div>
        <AnimatedMenuToggle toggle={() => setMobileOpen(!mobileOpen)} isOpen={mobileOpen} />
      </div>

      {/* Desktop — 悬浮卡片，过高时内部滚动（无滚动条） */}
      <aside className="hidden md:flex flex-col w-60 student-glass-sidebar fixed z-40 top-3 left-3 max-h-[calc(100vh-1.5rem)]">
        <AssistantSidebarChrome name={name} />
      </aside>

      <main className="flex-1 min-h-0 pt-14 md:pt-0 md:ml-[17.25rem] overflow-y-auto overflow-x-hidden">
        <Routes>
          <Route path="/" element={<AssistantHome />} />
          <Route path="/students" element={<AssistantStudents />} />
          <Route path="/roster" element={<AssistantRoster />} />
          <Route path="/progress" element={<AssistantProgress />} />
          <Route path="/attendance" element={<AssistantAttendance />} />
          <Route path="/checkin" element={<AssistantCheckin />} />
          <Route path="/black-points" element={<AssistantBlackPoints />} />
          <Route path="/leaves" element={<AssistantLeaves />} />
          <Route path="/quit" element={<Navigate to="/assistant/students" replace />} />
          <Route path="/requests" element={<AssistantRequests />} />
        </Routes>
      </main>
    </div>
  )
}

export default function AssistantDashboard() {
  return (
    <ProtectedRoute requiredUserType="student">
      <AssistantShell />
    </ProtectedRoute>
  )
}
