import type { Api } from '@shared/ipc-contract'

/**
 * 渲染进程访问主进程的唯一出口。
 *
 * 业务代码不要直接读 window.api：
 * 1. 这里能统一做存在性检查，preload 没加载时报出可读的错误，而不是 undefined 崩在深处
 * 2. 将来如果要出 Web 版，只换这一层
 */
export function getApi(): Api {
  const api = window.api
  if (!api) {
    throw new Error('window.api 不存在：preload 未加载，或 BrowserWindow 的沙箱配置有误')
  }
  return api
}
