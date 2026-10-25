/**
 * 图标候选对比工具。
 * 用同一个 Electron 窗口渲染多组候选，按真实尺寸 20/32/48/64 对比，避免"大图好看小图糊"。
 * 改图标前先跑这个，比改完再截图省时间。
 *
 * 用法：node scripts/icon-lab.mjs
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// 独立的 userData：否则会被主实例的单实例锁挡住（dev 正在跑时截图会失败）
const userDataDir = join(tmpdir(), 'qingqing-visual-qa')

/** 每个候选只写 <svg> 内部，viewBox 统一 0 0 24 24 */
const candidates = [
  {
    key: 'A 对生双叶',
    inner: `
      <path d="M12 21V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M12 12.2C12 7.6 8.4 4 3.8 4c0 4.6 3.6 8.2 8.2 8.2z" fill="currentColor"/>
      <path d="M12 12.2c0-4.6 3.6-8.2 8.2-8.2 0 4.6-3.6 8.2-8.2 8.2z" fill="currentColor"/>`,
  },
  {
    key: 'B 单叶斜生',
    inner: `<path d="M4.5 19.5C4.5 11.1 11.1 4.5 19.5 4.5c0 8.4-6.6 15-15 15z" fill="currentColor"/>`,
  },
  {
    key: 'C 双圆叠',
    inner: `
      <circle cx="9.2" cy="12" r="6.2" fill="currentColor"/>
      <circle cx="14.8" cy="12" r="6.2" fill="currentColor" opacity="0.5"/>`,
  },
  {
    key: 'D 圆角块内白芽',
    inner: `
      <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor"/>
      <path d="M12 18.5v-5.6" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M12 13.4c0-2.8-2.2-5-5-5 0 2.8 2.2 5 5 5z" fill="#fff"/>
      <path d="M12 13.4c0-2.8 2.2-5 5-5 0 2.8-2.2 5-5 5z" fill="#fff"/>`,
  },
]

const sizes = [20, 32, 48, 64]

const svg = (inner, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block">${inner}</svg>`

const board = (dark) => `
  <div class="panel ${dark ? 'dark' : ''}">
    ${candidates
      .map(
        (c) => `
      <div class="row">
        <span class="name">${c.key}</span>
        <div class="sizes">
          ${sizes.map((s) => `<div class="cell">${svg(c.inner, s)}<span class="num">${s}</span></div>`).join('')}
        </div>
      </div>`,
      )
      .join('')}
  </div>`

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; display:flex; gap:20px; font-family: system-ui, "Microsoft YaHei", sans-serif; background:#eef0f4; }
  .panel { flex:1; padding:18px 20px; border-radius:10px; background:#fff; color:#4f46e5; }
  .panel.dark { background:#151a22; color:#818cf8; }
  .row { display:flex; align-items:center; gap:18px; padding:14px 0; border-bottom:1px solid rgba(120,130,150,.18); }
  .row:last-child { border-bottom:0; }
  .name { width:104px; font-size:12px; color:#667085; flex:none; }
  .panel.dark .name { color:#7c8696; }
  .sizes { display:flex; align-items:flex-end; gap:22px; }
  .cell { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .num { font-size:10px; color:#98a2b3; }
</style></head>
<body>${board(false)}${board(true)}</body></html>`

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.setContent(html, { waitUntil: 'load' })
await page.waitForTimeout(400)
await page.setViewportSize({ width: 760, height: 470 })
await page.screenshot({ path: '.shots/icon-candidates.png' })
console.log('saved .shots/icon-candidates.png')
await app.close()
