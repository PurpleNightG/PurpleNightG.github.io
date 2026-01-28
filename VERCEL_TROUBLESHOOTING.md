# Vercel 部署故障排查指南

## ❌ 当前问题

- `/api/health` ✅ 正常
- `/api/members` ❌ 404错误

这说明Express应用已部署，但路由配置有问题。

---

## 🔍 **必须检查的Vercel设置**

### **1. 项目根目录设置**

访问：https://vercel.com/your-project/settings

**检查项：**
```
Settings → General → Root Directory
```

**正确设置：**
- ✅ Root Directory: `server`（如果后端代码在server文件夹）
- ❌ Root Directory: `.` 或留空（错误）

**如果设置错误：**
1. 修改为 `server`
2. 点击 Save
3. 手动触发重新部署

---

### **2. 环境变量配置**

访问：https://vercel.com/your-project/settings/environment-variables

**必须设置的环境变量：**

| 变量名 | 值示例 | 说明 |
|--------|--------|------|
| `DB_HOST` | `mysql6.sqlpub.com` | 数据库主机 |
| `DB_PORT` | `3311` | 数据库端口 |
| `DB_USER` | `your_user` | 数据库用户名 |
| `DB_PASSWORD` | `your_password` | 数据库密码 |
| `DB_NAME` | `png_management` | 数据库名称 |
| `JWT_SECRET` | `your-secret-key` | JWT密钥 |
| `VERCEL` | `1` | Vercel标识 |
| `NODE_ENV` | `production` | 环境标识 |

**重要提示：**
- ⚠️ 每个环境变量都要勾选：Production、Preview、Development
- ⚠️ 修改后需要重新部署才能生效

---

### **3. 数据库连接问题**

**检查数据库是否允许外部连接：**

你的数据库主机是 `mysql6.sqlpub.com`，需要确认：
- ✅ 允许来自Vercel的IP连接
- ✅ 或者允许所有IP连接（不推荐，但简单）

**测试方法：**
查看Vercel部署日志，搜索：
- `✅ Vercel数据库连接正常` - 好！
- `❌ Vercel数据库连接失败` - 数据库配置有问题

---

### **4. 构建命令检查**

访问：https://vercel.com/your-project/settings

**正确的构建设置：**
```
Build Command: npm install
Output Directory: (留空)
Install Command: npm install
```

**注意：**
- ❌ 不要设置 `npm run build`
- ✅ Vercel会自动处理serverless函数

---

### **5. 查看部署日志**

访问：https://vercel.com/your-project/deployments

**步骤：**
1. 点击最新的部署
2. 查看 "Building" 和 "Function Logs"
3. 查找错误信息

**常见错误：**
```
❌ Error: Cannot find module 'express'
   → 解决：检查package.json是否在正确位置

❌ Error: connect ECONNREFUSED
   → 解决：数据库连接配置错误

❌ 404 on all routes except /api/health
   → 解决：vercel.json路由配置问题
```

---

## 🔧 **立即执行的修复步骤**

### **步骤1：检查项目结构**

你的项目应该是这样的：
```
紫夜官网/
├── server/              ← Vercel的Root Directory应该设置为这里
│   ├── index.js
│   ├── package.json
│   ├── vercel.json
│   ├── routes/
│   ├── config/
│   └── ...
├── src/                 ← 前端代码
├── package.json         ← 前端的package.json
└── ...
```

### **步骤2：重新部署**

在Vercel Dashboard：
1. 点击 "Deployments"
2. 找到最新的部署
3. 点击右边的 "..." 菜单
4. 选择 "Redeploy"
5. 勾选 "Use existing Build Cache" ❌（不勾选，强制重新构建）
6. 点击 "Redeploy"

### **步骤3：测试API**

等待3-5分钟后，测试：

```bash
# 测试健康检查
https://api.sh01.eu.org/api/health

# 测试成员列表（需要token）
https://api.sh01.eu.org/api/members
```

**预期结果：**
- ✅ 两个都返回JSON
- ❌ 如果还是404，继续下一步

---

## 🆘 **如果还是不行**

### **备选方案1：分离后端仓库**

创建独立的后端仓库可能更稳定：

```bash
# 1. 创建新仓库
cd server
git init
git add .
git commit -m "Initial backend"
git remote add origin https://github.com/PurpleNightG/ziye-backend.git
git push -u origin main

# 2. 在Vercel导入这个新仓库
# 3. Root Directory设置为 . （因为整个仓库都是后端）
```

### **备选方案2：使用Railway**

如果Vercel一直有问题，可以尝试Railway：
- 访问：https://railway.app/
- 连接GitHub
- 导入项目
- 自动识别Express应用

### **备选方案3：检查Cloudflare缓存**

有时候Cloudflare会缓存404错误：

1. 登录Cloudflare
2. 找到 `sh01.eu.org` 域名
3. 进入 "Caching"
4. 点击 "Purge Everything"（清除所有缓存）
5. 等待1-2分钟
6. 重新测试

---

## 📞 **需要的信息**

如果问题依然存在，请提供：

1. **Vercel项目URL**：https://vercel.com/your-username/your-project
2. **最新部署的日志**（截图或复制文字）
3. **环境变量截图**（隐藏敏感信息）
4. **项目结构截图**

---

## ✅ **成功的标志**

当一切正常时，你应该看到：

```bash
# 浏览器开发者工具 Network 标签
GET https://api.sh01.eu.org/api/members
Status: 200 OK
Response: [{"id": 1, "nickname": "...", ...}]
```

而不是：
```bash
GET https://api.sh01.eu.org/api/members
Status: 404 Not Found
Response: <!DOCTYPE html>...
```
