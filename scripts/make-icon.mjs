/**
 * 生成应用图标 build/icon.png（512×512，带透明圆角）。
 *
 * 形状与界面里的 BrandMark 保持一致：圆角品牌色底 + 白色双叶嫩芽。
 * 唯一区别是图标需要底色块（桌面上一堆图标里，纯描边会被淹没）。
 *
 * 用法：node scripts/make-icon.mjs
 * 之后 `pnpm package` 时 electron-builder 会用它生成各尺寸 .ico。
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userDataDir = join(tmpdir(), 'qingqing-visual-qa')

const BRAND = '#0d9488'

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; }
</style></head><body>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="116" fill="${BRAND}"/>
  <g transform="translate(0, 32)">
    <path d="M256 356V224" stroke="#ffffff" stroke-width="26" stroke-linecap="round" fill="none"/>
    <path d="M256 232C256 156 192 92 116 92c0 76 64 140 140 140z" fill="#ffffff"/>
    <path d="M256 232c0-76 64-140 140-140 0 76-64 140-140 140z" fill="#ffffff"/>
  </g>
</svg>
</body></html>`

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.setContent(html, { waitUntil: 'load' })
await page.setViewportSize({ width: 512, height: 512 })
await page.waitForTimeout(300)

mkdirSync('build', { recursive: true })
await page.screenshot({ path: 'build/icon.png', omitBackground: true })
console.log('saved build/icon.png (512x512)')

await app.close()
