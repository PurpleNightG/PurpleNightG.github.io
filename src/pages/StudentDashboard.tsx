import { useState, useEffect, useRef } from 'react'
import { Smartphone } from 'lucide-react'
import { Routes, Route, useLocation } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import { StudentSidebar } from '../components/ui/sidebar'
import SurveyReminderBanner from '../components/SurveyReminderBanner'
import { useStudentGlassPointer } from '../hooks/useStudentGlassPointer'
import StudentProgress from './StudentProgress'
import PublicVideos from './PublicVideos'
import StudentApplyAssessment from './StudentApplyAssessment'
import StudentAssessmentReport from './StudentAssessmentReport'
import StudentHome from './StudentHome'
import StudentClassmates from './StudentClassmates'
import StudentBlackPoints from './StudentBlackPoints'
import StudentLeave from './StudentLeave'
import StudentSurveys from './StudentSurveys'
import StudentSurveyResults from './StudentSurveyResults'
import StudentSheets from './StudentSheets'
import StudentSheetView from './StudentSheetView'
import StudentOpinionBox from './StudentOpinionBox'
import AccountSecurity from './AccountSecurity'
import StudentCheckin from './StudentCheckin'

function StudentDashboardContent() {
  const [isMobile, setIsMobile] = useState(false)
  const { onGlassPointerMove, resetGlassTilt } = useStudentGlassPointer()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 切换路由时把主区域滚回顶部，避免问卷提示条被卷走只剩一条缝
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 })
  }, [location.pathname])

  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border-2 border-purple-600/50 shadow-2xl shadow-purple-500/20">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center animate-pulse">
              <Smartphone size={40} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">请使用电脑端打开</h1>
            <div className="space-y-3 text-gray-300">
              <p>请使用电脑端打开本网页，否则将出现布局错乱问题。</p>
              <p className="text-sm text-purple-400">因为鲶鱼懒懒的，所以没完善响应式页面哦~ 😴</p>
            </div>
            <div className="pt-4 border-t border-gray-700 w-full">
              <img src="https://s21.ax1x.com/2024/12/08/pA72i5R.png" alt="紫夜队标" className="w-16 h-16 mx-auto rounded-lg" />
              <p className="text-gray-500 text-sm mt-3">紫夜战术公会 - 学员端</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-screen overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-purple-900"
      onMouseMove={onGlassPointerMove}
      onMouseLeave={resetGlassTilt}
    >
      <StudentSidebar />

      <main
        ref={mainRef}
        className="flex-1 min-h-0 md:ml-[17.25rem] overflow-y-auto overflow-x-hidden flex flex-col"
      >
        <SurveyReminderBanner />
        <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
          <Routes>
            <Route index element={<StudentHome />} />
            <Route path="progress" element={<StudentProgress />} />
            <Route path="classmates" element={<StudentClassmates />} />
            <Route path="apply-assessment" element={<StudentApplyAssessment />} />
            <Route path="assessment-report" element={<StudentAssessmentReport />} />
            <Route path="blackpoints" element={<StudentBlackPoints />} />
            <Route path="leave" element={<StudentLeave />} />
            <Route path="checkin" element={<StudentCheckin />} />
            <Route path="videos" element={<PublicVideos />} />
            <Route path="surveys" element={<StudentSurveys />} />
            <Route path="surveys/:id/results" element={<StudentSurveyResults />} />
            <Route path="sheets" element={<StudentSheets />} />
            <Route path="sheets/:id" element={<StudentSheetView />} />
            <Route path="opinion-box" element={<StudentOpinionBox />} />
            <Route path="account-security" element={<AccountSecurity />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function StudentDashboard() {
  return (
    <ProtectedRoute requiredUserType="student">
      <StudentDashboardContent />
    </ProtectedRoute>
  )
}
