'use strict'

/**
 * 从 GitHub 仓库同步紫夜文档到本地安装目录。
 * 管理员在后台改文档会写到 GitHub public/docs 并 bump version.json；
 * 本地版对比版本后增量拉取，无需整包更新。
 */

const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const path = require('node:path')

const DEFAULT_REMOTE_BASES = [
  'https://cdn.jsdelivr.net/gh/PurpleNightG/PurpleNightG.github.io@main/public',
  'https://raw.githubusercontent.com/PurpleNightG/PurpleNightG.github.io/main/public',
  'https://purplenightg.github.io',
]

function readRemoteBases(rootDir) {
  const bases = []
  const configPath = path.join(rootDir, 'update-config.json')
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (typeof config.docsRemoteBase === 'string' && config.docsRemoteBase.trim()) {
        bases.push(config.docsRemoteBase.trim().replace(/\/$/, ''))
      }
      if (Array.isArray(config.docsRemoteBases)) {
        for (const item of config.docsRemoteBases) {
          if (typeof item === 'string' && item.trim()) {
            bases.push(item.trim().replace(/\/$/, ''))
          }
        }
      }
    }
  } catch {
    // ignore
  }

  if (process.env.ZIYE_DOCS_REMOTE) {
    bases.unshift(String(process.env.ZIYE_DOCS_REMOTE).replace(/\/$/, ''))
  }

  for (const item of DEFAULT_REMOTE_BASES) {
    if (!bases.includes(item)) bases.push(item)
  }

  return bases
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fetchBufferOnce(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const request = lib.get(
      url,
      {
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'ZiyeGuildLocalDocsSync/1.0',
          Accept: '*/*',
          'Cache-Control': 'no-cache',
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume()
          fetchBufferOnce(response.headers.location, timeoutMs).then(resolve, reject)
          return
        }

        if (response.statusCode !== 200) {
          response.resume()
          reject(new Error(`HTTP ${response.statusCode}: ${url}`))
          return
        }

        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', reject)
      }
    )

    request.on('timeout', () => {
      request.destroy()
      reject(new Error(`超时: ${url}`))
    })
    request.on('error', reject)
  })
}

async function fetchBuffer(url, timeoutMs = 20000, retries = 3) {
  let lastError
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchBufferOnce(url, timeoutMs)
    } catch (error) {
      lastError = error
      if (i < retries - 1) {
        await sleep(400 * (i + 1))
      }
    }
  }
  throw lastError
}

async function fetchText(url) {
  const buf = await fetchBuffer(url)
  return buf.toString('utf8')
}

async function fetchJson(url) {
  const text = await fetchText(url)
  return JSON.parse(text)
}

async function fetchTextFromBases(bases, relativePath, log) {
  let lastError
  for (const base of bases) {
    const url = `${base}/${relativePath.replace(/^\//, '')}?t=${Date.now()}`
    try {
      return { text: await fetchText(url), base }
    } catch (error) {
      lastError = error
      if (log) log(`  源失败 ${base}: ${error.message}`)
    }
  }
  throw lastError || new Error(`全部源失败: ${relativePath}`)
}

async function fetchJsonFromBases(bases, relativePath, log) {
  const { text, base } = await fetchTextFromBases(bases, relativePath, log)
  return { json: JSON.parse(text), base }
}

