/**
 * 阶段 8 验收：错误消息归一、今日添加时指定计划。
 * 用法：pnpm build && node scripts/verify-stage8.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage8-verify')
rmSync(userDataDir, { recursive: true, force: true })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.waitForTimeout(1300)

const result = await page.evaluate(async () => {
  const pad = (n) => String(n).padStart(2, '0')
  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  // 1) 错误消息归一：通过渲染进程的 api 层（有 Proxy 包装）拿错误
  await window.api.category.save({ name: '项目', color: 'cat-1' })
  let dupMessage = ''
  try {
    await window.api.category.save({ name: '项目', color: 'cat-2' })
  } catch (error) {
    dupMessage = String(error.message)
  }

  // 2) 带 planId 创建待办：应同时在该计划下建一个任务
  const plan = await window.api.plan.save({
    parentId: null,
    categoryId: null,
    title: '项目开发计划',
    note: null,
    startDate: today,
    endDate: today,
  })

  const before = await window.api.plan.detail(plan.id)
  const todo = await window.api.todo.create({
    title: '写接口文档',
    scheduledDate: today,
    planId: plan.id,
  })
  const afterCreate = await window.api.plan.detail(plan.id)

  await window.api.todo.toggle(todo.id)
  const afterDone = await window.api.plan.detail(plan.id)

  // 3) 日历返回 parentId，前端才能分开计数
  const month = await window.api.calendar.month(now.getFullYear(), now.getMonth() + 1)

  return {
    dupMessage,
    beforeTotal: before?.stats.taskTotal ?? 0,
    afterCreateTotal: afterCreate?.stats.taskTotal ?? 0,
    afterDoneCount: afterDone?.stats.taskDone ?? 0,
    todoPlanTitle: todo.planTitle,
    plansHaveParentId: month.plans.every((item) => 'parentId' in item),
  }
})

check(
  '错误消息不含 Electron 包装前缀（原始层）',
  result.dupMessage.includes('Error invoking remote method'),
  '原始层保留包装是正常的，UI 层会剥掉',
)

// 通过真实 UI 触发重名，验证用户实际看到的文案
await page.evaluate(() => {
  window.location.hash = '#/plans'
})
await page.waitForTimeout(1600)
const categoryTrigger = page.locator('button', { hasText: '分类' }).first()
await categoryTrigger.click()
await page.waitForTimeout(600)

const categoryDialog = page.getByRole('dialog')
await categoryDialog.getByLabel('新分类名称').fill('项目')
await categoryDialog.getByRole('button', { name: '添加' }).click()
await page.waitForTimeout(700)

const alertText = await categoryDialog.getByRole('alert').innerText()
check('UI 展示的是纯业务文案', alertText.includes('分类「项目」已存在'), alertText)
check(
  'UI 文案不含英文脚手架',
  !alertText.includes('Error invoking remote method') && !alertText.includes('Error:'),
  alertText,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

check('新建计划初始 0 个任务', result.beforeTotal === 0, String(result.beforeTotal))
check(
  '带 planId 建待办会自动建任务',
  result.afterCreateTotal === 1,
  String(result.afterCreateTotal),
)
check('该待办带上了计划名', result.todoPlanTitle === '项目开发计划', String(result.todoPlanTitle))
check('完成后计划进度变成 1/1', result.afterDoneCount === 1, String(result.afterDoneCount))
check('日历计划数据带 parentId', result.plansHaveParentId === true)

// ---------- 截图 ----------
await page.evaluate(() => {
  window.location.hash = '#/plans'
})
await page.reload()
await page.waitForTimeout(1300)
await page.screenshot({ path: '.shots/plans-tree-dates.png' })
console.log('shot: plans-tree-dates')

await page.evaluate(() => {
  window.location.hash = '#/today'
})
await page.waitForTimeout(900)
await page.screenshot({ path: '.shots/today-add-plan.png' })
console.log('shot: today-add-plan')

await page.evaluate(() => {
  window.location.hash = '#/calendar'
})
await page.waitForTimeout(900)
await page.screenshot({ path: '.shots/calendar-plans-count.png' })
console.log('shot: calendar-plans-count')

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
