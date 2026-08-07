import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const LOCAL_APP_DIR = path.resolve(__dirname, '..')
export const ROOT_DIR = path.resolve(LOCAL_APP_DIR, '..')
export const SERVER_DIR = path.join(ROOT_DIR, 'server')
export const SERVER_ENV = path.join(SERVER_DIR, '.env')
export const SERVER_ENV_EXAMPLE = path.join(SERVER_DIR, '.env.example')
export const LOCAL_ENV = path.join(LOCAL_APP_DIR, '.env')

export const FRONTEND_PORT = 3001
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`

/** 默认：公网 NAT 18000 → 机内 8000；可用环境变量或 local-app copy/.env 覆盖 */
const DEFAULT_REMOTE_API_URL = 'http://160.202.254.36:18000/api'

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }
  const values = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
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

function normalizeApiUrl(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '')
  if (!value) return DEFAULT_REMOTE_API_URL
  return value.endsWith('/api') ? value : `${value}/api`
}

const fileEnv = parseEnvFile(LOCAL_ENV)

export const REMOTE_API_URL = normalizeApiUrl(
  process.env.ZIYE_REMOTE_API_URL ||
    process.env.REMOTE_API_URL ||
    fileEnv.ZIYE_REMOTE_API_URL ||
    fileEnv.REMOTE_API_URL ||
    DEFAULT_REMOTE_API_URL
)

/** 前端构建用的 API 基址（指向 Linux，不再指向本机后端） */
export const API_URL = REMOTE_API_URL
