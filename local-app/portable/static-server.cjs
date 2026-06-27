'use strict'

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PORT = Number(process.env.FRONTEND_PORT || 3001)
const DIST_DIR = path.join(__dirname, 'app', 'dist')

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

    response.writeHead(200, { 'Content-Type': type })
    response.end(data)
  })
}

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
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
      return
    }

    response.writeHead(404)
    response.end('Not Found')
  })
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`frontend-ready:${PORT}\n`)
})
