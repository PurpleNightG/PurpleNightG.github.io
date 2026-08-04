import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ensureDir, log, PORTABLE_DIR, RELEASE_DIR } from './build-utils.mjs'
import { ROOT_DIR } from './paths.mjs'

const UPDATE_CONFIG_SRC = path.join(ROOT_DIR, 'local-app', 'portable', 'update-config.json')

export function createBundleVersion() {
  return new Date().toISOString()
}

export function writeBundleVersion(version) {
  ensureDir(PORTABLE_DIR)
  fs.writeFileSync(path.join(PORTABLE_DIR, '.bundle-version'), version, 'utf8')
}

export function copyUpdateConfig() {
  if (!fs.existsSync(UPDATE_CONFIG_SRC)) {
    return
  }
  fs.copyFileSync(UPDATE_CONFIG_SRC, path.join(PORTABLE_DIR, 'update-config.json'))
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function readManifestUrlHint() {
  try {
    const config = JSON.parse(fs.readFileSync(UPDATE_CONFIG_SRC, 'utf8'))
    return typeof config.manifestUrl === 'string' ? config.manifestUrl : ''
  } catch {
    return ''
  }
}

/**
 * 生成 Gitee 发布用的 latest.json。
 * downloadUrl 可用环境变量 GITEE_DOWNLOAD_URL 覆盖；否则写入占位，上传 Release 后手动改。
 */
export function writeLatestManifest(bundleVersion, zipPath, notes = '') {
  ensureDir(RELEASE_DIR)

  if (!fs.existsSync(zipPath)) {
    throw new Error(`找不到更新包: ${zipPath}`)
  }

  const downloadUrl =
    process.env.GITEE_DOWNLOAD_URL ||
    'https://gitee.com/NDYian/ziye/releases/download/替换为Tag/紫夜官网-本地版-便携包.zip'

  const manifest = {
    version: bundleVersion,
    downloadUrl,
    sha256: sha256File(zipPath),
    notes: notes || '紫夜官网本地版更新',
    builtAt: new Date().toISOString(),
  }

  const manifestPath = path.join(RELEASE_DIR, 'latest.json')
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const guidePath = path.join(RELEASE_DIR, 'Gitee发布说明.txt')
  const manifestHint = readManifestUrlHint()
  const guide = [
    '紫夜官网本地版 - Gitee 自动更新发布步骤',
    '========================================',
    '',
    `本次版本: ${bundleVersion}`,
    `更新包: ${zipPath}`,
    `清单文件: ${manifestPath}`,
    `SHA256: ${manifest.sha256}`,
    '',
    '1. 在 Gitee 仓库创建 Release（发行版），上传「紫夜官网-本地版-便携包.zip」',
    '2. 复制该附件的下载地址，填入 latest.json 的 downloadUrl',
    '   （或打包前设置环境变量 GITEE_DOWNLOAD_URL）',
    '3. 将改好的 latest.json 提交到仓库根目录（master/main 分支）',
    `4. 确认 update-config.json 的 manifestUrl 指向:`,
    `   ${manifestHint || 'https://gitee.com/用户名/仓库名/raw/master/latest.json'}`,
    '5. 首次仍需把带自动更新的「紫夜官网-本地版.exe」发群一次；之后成员启动即可自动更新',
    '',
  ].join('\n')

  fs.writeFileSync(guidePath, guide, 'utf8')

  log(`✅ 已生成更新清单: ${manifestPath}`)
  log(`📄 发布说明: ${guidePath}`)
  return manifestPath
}
