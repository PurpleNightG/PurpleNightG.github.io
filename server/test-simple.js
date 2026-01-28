// 极简测试 - 不依赖任何数据库
import express from 'express'
import cors from 'cors'

const app = express()

app.use(cors({
  origin: true,
  credentials: true
}))

app.use(express.json())

// 测试路由
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: '测试成功！',
    env: process.env.NODE_ENV,
    vercel: process.env.VERCEL
  })
})

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '紫夜公会后端服务运行中' 
  })
})

export default app
