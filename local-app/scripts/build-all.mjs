import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fail, log } from './build-utils.mjs'

const LOCAL_APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

log('========================================')
log('  完整构建：便携包 + 单文件 EXE')
log('========================================\n')

const portable = spawnSync('node', ['scripts/build-portable.mjs'], {
  cwd: LOCAL_APP_DIR,
  stdio: 'inherit',
})

if (portable.status !== 0) {
  fail('便携包构建失败')
}

const exe = spawnSync('node', ['scripts/build-sfx.mjs'], {
  cwd: LOCAL_APP_DIR,
  stdio: 'inherit',
})

if (exe.status !== 0) {
  fail('单文件 EXE 构建失败')
}
