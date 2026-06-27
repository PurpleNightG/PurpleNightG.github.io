import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { ROOT_DIR } from './paths.mjs'

export const NODE_VERSION = '22.20.0'
export const NODE_ZIP = `node-v${NODE_VERSION}-win-x64.zip`
export const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}`
export const NODE_FOLDER = `node-v${NODE_VERSION}-win-x64`

export const CACHE_DIR = path.join(ROOT_DIR, 'local-app', '.cache')
export const RELEASE_DIR = path.join(ROOT_DIR, 'local-app', 'release')
export const PORTABLE_DIR = path.join(RELEASE_DIR, 'portable')
export const API_URL = 'http://localhost:3000/api'

export function log(message) {
  console.log(message)
}

export function fail(message) {
  console.error(`\n❌ ${message}`)
  process.exit(1)
}

export function run(command, cwd, env = {}) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })

  if (result.status !== 0) {
    fail(`命令执行失败: ${command}`)
  }
}

export async function downloadFile(url, destination) {
  const response = await fetch(url)
  if (!response.ok) {
    fail(`下载失败 (${response.status}): ${url}`)
  }

  await pipeline(response.body, createWriteStream(destination))
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.cache',
  'release',
  'local-app',
])

const SKIP_FILE_NAMES = new Set([
  '.env.example',
])

const SKIP_FILE_PATTERNS = [/\.map$/]

export function copyDirectory(source, destination, options = {}) {
  const { includeEnv = false, excludeMaps = true } = options

  ensureDir(destination)

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const destinationPath = path.join(destination, entry.name)

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) {
        continue
      }
      copyDirectory(sourcePath, destinationPath, options)
      continue
    }

    if (entry.name === '.env' && !includeEnv) {
      continue
    }

    if (SKIP_FILE_NAMES.has(entry.name)) {
      continue
    }

    if (excludeMaps && SKIP_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))) {
      continue
    }

    fs.copyFileSync(sourcePath, destinationPath)
  }
}

export function copyFile(source, destination) {
  ensureDir(path.dirname(destination))
  fs.copyFileSync(source, destination)
}

export function fileSizeMb(filePath) {
  const stats = fs.statSync(filePath)
  return (stats.size / 1024 / 1024).toFixed(1)
}
