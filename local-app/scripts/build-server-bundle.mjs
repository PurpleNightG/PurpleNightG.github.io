import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import esbuild from 'esbuild'
import { ROOT_DIR, SERVER_DIR } from './paths.mjs'
import { ensureDir, fail, log } from './build-utils.mjs'

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

export function installNativeDependencies(nodeExe, serverTarget, npmCli) {
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

  const result = spawnSync(nodeExe, [npmCli, 'install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: serverTarget,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_loglevel: 'error',
    },
  })

  if (result.status !== 0) {
    fail('mysql2 安装失败')
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
