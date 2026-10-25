import { app } from 'electron'
import { getDb } from './db/connection'
import { allSettings, setSetting } from './db/repo/setting.repo'

export const LAUNCH_AT_LOGIN_KEY = 'app.launchAtLogin'

/** 开机自启的真实状态 */
export interface LaunchState {
  /** 系统里实际是否已注册（不是设置里记的偏好） */
  enabled: boolean
  /** 当前环境是否支持：开发环境下 exe 是 node_modules 里的 electron.exe，不能注册 */
  supported: boolean
}

/** 启动项里写入的参数，读取时必须传同样的值才能匹配到同一条记录 */
const LAUNCH_ARGS = ['--hidden']

/**
 * 读系统里的真实状态。
 *
 * 为什么必须回读而不是信任设置值：安全软件（360、火绒、Defender 的受控文件夹访问）
 * 可能拦掉对 HKCU\...\Run 的写入，setLoginItemSettings 不会抛错，
 * 只是没写进去。这时界面若仍显示"已开启"，用户就被骗了 ——
 * 他以为开机会自动启动，实际不会。
 */
export function getLaunchState(): LaunchState {
  if (!app.isPackaged) return { enabled: false, supported: false }

  const info = app.getLoginItemSettings({ path: app.getPath('exe'), args: LAUNCH_ARGS })
  return { enabled: info.openAtLogin, supported: true }
}

/**
 * 写入并立即回读，返回系统里的**实际**结果。
 * 调用方必须用返回值更新界面，而不是用入参。
 */
export function applyLaunchAtLogin(enabled: boolean): LaunchState {
  if (!app.isPackaged) return { enabled: false, supported: false }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: LAUNCH_ARGS,
  })

  return getLaunchState()
}

/**
 * 把设置值拉回与系统一致。
 *
 * 启动时和设置变更后都调一次：
 * - 用户可能在任务管理器的"启动"页手动禁用了我们 -> 设置值要跟着变成关闭
 * - 系统拒绝了写入（安全软件） -> 设置值不能停留在"已开启"
 *
 * 返回最终状态，供界面显示。
 */
export function syncLaunchAtLogin(): LaunchState {
  if (!app.isPackaged) return { enabled: false, supported: false }

  let wanted = false
  try {
    wanted = allSettings(getDb())[LAUNCH_AT_LOGIN_KEY] === '1'
  } catch {
    return getLaunchState()
  }

  const actual = applyLaunchAtLogin(wanted)

  // 设置值与实际不一致时，以实际为准写回设置
  if (actual.enabled !== wanted) {
    try {
      setSetting(getDb(), LAUNCH_AT_LOGIN_KEY, actual.enabled ? '1' : '0')
    } catch {
      // 数据库未就绪，下次启动再纠正
    }
  }

  return actual
}

export function isLaunchAtLoginSupported(): boolean {
  return app.isPackaged
}
