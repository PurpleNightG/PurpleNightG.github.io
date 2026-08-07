# 紫夜公会官网 - 本地启动器

在本地以「软件」方式运行官网：内置 Node.js、前端、后端，**成员无需安装任何环境**，双击即可使用。

## 两种分发形式

| 形式 | 文件 | 说明 |
|------|------|------|
| **单文件直运行（推荐）** | `release/紫夜官网-本地版.exe` | 双击即用，无安装向导 |
| **ZIP 便携包** | `release/紫夜官网-本地版-便携包.zip` | 解压后双击 `紫夜官网.exe` |
| **安装向导包（可选）** | `npm run build:installer` | Inno Setup 传统安装程序 |

## 成员使用方式（单文件 EXE）

1. 收到 **`紫夜官网-本地版.exe`**
2. 双击运行
3. **首次**会弹出「正在初始化」并自动释放文件（约 10–30 秒）
4. 启动成功后**不再显示 CMD 黑窗口**，程序缩到**系统托盘**（任务栏右下角）
5. 浏览器自动打开 `http://127.0.0.1:3001`

**托盘操作：**
- 双击托盘图标 → 打开网站
- 右键 → 「打开网站」或「退出」

文件释放位置：`%LOCALAPPDATA%\ZiyeGuildLocal`（用户无感，无需手动操作）

> 若程序已在运行，再次双击 EXE 会直接打开浏览器。

## 管理员：如何打包

### 前置条件

- Windows 10/11（64 位）
- 本机已安装 Node.js 18+（仅**打包时**需要，成员不需要）
- 已配置好 `server/.env`（SQLPub 凭据会在打包时**内置**到安装包）

### 构建命令

```bash
cd local-app

# 1. 首次：安装依赖 + 创建 server/.env
npm run setup
# 编辑 server/.env 填入 SQLPub 凭据

# 2. 构建单文件直运行 EXE（推荐分发，会先完整构建最新前端与后端）
npm run build:exe

# 3. （可选）构建 Inno Setup 安装向导包
npm run build:installer

# 或一步完成便携包 + 单文件 EXE
npm run build:all
```

### 输出位置

```
local-app/release/
├── 紫夜官网-本地版.exe           ← 单文件直运行，推荐分发
├── 紫夜官网-本地版-便携包.zip    # ZIP 备选
├── 紫夜官网-安装包.exe           # npm run build:installer 才生成
└── portable/                    # 构建中间产物
```

### 单文件直运行 vs 安装包

| | 单文件直运行 (`build:exe`) | 安装向导 (`build:installer`) |
|--|--|--|
| 体验 | 双击即用 | 安装向导 + 桌面快捷方式 |
| 依赖 | 无 | 需 Inno Setup |
| 适合 | **日常分发给成员** | 需要卸载入口/开始菜单时 |

## 架构

```
紫夜官网.exe
    │
    ├─► runtime/node.exe → app/server/index.js  →  SQLPub 数据库
    │
    └─► runtime/node.exe → static-server.cjs    →  app/dist 静态前端
                              │
                              └─► 浏览器 http://127.0.0.1:3001
```

与 `npm run dev` 思路一致，但是**生产构建 + 内置运行时**，不经过 GitHub Pages 和 Vercel。

## 自动更新（Gitee）

本地版启动时会检查 Gitee 上的 `latest.json`，有新版本则自动下载便携包 ZIP、覆盖安装目录并重启。

### 管理员一次性配置

1. 在 Gitee 新建仓库（建议**私有**，安装包内含数据库凭据相关产物）
2. 编辑 `local-app/portable/update-config.json`，把 `manifestUrl` 改成：

```text
https://gitee.com/你的用户名/仓库名/raw/master/latest.json
```

3. 重新打包：`cd local-app && npm run build:exe`
4. 按 `local-app/release/Gitee发布说明.txt`：
   - 把 `紫夜官网-本地版-便携包.zip` 上传到 Gitee **发行版/Release** 附件
   - 把附件下载地址填进 `latest.json` 的 `downloadUrl`（或打包前设环境变量 `GITEE_DOWNLOAD_URL`）
   - 将 `latest.json` 提交到仓库根目录
