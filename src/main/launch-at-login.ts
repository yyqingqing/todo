import { app } from 'electron'
import { getDb } from './db/connection'
import { allSettings } from './db/repo/setting.repo'

export const LAUNCH_AT_LOGIN_KEY = 'app.launchAtLogin'

/**
 * 把「开机自启」设置同步到操作系统。
 *
 * Windows 上 setLoginItemSettings 写的是 HKCU\...\Run 项，macOS 走 LaunchAgent。
 * 启动时和设置变更时都要调：用户可能在系统设置里手动关掉过，重新同步能纠正回来。
 *
 * **开发环境下直接跳过**：此时 exe 是 node_modules 里的 electron.exe，
 * 注册后开机会启动一个没有 dev server 的空白窗口 —— 那是最糟的体验，
 * 而且用户会以为是应用坏了。所以这个设置只在打包安装后真正生效。
 */
export function syncLaunchAtLogin(): void {
  if (!app.isPackaged) return

  let enabled = false
  try {
    enabled = allSettings(getDb())[LAUNCH_AT_LOGIN_KEY] === '1'
  } catch {
    // 数据库还没就绪：这次不同步，下次设置变更或下个启动周期会重新同步
    return
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    // 开机自启不抢焦点：主窗口不显示，只留托盘与悬浮窗
    args: ['--hidden'],
  })
}

/** 界面据此决定开关是否可用 */
export function isLaunchAtLoginSupported(): boolean {
  return app.isPackaged
}
