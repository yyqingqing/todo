import type { Api } from '@shared/ipc-contract'

/**
 * Electron 会把主进程抛出的错误包装成：
 *   `Error invoking remote method 'category:save': Error: 分类「项目」已存在`
 * 直接展示给用户是一串英文脚手架，而不是业务消息。
 *
 * 这里统一剥掉这层包装。所有 IPC 错误都经过这一处，不会漏。
 */
const IPC_ERROR_PATTERN = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.*)$/s

export function normalizeIpcError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const matched = IPC_ERROR_PATTERN.exec(message)
  return new Error(matched?.[1]?.trim() || message)
}

type AsyncFn = (...args: unknown[]) => unknown

/**
 * 递归包装 API：所有返回 Promise 的方法挂一个 catch，把错误转成业务消息。
 *
 * 不能用 Proxy 实现：contextBridge 暴露到 window 的对象属性是「只读且不可配置」的，
 * Proxy 的 get 陷阱若返回别的值（这里是新包一层函数），会直接违反 Proxy 不变量并抛 TypeError
 * —— 表现为整个渲染进程白屏。必须复制出新对象。
 */
function wrapApi<T extends object>(target: T): T {
  const source = target as Record<string, unknown>
  const wrapped: Record<string, unknown> = {}

  for (const key of Object.getOwnPropertyNames(source)) {
    const value = source[key]

    if (typeof value === 'function') {
      const fn = value as AsyncFn
      wrapped[key] = (...args: unknown[]) => {
        try {
          const result = fn(...args)
          if (result instanceof Promise) {
            return result.catch((error: unknown) => {
              throw normalizeIpcError(error)
            })
          }
          return result
        } catch (error) {
          throw normalizeIpcError(error)
        }
      }
      continue
    }

    if (typeof value === 'object' && value !== null) {
      wrapped[key] = wrapApi(value)
      continue
    }

    wrapped[key] = value
  }

  return wrapped as T
}

let cachedApi: Api | null = null

/**
 * 渲染进程访问主进程的唯一出口。
 *
 * 业务代码不要直接读 window.api：
 * 1. 这里统一做存在性检查与错误归一，preload 没加载时报可读错误，而不是 undefined 崩在深处
 * 2. 将来要出 Web 版，只换这一层
 */
export function getApi(): Api {
  if (cachedApi) return cachedApi

  const raw = window.api
  if (!raw) {
    throw new Error('window.api 不存在：preload 未加载，或 BrowserWindow 的沙箱配置有误')
  }

  cachedApi = wrapApi(raw)
  return cachedApi
}
