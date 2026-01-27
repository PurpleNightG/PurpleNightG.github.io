import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import DocsLayout from './pages/DocsLayout'
import AdminDashboard from './pages/AdminDashboard'
import StudentDashboard from './pages/StudentDashboard'
import Login from './pages/Login'
import ToastContainer from './components/ToastContainer'

function App() {
  return (
    <>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
        {/* Login Route - No Layout */}
        <Route path="/login" element={<Login />} />
        
        {/* Admin Routes - No Layout */}
        <Route path="/admin/*" element={<AdminDashboard />} />
        
        {/* Student Routes - No Layout */}
        <Route path="/student/*" element={<StudentDashboard />} />
        
        {/* Public Routes - With Layout */}
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/docs" element={<DocsLayout />} />
              <Route path="/docs/:docName" element={<DocsLayout />} />
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
