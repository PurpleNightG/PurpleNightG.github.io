import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  API_URL,
  CACHE_DIR,
  NODE_FOLDER,
  NODE_URL,
  NODE_ZIP,
  PORTABLE_DIR,
  RELEASE_DIR,
  copyDirectory,
  copyFile,
  downloadFile,
  ensureDir,
  extractNodeZip,
  fail,
  isNodeZipValid,
  isPortableNodeReady,
  log,
  removeDir,
  run,
} from './build-utils.mjs'
import { buildAppIcon, ICON_PATH } from './build-icon.mjs'
import { LOCAL_APP_DIR, ROOT_DIR } from './paths.mjs'
import {
  copyUpdateConfig,
  createBundleVersion,
  writeBundleVersion,
  writeLatestManifest,
} from './write-latest-manifest.mjs'

const PORTABLE_TEMPLATE = path.join(LOCAL_APP_DIR, 'portable')
const NODE_CACHE_ZIP = path.join(CACHE_DIR, NODE_ZIP)
const NODE_CACHE_DIR = path.join(CACHE_DIR, NODE_FOLDER)

function injectRemoteApiUrl(launcherPath, apiUrl) {
  const source = fs.readFileSync(launcherPath, 'utf8')
  if (!source.includes('__ZIYE_REMOTE_API_URL__')) {
    fail('launcher.cjs 缺少 __ZIYE_REMOTE_API_URL__ 占位符，请检查模板')
  }
  const escaped = JSON.stringify(apiUrl).slice(1, -1)
  fs.writeFileSync(
    launcherPath,
    source.replace(/__ZIYE_REMOTE_API_URL__/g, escaped),
    'utf8'
  )
}

async function ensurePortableNode() {
  ensureDir(CACHE_DIR)

  if (!isPortableNodeReady(NODE_CACHE_DIR)) {
    if (fs.existsSync(NODE_CACHE_DIR)) {
      log('\n⚠️  Node 运行时不完整，清理后重新解压...')
      removeDir(NODE_CACHE_DIR)
    }

    if (!isNodeZipValid(NODE_CACHE_ZIP)) {
      if (fs.existsSync(NODE_CACHE_ZIP)) {
        log('⚠️  Node 安装包不完整，重新下载...')
        fs.unlinkSync(NODE_CACHE_ZIP)
      }
      log(`\n⬇️  下载 Node.js 运行时 (${NODE_FOLDER})...`)
      await downloadFile(NODE_URL, NODE_CACHE_ZIP)
    }
    if (!isNodeZipValid(NODE_CACHE_ZIP)) {
      fail('Node 下载失败或文件过小，请检查网络后删除 local-app copy/.cache 重试')
    }

    log('\n📦 解压 Node.js 运行时...')
    extractNodeZip(NODE_CACHE_ZIP, CACHE_DIR, NODE_FOLDER)
  }

  if (!isPortableNodeReady(NODE_CACHE_DIR)) {
    fail('Node.js 运行时解压失败，请删除 local-app copy/.cache 目录后重试')
  }
}

function buildFrontend() {
  log('\n🔨 构建前端（远程 Linux API）...')
  log(`  VITE_API_URL=${API_URL}`)

  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    run('npm ci', ROOT_DIR)
  }

  run('npm run build', ROOT_DIR, {
    VITE_API_URL: API_URL,
    NODE_ENV: 'production',
  })
}

function compileLauncherExe(iconPath) {
  log('\n🧩 编译启动器 EXE...')

  const cscCandidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ]

  const csc = cscCandidates.find((candidate) => fs.existsSync(candidate))
  if (!csc) {
    log('⚠️  未找到 csc.exe，跳过 EXE 编译。可安装 .NET Framework SDK 或使用 Inno Setup 打包。')
    return false
  }

  const source = path.join(PORTABLE_TEMPLATE, 'launcher.cs')
  const output = path.join(PORTABLE_DIR, '紫夜官网.exe')

  const args = [
    '/nologo',
    '/target:winexe',
    `/out:${output}`,
    '/reference:System.Windows.Forms.dll',
    '/reference:System.IO.Compression.FileSystem.dll',
    `/win32icon:${iconPath}`,
    source,
  ]

  const result = spawnSync(csc, args, { stdio: 'inherit' })

  if (result.status !== 0) {
    fail('启动器 EXE 编译失败')
  }

  return true
}