function encodePathSegments(relPath) {
  return String(relPath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function collectDocFiles(items, out = []) {
  if (!Array.isArray(items)) {
    return out
  }

  for (const item of items) {
    if (!item) continue
    if (item.type === 'dir' && Array.isArray(item.children)) {
      collectDocFiles(item.children, out)
    } else if (item.path && (item.type === 'file' || String(item.path).endsWith('.md'))) {
      out.push(String(item.path).replace(/^\//, ''))
    }
  }

  return out
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function writeBoth(docsDir, distDocsDir, relativePath, content) {
  const a = path.join(docsDir, relativePath)
  const b = path.join(distDocsDir, relativePath)
  ensureParentDir(a)
  ensureParentDir(b)
  const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
  fs.writeFileSync(a, data)
  fs.writeFileSync(b, data)
}

function readLocalVersion(distDir) {
  const candidates = [
    path.join(distDir, 'version.json'),
    path.join(distDir, 'docs', '.remote-version'),
  ]

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue
      const raw = fs.readFileSync(filePath, 'utf8').trim()
      if (filePath.endsWith('.remote-version')) {
        return raw
      }
      const json = JSON.parse(raw)
      if (json && json.version != null) {
        return String(json.version)
      }
    } catch {
      // continue
    }
  }

  return ''
}

/**
 * @param {string} rootDir 安装根目录（含 app/）
 * @param {(msg: string) => void} log
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<{ updated: boolean, version?: string, reason?: string }>}
 */
async function syncDocs(rootDir, log = console.log, options = {}) {
  const bases = readRemoteBases(rootDir)
  const distDir = path.join(rootDir, 'app', 'dist')
  const docsDir = path.join(rootDir, 'app', 'docs')
  const distDocsDir = path.join(distDir, 'docs')

  if (!fs.existsSync(distDir)) {
    return { updated: false, reason: 'missing-dist' }
  }

  fs.mkdirSync(docsDir, { recursive: true })
  fs.mkdirSync(distDocsDir, { recursive: true })

  let remoteVersionInfo
  let usedBase
  try {
    const result = await fetchJsonFromBases(bases, 'version.json', null)
    remoteVersionInfo = result.json
    usedBase = result.base
  } catch (error) {
    log(`文档版本检查失败（可继续使用本地文档）: ${error.message}`)
    return { updated: false, reason: 'version-fetch-failed' }
  }

  const remoteVersion = String(remoteVersionInfo.version || '')
  if (!remoteVersion) {
    return { updated: false, reason: 'empty-remote-version' }
  }

  const localVersion = readLocalVersion(distDir)
  if (!options.force && localVersion && localVersion === remoteVersion) {
    return { updated: false, version: remoteVersion, reason: 'up-to-date' }
  }

  log(`发现文档更新 (${localVersion || '无'} → ${remoteVersion})，正在同步...`)

  let index
  try {
    // 优先用已通的源，再回退其它
    const ordered = [usedBase, ...bases.filter((b) => b !== usedBase)]
    const result = await fetchJsonFromBases(ordered, 'docs/index.json', log)
    index = result.json
    usedBase = result.base
  } catch (error) {
    log(`拉取文档索引失败: ${error.message}`)
    return { updated: false, reason: 'index-fetch-failed' }
  }

  const files = collectDocFiles(index)
  const indexJson = `${JSON.stringify(index, null, 2)}\n`
  writeBoth(docsDir, distDocsDir, 'index.json', indexJson)

  let ok = 0
  let fail = 0
  const ordered = [usedBase, ...bases.filter((b) => b !== usedBase)]
  for (const rel of files) {
    const encoded = encodePathSegments(rel)
    try {
      const { text } = await fetchTextFromBases(ordered, `docs/${encoded}`, null)
      writeBoth(docsDir, distDocsDir, rel, text)
      ok += 1
    } catch (error) {
      fail += 1
      log(`  文档下载失败: ${rel} (${error.message})`)
    }
  }

  const versionPayload = `${JSON.stringify(
    {
      ...remoteVersionInfo,
      version: remoteVersion,
      syncedAt: new Date().toISOString(),
      syncedFrom: usedBase,
    },
    null,
    2
  )}\n`

  fs.writeFileSync(path.join(distDir, 'version.json'), versionPayload, 'utf8')
  fs.writeFileSync(path.join(distDocsDir, '.remote-version'), remoteVersion, 'utf8')
  fs.writeFileSync(path.join(docsDir, '.remote-version'), remoteVersion, 'utf8')

  if (fail > 0 && ok === 0) {
    log('文档同步失败：全部文件下载失败')
    return { updated: false, reason: 'all-downloads-failed' }
  }

  log(`文档同步完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}（源: ${usedBase}）`)
  return { updated: true, version: remoteVersion, ok, fail, base: usedBase }
}

module.exports = {
  syncDocs,
  DEFAULT_REMOTE_BASES,
}
