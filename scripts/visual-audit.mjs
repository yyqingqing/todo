/**
 * 阶段 8 视觉审计：把所有页面在「空 / 有数据」「浅色 / 深色」「宽 / 窄」下都截一遍。
 *
 * 为什么单独写一个：之前的验收脚本各自只覆盖自己那一页，
 * 从来没有人把「空库第一次打开」完整看一遍 —— 而这恰恰是用户的第一印象。
 *
 * 用法：pnpm build && node scripts/visual-audit.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const PAGES = [
  { hash: '#/today', name: 'today' },
  { hash: '#/plans', name: 'plans' },
  { hash: '#/calendar', name: 'calendar' },
  { hash: '#/score', name: 'score' },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function launch(dir) {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${join(tmpdir(), dir)}`],
    env,
  })
  const page = await app.firstWindow()
  await page.waitForTimeout(1400)
  return { app, page }
}

async function setWindowSize(app, width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) => !w.webContents.getURL().includes('overlay'),
      )
      win?.setSize(size.width, size.height)
    },
    { width, height },
  )
  await sleep(500)
}

async function captureAll(page, suffix) {
  for (const item of PAGES) {
    await page.evaluate((hash) => {
      window.location.hash = hash
    }, item.hash)
    await page.waitForTimeout(700)
    await page.screenshot({ path: `.shots/audit-${item.name}-${suffix}.png` })
    console.log(`shot: audit-${item.name}-${suffix}`)
  }
}

// ---------- 1. 空库（首次打开的真实样子） ----------
{
  const dir = 'qingqing-audit-empty'
  rmSync(join(tmpdir(), dir), { recursive: true, force: true })
  const { app, page } = await launch(dir)
  await captureAll(page, 'empty')
  await app.close()
  await sleep(1200)
}

// ---------- 2. 有数据 + 深色 + 窄窗 ----------
{
  const dir = 'qingqing-audit-data'
  rmSync(join(tmpdir(), dir), { recursive: true, force: true })
  const { app, page } = await launch(dir)

  await page.evaluate(async () => {
    const pad = (n) => String(n).padStart(2, '0')
    const now = new Date()
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const shift = (days) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }

    const study = await window.api.category.save({ name: '学习', color: 'cat-1' })
    const life = await window.api.category.save({ name: '生活', color: 'cat-3' })

    const plan = await window.api.plan.save({
      parentId: null,
      categoryId: study.id,
      title: '三个月背完一本单词书',
      note: '每天 30 分钟，周末复习',
      startDate: shift(-20),
      endDate: shift(70),
    })
    const week1 = await window.api.plan.save({
      parentId: plan.id,
      categoryId: study.id,
      title: '第一周：Unit 1-3',
      note: null,
      startDate: shift(-20),
      endDate: shift(-14),
    })
    for (const title of ['Unit 1 单词 80 个', 'Unit 2 单词 80 个', 'Unit 3 单词 80 个']) {
      await window.api.task.save({ planId: week1.id, title })
    }
    await window.api.plan.save({
      parentId: null,
      categoryId: life.id,
      title: '练字一百天',
      note: null,
      startDate: shift(-5),
      endDate: shift(95),
    })

    const pickable = await window.api.pickableTasks()
    const a = await window.api.todo.create({
      title: pickable[0].title,
      scheduledDate: today,
      taskId: pickable[0].id,
    })
    const b = await window.api.todo.create({
      title: pickable[1].title,
      scheduledDate: today,
      taskId: pickable[1].id,
    })
    await window.api.todo.create({ title: '给张三回电话', scheduledDate: today })
    await window.api.todo.create({ title: '取快递', scheduledDate: today })
    await window.api.todo.toggle(a.id)
    await window.api.todo.create({ title: '复习昨天的错词', scheduledDate: shift(-1) })
    await window.api.todo.toggle(b.id)
  })

  await captureAll(page, 'light')

  // 深色
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await sleep(400)
  await captureAll(page, 'dark')

  // 窄窗（贴着最小尺寸 1040×680）
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light'
  })
  await setWindowSize(app, 1040, 680)
  await captureAll(page, 'narrow')

  await app.close()
}

console.log('\nDONE')