function cleanupBuildArtifacts() {
  const launcherSource = path.join(PORTABLE_DIR, 'launcher.cs')
  if (fs.existsSync(launcherSource)) {
    fs.unlinkSync(launcherSource)
  }
}

function createZipArchive() {
  log('\n🗜️  创建 ZIP 压缩包...')

  const zipPath = path.join(RELEASE_DIR, '紫夜官网-本地版-便携包.zip')
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath)
  }

  const portableEscaped = PORTABLE_DIR.replace(/'/g, "''")
  const zipEscaped = zipPath.replace(/'/g, "''")
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path (Join-Path -Path '${portableEscaped}' -ChildPath '*') -DestinationPath '${zipEscaped}' -Force`,
    ],
    { stdio: 'inherit' }
  )
  if (result.status !== 0) {
    fail('创建 ZIP 压缩包失败')
  }
  log(`✅ ZIP: ${zipPath}`)
  return zipPath
}

async function main() {
  log('========================================')
  log('  紫夜公会官网 - 远程 API 本地版构建')
  log('========================================')
  log(`  远程 API: ${API_URL}`)
  log('  本包不含后端、不含数据库凭据')
  log('========================================')

  await ensurePortableNode()
  buildFrontend()
  const iconPath = await buildAppIcon()
  const bundleVersion = createBundleVersion()

  log('\n📁 组装便携目录（仅静态前端 + 启动器）...')
  removeDir(PORTABLE_DIR)
  ensureDir(PORTABLE_DIR)

  copyFile(path.join(NODE_CACHE_DIR, 'node.exe'), path.join(PORTABLE_DIR, 'runtime', 'node.exe'))
  copyFile(path.join(PORTABLE_TEMPLATE, 'launcher.cjs'), path.join(PORTABLE_DIR, 'launcher.cjs'))
  copyFile(path.join(PORTABLE_TEMPLATE, 'static-server.cjs'), path.join(PORTABLE_DIR, 'static-server.cjs'))
  copyFile(path.join(PORTABLE_TEMPLATE, 'docs-sync.cjs'), path.join(PORTABLE_DIR, 'docs-sync.cjs'))
  copyFile(iconPath, path.join(PORTABLE_DIR, 'app.ico'))
  copyUpdateConfig()
  writeBundleVersion(bundleVersion)

  copyDirectory(path.join(ROOT_DIR, 'dist'), path.join(PORTABLE_DIR, 'app', 'dist'), {
    excludeMaps: true,
  })
  copyDirectory(path.join(ROOT_DIR, 'public', 'docs'), path.join(PORTABLE_DIR, 'app', 'docs'))

  injectRemoteApiUrl(path.join(PORTABLE_DIR, 'launcher.cjs'), API_URL)
  log('🔗 已注入远程 API 地址到启动器（无 credentials.sealed）')

  const hasExe = compileLauncherExe(iconPath)
  cleanupBuildArtifacts()
  const zipPath = createZipArchive()
  writeLatestManifest(bundleVersion, zipPath)

  log('\n========================================')
  log('  构建完成')
  log('========================================')
  log(`  便携目录: ${PORTABLE_DIR}`)
  log(`  版本: ${bundleVersion}`)
  log(`  API: ${API_URL}`)
  log('  安全: 包内无数据库凭据、无后端源码')
  if (hasExe) {
    log(`  双击运行: ${path.join(PORTABLE_DIR, '紫夜官网.exe')}`)
  } else {
    log('  命令启动: runtime\\node.exe launcher.cjs')
  }
  log('\n下一步（可选）: npm run build:exe 生成单文件分发 EXE')
  log('========================================\n')
}

main().catch((error) => {
  fail(error.message)
})
