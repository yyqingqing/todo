import type { DataEntity } from '@shared/ipc-contract'
import { IPC } from '@shared/ipc-contract'
import { BrowserWindow } from 'electron'

/**
 * 数据变更广播。
 *
 * 主窗口和（阶段 5 的）悬浮窗共享同一份数据，任何一侧写完都必须通知另一侧，
 * 否则会出现「悬浮窗勾了，主窗口还是旧数据」。这类 bug 只在两个窗口同时开着时出现，
 * 最难复现，也最伤信任，所以从第一处写操作起就要建立这个机制。
 */
export function broadcastDataChanged(entity: DataEntity): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.dataChanged, entity)
    }
  }
}
