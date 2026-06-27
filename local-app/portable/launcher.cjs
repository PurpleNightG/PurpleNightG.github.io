'use strict'

const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

const ROOT = __dirname
const NODE = path.join(ROOT, 'runtime', 'node.exe')
const SERVER_DIR = path.join(ROOT, 'app', 'server')
const SERVER_ENV = path.join(SERVER_DIR, '.env')
const BACKEND_PORT = 3000
const FRONTEND_PORT = 3001
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`
const ERROR_FILE = path.join(ROOT, 'last-error.txt')
const LOG_DIR = path.join(
  process.env.LOCALAPPDATA || ROOT,
  'ZiyeGuildLocal',
  'logs'
)

const TRAY_MODE = process.env.ZIYE_TRAY_MODE === '1'
const children = []
const serviceLogs = {
  后端: [],
  前端: [],
}

function timestamp() {
  return new Date().toISOString()
}

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function appendLog(message) {
  ensureLogDir()
  const logFile = path.join(LOG_DIR, 'startup.log')
  fs.appendFileSync(logFile, `[${timestamp()}] ${message}\n`, 'utf8')
}

function log(message) {
  const line = `${message}`
  process.stdout.write(`${line}\n`)
  appendLog(line)
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const values = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }

  return values
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.close(() => resolve(true))
    })
  })
}

function testTcpConnection(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) })
    let settled = false

    const finish = (ok, message) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resolve({ ok, message })
    }

    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish(true, 'ok'))
    socket.on('timeout', () => finish(false, '连接超时'))
    socket.on('error', (error) => finish(false, error.message))
  })
}

function testNodeRuntime() {
  const result = spawnSync(NODE, ['-e', 'process.stdout.write(process.version)'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.status !== 0) {
    return { ok: false, message: result.stderr || 'Node 运行时无法启动' }
  }

  return { ok: true, message: result.stdout.trim() }
}

function testMysqlModule() {
  const script = `
    try {
      require('mysql2');
      process.stdout.write('ok');
    } catch (error) {
      process.stderr.write(error.message || String(error));
      process.exit(1);
    }
  `

  const result = spawnSync(NODE, ['-e', script], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.status !== 0) {
    return { ok: false, message: result.stderr || result.stdout || 'mysql2 加载失败' }
  }

  return { ok: true, message: 'ok' }
}

async function runPreflightChecks() {
  const issues = []
  const env = readEnvFile(SERVER_ENV)

  const nodeCheck = testNodeRuntime()
  if (!nodeCheck.ok) {
    issues.push(`内置 Node 无法运行: ${nodeCheck.message}`)
  } else {
    log(`Node 运行时: ${nodeCheck.message}`)
  }

  const mysqlCheck = testMysqlModule()
  if (!mysqlCheck.ok) {
    issues.push(
      `数据库驱动加载失败: ${mysqlCheck.message}\n` +
        '  可能缺少 Visual C++ 运行库，请安装: https://aka.ms/vs/17/release/vc_redist.x64.exe'
    )
  }

  const backendPortFree = await isPortAvailable(BACKEND_PORT)
  const frontendPortFree = await isPortAvailable(FRONTEND_PORT)
  if (!backendPortFree) {
    issues.push(`端口 ${BACKEND_PORT} 已被占用，请关闭占用该端口的程序后重试`)
  }
  if (!frontendPortFree) {
    issues.push(`端口 ${FRONTEND_PORT} 已被占用，请关闭占用该端口的程序后重试`)
  }

  if (env.DB_HOST && env.DB_PORT) {
    log(`检测数据库连通性: ${env.DB_HOST}:${env.DB_PORT}`)
    const dbCheck = await testTcpConnection(env.DB_HOST, env.DB_PORT)
    if (!dbCheck.ok) {
      issues.push(
        `无法连接数据库 ${env.DB_HOST}:${env.DB_PORT} (${dbCheck.message})\n` +
          '  请检查：\n' +
          '  1. 本机是否能正常上网\n' +
          '  2. 防火墙/公司网络是否拦截 3311 端口\n' +
          '  3. SQLPub 是否已允许该成员 IP 访问（需在 SQLPub 控制台配置）'
      )
    }
  } else {
    issues.push('数据库配置不完整，请检查 app/server/.env 中的 DB_HOST / DB_PORT')
  }

  return issues
}

function pauseBeforeExit(code) {
  log('\n按 Enter 键退出...')
  try {
    process.stdin.setEncoding('utf8')
    process.stdin.resume()
    process.stdin.on('data', () => process.exit(code))
  } catch {
    spawnSync('cmd', ['/c', 'pause'], { stdio: 'inherit' })
    process.exit(code)
  }
}

function writeErrorFile(message) {
  fs.writeFileSync(ERROR_FILE, message, 'utf8')
}

function fail(message, details = '') {
  const backendLog = serviceLogs.后端.join('').trim()
  const frontendLog = serviceLogs.前端.join('').trim()
  const sections = [`[错误] ${message}`]

  if (details) {
    sections.push(details)
  }
  if (backendLog) {
    sections.push('\n--- 后端输出 ---\n' + backendLog)
  }
  if (frontendLog) {
    sections.push('\n--- 前端输出 ---\n' + frontendLog)
  }

  sections.push(`\n日志文件: ${path.join(LOG_DIR, 'startup.log')}`)

  const fullMessage = sections.join('\n')
  process.stderr.write(`\n${fullMessage}\n`)
  writeErrorFile(fullMessage)
  appendLog(fullMessage)

  cleanupChildren()
  if (TRAY_MODE) {
    process.exit(1)
  }
  pauseBeforeExit(1)
}

function cleanupChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
}

process.on('SIGINT', () => {
  log('\n正在停止服务...')
  cleanupChildren()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanupChildren()
  process.exit(0)
})

function spawnService(label, args, cwd, env = {}) {
  log(`启动${label}...`)

  const child = spawn(NODE, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    serviceLogs[label].push(text)
    appendLog(`[${label}] ${text.trimEnd()}`)
  })

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    serviceLogs[label].push(text)
    appendLog(`[${label}][ERR] ${text.trimEnd()}`)
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      const backendHint =
        label === '后端'
          ? '\n常见原因：\n' +
            '  - 数据库连接失败（SQLPub 未放行该电脑 IP）\n' +
            '  - 缺少 Visual C++ 运行库\n' +
            '  - 安装路径权限不足，建议解压到 D:\\紫夜官网 等普通目录'
          : ''
      fail(`${label}异常退出 (code=${code})`, backendHint)
    }
  })

  children.push(child)
  return child
}

function waitForUrl(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume()
        resolve(true)
      })

      request.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`等待超时: ${url}`))
          return
        }
        setTimeout(attempt, 500)
      })
    }

    attempt()
  })
}

function openBrowser(url) {
  spawn('cmd', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
}

async function main() {
  if (fs.existsSync(ERROR_FILE)) {
    fs.unlinkSync(ERROR_FILE)
  }

  if (!fs.existsSync(NODE)) {
    fail('缺少内置 Node 运行时，请重新下载完整安装包。')
  }

  if (!fs.existsSync(SERVER_ENV)) {
    fail('缺少数据库配置 app/server/.env，请联系管理员获取完整安装包。')
  }

  log('========================================')
  log('  紫夜公会官网 - 本地版')
  log('========================================')
  log(`  地址: ${FRONTEND_URL}`)
  log(TRAY_MODE ? '  启动成功后将最小化到系统托盘' : '  关闭此窗口将停止服务')
  log('========================================\n')

  log('正在执行启动前检查...')
  const preflightIssues = await runPreflightChecks()
  if (preflightIssues.length > 0) {
    fail('启动前检查未通过', preflightIssues.map((item) => `- ${item}`).join('\n'))
  }
  log('启动前检查通过\n')

  spawnService('后端', ['server.cjs'], SERVER_DIR, {
    PORT: String(BACKEND_PORT),
    NODE_ENV: 'production',
  })

  spawnService('前端', [path.join(ROOT, 'static-server.cjs')], ROOT, {
    FRONTEND_PORT: String(FRONTEND_PORT),
  })

  log('正在启动，请稍候...')

  try {
    await Promise.all([
      waitForUrl(`http://127.0.0.1:${BACKEND_PORT}/api/health`),
      waitForUrl(`http://127.0.0.1:${FRONTEND_PORT}/`),
    ])
  } catch (error) {
    fail(error.message)
  }

  log('\n服务已就绪')
  log('ZIYE_READY')

  if (TRAY_MODE) {
    log('已在后台运行，可通过系统托盘图标管理。')
    // 保持进程运行，由托盘程序负责打开浏览器和退出
    return
  }

  log('正在打开浏览器...')
  openBrowser(FRONTEND_URL)
  log('\n网站运行中。关闭此窗口即可退出。\n')
}

main().catch((error) => {
  fail(error.message)
})
