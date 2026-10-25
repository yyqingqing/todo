/**
 * 回归验收：跨页面数据同步。
 *
 * 复现用户报告的问题：在今日页勾选完成，切到日历页看不到变化。
 * 根因是 data-sync 的失效表漏了 calendar —— 直接调 IPC 测不出来（那不走 React Query 缓存），
 * 必须走真实 UI 交互 + 页面切换。
 *
 * 用法：pnpm build && node scripts/verify-sync.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-sync-verify')
rmSync(userDataDir, { recursive: true, force: true })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.waitForTimeout(1300)

const today = await page.evaluate(() => {
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})

// 造一条今天的待办
await page.evaluate(async (date) => {
  await window.api.todo.create({ title: '同步验证项', scheduledDate: date })
}, today)

// ---------- 日历页：应显示 0/1 ----------
await page.evaluate(() => {
  window.location.hash = '#/calendar'
})
await page.waitForTimeout(900)
const todayCell = page.getByRole('button', { name: new RegExp(today) })
const before = await todayCell.innerText()
check('日历初始显示 0/1', before.includes('0/1'), JSON.stringify(before))

// ---------- 切到今日页勾选 ----------
await page.evaluate(() => {
  window.location.hash = '#/today'
})
await page.waitForTimeout(800)
await page.getByText('同步验证项', { exact: true }).click()
await page.waitForTimeout(800)

// ---------- 切回日历：应变成 1/1 ----------
await page.evaluate(() => {
  window.location.hash = '#/calendar'
})
await page.waitForTimeout(1200)
const after = await page.getByRole('button', { name: new RegExp(today) }).innerText()
check('回到日历后变成 1/1（缓存已失效）', after.includes('1/1'), JSON.stringify(after))

// ---------- 计划页也应同步 ----------
await page.evaluate(() => {
  window.location.hash = '#/today'
})
await page.waitForTimeout(600)
await page.getByText('同步验证项', { exact: true }).click()
await page.waitForTimeout(800)
await page.evaluate(() => {
  window.location.hash = '#/calendar'
})
await page.waitForTimeout(1000)
const reverted = await page.getByRole('button', { name: new RegExp(today) }).innerText()
check('取消勾选后日历回退到 0/1', reverted.includes('0/1'), JSON.stringify(reverted))

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
