import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'
import { ROOT_DIR } from './paths.mjs'
import { ensureDir, fail, log } from './build-utils.mjs'

const LOGO_CANDIDATES = [
  path.join(ROOT_DIR, '白色背景.png'),
  path.join(ROOT_DIR, 'public', 'logo.png'),
]

const ICON_DIR = path.join(ROOT_DIR, 'local-app', 'assets')
const ICON_PATH = path.join(ICON_DIR, 'app.ico')
const ICON_SIZES = [16, 32, 48, 64, 128, 256]

async function createSquarePngs(logoPath, tempDir) {
  const pngPaths = []

  for (const size of ICON_SIZES) {
    const pngPath = path.join(tempDir, `${size}.png`)
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toFile(pngPath)
    pngPaths.push(pngPath)
  }

  return pngPaths
}

export async function buildAppIcon() {
  const logoPath = LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate))

  if (!logoPath) {
    fail('未找到 logo 图片，请将 白色背景.png 放在项目根目录。')
  }

  log(`\n🎨 生成应用图标: ${path.basename(logoPath)}`)

  ensureDir(ICON_DIR)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ziye-icon-'))
  try {
    const pngPaths = await createSquarePngs(logoPath, tempDir)
    const iconBuffer = await pngToIco(pngPaths)
    fs.writeFileSync(ICON_PATH, iconBuffer)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  return ICON_PATH
}

export { ICON_PATH }
