import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import {
  LOCAL_APP_DIR,
  ROOT_DIR,
  SERVER_DIR,
  SERVER_ENV,
  SERVER_ENV_EXAMPLE,
} from './paths.mjs'

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

console.log('紫夜公会官网 - 本地环境初始化\n')

run('安装前端依赖', ROOT_DIR)
run('安装后端依赖', SERVER_DIR)
run('安装启动器依赖', LOCAL_APP_DIR)

if (!fs.existsSync(SERVER_ENV)) {
  if (fs.existsSync(SERVER_ENV_EXAMPLE)) {
    fs.copyFileSync(SERVER_ENV_EXAMPLE, SERVER_ENV)
    console.log('\n✅ 已从 server/.env.example 创建 server/.env')
    console.log('⚠️  请编辑 server/.env，填入 SQLPub 数据库凭据后再启动。')
  } else {
    console.log('\n⚠️  未找到 server/.env，请手动创建并配置数据库连接。')
  }
} else {
  console.log('\n✅ 已检测到 server/.env')
}

console.log('\n初始化完成。双击 start.bat 或运行 npm run launch 即可启动。\n')
