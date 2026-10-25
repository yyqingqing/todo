/**
 * 阶段 7 验收：积分。
 * 用法：pnpm build && node scripts/verify-stage7.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage7-verify')
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
  const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  const today = toStr(now)
  const yesterday = toStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))

  // 昨天的一条，用于验证「逾期完成」只得 6 分
  const late = await window.api.todo.create({ title: '昨天的遗留', scheduledDate: yesterday })

  // 今天的 3 条：完成 3 条会触发「当日全清」
  const ids = []
  for (const title of ['任务甲', '任务乙', '任务丙']) {
    const todo = await window.api.todo.create({ title, scheduledDate: today })
    ids.push(todo.id)
  }

  const steps = []

  // 第 1 条：+10
  await window.api.todo.toggle(ids[0])
  steps.push((await window.api.score.overview()).total)

  // 第 2 条：+10 -> 20
  await window.api.todo.toggle(ids[1])
  steps.push((await window.api.score.overview()).total)

  // 第 3 条：+10 + 全清 20 -> 50
  await window.api.todo.toggle(ids[2])
  steps.push((await window.api.score.overview()).total)

  // 取消第 1 条：冲正 -10 -> 40
  await window.api.todo.toggle(ids[0])
  steps.push((await window.api.score.overview()).total)

  // 再勾回来：+10 -> 50（全清奖励不会重复发，unique_key 已存在）
  await window.api.todo.toggle(ids[0])
  steps.push((await window.api.score.overview()).total)

  // 逾期完成：+6
  await window.api.todo.toggle(late.id)
  steps.push((await window.api.score.overview()).total)

  const recent = await window.api.score.recent(50)
  const overview = await window.api.score.overview()

  return { steps, recent, overview, today, yesterday, ids }
})

check('第 1 条完成 -> 10', result.steps[0] === 10, `got ${result.steps[0]}`)
check('第 2 条完成 -> 20', result.steps[1] === 20, `got ${result.steps[1]}`)
check('第 3 条完成触发全清 -> 50', result.steps[2] === 50, `got ${result.steps[2]}`)
check('取消完成冲正 -> 40', result.steps[3] === 40, `got ${result.steps[3]}`)
check('重新完成 -> 50（全清奖励不重复发）', result.steps[4] === 50, `got ${result.steps[4]}`)
check('逾期完成只加 6 分 -> 56', result.steps[5] === 56, `got ${result.steps[5]}`)

check('总分为 56', result.overview.total === 56, `got ${result.overview.total}`)
check(
  '今日得分为 56（3×10 + 全清 20 + 逾期 6，全部按完成日入账）',
  result.overview.today === 56,
  `got ${result.overview.today}`,
)
check(
  '流水条数正确（5 次加分 + 1 次冲正 + 1 次全清）',
  result.recent.length === 7,
  `got ${result.recent.length}`,
)
check(
  '流水按时间倒序（首条是逾期完成）',
  result.recent[0]?.reason === 'todo_late',
  String(result.recent[0]?.reason),
)
check('流水带标题快照', result.recent[0]?.title === '昨天的遗留', String(result.recent[0]?.title))
check(
  '冲正记录为负数',
  result.recent.some((entry) => entry.reason === 'revoke' && entry.points < 0),
)
check(
  '热力图包含今天',
  result.overview.daily.some((day) => day.date === result.today),
)

// ---------- 截图 ----------
await page.evaluate((hash) => {
  window.location.hash = hash
}, '#/score')
await page.reload()
await page.waitForTimeout(1500)
await page.screenshot({ path: '.shots/score-page.png' })
console.log('shot: score-page')

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
