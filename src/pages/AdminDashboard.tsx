import { useState, useEffect } from 'react'
import { Smartphone } from 'lucide-react'
import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import { AdminSidebar } from '../components/ui/sidebar'
import { BadgeProvider } from '../contexts/BadgeContext'
import { useStudentGlassPointer } from '../hooks/useStudentGlassPointer'
import AdminHome from './admin/AdminHome'
import MemberList from './admin/MemberList'
import LeaveRecords from './admin/LeaveRecords'
import BlackPointRecords from './admin/BlackPointRecords'
import ReminderList from './admin/ReminderList'
import QuitApproval from './admin/QuitApproval'
import RetentionManagement from './admin/RetentionManagement'
import CourseManagement from './admin/CourseManagement'
import ProgressAssignment from './admin/ProgressAssignment'
import AssessmentRecords from './admin/AssessmentRecords'
import AssessmentApproval from './admin/AssessmentApproval'
import AssessmentGuidelines from './admin/AssessmentGuidelines'
import PublicVideosManagement from './admin/PublicVideosManagement'
import VideoUpload from './admin/VideoUpload'
import DocManagement from './admin/DocManagement'
import AntiCheatTickets from './admin/anticheat/AntiCheatTickets'
import AntiCheatConfigs from './admin/anticheat/AntiCheatConfigs'
import AntiCheatMonitor from './admin/anticheat/AntiCheatMonitor'
import AntiCheatSessionDetail from './admin/anticheat/AntiCheatSessionDetail'
import AntiCheatSettings from './admin/anticheat/AntiCheatSettings'
import AntiCheatDllWhitelist from './admin/anticheat/AntiCheatDllWhitelist'
import SurveyManagement from './admin/SurveyManagement'
import SurveyResults from './admin/SurveyResults'
import SheetManagement from './admin/SheetManagement'
import SheetEditor from './admin/SheetEditor'
import OpinionBoxManagement from './admin/OpinionBoxManagement'
import AssistantManagement from './admin/AssistantManagement'
import AccountSecurity from './AccountSecurity'

function AdminDashboardContent() {
  const [isMobile, setIsMobile] = useState(false)
  const { onGlassPointerMove, resetGlassTilt } = useStudentGlassPointer()

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full student-glass-panel student-glass-panel--static p-8 border-2 border-purple-600/50">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center animate-pulse">
              <Smartphone size={40} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">请使用电脑端打开</h1>
            <div className="space-y-3 text-gray-300">
              <p>请使用电脑端打开本网页，否则将出现布局错乱问题。</p>
              <p className="text-sm text-purple-400">因为鲶鱼懒懒的，所以没完善响应式页面哦~ 😴</p>
            </div>
            <div className="pt-4 border-t border-white/10 w-full">
              <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="w-16 h-16 mx-auto rounded-lg" />
              <p className="text-gray-500 text-sm mt-3">紫夜战术公会 - 管理端</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <BadgeProvider>
      <div
        className="flex h-screen overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900"
        onMouseMove={onGlassPointerMove}
        onMouseLeave={resetGlassTilt}
      >
        <AdminSidebar />

        <main className="flex-1 min-h-0 md:ml-[17.25rem] overflow-y-auto overflow-x-hidden">
          <Routes>
            <Route path="/" element={<AdminHome />} />
            <Route path="/members/list" element={<MemberList />} />
            <Route path="/members/assistants" element={<AssistantManagement />} />
            <Route path="/members/leave" element={<LeaveRecords />} />
            <Route path="/members/violations" element={<BlackPointRecords />} />
            <Route path="/courses/list" element={<CourseManagement />} />
            <Route path="/courses/progress" element={<ProgressAssignment />} />
            <Route path="/assessments/records" element={<AssessmentRecords />} />
            <Route path="/assessments/approval" element={<AssessmentApproval />} />
            <Route path="/assessments/guidelines" element={<AssessmentGuidelines />} />
            <Route path="/assessments/videos" element={<PublicVideosManagement />} />
            <Route path="/assessments/upload" element={<VideoUpload />} />
            <Route path="/anticheat/tickets" element={<AntiCheatTickets />} />
            <Route path="/anticheat/configs" element={<AntiCheatConfigs />} />
            <Route path="/anticheat/monitor" element={<AntiCheatMonitor />} />
            <Route path="/anticheat/sessions/:id" element={<AntiCheatSessionDetail />} />
            <Route path="/anticheat/dll-whitelist" element={<AntiCheatDllWhitelist />} />
            <Route path="/anticheat/settings" element={<AntiCheatSettings />} />
            <Route path="/leave-team/reminders" element={<ReminderList />} />
            <Route path="/leave-team/approval" element={<QuitApproval />} />
            <Route path="/leave-team/retention" element={<RetentionManagement />} />
            <Route path="/docs" element={<DocManagement />} />
            <Route path="/sheets" element={<SheetManagement />} />
            <Route path="/sheets/:id" element={<SheetEditor />} />
            <Route path="/surveys" element={<SurveyManagement />} />
            <Route path="/surveys/:id/results" element={<SurveyResults />} />
            <Route path="/opinion-box" element={<OpinionBoxManagement />} />
            <Route path="/account-security" element={<AccountSecurity />} />
          </Routes>
        </main>
      </div>
    </BadgeProvider>
  )
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute requiredUserType="admin">
      <AdminDashboardContent />
    </ProtectedRoute>
  )
}
