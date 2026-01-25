# 🚀 Koyeb 部署指南

## ✅ Koyeb 优势

- 💰 完全免费（无需信用卡）
- 🔥 2个实例，每个 512MB RAM
- ⚡ 无睡眠，始终在线
- 🌏 国内访问较稳定
- 🚀 简单易用

---

## 📝 部署步骤

### 第一步：注册 Koyeb 账号

1. 访问：https://app.koyeb.com/auth/signup
2. 使用 GitHub 账号登录（推荐）或邮箱注册
3. 验证邮箱（如果使用邮箱注册）

---

### 第二步：创建服务

1. **点击 "Create App"**

2. **选择部署方式：GitHub**
   - 点击 "GitHub" 选项
   - 授权 Koyeb 访问你的 GitHub（首次需要）

3. **选择仓库**
   - Repository: `PurpleNightG/PurpleNightG.github.io`
   - Branch: `main`
   - ⚠️ **重要**：Builder 选择 **Dockerfile** 或 **Buildpack**

4. **配置构建设置**
   - Build directory: `server` （⚠️ 必须填写）
   - Build command: `npm install`
   - Run command: `npm start`

---

### 第三步：配置环境变量

在 "Environment variables" 部分，点击 **Add variable** 添加以下变量：

| 变量名 | 值 |
|--------|-----|
| `DB_HOST` | `mysql6.sqlpub.com` |
| `DB_PORT` | `3311` |
| `DB_USER` | `ndyian_zoz` |
| `DB_PASSWORD` | `mfZ0Z6uhizLXIxp4` |
| `DB_NAME` | `png_management` |
| `JWT_SECRET` | `ziye_tactical_guild_secret_key_2026` |
| `PORT` | `8000` |

> 💡 点击每个变量右侧的 🔒 图标可以将其标记为敏感信息

---

### 第四步：配置服务设置

1. **Service name**: `png-back`（或你喜欢的名称）

2. **Instance type**: 
   - 选择 **Nano** (免费)
   - 512 MB RAM
   - 0.1 vCPU

3. **Region**: 
   - 推荐选择 **Frankfurt (fra)** 或 **Washington (was)**
   - 国内访问 Frankfurt 较快

4. **Scaling**:
   - Min instances: `1`
   - Max instances: `1`

5. **Port**: `8000`
   - 确保与环境变量中的 PORT 一致

6. **Health check**:
   - Path: `/api/health`
   - Port: `8000`

---

### 第五步：部署

1. 点击底部的 **Deploy** 按钮

2. 等待部署完成（约 2-5 分钟）
   - 可以在 "Logs" 标签查看部署日志
   - 看到 "🚀 服务器运行在端口 8000" 表示成功

3. 部署成功后，你会看到服务状态变为 **Healthy** ✅

---

### 第六步：获取服务 URL

1. 在服务详情页面，找到 **Public URL**
2. 格式类似：`https://png-back-xxx.koyeb.app`
3. **复制这个 URL**

---

### 第七步：更新前端配置

1. 编辑本地的 `.env.production` 文件：

```env
# 生产环境配置
VITE_API_URL=https://你的koyeb地址.koyeb.app/api
```

例如：
```env
VITE_API_URL=https://png-back-xxx.koyeb.app/api
```

2. 提交并推送：

```bash
git add .env.production
git commit -m "更新API地址为Koyeb部署URL"
git push origin main
```

3. 等待 GitHub Actions 重新部署前端（约 2-3 分钟）

---

## 🧪 测试部署

### 测试后端健康检查

访问：`https://你的koyeb地址.koyeb.app/api/health`

应该看到：
```json
{
  "status": "ok",
  "message": "紫夜公会后端服务运行中"
}
```

### 测试前端连接

1. 访问：https://purplenightg.github.io
2. 点击登录
3. 使用测试账号：
   - 管理员：admin / admin123
   - 学员：student / student123

---

## 🔧 常用操作

### 查看日志

1. 进入服务详情页
2. 点击 **Logs** 标签
3. 实时查看服务日志

### 重新部署

1. 代码推送到 GitHub 后会自动部署
2. 或在 Koyeb 点击 **Redeploy**

### 修改环境变量

1. Settings → Environment variables
2. 修改后需要重新部署

### 自定义域名（可选）

1. Settings → Domains
2. 添加你的域名
3. 配置 DNS CNAME 记录

---

## ❌ 故障排查

### 部署失败

1. 检查 Logs 中的错误信息
2. 确认 `server` 目录路径正确
3. 确认所有环境变量都已添加

### 服务无法启动

1. 检查 PORT 环境变量是否为 `8000`
2. 检查 package.json 中的 start 命令
3. 查看详细日志

### 数据库连接失败

1. 确认所有数据库环境变量正确
2. 检查 SQLPub 是否允许外部连接
3. 查看后端日志中的具体错误

### 前端连接超时

1. 确认后端服务状态为 Healthy
2. 检查 `.env.production` 中的 URL 是否正确
3. 测试直接访问后端 API

---

## 💡 优化建议

### 监控服务

- 定期检查 Koyeb Dashboard
- 关注服务状态和日志
- 设置邮件通知（Settings → Notifications）

### 性能优化

- 使用最近的 Region
- 保持代码精简
- 合理使用数据库连接池

### 安全建议

- 定期更新依赖包
- 使用强密码和 JWT Secret
- 不要在代码中硬编码敏感信息

---

## 🎉 完成！

现在你的紫夜公会管理系统已经完全部署好了！

- ✅ 前端：GitHub Pages
- ✅ 后端：Koyeb
- ✅ 数据库：SQLPub MySQL
- ✅ 完全免费
- ✅ 国内可访问

祝使用愉快！🚀
