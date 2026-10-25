import { create } from 'zustand'

interface ErrorToastState {
  message: string | null
  show: (message: string) => void
  clear: () => void
}

/**
 * 全局错误提示。
 *
 * 存在的理由：界面里有 4 处 `void mutation.mutateAsync(...)` 没有 catch，
 * 操作失败时只会产生一个 unhandled rejection，用户那边表现为「点了没反应」。
 * 与其给每处补 try/catch，不如在 QueryClient 的 mutationCache 上收敛到一处。
 *
 * 用 zustand 而不是 context：它要在 React 树之外（QueryClient 配置里）被调用。
 */
export const useErrorToast = create<ErrorToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}))

/** 供非 React 代码（mutationCache.onError）调用 */
export function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  useErrorToast.getState().show(message)
}

// 开发期手动验证入口：控制台执行 __notifyError('测试') 就能看到提示条。
// 生产构建里 import.meta.env.DEV 为 false，整段会被摇掉。
if (import.meta.env.DEV) {
  ;(window as unknown as { __notifyError?: (message: string) => void }).__notifyError = (message) =>
    useErrorToast.getState().show(message)
}
