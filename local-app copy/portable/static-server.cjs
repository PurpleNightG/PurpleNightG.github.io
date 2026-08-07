'use strict'

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PORT = Number(process.env.FRONTEND_PORT || 3001)
const ROOT = __dirname
const DIST_DIR = path.join(ROOT, 'app', 'dist')
const DOCS_DIR = path.join(ROOT, 'app', 'docs')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
}

function sendFile(filePath, response) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }

    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
    })
    response.end(data)
  })
}

function resolveDocsFile(urlPath) {
  // /docs/xxx → prefer mutable app/docs, fallback app/dist/docs
  const relative = urlPath.replace(/^\/docs\/?/, '')
  const primary = path.join(DOCS_DIR, relative)
  const fallback = path.join(DIST_DIR, 'docs', relative)

  if (primary.startsWith(DOCS_DIR) && fs.existsSync(primary) && fs.statSync(primary).isFile()) {
    return primary
  }
  if (fallback.startsWith(path.join(DIST_DIR, 'docs')) && fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
    return fallback
  }
  return null
}

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')

  if (safePath === '/docs' || safePath.startsWith('/docs/')) {
    const docsFile = resolveDocsFile(safePath.endsWith('/') ? `${safePath}index.json` : safePath)
    if (docsFile) {
      sendFile(docsFile, response)
      return
    }
  }

  let filePath = path.join(DIST_DIR, safePath)

  if (urlPath.endsWith('/')) {
    filePath = path.join(filePath, 'index.html')
  }

  if (!filePath.startsWith(DIST_DIR)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(filePath, response)
      return
    }

    const indexPath = path.join(DIST_DIR, 'index.html')
    if (fs.existsSync(indexPath)) {
      sendFile(indexPath, response)
    } else {
      response.writeHead(404)
      response.end('Not Found')
    }
  })
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`frontend-ready:${PORT}\n`)
})
