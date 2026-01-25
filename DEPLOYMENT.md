# 紫夜公会网站部署指南

## 📋 架构说明

本项目采用前后端分离架构：
- **前端**：React + Vite 静态网站
- **后端**：Node.js + Express API服务
- **数据库**：MySQL (SQLPub)

## 🚀 推荐部署方案

### 方案一：前端 GitHub Pages + 后端 Vercel（推荐）

#### 前端部署到 GitHub Pages

1. **修改 `vite.config.ts`**（如果仓库名不是根路径）
```typescript
export default defineConfig({
  base: '/仓库名/', // 如果部署到 username.github.io/repo-name
  // 或者使用根路径
  base: '/', // 如果部署到 username.github.io
})
```

2. **构建前端**
```bash
npm run build
```

3. **部署到 GitHub Pages**
   - 方式1：使用 GitHub Actions（推荐）
   - 方式2：手动上传 dist 目录

**GitHub Actions 自动部署配置**（创建 `.github/workflows/deploy.yml`）：
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install and Build
        run: |
          npm install
          npm run build
          
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

#### 后端部署到 Vercel

1. **创建 `vercel.json`（在 server 目录）**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ],
  "env": {
    "DB_HOST": "@db_host",
    "DB_PORT": "@db_port",
    "DB_USER": "@db_user",
    "DB_PASSWORD": "@db_password",
    "DB_NAME": "@db_name",
    "JWT_SECRET": "@jwt_secret"
  }
}
```

2. **部署步骤**
```bash
# 安装 Vercel CLI
npm install -g vercel

# 在 server 目录下运行
cd server
vercel

# 添加环境变量（在 Vercel 网站设置）
# DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
```

3. **更新前端 API 地址**
   修改 `src/pages/Login.tsx` 和其他文件中的 API_URL：
```typescript
const API_URL = 'https://your-backend.vercel.app/api'
```

---

### 方案二：前端 Vercel + 后端 Vercel

前后端都部署到 Vercel：

```bash
# 前端部署
vercel

# 后端部署
cd server
vercel
```

---

### 方案三：前端 GitHub Pages + 后端 Railway（免费额度）

Railway 提供免费的后端托管：

1. 访问 [Railway.app](https://railway.app)
2. 连接 GitHub 仓库
3. 选择 server 目录部署
4. 配置环境变量
5. 获取部署URL

---

### 方案四：全栈部署到 Render（推荐新手）

Render 提供简单的全栈部署：

**后端部署**
1. 访问 [Render.com](https://render.com)
2. 创建 Web Service
3. 连接仓库，选择 server 目录
4. 设置启动命令：`npm start`
5. 配置环境变量

**前端部署**
1. 创建 Static Site
2. 构建命令：`npm run build`
3. 发布目录：`dist`

---

## 🔧 环境变量配置

### 前端需要修改的地方

在部署前，需要将 API_URL 改为生产环境地址：

**方法1：使用环境变量（推荐）**

创建 `.env.production`：
```env
VITE_API_URL=https://your-backend-url.com/api
```

修改代码使用环境变量：
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
```

**方法2：直接修改**
```typescript
// 开发环境
// const API_URL = 'http://localhost:3000/api'

// 生产环境
const API_URL = 'https://your-backend-url.vercel.app/api'
```

### 后端环境变量

无论使用哪个平台，都需要配置：
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `PORT`（某些平台会自动设置）

---

## 📊 各平台对比

| 平台 | 优点 | 缺点 | 免费额度 |
|------|------|------|----------|
| **GitHub Pages** | 简单，域名好看 | 仅静态内容 | 无限制 |
| **Vercel** | 快速，支持Serverless | 有访问限制 | 100GB流量/月 |
| **Railway** | 配置简单 | 免费额度较少 | $5/月 |
| **Render** | 功能全面 | 冷启动较慢 | 750小时/月 |
| **Netlify** | CDN快，CI/CD好 | 后端支持有限 | 100GB流量/月 |

---

## 🎯 最佳实践推荐

### 个人项目/学习用途
- **前端**：GitHub Pages（免费无限）
- **后端**：Vercel 或 Render（免费额度足够）

### 小型生产项目
- **前端**：Vercel 或 Netlify（带CDN加速）
- **后端**：Railway 或 Render（稳定性好）

### 预算充足
- **完整解决方案**：阿里云 / 腾讯云 ECS

---

## ⚠️ 注意事项

1. **CORS配置**：确保后端允许前端域名访问
   ```javascript
   // server/index.js
   const allowedOrigins = [
     'http://localhost:5173',
     'https://username.github.io',
     'https://your-frontend-domain.com'
   ]
   
   app.use(cors({
     origin: (origin, callback) => {
       if (!origin || allowedOrigins.includes(origin)) {
         callback(null, true)
       } else {
         callback(new Error('Not allowed by CORS'))
       }
     }
   }))
   ```

2. **数据库连接**：确保SQLPub允许外部IP访问

3. **环境变量安全**：
   - 不要提交 `.env` 到 Git
   - 在部署平台配置环境变量
   - 使用强密码和JWT密钥

4. **构建优化**：
   ```bash
   # 生产构建
   npm run build
   
   # 检查构建大小
   npm run preview
   ```

---

## 🔗 相关资源

- [Vite 部署文档](https://vitejs.dev/guide/static-deploy.html)
- [Vercel 文档](https://vercel.com/docs)
- [Railway 文档](https://docs.railway.app)
- [Render 文档](https://render.com/docs)
- [GitHub Pages 文档](https://pages.github.com)
