# 紫夜公会官网 - 本地版（远程 API）

本目录是 **`local-app` 的副本**，专门改成：

- 本机只跑**静态前端**
- API 请求打到 **Linux 服务器**
- **包内不带** `credentials.sealed` / 数据库密码 / 后端

原有 `local-app`（内置后端 + 密封凭据）保持不动。

```
成员电脑 EXE → http://127.0.0.1:3001（静态页）
                │
                └─ fetch → http://公网IP:18000/api  →  Linux Node → SQLPub
```

线上站（GitHub Pages + Vercel）可继续原样，互不影响。

---

## 打包前配置 API 地址

编辑本目录 `.env`（可从 `.env.example` 复制）：

```env
REMOTE_API_URL=http://160.202.254.36:18000/api
```

若 NAT 是「外网 18000 → 机内 8000」，这里必须写 **外网端口 18000**。

也可用环境变量：`ZIYE_REMOTE_API_URL=...`

---

## 管理员打包（Windows）

```bash
cd "local-app copy"
npm run setup
# 确认 .env 里 REMOTE_API_URL 正确

npm run build:exe
```

产物：

```
local-app copy/release/
├── 紫夜官网-本地版-远程API.exe
├── 紫夜官网-本地版-便携包.zip
└── portable/
```

开发调试（本机只起前端）：

```bash
npm run launch
```

---

## Linux API 部署（CentOS 7 + Docker，推荐）

CentOS 7 的 glibc 太旧，系统 Node 20 难装；用 **Docker 跑 Node 20**，凭据只放服务器。

### 1. 准备目录与代码

在服务器上：

```bash
sudo mkdir -p /opt/ziye-api
# 把仓库里的 server/ 整目录拷到 /opt/ziye-api
# （可用 scp / U盘 / git，勿把含密码的文件提交到公开仓库）
cd /opt/ziye-api
```

### 2. 写 `.env`（仅服务器上有）

```bash
sudo nano /opt/ziye-api/.env
```

至少包含（值用你自己的，勿用泄露过的旧密码）：

```env
DB_HOST=mysql6.sqlpub.com
DB_PORT=3311
DB_USER=ndyian_zoz
DB_PASSWORD=你的新密码
DB_NAME=png_management
JWT_SECRET=足够长的随机串
PORT=8000
TRUST_PROXY=1
FRONTEND_URL=http://127.0.0.1:3001
```

SQLPub 控制台把服务器出口 IP（如 `160.202.254.36`）加入白名单。

### 3. 防火墙 + NAT

- 本机防火墙放行 **TCP 8000**
- 路由器/NAT：外网 **TCP 18000** → 内网机 **TCP 8000**（按你现有映射）

### 4. Docker 启动（host 网络，方便连 SQLPub）

```bash
sudo docker pull node:20-bookworm

sudo docker rm -f ziye-api 2>/dev/null

sudo docker run -d \
  --name ziye-api \
  --restart unless-stopped \
  --network host \
  -v /opt/ziye-api:/app \
  -w /app \
  node:20-bookworm \
  bash -c "npm install --omit=dev && node --use-system-ca index.js"
```

### 5. 验收

服务器本机：

```bash
curl -sS http://127.0.0.1:8000/api/health
```

外网电脑：

```powershell
curl http://160.202.254.36:18000/api/health
```

有 JSON / OK 即可，再打包本目录本地版。

### 6. 看日志 / 重启

```bash
sudo docker logs -f ziye-api
sudo docker restart ziye-api
```

以后改代码：更新 `/opt/ziye-api` 后 `sudo docker restart ziye-api`（若依赖变了再进容器重跑 `npm install`）。

---

## 安全说明

| 位置 | 是否允许有 DB 密码 |
|------|-------------------|
| Linux `/opt/ziye-api/.env` | 可以（权限收紧，勿公开） |
| Vercel 环境变量 | 可以 |
| `local-app copy` 打包产物 | **不可以** |
| 公开 Gitee Release | **不可以** |

泄露后务必轮换：DB 密码、JWT_SECRET、GitHub PAT、Agora/Volc 等。

---

## 与旧 local-app 的区别

| | `local-app`（原版） | `local-app copy`（本目录） |
|--|--|--|
| 本机后端 | 有 | 无 |
| 数据库凭据 | `credentials.sealed` | 无 |
| API | `localhost:3000` | Linux 公网地址 |
| 依赖 | Vercel/本机 Node 后端 | Linux 常开 |
