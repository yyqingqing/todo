/**
 * 视觉自检截图脚本。
 * 用 Playwright 启动打包后的 Electron，逐页面 × 主题截图。
 *
 * 为什么不直接用系统截屏：高 DPI 下 PowerShell 的 CopyFromScreen 会因进程非 DPI 感知而截偏，
 * 而且会拍到用户其它窗口。这里拿的是页面本身，稳定且不打扰。
 *
 * 用法：pnpm build && pnpm shot
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
  { name: 'settings-light', hash: '#/today', theme: 'light', openSettings: true },
  { name: 'settings-dark', hash: '#/today', theme: 'dark', openSettings: true },
  { name: 'plans-light', hash: '#/plans', theme: 'light' },
  { name: 'calendar-light', hash: '#/calendar', theme: 'light' },
  { name: 'score-light', hash: '#/score', theme: 'light' },
]

for (const target of targets) {
  await page.evaluate(
    ({ theme, hash }) => {
      document.documentElement.dataset.theme = theme
      window.location.hash = hash
    },
    { theme: target.theme, hash: target.hash },
  )
  await page.waitForTimeout(350)

  if (target.openSettings) {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.waitForTimeout(300)
  }

  await page.screenshot({ path: `${OUT_DIR}/${target.name}.png` })
  console.log('shot:', target.name)

  if (target.openSettings) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

console.log('page errors:', errors.length ? errors : '(none)')
await app.close()
