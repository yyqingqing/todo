/**
 * 阶段 6 验收：日历月视图。
 * 用法：pnpm build && node scripts/verify-stage6.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage6-verify')
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
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day15 = `${year}-${pad(month)}-15`

  const cat = await window.api.category.save({ name: '学习', color: 'cat-2' })
  const plan = await window.api.plan.save({
    parentId: null,
    categoryId: cat.id,
    title: '三个月背完一本单词书',
    note: null,
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-28`,
  })
  const task1 = await window.api.task.save({ planId: plan.id, title: 'Unit 1 单词' })
  await window.api.task.save({ planId: plan.id, title: 'Unit 2 单词' })

  // 15 号：2 条待办，完成 1 条
  const a = await window.api.todo.create({
    title: task1.title,
    scheduledDate: day15,
    taskId: task1.id,
  })
  await window.api.todo.create({ title: '给张三回电话', scheduledDate: day15 })
  await window.api.todo.toggle(a.id)

  // 20 号：1 条待办，全部完成
  const b = await window.api.todo.create({
    title: '复习错词',
    scheduledDate: `${year}-${pad(month)}-20`,
  })
  await window.api.todo.toggle(b.id)

  return { year, month, day15, planId: plan.id }
})

const view = await page.evaluate(({ year, month }) => window.api.calendar.month(year, month), {
  year: result.year,
  month: result.month,
})

check('月视图返回当月', view.year === result.year && view.month === result.month)
check('有两天的完成数据（稀疏）', view.days.length === 2, `got ${view.days.length}`)

const d15 = view.days.find((d) => d.date === result.day15)
check('15 号统计为 1/2', d15?.done === 1 && d15?.total === 2, JSON.stringify(d15))

const d20 = view.days.find((d) => d.date.endsWith('-20'))
check('20 号全部完成', d20?.done === 1 && d20?.total === 1, JSON.stringify(d20))

check(
  '本月计划列表包含该计划',
  view.plans.length === 1 && view.plans[0]?.title === '三个月背完一本单词书',
)
check('计划带根计划序号（颜色按计划树分配）', view.plans[0]?.rootIndex === 0, String(view.plans[0]?.rootIndex))
check(
  '计划进度为 50%（2 条任务里 1 条完成）',
  view.plans[0]?.progress === 0.5,
  String(view.plans[0]?.progress),
)

// 非法月份应被拒
const badMonth = await page.evaluate(async () =>
  window.api.calendar
    .month(2026, 13)
    .then(() => 'no-error')
    .catch(() => 'rejected'),
)
check('非法月份被拒', badMonth === 'rejected')

// 跨月计划应只返回与本月有交集的
const adjacentMonth = result.month === 12 ? 1 : result.month + 1
const crossMonth = await page.evaluate(
  ({ year, month }) => window.api.calendar.month(year, month),
  { year: result.year, month: adjacentMonth },
)
check('相邻月份不含该计划（交集过滤生效）', !crossMonth.plans.some((p) => p.id === result.planId))

// ---------- 截图 ----------
await page.evaluate((hash) => {
  window.location.hash = hash
}, '#/calendar')
await page.reload()
await page.waitForTimeout(1400)
await page.screenshot({ path: '.shots/calendar-month.png' })
console.log('shot: calendar-month')

// 点 15 号看当天详情
await page.getByRole('button', { name: /-15/ }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: '.shots/calendar-day.png' })
console.log('shot: calendar-day')

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
