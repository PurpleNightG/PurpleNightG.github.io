import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import {
  API_URL,
  BACKEND_PORT,
  FRONTEND_PORT,
  FRONTEND_URL,
  ROOT_DIR,
  SERVER_DIR,
  SERVER_ENV,
} from './paths.mjs'

const args = new Set(process.argv.slice(2))
const isDev = args.has('--dev')
const shouldOpen = args.has('--open')
const forceBuild = args.has('--build')

const children = []

function log(message) {
  console.log(message)
}

function fail(message) {
  console.error(`\n❌ ${message}`)
  cleanup(1)
}

function spawnProcess(label, command, cwd, env = {}) {
  log(`▶  启动${label}...`)
  const child = spawn(command, {
    cwd,
    shell: true,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })

  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`\n❌ ${label}已退出 (code=${code}, signal=${signal ?? 'none'})`)
      cleanup(code ?? 1)
    }
  })

  children.push(child)
  return child
}

function cleanup(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => {
  log('\n\n正在停止本地服务...')
  cleanup(0)
})

process.on('SIGTERM', () => cleanup(0))

function waitForUrl(url, timeoutMs = 60000) {
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
  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`

  spawn(command, { shell: true, stdio: 'ignore' })
}

function ensureEnv() {
  if (!fs.existsSync(SERVER_ENV)) {
    fail('未找到 server/.env。请先运行: cd local-app && npm run setup')
  }
}

function ensureDist(force) {
  const distDir = `${ROOT_DIR}/dist`
  if (!force && fs.existsSync(distDir)) {
    return
  }

  log('\n🔨 正在构建前端（本地 API 地址）...')
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT_DIR,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_URL: API_URL,
      NODE_ENV: 'production',
    },
  })

  if (result.status !== 0) {
    fail('前端构建失败')
  }
}

async function main() {
  ensureEnv()

  log('========================================')
  log('  紫夜公会官网 - 本地模式')
  log('========================================')
  log(`  前端: ${FRONTEND_URL}`)
  log(`  后端: http://localhost:${BACKEND_PORT}`)
  log(`  数据库: 直连 SQLPub（经 server/.env 配置）`)
  log(`  模式: ${isDev ? '开发 (Vite Dev)' : '生产预览 (Vite Preview)'}`)
  log('========================================\n')

  spawnProcess('后端', isDev ? 'npm run dev' : 'npm start', SERVER_DIR)

  if (isDev) {
    spawnProcess('前端', 'npm run dev', ROOT_DIR, {
      VITE_API_URL: API_URL,
      BROWSER: 'none',
    })
  } else {
    ensureDist(forceBuild)
    spawnProcess('前端', `npx vite preview --port ${FRONTEND_PORT} --host`, ROOT_DIR, {
      VITE_API_URL: API_URL,
      BROWSER: 'none',
    })
  }

  log('\n⏳ 等待服务就绪...')

  try {
    await Promise.all([
      waitForUrl(`http://127.0.0.1:${BACKEND_PORT}/api/health`),
      waitForUrl(`http://127.0.0.1:${FRONTEND_PORT}/`),
    ])
  } catch (error) {
    fail(error.message)
  }

  log('\n✅ 本地服务已就绪')

  if (shouldOpen) {
    log(`🌐 正在打开浏览器: ${FRONTEND_URL}`)
    openBrowser(FRONTEND_URL)
  } else {
    log(`🌐 请手动访问: ${FRONTEND_URL}`)
  }

  log('\n按 Ctrl+C 停止所有服务\n')
}

main().catch((error) => {
  fail(error.message)
})
