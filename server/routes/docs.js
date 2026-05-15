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

async function updateIndex() {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DOCS_PATH}?ref=${BRANCH}`, {
      headers: getHeaders()
    })
    if (!res.ok) return
    const files = await res.json()
    const mdFiles = files
      .filter(f => f.type === 'file' && f.name.endsWith('.md'))
      .map(f => ({ name: f.name.replace('.md', ''), path: f.name }))

    const encoded = Buffer.from(JSON.stringify(mdFiles, null, 2), 'utf-8').toString('base64')
    const sha = await getFileSha(`${DOCS_PATH}/index.json`)
    await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DOCS_PATH}/index.json`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        message: 'docs: update index',
        content: encoded,
        branch: BRANCH,
        ...(sha ? { sha } : {})
      })
    })
  } catch (e) {
    console.error('更新 index.json 失败:', e)
  }
}

async function updateVersion() {
  try {
    const version = Date.now().toString()
    const encoded = Buffer.from(JSON.stringify({ version }, null, 2), 'utf-8').toString('base64')
    const sha = await getFileSha(VERSION_PATH)
    await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${VERSION_PATH}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        message: 'docs: bump version',
        content: encoded,
        branch: BRANCH,
        ...(sha ? { sha } : {})
      })
    })
  } catch (e) {
    console.error('更新 version.json 失败:', e)
  }
}

// 列出所有 MD 文件
router.get('/list', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(503).json({ success: false, message: '未配置 GITHUB_TOKEN，请在服务器 .env 中设置' })
    }
    const response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DOCS_PATH}?ref=${BRANCH}`,
      { headers: getHeaders() }
    )
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.message || '获取文件列表失败')
    }
    const files = await response.json()
    const mdFiles = files
      .filter(f => f.type === 'file' && f.name.endsWith('.md'))
      .map(f => ({ name: f.name, sha: f.sha, size: f.size }))
    res.json({ success: true, data: mdFiles })
  } catch (error) {
    console.error('列出文档失败:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 获取单个文件内容
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

// 创建或更新文件
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
        body: JSON.stringify({
          message: `docs: update ${filename}`,
          content: encoded,
          branch: BRANCH,
          ...(sha ? { sha } : {})
        })
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

// 删除文件
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
        body: JSON.stringify({
          message: `docs: delete ${filename}`,
          sha,
          branch: BRANCH
        })
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

export default router
