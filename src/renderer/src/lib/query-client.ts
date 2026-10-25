import { MutationCache, QueryClient } from '@tanstack/react-query'
import { reportError } from './error-store'

/**
 * 全局唯一的 QueryClient。
 *
 * 主窗口和悬浮窗是两个独立的渲染进程，各有自己的实例。
 * 它们之间的数据一致性靠主进程的 `data:changed` 广播，而不是共享缓存 ——
 * 跨进程共享缓存在这个架构里做不到，也别试图绕过进程边界。
 */
export const queryClient = new QueryClient({
  // 所有写操作的失败都收敛到这里。
  // 没有这一层的话，`void mutateAsync(...)` 的失败只会变成 unhandled rejection，
  // 用户看到的是「点了没反应」。
  mutationCache: new MutationCache({
    onError: (error) => {
      reportError(error)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})
