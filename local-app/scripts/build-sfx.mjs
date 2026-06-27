import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { ICON_PATH } from './build-icon.mjs'
import {
  PORTABLE_DIR,
  RELEASE_DIR,
  fail,
  fileSizeMb,
  log,
  run,
} from './build-utils.mjs'
import { ROOT_DIR } from './paths.mjs'

const MARKER = Buffer.from('ZIYEZIP!', 'ascii')
const SFX_SOURCE = path.join(ROOT_DIR, 'local-app', 'portable', 'sfx-bootstrap.cs')
const OUTPUT_EXE = path.join(RELEASE_DIR, '紫夜官网-本地版.exe')

function findCsc() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function createPortableZip() {
  const zipPath = path.join(RELEASE_DIR, 'portable.payload.zip')
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

  if (!fs.existsSync(zipPath)) {
    fail('创建内置压缩包失败')
  }

  return zipPath
}

function compileBootstrap(stagingExe, iconPath) {
  const csc = findCsc()
  if (!csc) {
    fail('未找到 csc.exe，无法编译单文件启动器')
  }

  const args = [
    '/nologo',
    '/target:winexe',
    `/out:${stagingExe}`,
    '/reference:System.IO.Compression.FileSystem.dll',
    '/reference:System.Windows.Forms.dll',
    `/win32icon:${iconPath}`,
    SFX_SOURCE,
  ]

  const result = spawnSync(csc, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    fail('单文件启动器编译失败')
  }
}

function appendPayload(stagingExe, zipPath, outputExe, bundleVersion) {
  const zipBuffer = fs.readFileSync(zipPath)
  const versionBuffer = Buffer.from(bundleVersion, 'utf8')
  const versionLength = Buffer.alloc(4)
  versionLength.writeUInt32LE(versionBuffer.length, 0)
  const zipSize = Buffer.alloc(4)
  zipSize.writeUInt32LE(zipBuffer.length, 0)

  fs.copyFileSync(stagingExe, outputExe)
  fs.appendFileSync(outputExe, zipBuffer)
  fs.appendFileSync(outputExe, versionBuffer)
  fs.appendFileSync(outputExe, versionLength)
  fs.appendFileSync(outputExe, zipSize)
  fs.appendFileSync(outputExe, MARKER)
}

export async function buildSingleFileExe() {
  log('先构建最新便携包（含前端与后端）...')
  run('node scripts/build-portable.mjs', path.join(ROOT_DIR, 'local-app'))

  let iconPath = ICON_PATH
  if (!fs.existsSync(iconPath)) {
    const { buildAppIcon } = await import('./build-icon.mjs')
    iconPath = await buildAppIcon()
  }

  log('\n📦 构建单文件直运行 EXE...')

  const zipPath = createPortableZip()
  const stagingExe = path.join(os.tmpdir(), `ziye-bootstrap-${Date.now()}.exe`)
  const bundleVersion = new Date().toISOString()

  try {
    compileBootstrap(stagingExe, iconPath)
    appendPayload(stagingExe, zipPath, OUTPUT_EXE, bundleVersion)
  } finally {
    for (const filePath of [stagingExe, zipPath]) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }
  }

  log('\n========================================')
  log('  单文件直运行 EXE 构建完成')
  log('========================================')
  log(`  文件: ${OUTPUT_EXE}`)
  log(`  大小: ${fileSizeMb(OUTPUT_EXE)} MB`)
  log('\n成员双击即可运行：')
  log('  - 首次：自动释放到 %LOCALAPPDATA%\\ZiyeGuildLocal')
  log('  - 之后：直接启动，无需安装向导')
  log('========================================\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildSingleFileExe().catch((error) => fail(error.message))
}
