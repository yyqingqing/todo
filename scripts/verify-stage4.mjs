/**
 * 阶段 4 验收：顺延。
 *
 * 重点验证三件事：
 * 1. 原计划日期（origin_date）在多次顺延后依然不变 —— 这是拖延统计的唯一依据
 * 2. 顺延次数会累积，且能触发"该拆小或放弃"的提示阈值
 * 3. 已完成项、目标日期相同的项不会被误移动
 *
 * 用法：pnpm build && node scripts/verify-stage4.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage4-verify')
rmSync(userDataDir, { recursive: true, force: true })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.waitForTimeout(1200)

const result = await page.evaluate(async () => {
  const pad = (n) => String(n).padStart(2, '0')
  const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const addDays = (dateStr, days) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    return toStr(new Date(y, m - 1, d + days))
  }

  const today = toStr(new Date())
  const tomorrow = addDays(today, 1)
  const out = { today, tomorrow, steps: [] }

  const plan = await window.api.plan.save({
    parentId: null,
    categoryId: null,
    title: '三个月背完一本单词书',
    note: null,
    startDate: today,
    endDate: addDays(today, 90),
  })
  const task1 = await window.api.task.save({ planId: plan.id, title: 'Unit 1 单词 80 个' })
  const task2 = await window.api.task.save({ planId: plan.id, title: 'Unit 2 单词 80 个' })

  const t1 = await window.api.todo.create({
    title: task1.title,
    scheduledDate: today,
    taskId: task1.id,
  })
  const t2 = await window.api.todo.create({
    title: task2.title,
    scheduledDate: today,
    taskId: task2.id,
  })
  const t3 = await window.api.todo.create({ title: '给张三回电话', scheduledDate: today })

  out.beforeCount = (await window.api.todo.byDate(today)).length

  // 单条顺延到明天
  out.movedOne = await window.api.todo.rollover([t1.id], tomorrow)
  out.todayAfter = (await window.api.todo.byDate(today)).length
  out.tomorrowAfter = (await window.api.todo.byDate(tomorrow)).length

  const moved = (await window.api.todo.byDate(tomorrow))[0]
  out.originDate = moved.originDate
  out.scheduledDate = moved.scheduledDate
  out.rolloverCount = moved.rolloverCount

  // 再顺延两次，累计到 3 次
  await window.api.todo.rollover([t1.id], addDays(today, 2))
  await window.api.todo.rollover([t1.id], addDays(today, 3))
  out.afterThree = (await window.api.todo.byDate(addDays(today, 3)))[0]
  out.stillOrigin = out.afterThree.originDate

  // 批量顺延剩下的两条
  out.movedBatch = await window.api.todo.rollover([t2.id, t3.id], tomorrow)

  // 顺延到相同日期：应当跳过，不计数
  out.movedSameDay = await window.api.todo.rollover([t2.id], tomorrow)

  // 已完成项不应被顺延
  await window.api.todo.toggle(t3.id)
  out.movedDone = await window.api.todo.rollover([t3.id], addDays(today, 5))

  // 让今天列表里出现一条"已顺延 3 次"的项，用于截图
  await window.api.todo.rollover([t1.id], today)
  await window.api.todo.create({ title: '背 Unit 3 的 20 个新词', scheduledDate: today })
  out.finalToday = (await window.api.todo.byDate(today)).length

  return out
})

check('顺延前今天有 3 条', result.beforeCount === 3, `got ${result.beforeCount}`)
check('单条顺延移动了 1 条', result.movedOne === 1, `got ${result.movedOne}`)
check('今天减少到 2 条', result.todayAfter === 2, `got ${result.todayAfter}`)
check('明天出现了这 1 条', result.tomorrowAfter === 1, `got ${result.tomorrowAfter}`)
check(
  'origin_date 保持为最初计划日',
  result.originDate === result.today,
  `${result.originDate} vs ${result.today}`,
)
check('scheduled_date 变成了明天', result.scheduledDate === result.tomorrow)
check('顺延次数记为 1', result.rolloverCount === 1, `got ${result.rolloverCount}`)
check(
  '连续顺延 3 次后计数为 3',
  result.afterThree?.rolloverCount === 3,
  `got ${result.afterThree?.rolloverCount}`,
)
check(
  '多次顺延后 origin_date 仍不变',
  result.stillOrigin === result.today,
  String(result.stillOrigin),
)
check('批量顺延移动 2 条', result.movedBatch === 2, `got ${result.movedBatch}`)
check('顺延到相同日期不计数', result.movedSameDay === 0, `got ${result.movedSameDay}`)
check('已完成项不被顺延', result.movedDone === 0, `got ${result.movedDone}`)

// ---------- 截图 ----------
await page.evaluate((hash) => {
  window.location.hash = hash
}, '#/today')
await page.reload()
await page.waitForTimeout(1300)
await page.screenshot({ path: '.shots/today-rollover.png' })
console.log('shot: today-rollover')

// 打开顺延对话框
await page.getByRole('button', { name: /顺延/ }).first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: '.shots/rollover-dialog.png' })
console.log('shot: rollover-dialog')

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
