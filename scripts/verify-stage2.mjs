/**
 * 阶段 2 验收脚本：计划树、分类、任务、进度聚合、环检测。
 *
 * 先用 IPC 造数据（比手点可靠），再断言结构，最后截图。
 * 用法：pnpm build && node scripts/verify-stage2.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const userDataDir = join(tmpdir(), 'qingqing-stage2-verify')
rmSync(userDataDir, { recursive: true, force: true })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })
const page = await app.firstWindow()
await page.waitForTimeout(1200)

// ---------- 造数据：分类 + 三层计划 + 任务 ----------
const seed = await page.evaluate(async () => {
  const cat = await window.api.category.save({ name: '学习', color: 'cat-1' })
  const root = await window.api.plan.save({
    parentId: null,
    categoryId: cat.id,
    title: '三个月背完一本单词书',
    note: '每天 30 分钟，周末复习',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
  })
  const week1 = await window.api.plan.save({
    parentId: root.id,
    categoryId: cat.id,
    title: '第一周：Unit 1-3',
    note: null,
    startDate: '2026-10-01',
    endDate: '2026-10-07',
  })
  for (const title of ['Unit 1 单词 80 个', 'Unit 2 单词 80 个', 'Unit 3 单词 80 个']) {
    await window.api.task.save({ planId: week1.id, title })
  }
  const work = await window.api.plan.save({
    parentId: null,
    categoryId: null,
    title: '练字一百天',
    note: null,
    startDate: '2026-10-10',
    endDate: '2027-01-18',
  })
  return { rootId: root.id, week1Id: week1.id, workId: work.id, catId: cat.id }
})

// ---------- 结构断言 ----------
const tree = await page.evaluate(() => window.api.plan.tree())
check('两根计划', tree.length === 2, `got ${tree.length}`)

const rootNode = tree.find((node) => node.id === seed.rootId)
check('根计划有 1 个子计划', rootNode?.children.length === 1, `got ${rootNode?.children.length}`)
check(
  '子计划有 3 个任务统计',
  rootNode?.children[0]?.stats.taskTotal === 3,
  JSON.stringify(rootNode?.children[0]?.stats),
)
check('父计划汇总了子计划的任务', rootNode?.stats.taskTotal === 3, JSON.stringify(rootNode?.stats))
check('未完成任务时进度为 0', rootNode?.stats.taskDone === 0)

const detail = await page.evaluate((id) => window.api.plan.detail(id), seed.week1Id)
check('详情带上子计划与任务', detail?.tasks.length === 3 && detail?.childPlans.length === 0)
check('详情带上分类', detail?.category?.name === '学习', JSON.stringify(detail?.category?.name))

// ---------- 校验类断言 ----------
const emptyTitle = await page.evaluate(
  async (id) =>
    window.api.plan
      .save({
        id,
        parentId: null,
        categoryId: null,
        title: '   ',
        note: null,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      })
      .then(() => 'no-error')
      .catch((e) => String(e.message)),
  seed.week1Id,
)
check('空标题被拒', emptyTitle !== 'no-error', emptyTitle.slice(0, 40))

const badRange = await page.evaluate(async () =>
  window.api.plan
    .save({
      parentId: null,
      categoryId: null,
      title: 'x',
      note: null,
      startDate: '2026-12-31',
      endDate: '2026-01-01',
    })
    .then(() => 'no-error')
    .catch(() => 'rejected'),
)
check('结束早于开始被拒', badRange === 'rejected', badRange)

const cycle = await page.evaluate(
  async (ids) =>
    window.api.plan
      .save({
        id: ids.rootId,
        parentId: ids.week1Id,
        categoryId: null,
        title: '三个月背完一本单词书',
        note: null,
        startDate: '2026-10-01',
        endDate: '2026-12-31',
      })
      .then(() => 'no-error')
      .catch(() => 'rejected'),
  seed,
)
check('把父计划挪到子计划下被拒（防环）', cycle === 'rejected', cycle)

const dupCategory = await page.evaluate(async () =>
  window.api.category
    .save({ name: '学习', color: 'cat-2' })
    .then(() => 'no-error')
    .catch(() => 'rejected'),
)
check('重名分类被拒', dupCategory === 'rejected', dupCategory)

// ---------- 截图 ----------
await page.evaluate((hash) => {
  window.location.hash = hash
}, '#/plans')
await page.waitForTimeout(600)
await page.screenshot({ path: '.shots/plans-created.png' })
console.log('shot: plans-created')

// 展开/详情：点第二个根计划
await page.getByRole('button', { name: '练字一百天', exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '.shots/plans-empty-detail.png' })
console.log('shot: plans-empty-detail')

// 回到第一个
await page.getByRole('button', { name: '三个月背完一本单词书', exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '.shots/plans-detail.png' })
console.log('shot: plans-detail')

// 新建计划弹窗
await page.getByRole('button', { name: '新建计划' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '.shots/plan-form.png' })
console.log('shot: plan-form')

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
