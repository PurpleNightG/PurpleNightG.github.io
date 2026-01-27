import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { testConnection } from './config/database.js'
import authRoutes from './routes/auth.js'
import studentAuthRoutes from './routes/student-auth.js'
import membersRoutes from './routes/members.js'
import leavesRoutes from './routes/leaves.js'
import blackpointsRoutes from './routes/blackpoints.js'
import remindersRoutes from './routes/reminders.js'
import quitRoutes from './routes/quit.js'
import retentionRoutes from './routes/retention.js'
import coursesRoutes from './routes/courses.js'
import progressRoutes from './routes/progress.js'
import settingsRoutes from './routes/settings.js'
import assessmentsRoutes from './routes/assessments.js'
import assessmentApplicationsRoutes from './routes/assessmentApplications.js'
import assessmentGuidelinesRoutes from './routes/assessmentGuidelines.js'
import publicVideosRoutes from './routes/publicVideos.js'
import videoUploadRoutes from './routes/videoUpload.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8000

// CORS配置 - 允许的来源
const allowedOrigins = [
  'http://localhost:5173',       // 本地开发前端
  'http://localhost:3001',       // 本地开发前端备用端口
  'http://127.0.0.1:5173',
  'https://sh01.eu.org',         // 自定义域名
  'http://sh01.eu.org',
  process.env.FRONTEND_URL,      // 生产环境前端URL（通过环境变量配置）
]

// 中间件
app.use(cors({
  origin: (origin, callback) => {
    // 允许没有origin的请求（比如移动应用或Postman）
    if (!origin) return callback(null, true)
    
    // 检查origin是否在允许列表中，或者是GitHub Pages域名
    if (allowedOrigins.includes(origin) || 
        origin.includes('github.io') ||
        origin.includes('vercel.app') ||
        origin.includes('koyeb.app') ||
        origin.includes('eu.org')) {
      callback(null, true)
    } else {
      callback(new Error('不允许的跨域请求'))
    }
  },
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 路由
app.use('/api/auth', authRoutes)
app.use('/api/student', studentAuthRoutes)  // 学员端登录路由
app.use('/api/members', membersRoutes)
app.use('/api/leaves', leavesRoutes)
app.use('/api/blackpoints', blackpointsRoutes)
app.use('/api/reminders', remindersRoutes)
app.use('/api/quit', quitRoutes)
app.use('/api/retention', retentionRoutes)
app.use('/api/courses', coursesRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/assessments', assessmentsRoutes)
app.use('/api/assessment-applications', assessmentApplicationsRoutes)
app.use('/api/assessment-guidelines', assessmentGuidelinesRoutes)
app.use('/api/public-videos', publicVideosRoutes)
app.use('/api/video-upload', videoUploadRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '紫夜公会后端服务运行中' })
})

// 启动服务器
async function startServer() {
  // 测试数据库连接
  const dbConnected = await testConnection()
  
  if (!dbConnected) {
    console.error('⚠️  数据库连接失败，服务器启动中止')
    process.exit(1)
  }

  app.listen(PORT, () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`)
    console.log(`📍 API地址: http://localhost:${PORT}/api`)
  })
}

startServer()
