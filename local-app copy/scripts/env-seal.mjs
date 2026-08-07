import crypto from 'node:crypto'
import fs from 'node:fs'

/** AES-256-GCM：打包时加密 .env，运行时只在内存解密，不落盘明文 */

export function sealEnvText(plaintext, key = crypto.randomBytes(32)) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64')
  return { payload, keyHex: key.toString('hex') }
}

export function writeSealedEnv(envFilePath, sealedOutPath) {
  const plaintext = fs.readFileSync(envFilePath, 'utf8')
  const { payload, keyHex } = sealEnvText(plaintext)
  fs.writeFileSync(sealedOutPath, `${payload}\n`, 'utf8')
  return keyHex
}

/** 把本次构建的密钥注入 launcher.cjs（不单独落盘密钥文件） */
export function injectSealKeyIntoLauncher(launcherPath, keyHex) {
  let source = fs.readFileSync(launcherPath, 'utf8')
  if (!source.includes('__ZIYE_SEAL_KEY__')) {
    throw new Error('launcher.cjs 缺少 __ZIYE_SEAL_KEY__ 占位符，无法注入凭据密钥')
  }
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error('无效的 seal key')
  }
  source = source.replace(/__ZIYE_SEAL_KEY__/g, keyHex)
  fs.writeFileSync(launcherPath, source, 'utf8')
}
