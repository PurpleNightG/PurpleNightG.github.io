'use strict'

const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

const ROOT = __dirname
const NODE = path.join(ROOT, 'runtime', 'node.exe')
const FRONTEND_PORT = 3001
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`
const ERROR_FILE = path.join(ROOT, 'last-error.txt')
const LOG_DIR = path.join(
  process.env.LOCALAPPDATA || ROOT,
  'ZiyeGuildLocalRemote',
  'logs'
)

/** 打包时由 build-portable 替换；勿手改占位符 */
const EMBEDDED_REMOTE_API_URL = '__ZIYE_REMOTE_API_URL__'

const TRAY_MODE = process.env.ZIYE_TRAY_MODE === '1'
const children = []
const serviceLogs = {
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

function resolveRemoteApiUrl() {
  const fromEnv = String(process.env.ZIYE_REMOTE_API_URL || '').trim()
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '').endsWith('/api')
      ? fromEnv.replace(/\/+$/, '')
      : `${fromEnv.replace(/\/+$/, '')}/api`
  }

  const embedded = String(EMBEDDED_REMOTE_API_URL || '').trim()
  if (embedded && !embedded.includes('__ZIYE')) {
    return embedded.replace(/\/+$/, '')
  }

  return 'http://160.202.254.36:18000/api'
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

function probeRemoteApi(apiBaseUrl, timeoutMs = 12000) {
  const healthUrl = `${apiBaseUrl.replace(/\/+$/, '')}/health`
  return new Promise((resolve) => {
    const request = http.get(healthUrl, { timeout: timeoutMs }, (response) => {
      response.resume()
      resolve({
        ok: response.statusCode >= 200 && response.statusCode < 500,
        statusCode: response.statusCode,
        url: healthUrl,
      })
    })
    request.on('timeout', () => {
      request.destroy()
      resolve({ ok: false, message: '连接超时', url: healthUrl })
    })
    request.on('error', (error) => {
      resolve({ ok: false, message: error.message, url: healthUrl })
    })
  })
}

async function runPreflightChecks(remoteApiUrl) {
  const issues = []

  const nodeCheck = testNodeRuntime()
  if (!nodeCheck.ok) {
    issues.push(`内置 Node 无法运行: ${nodeCheck.message}`)
  } else {
    log(`Node 运行时: ${nodeCheck.message}`)
  }

  const frontendPortFree = await isPortAvailable(FRONTEND_PORT)
  if (!frontendPortFree) {
    issues.push(`端口 ${FRONTEND_PORT} 已被占用，请关闭占用该端口的程序后重试`)
  }

  log(`检测远程 API: ${remoteApiUrl}`)
  const apiCheck = await probeRemoteApi(remoteApiUrl)
  if (!apiCheck.ok) {
    issues.push(
      `无法访问远程 API ${apiCheck.url} (${apiCheck.message || `HTTP ${apiCheck.statusCode}`})\n` +
        '  请确认 Linux 上的后端已启动，且公网端口映射正常'
    )
  } else {
    log(`远程 API 可达 (HTTP ${apiCheck.statusCode})`)
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
  const frontendLog = serviceLogs.前端.join('').trim()
  const sections = [`[错误] ${message}`]

  if (details) {
    sections.push(details)
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
      fail(`${label}异常退出 (code=${code})`)
    }
  })

  children.push(child)
  return child
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

  const remoteApiUrl = resolveRemoteApiUrl()

  log('========================================')
  log('  紫夜公会官网 - 本地版（远程 API）')
  log('========================================')
  log(`  本机页面: ${FRONTEND_URL}`)
  log(`  远程 API: ${remoteApiUrl}`)
  log(TRAY_MODE ? '  启动成功后将最小化到系统托盘' : '  关闭此窗口将停止本机页面服务')
  log('========================================\n')

  log('正在执行启动前检查...')
  const preflightIssues = await runPreflightChecks(remoteApiUrl)
  if (preflightIssues.length > 0) {
    fail('启动前检查未通过', preflightIssues.map((item) => `- ${item}`).join('\n'))
  }
  log('启动前检查通过\n')

  spawnService('前端', [path.join(ROOT, 'static-server.cjs')], ROOT, {
    FRONTEND_PORT: String(FRONTEND_PORT),
  })

  log('正在启动，请稍候...')

  try {
    await waitForUrl(`http://127.0.0.1:${FRONTEND_PORT}/`)
  } catch (error) {
    fail(error.message)
  }

  log('\n服务已就绪')
  log('ZIYE_READY')

  try {
    const { syncDocs } = require('./docs-sync.cjs')
    const runDocsSync = (label) => {
      syncDocs(ROOT, (message) => appendLog(`[docs-sync] ${message}`))
        .then((result) => {
          if (result.updated) {
            appendLog(`[docs-sync] ${label}完成，已更新到 ${result.version}`)
          }
        })
        .catch((error) => {
          appendLog(`[docs-sync] ${label}失败: ${error.message}`)
        })
    }
    runDocsSync('启动后同步')
    setInterval(() => runDocsSync('定时同步'), 60 * 1000)
  } catch (error) {
    appendLog(`文档同步模块异常，跳过: ${error.message}`)
  }

  if (TRAY_MODE) {
    log('已在后台运行，可通过系统托盘图标管理。')
    return
  }

  log('正在打开浏览器...')
  openBrowser(FRONTEND_URL)
  log('\n网站运行中。关闭此窗口即可退出。\n')
}

main().catch((error) => {
  fail(error.message)
})
