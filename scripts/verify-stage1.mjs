/**
 * 阶段 1 验收脚本。
 *
 * 验证三件事：
 * 1. sandbox: true 下 preload 正常工作，window.api 可用
 * 2. IPC 端到端通（主进程 → 渲染进程）
 * 3. 数据真落盘：写入后重启仍能读到
 *
 * 用法：pnpm build && node scripts/verify-stage1.mjs
 */
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// 每次验收用全新目录，确保测的是"首次建库"路径
const userDataDir = join(tmpdir(), 'qingqing-stage1-verify')
rmSync(userDataDir, { recursive: true, force: true })

const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], env })

let failed = false
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failed = true
}

// ---------- 第一次启动：建库 ----------
let app = await launch()
let page = await app.firstWindow()
await page.waitForTimeout(1200)

const hasApi = await page.evaluate(() => typeof window.api === 'object' && window.api !== null)
check('sandbox 下 window.api 可用', hasApi)

const info = await page.evaluate(() => window.api.app.info())
console.log('       db:', JSON.stringify(info))
check('迁移已执行到版本 1', info.schemaVersion === 1, `got v${info.schemaVersion}`)
check('数据库文件已创建', typeof info.path === 'string' && info.path.endsWith('qingqing.db'))

const tree = await page.evaluate(() => window.api.plan.tree())
check('空库返回空树', Array.isArray(tree) && tree.length === 0, `got ${JSON.stringify(tree)}`)

await page.evaluate(() => window.api.setting.set('verify.probe', 'hello'))
const settings1 = await page.evaluate(() => window.api.setting.all())
check('设置写入成功', settings1['verify.probe'] === 'hello', JSON.stringify(settings1))

await app.close()

// ---------- 第二次启动：验证持久化 ----------
app = await launch()
page = await app.firstWindow()
await page.waitForTimeout(1200)

const settings2 = await page.evaluate(() => window.api.setting.all())
check('重启后数据仍在（真落盘）', settings2['verify.probe'] === 'hello', JSON.stringify(settings2))

const info2 = await page.evaluate(() => window.api.app.info())
check('重启不重复执行迁移', info2.schemaVersion === 1, `got v${info2.schemaVersion}`)

// 非法参数应被 IPC 层挡下，而不是写进库
const rejected = await page.evaluate(async () => {
  try {
    await window.api.setting.set(123, 'x')
    return false
  } catch {
    return true
  }
})
check('IPC 参数校验生效（非字符串被拒）', rejected)

await app.close()

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: ALL PASSED')
process.exit(failed ? 1 : 0)
