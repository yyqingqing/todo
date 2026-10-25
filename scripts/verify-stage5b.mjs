/**
 * 阶段 5 补充验收：透明度设置、恢复默认、锁定提示、双窗口同步。
 * 用法：pnpm build && node scripts/verify-stage5b.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage5b-verify')
rmSync(userDataDir, { recursive: true, force: true })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const main = await app.firstWindow()
await main.waitForTimeout(1300)

// 一条待办，供双窗口同步检查
await main.evaluate(async () => {
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date()
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  await window.api.todo.create({ title: '给张三回电话', scheduledDate: today })
  await window.api.todo.create({ title: '复习 Unit 1 的错词', scheduledDate: today })
})

// ---------- 透明度 ----------
await main.evaluate(() => window.api.setting.set('overlay.opacity', '0.5'))
const settings1 = await main.evaluate(() => window.api.setting.all())
check('透明度写入成功', settings1['overlay.opacity'] === '0.5', settings1['overlay.opacity'])

await main.evaluate(() => window.api.overlay.show())
await sleep(2400)

const overlay = app.windows().find((page) => page.url().includes('overlay'))
check('悬浮窗已打开', Boolean(overlay))
if (!overlay) {
  console.log('\nRESULT: FAILED（悬浮窗没起来）')
  process.exit(1)
}
await overlay.waitForTimeout(1200)

const readCardBg = () =>
  overlay.evaluate(() => {
    const card = document.querySelector('div[class*="rounded-"]')
    return card ? getComputedStyle(card).backgroundColor : 'none'
  })

const bg50 = await readCardBg()
const debugSettings = await overlay.evaluate(() => window.api.setting.all())
const debugVar = await overlay.evaluate(() => {
  const el = document.querySelector('div[class*="rounded-"]')
  return el ? getComputedStyle(el).getPropertyValue('--overlay-opacity') : 'no-el'
})
console.log('       overlay 读到的 opacity 设置:', debugSettings['overlay.opacity'])
console.log('       --overlay-opacity =', JSON.stringify(debugVar))
check('背景 alpha 跟随设置（0.5）', bg50 === 'rgba(255, 255, 255, 0.5)', bg50)

await main.evaluate(() => window.api.setting.set('overlay.opacity', '0.82'))
await overlay.waitForTimeout(1000)
const bg82 = await readCardBg()
check('改回默认值后实时生效', bg82 === 'rgba(255, 255, 255, 0.82)', bg82)

// ---------- 双窗口同步 ----------
const before = await overlay.locator('li').count()
await main.evaluate(async () => {
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date()
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  await window.api.todo.create({ title: '双窗口同步测试项', scheduledDate: today })
})
await overlay.waitForTimeout(1000)
const after = await overlay.locator('li').count()
check('主窗口新增后悬浮窗自动更新', after === before + 1, `${before} -> ${after}`)

// ---------- 锁定提示 ----------
await main.evaluate(() => window.api.overlay.toggleLocked())
await overlay.waitForTimeout(600)
const lockedHint = await overlay.getByText(/已锁定/).count()
check('锁定后显示「已锁定 + 快捷键」提示', lockedHint > 0)
await overlay.screenshot({ path: '.shots/overlay-locked.png', omitBackground: true })
console.log('shot: overlay-locked')

await main.evaluate(() => window.api.overlay.toggleLocked())
await overlay.waitForTimeout(500)
await overlay.screenshot({ path: '.shots/overlay-normal.png', omitBackground: true })
console.log('shot: overlay-normal')

// ---------- 关闭行为设置 ----------
await main.evaluate(() => window.api.setting.set('app.closeAction', 'tray'))
const settings2 = await main.evaluate(() => window.api.setting.all())
check('关闭行为已保存为 tray', settings2['app.closeAction'] === 'tray')

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
