# 🌐 Cloudflare CDN 配置指南

使用自定义域名 `sh01.eu.org` 通过 Cloudflare 加速访问，解决 Vercel 在国内访问不稳定的问题。

---

## ✅ 配置效果

- ✅ 国内无需梯子即可访问
- ✅ 全球 CDN 加速
- ✅ 免费 HTTPS 证书
- ✅ DDoS 防护
- ✅ 隐藏真实后端地址

---

## 📝 配置步骤

### 第一步：注册并添加域名到 Cloudflare

1. **注册 Cloudflare 账号**
   - 访问：https://dash.cloudflare.com/sign-up
   - 使用邮箱注册（完全免费）

2. **添加网站**
   - 登录后点击 **"Add a Site"**
   - 输入域名：`sh01.eu.org`
   - 点击 **"Add site"**

3. **选择套餐**
   - 选择 **Free** 计划（完全免费）
   - 点击 **"Continue"**

---

### 第二步：修改域名 DNS 服务器

1. **获取 Cloudflare DNS 服务器**
   
   Cloudflare 会显示两个名称服务器，类似：
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```
   （实际名称会不同，以 Cloudflare 显示的为准）

2. **修改域名 DNS**
   
   - 登录 eu.org 域名管理后台
   - 找到 DNS 服务器设置
   - 将原有的 DNS 服务器替换为 Cloudflare 的服务器
   - 保存设置

3. **等待生效**
   
   - DNS 修改需要时间传播（几分钟到24小时）
   - Cloudflare 会发邮件通知激活成功
   - 激活后继续下一步

---

### 第三步：配置 DNS 记录

在 Cloudflare Dashboard → 选择你的域名 → DNS → Records

#### 配置选项 A：只加速后端 API（推荐）

添加以下 DNS 记录：

| 类型 | 名称 | 目标 | 代理状态 | TTL |
|------|------|------|---------|-----|
| CNAME | api | png-back.vercel.app | ✅ 已代理 | Auto |

**说明**：
- **名称**：填 `api`
- **目标**：填 `png-back.vercel.app`
- **代理状态**：必须开启（橙色云朵图标）
- **TTL**：选择 Auto

配置后，API 地址为：`https://api.sh01.eu.org/api`

#### 配置选项 B：同时加速前端和后端

添加两条 DNS 记录：

**记录 1 - 前端**
| 类型 | 名称 | 目标 | 代理状态 | TTL |
|------|------|------|---------|-----|
| CNAME | @ | purplenightg.github.io | ✅ 已代理 | Auto |

**记录 2 - 后端**
| 类型 | 名称 | 目标 | 代理状态 | TTL |
|------|------|------|---------|-----|
| CNAME | api | png-back.vercel.app | ✅ 已代理 | Auto |

配置后：
- 前端：`https://sh01.eu.org`
- 后端：`https://api.sh01.eu.org/api`

**⚠️ 重要**：代理状态必须是**橙色云朵**（已代理），而不是灰色云朵（仅 DNS）

---

### 第四步：配置 SSL/TLS

1. 在 Cloudflare Dashboard → SSL/TLS
2. **加密模式**选择：**Full** 或 **Full (strict)**
3. 等待证书自动签发（几分钟）

---

### 第五步：优化设置（可选但推荐）

#### 启用 HTTP/3
- Speed → Optimization → HTTP/3：开启

#### 启用 Brotli 压缩
- Speed → Optimization → Brotli：开启

#### 自动最小化
- Speed → Optimization → Auto Minify：全选

#### 缓存设置
- Caching → Configuration → Caching Level：Standard

---

### 第六步：推送代码更新

前端配置和后端 CORS 已经修改好了，现在推送到 GitHub：

```bash
git add .
git commit -m "添加Cloudflare CDN支持，使用自定义域名加速"
git push origin main
```

---

### 第七步：等待部署完成

1. **GitHub Actions** 自动部署前端（约 2-3 分钟）
2. **Vercel** 自动部署后端（约 1-2 分钟）
3. **Cloudflare DNS** 生效（约 5-10 分钟）

---

## 🧪 测试配置

### 测试后端健康检查

访问：`https://api.sh01.eu.org/api/health`

应该看到：
```json
{
  "status": "ok",
  "message": "紫夜公会后端服务运行中"
}
```

### 测试前端访问

根据你选择的配置：

**选项 A（只加速后端）**
- 访问：`https://purplenightg.github.io`
- 后端通过 `https://api.sh01.eu.org` 加速访问

**选项 B（同时加速前后端）**
- 访问：`https://sh01.eu.org`
- 后端通过 `https://api.sh01.eu.org` 访问

### 测试登录功能

使用测试账号登录：
- 管理员：admin / admin123
- 学员：student / student123

**✅ 应该无需梯子即可正常登录！**

---

## 🔧 故障排查

### DNS 未生效

- 检查 Cloudflare 状态是否显示 "Active"
- 使用 `nslookup api.sh01.eu.org` 检查 DNS 解析
- 等待更长时间（最多24小时）

### SSL 证书错误

- 确认 SSL/TLS 模式为 Full
- 等待证书签发完成
- 清除浏览器缓存

### CORS 错误

- 检查代码是否已推送到 GitHub
- 确认 Vercel 已重新部署
- 查看浏览器控制台的具体错误

### 502 Bad Gateway

- 检查 Vercel 后端是否正常运行
- 访问 `https://png-back.vercel.app/api/health` 测试
- 查看 Vercel 部署日志

---

## 📊 配置对比

### 之前（Vercel 直连）
- ❌ 国内访问不稳定
- ❌ 经常超时
- ❌ 需要梯子
- ✅ 配置简单

### 之后（Cloudflare CDN）
- ✅ 国内访问稳定
- ✅ 全球加速
- ✅ 无需梯子
- ✅ 免费 CDN
- ✅ DDoS 防护
- ⚠️ 配置稍复杂

---

## 💡 高级优化（可选）

### 自定义缓存规则

在 Cloudflare → Caching → Cache Rules 添加：
```
如果 URI 路径匹配 /api/*
则 缓存级别：Bypass
```

### Page Rules（免费3条）

1. **API 路径不缓存**
   - URL: `api.sh01.eu.org/api/*`
   - Settings: Cache Level: Bypass

2. **静态资源缓存**
   - URL: `sh01.eu.org/*.js`
   - Settings: Cache Level: Cache Everything

### Workers（高级）

如果需要更复杂的路由或功能，可以使用 Cloudflare Workers。

---

## 🎉 完成！

现在你的紫夜公会管理系统通过 Cloudflare CDN 加速，国内用户无需梯子即可流畅访问！

**架构图**：
```
用户访问
  ↓
Cloudflare CDN (sh01.eu.org)
  ↓
GitHub Pages (前端) + Vercel (后端)
  ↓
SQLPub MySQL (数据库)
```

祝使用愉快！🚀
