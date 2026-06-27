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
  fail,
  log,
  removeDir,
  run,
} from './build-utils.mjs'
import { buildAppIcon, ICON_PATH } from './build-icon.mjs'
import {
  bundleServer,
  installNativeDependencies,
  prepareServerRuntime,
} from './build-server-bundle.mjs'
import { ROOT_DIR, SERVER_ENV } from './paths.mjs'

const PORTABLE_TEMPLATE = path.join(ROOT_DIR, 'local-app', 'portable')
const NODE_CACHE_ZIP = path.join(CACHE_DIR, NODE_ZIP)
const NODE_CACHE_DIR = path.join(CACHE_DIR, NODE_FOLDER)
const SERVER_TARGET = path.join(PORTABLE_DIR, 'app', 'server')
const SERVER_BUNDLE = path.join(SERVER_TARGET, 'server.cjs')

function ensureServerEnv() {
  if (!fs.existsSync(SERVER_ENV)) {
    fail(
      '打包前请先配置 server/.env（SQLPub 数据库凭据）。\n' +
        '该文件会在打包时内置到安装包中，仅分发给可信成员。'
    )
  }
}

async function ensurePortableNode() {
  ensureDir(CACHE_DIR)

  if (!fs.existsSync(NODE_CACHE_DIR)) {
    if (!fs.existsSync(NODE_CACHE_ZIP)) {
      log(`\n⬇️  下载 Node.js 运行时 (${NODE_FOLDER})...`)
      await downloadFile(NODE_URL, NODE_CACHE_ZIP)
    }

    log('\n📦 解压 Node.js 运行时...')
    run(`tar -xf "${NODE_CACHE_ZIP}" -C "${CACHE_DIR}"`, CACHE_DIR)
  }

  if (!fs.existsSync(path.join(NODE_CACHE_DIR, 'node.exe'))) {
    fail('Node.js 运行时解压失败')
  }
}

function buildFrontend() {
  log('\n🔨 构建前端（本地 API 地址）...')

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

  const psCommand = [
    'Compress-Archive',
    `-Path "${PORTABLE_DIR}\\*"`,
    `-DestinationPath "${zipPath}"`,
    '-Force',
  ].join(' ')

  run(`powershell -NoProfile -Command "${psCommand}"`, ROOT_DIR)
  log(`✅ ZIP: ${zipPath}`)
}

async function main() {
  log('========================================')
  log('  紫夜公会官网 - 免安装包构建')
  log('========================================')

  ensureServerEnv()
  await ensurePortableNode()
  buildFrontend()
  const iconPath = await buildAppIcon()

  log('\n📁 组装便携目录（仅运行产物，不含源码）...')
  removeDir(PORTABLE_DIR)
  ensureDir(PORTABLE_DIR)

  copyFile(path.join(NODE_CACHE_DIR, 'node.exe'), path.join(PORTABLE_DIR, 'runtime', 'node.exe'))
  copyFile(path.join(PORTABLE_TEMPLATE, 'launcher.cjs'), path.join(PORTABLE_DIR, 'launcher.cjs'))
  copyFile(path.join(PORTABLE_TEMPLATE, 'static-server.cjs'), path.join(PORTABLE_DIR, 'static-server.cjs'))
  copyFile(iconPath, path.join(PORTABLE_DIR, 'app.ico'))

  copyDirectory(path.join(ROOT_DIR, 'dist'), path.join(PORTABLE_DIR, 'app', 'dist'), {
    excludeMaps: true,
  })

  copyDirectory(path.join(ROOT_DIR, 'public', 'docs'), path.join(PORTABLE_DIR, 'app', 'docs'))

  await bundleServer(SERVER_BUNDLE)
  prepareServerRuntime(SERVER_TARGET, SERVER_ENV)

  const bundledNode = path.join(PORTABLE_DIR, 'runtime', 'node.exe')
  const npmCli = path.join(NODE_CACHE_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  installNativeDependencies(bundledNode, SERVER_TARGET, npmCli)

  const hasExe = compileLauncherExe(iconPath)
  cleanupBuildArtifacts()
  createZipArchive()

  log('\n========================================')
  log('  构建完成')
  log('========================================')
  log(`  便携目录: ${PORTABLE_DIR}`)
  log('  安全: 未包含前端/后端源码、SQL 迁移脚本')
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
