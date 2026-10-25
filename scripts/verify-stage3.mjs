/**
 * 阶段 3 验收：今日清单 + 与计划的连接。
 *
 * 核心要证明的一件事：**完成今日待办会改变计划进度**。
 * 这是"计划"和"每日"这两个列表产生连接的地方，断了这个产品就退化成两个独立清单。
 *
 * 用法：pnpm build && node scripts/verify-stage3.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage3-verify')
rmSync(userDataDir, { recursive: true, force: true })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.waitForTimeout(1200)

const today = await page.evaluate(() => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
})

// ---------- 造数据：计划 + 3 个任务 ----------
const seed = await page.evaluate(async () => {
  const plan = await window.api.plan.save({
    parentId: null,
    categoryId: null,
    title: '三个月背完一本单词书',
    note: null,
    startDate: '2026-10-01',
    endDate: '2026-12-31',
  })
  const ids = []
  for (const title of ['Unit 1 单词 80 个', 'Unit 2 单词 80 个', 'Unit 3 单词 80 个']) {
    const task = await window.api.task.save({ planId: plan.id, title })
    ids.push(task.id)
  }
  return { planId: plan.id, taskIds: ids }
})

// ---------- 可拉取任务 ----------
const pickable = await page.evaluate(() => window.api.pickableTasks())
check('可拉取任务有 3 条', pickable.length === 3, `got ${pickable.length}`)
check('可拉取任务带计划名', pickable[0]?.planTitle === '三个月背完一本单词书')

// ---------- 从计划拉一条到今日 ----------
const pulled = await page.evaluate(
  async ({ date, task }) =>
    window.api.todo.create({ title: task.title, scheduledDate: date, taskId: task.id }),
  { date: today, task: pickable[0] },
)
check('拉取后带上归属计划名', pulled.planTitle === '三个月背完一本单词书', String(pulled.planTitle))
check('origin_date 与排期日一致', pulled.originDate === today && pulled.scheduledDate === today)

// ---------- 快速新增临时事项 ----------
await page.evaluate(
  (date) => window.api.todo.create({ title: '给张三回电话', scheduledDate: date }),
  today,
)

const todos = await page.evaluate((date) => window.api.todo.byDate(date), today)
check('今日共 2 条待办', todos.length === 2, `got ${todos.length}`)
check('临时事项没有归属计划', todos.find((t) => t.title === '给张三回电话')?.planTitle === null)

// ---------- 完成后计划进度应变化 ----------
const beforePlan = await page.evaluate((id) => window.api.plan.detail(id), seed.planId)
check(
  '完成前计划是 0/3',
  beforePlan?.stats.taskDone === 0 && beforePlan?.stats.taskTotal === 3,
  JSON.stringify(beforePlan?.stats),
)

await page.evaluate((id) => window.api.todo.toggle(id), pulled.id)

const afterPlan = await page.evaluate((id) => window.api.plan.detail(id), seed.planId)
check(
  '完成后计划变成 1/3（计划与清单已连接）',
  afterPlan?.stats.taskDone === 1 && afterPlan?.stats.taskTotal === 3,
  JSON.stringify(afterPlan?.stats),
)

// ---------- 取消完成应回退 ----------
const toggled = await page.evaluate((id) => window.api.todo.toggle(id), pulled.id)
check('再次切换回到 pending', toggled.status === 'pending')
const revertedPlan = await page.evaluate((id) => window.api.plan.detail(id), seed.planId)
check(
  '取消后计划进度回退到 0/3',
  revertedPlan?.stats.taskDone === 0,
  JSON.stringify(revertedPlan?.stats),
)

// ---------- 同一个任务不能拉两次 ----------
const dup = await page.evaluate(
  async ({ date, task }) =>
    window.api.todo
      .create({ title: task.title, scheduledDate: date, taskId: task.id })
      .then(() => 'no-error')
      .catch(() => 'rejected'),
  { date: today, task: pickable[0] },
)
check('同一任务重复排期被拒', dup === 'rejected', dup)

// ---------- 截图 ----------
await page.evaluate(async (date) => {
  window.location.hash = '#/today'
  // 再补两条，让截图里有完成态也有未完成态
  await window.api.todo.create({ title: '复习 Unit 1 的错词', scheduledDate: date })
}, today)
await page.reload()
await page.waitForTimeout(1200)

await page.evaluate((id) => window.api.todo.byDate(id), today)
const rows = await page.getByRole('checkbox').count()
check('界面渲染出 3 个复选框', rows === 3, `got ${rows}`)

// 点标题：checkbox 是 sr-only（视觉隐藏），Playwright 无法直接点中；
// label 包裹着 checkbox，点 label 内任意位置都等价于点复选框，这也是用户的真实操作
await page.getByText('给张三回电话', { exact: true }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: '.shots/today-list.png' })
console.log('shot: today-list')

// 从计划添加弹窗
await page.getByRole('button', { name: '从计划添加' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '.shots/today-pick.png' })
console.log('shot: today-pick')
await page.keyboard.press('Escape')

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
