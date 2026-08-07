import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { LOCAL_APP_DIR, LOCAL_ENV, ROOT_DIR } from './paths.mjs'

function run(label, cwd) {
  console.log(`\n📦 ${label}`)
  const result = spawnSync('npm', ['install'], {
    cwd,
    shell: true,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('紫夜公会官网 - 远程 API 本地版初始化\n')

run('安装前端依赖', ROOT_DIR)
run('安装启动器依赖', LOCAL_APP_DIR)

const examplePath = `${LOCAL_APP_DIR}/.env.example`
if (!fs.existsSync(LOCAL_ENV) && fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, LOCAL_ENV)
  console.log('\n✅ 已创建 local-app copy/.env（远程 API 地址）')
  console.log('⚠️  请按需修改 REMOTE_API_URL 为你的 Linux 公网地址。')
} else if (fs.existsSync(LOCAL_ENV)) {
  console.log('\n✅ 已检测到 local-app copy/.env')
}

console.log('\n初始化完成。双击 start.bat 或运行 npm run launch 即可启动前端。')
console.log('请先在 Linux 上部署 backend（见 README「Linux API 部署」）。\n')
