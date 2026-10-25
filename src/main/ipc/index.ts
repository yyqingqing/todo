import { IPC } from '@shared/ipc-contract'
import { ipcMain } from 'electron'
import { getDatabaseInfo, getDb } from '../db/connection'
import { listPlanTree } from '../db/repo/plan.repo'
import { allSettings, setSetting } from '../db/repo/setting.repo'

/**
 * 注册所有 IPC handler。
 *
 * 约定：handler 只做「参数校验 → 调用 repo / service」，不写业务逻辑。
 * 业务规则放 shared/domain（纯函数，可单测），事务边界放 service 层。
 */

/**
 * IPC 入参来自渲染进程，虽然是我们自己的代码，但要按不可信数据处理。
 * 一个类型错误就足以把整条写操作变成静默失败，校验成本极低。
 */
function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`IPC 参数校验失败：${field} 必须是字符串`)
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.appInfo, () => getDatabaseInfo())

  ipcMain.handle(IPC.planTree, () => listPlanTree(getDb()))

  ipcMain.handle(IPC.settingAll, () => allSettings(getDb()))

  ipcMain.handle(IPC.settingSet, (_event, key: unknown, value: unknown) => {
    assertString(key, 'key')
    assertString(value, 'value')
    setSetting(getDb(), key, value)
  })
}
