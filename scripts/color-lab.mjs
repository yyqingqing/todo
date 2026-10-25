/**
 * 品牌色对比工具。
 * 产品名「青青」指向草木青翠，而当前品牌色是靛蓝紫 —— 意象不匹配。
 * 这里按同一图标/标记渲染几种候选色，供挑选。
 *
 * 用法：node scripts/color-lab.mjs
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userDataDir = join(tmpdir(), 'qingqing-visual-qa')

const palette = [
  { name: '靛蓝（当前）', hex: '#4f46e5' },
  { name: '青绿', hex: '#0d9488' },
  { name: '青蓝', hex: '#0891b2' },
  { name: '草绿', hex: '#16a34a' },
]

const sprout = (color, size) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
  <path d="M12 21V11" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 12.2C12 7.6 8.4 4 3.8 4c0 4.6 3.6 8.2 8.2 8.2z" fill="${color}"/>
  <path d="M12 12.2c0-4.6 3.6-8.2 8.2-8.2 0 4.6-3.6 8.2-8.2 8.2z" fill="${color}"/>
</svg>`

const appIcon = (hex, size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" style="display:block">
  <rect width="512" height="512" rx="116" fill="${hex}"/>
  <g transform="translate(0, 32)">
    <path d="M256 356V224" stroke="#ffffff" stroke-width="26" stroke-linecap="round" fill="none"/>
    <path d="M256 232C256 156 192 92 116 92c0 76 64 140 140 140z" fill="#ffffff"/>
    <path d="M256 232c0-76 64-140 140-140 0 76-64 140-140 140z" fill="#ffffff"/>
  </g>
</svg>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; padding:22px; background:#f7f8fa; font-family: system-ui,"Microsoft YaHei",sans-serif; display:flex; gap:22px; }
  .col { display:flex; flex-direction:column; align-items:center; gap:10px; padding:18px 16px; background:#fff; border-radius:10px; }
  .name { font-size:13px; color:#101828; font-weight:600; }
  .hex { font-size:11px; color:#667085; font-family: ui-monospace, monospace; }
  .row { display:flex; align-items:center; gap:9px; padding-top:4px; }
  .row span { font-size:15px; font-weight:600; color:#101828; }
</style></head><body>
${palette
  .map(
    (p) => `
  <div class="col">
    ${appIcon(p.hex, 104)}
    <div class="name">${p.name}</div>
    <div class="hex">${p.hex}</div>
    <div class="row">${sprout(p.hex, 20)}<span>青青</span></div>
  </div>`,
  )
  .join('')}
</body></html>`

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.setContent(html, { waitUntil: 'load' })
await page.waitForTimeout(350)
await page.setViewportSize({ width: 736, height: 300 })
await page.screenshot({ path: '.shots/color-candidates.png' })
console.log('saved .shots/color-candidates.png')
await app.close()
