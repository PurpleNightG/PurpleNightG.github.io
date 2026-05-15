import express from 'express'

const router = express.Router()

const GITHUB_API = 'https://api.github.com'
const OWNER = process.env.GITHUB_OWNER || 'PurpleNightG'
const REPO = process.env.GITHUB_REPO || 'PurpleNightG.github.io'
const BRANCH = process.env.GITHUB_BRANCH || 'main'
const DOCS_PATH = 'public/docs'
const VERSION_PATH = 'public/version.json'

function getHeaders() {
  return {
    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'PurpleNight-Admin'
  }
}

async function getFileSha(filePath) {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`, {
      headers: getHeaders()
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.sha || null
  } catch {
    return null
  }
}

// 递归列出目录内容，返回嵌套树结构
async function listRecursive(dirPath) {
  const res = await fetch(
    `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${dirPath}?ref=${BRANCH}`,
    { headers: getHeaders() }
  )
  if (!res.ok) return []
  const items = await res.json()
  if (!Array.isArray(items)) return []

  const result = []
  for (const item of items) {
    if (item.name === 'index.json') continue
    if (item.type === 'file' && item.name.endsWith('.md')) {
      const relPath = item.path.replace(`${DOCS_PATH}/`, '')
      result.push({ name: item.name, path: relPath, sha: item.sha, size: item.size, type: 'file' })
    } else if (item.type === 'dir') {
      const children = await listRecursive(item.path)
      const relPath = item.path.replace(`${DOCS_PATH}/`, '') + '/'
      result.push({ name: item.name, path: relPath, type: 'dir', children })
    }
  }
  return result
}

// 递归构建 index.json 结构（只保留 name/path/type/children，省略 sha/size）
function buildIndexTree(tree) {
  return tree.map(item => {
    if (item.type === 'dir') {
      return { name: item.name, path: item.path, type: 'dir', children: buildIndexTree(item.children || []) }
    }
    return { name: item.name.replace('.md', ''), path: item.path, type: 'file' }
  })
}

async function updateIndex() {
  try {
    const tree = await listRecursive(DOCS_PATH)
    const index = buildIndexTree(tree)
    const encoded = Buffer.from(JSON.stringify(index, null, 2), 'utf-8').toString('base64')
    const sha = await getFileSha(`${DOCS_PATH}/index.json`)
    await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DOCS_PATH}/index.json`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ message: 'docs: update index', content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) })
    })
  } catch (e) {
    console.error('更新 index.json 失败:', e)
  }
}

async function updateVersion() {
  try {
    const encoded = Buffer.from(JSON.stringify({ version: Date.now().toString() }, null, 2), 'utf-8').toString('base64')
    const sha = await getFileSha(VERSION_PATH)
    await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${VERSION_PATH}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ message: 'docs: bump version', content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) })
    })
  } catch (e) {
    console.error('更新 version.json 失败:', e)
  }
}

// 递归删除目录下所有文件
async function deleteDirectoryRecursive(dirPath) {
  const res = await fetch(
    `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${dirPath}?ref=${BRANCH}`,
    { headers: getHeaders() }
  )
  if (!res.ok) return
  const items = await res.json()
  if (!Array.isArray(items)) return
  for (const item of items) {
    if (item.type === 'dir') {
      await deleteDirectoryRecursive(item.path)
    } else {
      await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${item.path}`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ message: `docs: delete ${item.name}`, sha: item.sha, branch: BRANCH })
      })
    }
  }
}

// 列出文件树（管理端用）
router.get('/list', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(503).json({ success: false, message: '未配置 GITHUB_TOKEN，请在服务器 .env 中设置' })
    }
    const tree = await listRecursive(DOCS_PATH)
    res.json({ success: true, data: tree })
  } catch (error) {
    console.error('列出文档失败:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 获取单个文件内容（filename 支持 folder/file.md 格式）
router.get('/file', async (req, res) => {
  try {
    const { filename } = req.query
    if (!filename) return res.status(400).json({ success: false, message: '缺少 filename 参数' })
    const response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DOCS_PATH}/${filename}?ref=${BRANCH}`,
      { headers: getHeaders() }
    )
    if (!response.ok) throw new Error('文件不存在')
    const data = await response.json()
    const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    res.json({ success: true, data: { content, sha: data.sha, name: data.name } })
  } catch (error) {
    console.error('获取文档内容失败:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 创建或更新文件（filename 支持 folder/file.md）
router.put('/file', async (req, res) => {
  try {
    const { filename, content, sha } = req.body
    if (!filename || content === undefined) {
      return res.status(400).json({ success: false, message: '缺少 filename 或 content 参数' })
    }
    const encoded = Buffer.from(content, 'utf-8').toString('base64')
    const response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DOCS_PATH}/${filename}`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ message: `docs: update ${filename}`, content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) })
      }
    )
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.message || '保存文件失败')
    }
    await updateIndex()
    await updateVersion()
    res.json({ success: true, message: '文件保存成功，GitHub Pages 正在重新部署（约1分钟后生效）' })
  } catch (error) {
    console.error('保存文档失败:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 删除文件（filename 支持 folder/file.md）
router.delete('/file', async (req, res) => {
  try {
    const { filename, sha } = req.body
    if (!filename || !sha) {
      return res.status(400).json({ success: false, message: '缺少 filename 或 sha 参数' })
    }
    const response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DOCS_PATH}/${filename}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ message: `docs: delete ${filename}`, sha, branch: BRANCH })
      }
    )
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.message || '删除文件失败')
    }
    await updateIndex()
    await updateVersion()
    res.json({ success: true, message: '文件删除成功' })
  } catch (error) {
    console.error('删除文档失败:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 删除整个文件夹（递归删除所有子文件）
router.delete('/folder', async (req, res) => {
  try {
    const { folderPath } = req.body
    if (!folderPath) return res.status(400).json({ success: false, message: '缺少 folderPath 参数' })
    await deleteDirectoryRecursive(`${DOCS_PATH}/${folderPath}`)
    await updateIndex()
    await updateVersion()
    res.json({ success: true, message: '文件夹删除成功' })
  } catch (error) {
    console.error('删除文件夹失败:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
