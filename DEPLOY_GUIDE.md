# 🚀 紫夜公会网站快速部署指南

## 📌 概述

本项目前后端分离，需要分别部署：
- **前端**：静态网站（React + Vite）
- **后端**：Node.js API（Express）
- **数据库**：MySQL（已使用SQLPub）

---

## ⚡ 推荐部署方案

### **前端：GitHub Pages（免费）**
### **后端：Vercel（免费）**

这是最简单、最省钱的方案！

---

## 🎯 第一步：部署后端到 Vercel

### 1. 准备工作
```bash
# 如果还没安装 Vercel CLI
npm install -g vercel
```

### 2. 部署后端
```bash
cd server
vercel login  # 登录 Vercel 账号
vercel        # 首次部署
```

### 3. 配置环境变量
在 Vercel 网站（https://vercel.com）：
1. 进入你的项目
2. Settings → Environment Variables
3. 添加以下变量：
   - `DB_HOST` = `mysql6.sqlpub.com`
   - `DB_PORT` = `3311`
   - `DB_USER` = `ndyian_zoz`
   - `DB_PASSWORD` = `mfZ0Z6uhizLXIxp4`
   - `DB_NAME` = `png_management`
   - `JWT_SECRET` = `ziye_tactical_guild_secret_key_2026`

### 4. 重新部署
```bash
vercel --prod
```

### 5. 记录后端URL
部署成功后会显示类似：`https://your-project.vercel.app`
**记住这个地址！**

---

## 🎨 第二步：部署前端到 GitHub Pages

### 1. 修改生产环境配置
编辑 `.env.production`：
```env
VITE_API_URL=https://your-project.vercel.app/api
```
（替换为你刚才记录的后端URL）

### 2. 提交到 GitHub
```bash
git add .
git commit -m "准备部署"
git push origin main
```

### 3. 启用 GitHub Pages
1. 进入你的 GitHub 仓库
2. Settings → Pages
3. Source 选择 "GitHub Actions"
4. 推送代码后会自动构建部署

### 4. 访问网站
部署完成后，访问：
`https://你的用户名.github.io/仓库名/`

---

## 🔧 本地开发

### 启动前端
```bash
npm install
npm run dev
```
访问：http://localhost:5173

### 启动后端
```bash
cd server
npm install
npm run dev
```
后端运行在：http://localhost:3000

---

## 📝 重要提示

### ⚠️ 部署前检查清单
- [ ] 后端已部署到 Vercel 并记录了 URL
- [ ] `.env.production` 已配置正确的后端 URL
- [ ] 数据库表已创建（执行过 `init.sql`）
- [ ] `.env` 文件**没有**提交到 Git
- [ ] GitHub Actions 配置文件已添加

### 🔐 安全注意
1. ⚠️ **不要提交 `.env` 文件到 Git**
2. 所有敏感信息通过环境变量配置
3. 生产环境建议修改 JWT_SECRET

### 🐛 常见问题

**Q: 前端部署后显示404**
A: 检查 GitHub Pages 设置，确保选择了 "GitHub Actions"

**Q: 前端无法连接后端**
A: 
1. 检查 `.env.production` 中的 API URL 是否正确
2. 检查浏览器控制台的错误信息
3. 确认后端 Vercel 部署成功

**Q: 登录时提示无法连接服务器**
A: 
1. 检查后端是否正常运行
2. 检查 CORS 配置
3. 打开浏览器开发者工具查看 Network 标签

**Q: 后端报数据库连接错误**
A: 
1. 检查 Vercel 环境变量是否配置正确
2. 确认 SQLPub 数据库允许外部连接

---

## 🎉 部署成功后

访问你的网站，使用测试账号登录：

**管理员账号**
- 用户名：`admin`
- 密码：`admin123`

**学员账号**
- 用户名：`student`
- 密码：`student123`

---

## 📞 需要帮助？

查看详细部署文档：`DEPLOYMENT.md`
