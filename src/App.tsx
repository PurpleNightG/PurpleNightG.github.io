import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Downloads from './pages/Downloads'
import DocsLayout from './pages/DocsLayout'
import ScreenShare from './pages/ScreenShare'
import AdminDashboard from './pages/AdminDashboard'
import StudentDashboard from './pages/StudentDashboard'
import AssistantDashboard from './pages/AssistantDashboard'
import Login from './pages/Login'
import ToastContainer from './components/ToastContainer'
import { MeetingInviteFloat, AdminMeetingsFloat, StudentLiveRoomsFloat, HostJoinRequestsFloat } from './components/MeetingFloats'
import { useSessionHeartbeat } from './hooks/useSessionHeartbeat'

function App() {
  useSessionHeartbeat()

  return (
    <>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <MeetingInviteFloat />
        <StudentLiveRoomsFloat />
        <HostJoinRequestsFloat />
        <AdminMeetingsFloat />
        <Routes>
        {/* Login Route - No Layout */}
        <Route path="/login" element={<Login />} />
        
        {/* Admin Routes - No Layout */}
        <Route path="/admin/*" element={<AdminDashboard />} />
        
        {/* Assistant Routes - student token + 紫夜助教 */}
        <Route path="/assistant/*" element={<AssistantDashboard />} />
        
        {/* Student Routes - No Layout */}
        <Route path="/student/*" element={<StudentDashboard />} />
        
        {/* Public Routes - With Layout */}
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route path="/docs" element={<DocsLayout />} />
              <Route path="/docs/*" element={<DocsLayout />} />
              <Route path="/screen-share" element={<ScreenShare />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </Router>
    <ToastContainer />
    </>
  )
}

export default App
