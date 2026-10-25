/**
 * 阶段 5 验收：悬浮窗。
 *
 * 能自动验证的：窗口创建、路由、背景透明、内容、锁定/折叠状态切换。
 * 不能自动验证的：操作系统层面是否真的透出桌面、是否压在其它窗口之上 ——
 * 那需要人眼看，或者截整个屏幕（会拍到用户桌面）。
 *
 * 用法：pnpm build && node scripts/verify-stage5.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage5-verify')
rmSync(userDataDir, { recursive: true, force: true })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const main = await app.firstWindow()
await main.waitForTimeout(1200)

// 造点数据，让悬浮窗里有内容
await main.evaluate(async () => {
  const pad = (n) => String(n).padStart(2, '0')
  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()

  const plan = await window.api.plan.save({
    parentId: null,
    categoryId: null,
    title: '三个月背完一本单词书',
    note: null,
    startDate: today,
    endDate: today,
  })
  await window.api.task.save({ planId: plan.id, title: 'Unit 1 单词 80 个' })
  const pickable = await window.api.pickableTasks()
  await window.api.todo.create({
    title: pickable[0].title,
    scheduledDate: today,
    taskId: pickable[0].id,
  })
  await window.api.todo.create({ title: '给张三回电话', scheduledDate: today })
  await window.api.todo.create({ title: '复习 Unit 1 的错词', scheduledDate: today })
})

// 打开悬浮窗
await main.evaluate(() => window.api.overlay.show())
await new Promise((resolve) => setTimeout(resolve, 2200))

const pages = app.windows()
check('悬浮窗已创建（共 2 个窗口）', pages.length === 2, `got ${pages.length}`)

const overlay = pages.find((page) => page.url().includes('overlay'))
check('悬浮窗加载了 #/overlay', Boolean(overlay))

if (!overlay) {
  console.log('\nRESULT: FAILED（悬浮窗没起来，后续检查跳过）')
  process.exit(1)
}

await overlay.waitForTimeout(900)

const bodyBg = await overlay.evaluate(() => getComputedStyle(document.body).backgroundColor)
check('body 背景透明（圆角外能透出桌面）', bodyBg === 'rgba(0, 0, 0, 0)', bodyBg)

const cardBg = await overlay.evaluate(() => {
  const card = document.querySelector('div[class*="rounded-"]')
  return card ? getComputedStyle(card).backgroundColor : 'none'
})
check('卡片背景是半透明色', cardBg.startsWith('rgba('), cardBg)

const todoCount = await overlay.locator('li').count()
check('悬浮窗渲染出 3 条待办', todoCount === 3, `got ${todoCount}`)

const state0 = await main.evaluate(() => window.api.overlay.getState())
check(
  '初始状态：可见、未锁定、未折叠',
  state0.visible && !state0.locked && !state0.collapsed,
  JSON.stringify(state0),
)

const locked = await main.evaluate(() => window.api.overlay.toggleLocked())
check('锁定切换返回 true', locked === true)

const stateLocked = await main.evaluate(() => window.api.overlay.getState())
check('状态同步为已锁定', stateLocked.locked === true)

// 解锁后再截图，避免截图时窗口处于穿透态
await main.evaluate(() => window.api.overlay.toggleLocked())
await overlay.waitForTimeout(400)
await overlay.screenshot({ path: '.shots/overlay.png', omitBackground: true })
console.log('shot: overlay')

const collapsed = await main.evaluate(() => window.api.overlay.toggleCollapsed())
check('折叠切换返回 true', collapsed === true)
await overlay.waitForTimeout(500)
await overlay.screenshot({ path: '.shots/overlay-collapsed.png', omitBackground: true })
console.log('shot: overlay-collapsed')

// 位置持久化：拖动后应写进 setting 表
const boundsBefore = await main.evaluate(() => window.api.setting.all())
check(
  '悬浮窗位置已持久化',
  typeof boundsBefore['overlay.bounds'] === 'string',
  String(boundsBefore['overlay.bounds']).slice(0, 60),
)

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
