import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import esbuild from 'esbuild'
import { SERVER_DIR } from './paths.mjs'
import { copyDirectory, ensureDir, fail, log } from './build-utils.mjs'

const SERVER_EXTERNALS = ['mysql2']

export async function bundleServer(outFile) {
  log('\n🔒 打包后端为单文件（不含源码目录）...')

  ensureDir(path.dirname(outFile))

  try {
    await esbuild.build({
      entryPoints: [path.join(SERVER_DIR, 'index.js')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: outFile,
      external: SERVER_EXTERNALS,
      minify: true,
      legalComments: 'none',
      sourcemap: false,
      logLevel: 'warning',
      mainFields: ['module', 'main'],
      conditions: ['node', 'import'],
      banner: {
        js: 'const import_meta_url = require("url").pathToFileURL(__filename).href;',
      },
      define: {
        'import.meta.url': 'import_meta_url',
      },
    })
  } catch (error) {
    fail(`后端打包失败: ${error.message}`)
  }
}

function readNodeVersion(nodeExe) {
  const result = spawnSync(nodeExe, ['-p', 'process.versions.node'], { encoding: 'utf8' })
  if (result.status !== 0) {
    fail('无法读取 bundled Node 版本')
  }
  return result.stdout.trim()
}

function installWithSystemNpm(serverTarget, nodeVersion) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return spawnSync(npmCmd, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: serverTarget,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_target: nodeVersion,
      npm_config_runtime: 'node',
      npm_config_arch: process.arch === 'x64' ? 'x64' : process.arch,
      npm_config_disturl: 'https://nodejs.org/dist',
      npm_config_loglevel: 'warn',
    },
  })
}

function installWithBundledNpm(nodeExe, npmCli, serverTarget) {
  return spawnSync(nodeExe, [npmCli, 'install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: serverTarget,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_loglevel: 'warn',
    },
  })
}

function copyMysql2FromServer(serverTarget) {
  const serverModules = path.join(SERVER_DIR, 'node_modules')
  const mysql2PkgPath = path.join(serverModules, 'mysql2', 'package.json')
  if (!fs.existsSync(mysql2PkgPath)) {
    return false
  }

  log('  改用从 server/node_modules 复制 mysql2 依赖树...')
  const targetModules = path.join(serverTarget, 'node_modules')
  ensureDir(targetModules)

  const pkg = JSON.parse(fs.readFileSync(mysql2PkgPath, 'utf8'))
  const depNames = Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })

  copyDirectory(path.join(serverModules, 'mysql2'), path.join(targetModules, 'mysql2'))
  for (const depName of depNames) {
    const depDir = path.join(serverModules, depName)
    if (fs.existsSync(depDir)) {
      copyDirectory(depDir, path.join(targetModules, depName))
    }
  }

  return fs.existsSync(path.join(targetModules, 'mysql2', 'package.json'))
}

export function installNativeDependencies(nodeExe, serverTarget, nodeCacheDir) {
  log('\n📦 安装原生依赖 (mysql2)...')

  const runtimePackage = {
    name: 'ziye-server-runtime',
    private: true,
    type: 'commonjs',
    dependencies: {
      mysql2: '^3.6.5',
    },
  }

  fs.writeFileSync(
    path.join(serverTarget, 'package.json'),
    `${JSON.stringify(runtimePackage, null, 2)}\n`
  )

  const nodeVersion = readNodeVersion(nodeExe)
  let result = installWithSystemNpm(serverTarget, nodeVersion)

  if (result.status !== 0) {
    const npmCli = path.join(nodeCacheDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (fs.existsSync(npmCli)) {
      log('  系统 npm 安装失败，改用 bundled npm 重试...')
      result = installWithBundledNpm(nodeExe, npmCli, serverTarget)
    }
  }

  if (result.status !== 0 || !fs.existsSync(path.join(serverTarget, 'node_modules', 'mysql2'))) {
    if (!copyMysql2FromServer(serverTarget)) {
      fail('mysql2 安装失败，请确认 server 目录已执行 npm install')
    }
  }

  for (const fileName of ['package-lock.json']) {
    const filePath = path.join(serverTarget, fileName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

export function prepareServerRuntime(serverTarget, envFile) {
  ensureDir(path.join(serverTarget, '..', 'uploads'))
  fs.copyFileSync(envFile, path.join(serverTarget, '.env'))
}
