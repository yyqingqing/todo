/**
 * 视觉自检截图脚本。
 * 用 Playwright 启动打包后的 Electron，逐个页面 × 主题截图，避免依赖桌面截屏（会受 DPI 缩放和遮挡影响）。
 *
 * 用法：pnpm build && node scripts/shot.mjs
 */
import { mkdirSync } from 'node:fs'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
// 这个变量会让 electron 以纯 Node 模式启动，拿不到 app / BrowserWindow
delete env.ELECTRON_RUN_AS_NODE

const OUT_DIR = '.shots'
mkdirSync(OUT_DIR, { recursive: true })

const app = await electron.launch({ args: ['.'], env })
const page = await app.firstWindow()
await page.waitForTimeout(900)

const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const targets = [
  { name: 'today-light', hash: '#/today', theme: 'light' },
  { name: 'today-dark', hash: '#/today', theme: 'dark' },
  { name: 'plans-light', hash: '#/plans', theme: 'light' },
  { name: 'calendar-light', hash: '#/calendar', theme: 'light' },
  { name: 'score-light', hash: '#/score', theme: 'light' },
]

for (const t of targets) {
  await page.evaluate(
    ({ theme, hash }) => {
      document.documentElement.dataset.theme = theme
      window.location.hash = hash
    },
    { theme: t.theme, hash: t.hash },
  )
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT_DIR}/${t.name}.png` })
  console.log('shot:', t.name)
}

console.log('page errors:', errors.length ? errors : '(none)')
await app.close()
