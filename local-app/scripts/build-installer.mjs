import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { RELEASE_DIR, fail, fileSizeMb, log, run } from './build-utils.mjs'
import { ROOT_DIR } from './paths.mjs'

const INNO_CANDIDATES = [
  'D:\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
]

function findInnoCompiler() {
  for (const candidate of INNO_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  const which = spawnSync('where', ['iscc'], { shell: true, encoding: 'utf8' })
  if (which.status === 0) {
    return which.stdout.trim().split(/\r?\n/)[0]
  }

  return null
}

async function main() {
  const portableExe = path.join(RELEASE_DIR, 'portable', '紫夜官网.exe')
  if (!fs.existsSync(portableExe)) {
    log('未找到便携包，先执行 build:portable ...')
    run('node scripts/build-portable.mjs', path.join(ROOT_DIR, 'local-app'))
  }

  const inno = findInnoCompiler()
  if (!inno) {
    fail(
      '未找到 Inno Setup 6。\n' +
        '如需安装向导式安装包，请安装 Inno Setup。\n' +
        '若只需单文件直运行，请使用: npm run build:exe'
    )
  }

  log('\n📦 使用 Inno Setup 生成安装包 EXE...')
  const issFile = path.join(ROOT_DIR, 'local-app', 'installer', 'setup.iss')
  const result = spawnSync(inno, [issFile], {
    cwd: path.join(ROOT_DIR, 'local-app', 'installer'),
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    fail('Inno Setup 编译失败')
  }

  const outputExe = path.join(RELEASE_DIR, '紫夜官网-安装包.exe')
  const defaultOutput = path.join(RELEASE_DIR, '紫夜官网-本地版.exe')
  if (fs.existsSync(defaultOutput)) {
    fs.renameSync(defaultOutput, outputExe)
  }

  if (!fs.existsSync(outputExe)) {
    fail('未找到输出文件，请检查 Inno Setup 日志')
  }

  log('\n========================================')
  log('  安装包 EXE 构建完成')
  log('========================================')
  log(`  文件: ${outputExe}`)
  log(`  大小: ${fileSizeMb(outputExe)} MB`)
  log('========================================\n')
}

main().catch((error) => {
  fail(error.message)
})