5. **最后一次**把新的 `紫夜官网-本地版.exe` 发到 QQ 群（旧版没有更新器，必须手下一遍）

之后每次打包，只需更新 Gitee 上的 ZIP + `latest.json`，成员重启本地版即可自动更新。

### 成员侧

- 启动画面会显示「正在检查更新…」
- 有更新时自动下载（显示进度）并重启
- 托盘右键也可「检查更新」
- 无网/检查失败时仍会正常启动旧版本
- 更新时会使用安装包内最新的加密凭据（`credentials.sealed`），不再保留旧明文 `.env`

### 文档自动同步

本地版启动时会从 GitHub 仓库拉取最新「紫夜文档」（对比 `version.json`），并每分钟后台再检查一次。

- 管理员在后台改文档 → 写入 GitHub → 本地版自动同步
- **不需要**为此重新打包或发群
- 无网时继续使用本地已缓存的文档
- 同步源默认：`raw.githubusercontent.com/.../public`（可在 `update-config.json` 的 `docsRemoteBase` 修改）

### latest.json 示例

```json
{
  "version": "2026-08-03T06:00:00.000Z",
  "downloadUrl": "https://gitee.com/user/repo/releases/download/v1/紫夜官网-本地版-便携包.zip",
  "sha256": "打包时自动生成",
  "notes": "屏幕共享流畅/清晰模式"
}
```

## 开发调试（管理员自用）

| 命令 | 说明 |
|------|------|
| `npm run launch` | 开发模式，等同双端 dev |
| `npm run start` | 生产预览模式 |
| 双击 `start.bat` | 快捷启动开发模式 |

## 安全说明

- 打包时把 `server/.env` **加密**为 `app/server/credentials.sealed`，密钥写入启动器；**不会**在安装目录留下明文 `.env`
- 仍可通过逆向启动器还原凭据，安装包只分发给**可信公会成员**，不要公开上传到 GitHub
- `release/` 和 `.cache/` 已在 `local-app/.gitignore` 中，不会误提交

### 分发包不含源码

构建时会自动：

- **前端**：仅复制 `dist/` 构建产物（不含 `src/`、TypeScript 源码）
- **后端**：esbuild 打包为单个压缩后的 `server.cjs`（不含 `routes/`、`migrations/`、SQL 脚本等）
- **图标**：自动从项目根目录 `白色背景.png` 生成 EXE 图标
- **依赖**：仅保留 `mysql2` 原生模块，其余后端依赖已打入 `server.cjs`
- **排除**：source map、文档、测试脚本、迁移文件

> 前端 `dist/assets/*.js` 为浏览器必需的可执行脚本（已压缩），无法完全隐藏，但不包含 React/TS 源码结构。

## 注意事项

- 成员电脑需能访问 SQLPub（`mysql6.sqlpub.com`），纯离线不可用
- 安装包体积约 **150–250 MB**（含 Node + 依赖 + 前端资源）
- 首次启动可能需 5–15 秒（启动后端 + 连接数据库）
- Windows 防火墙可能弹出提示，选择「允许访问」即可

## 故障排查

| 现象 | 处理 |
|------|------|
| 闪退 / 后端 code=1 | 新版会弹出错误详情；也可查看安装目录 `last-error.txt` 或 `%LOCALAPPDATA%\ZiyeGuildLocal\logs\startup.log` |
| **他人电脑失败、自己电脑正常** | **最常见：SQLPub 未放行该成员 IP**。登录 [SQLPub 控制台](https://www.sqlpub.com) → 数据库 → 访问控制 → 设为「允许所有 IP」或添加成员 IP |
| 缺少 VC++ 运行库 | 安装 [VC++ Redistributable x64](https://aka.ms/vs/17/release/vc_redist.x64.exe) |
| 端口被占用 | 关闭占用 3000/3001 端口的程序 |
| 提示缺少凭据 / 解密失败 | 重新打包分发；本机开发目录需有 `server/.env`，安装包应含 `credentials.sealed` |
| 杀毒软件拦截 | 添加白名单（内置 Node 运行本地服务） |
| 解压路径 | 建议解压到 `D:\紫夜官网` 等简单路径，避免过深目录或 OneDrive 同步文件夹 |
