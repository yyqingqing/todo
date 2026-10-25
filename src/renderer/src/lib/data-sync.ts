import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getApi } from './api'

/**
 * 实体 → 需要失效的 query 前缀。
 * 用表驱动而不是 if/else 链：加实体只加一行，不改分发逻辑（开闭原则的落点之一）。
 */
const INVALIDATION: Readonly<Record<string, readonly (readonly string[])[]>> = {
  plan: [['plan']],
  task: [['plan']],
  todo: [['plan'], ['todo']],
  category: [['category'], ['plan']],
  score: [['score']],
}

/**
 * 订阅主进程的数据变更广播。
 *
 * 主窗口与（阶段 5 的）悬浮窗共享同一份数据。没有这个同步，
 * 会出现「悬浮窗勾了，主窗口还是旧数据」——只在两窗口同开时复现，最难查。
 */
export function useDataSync(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    // 返回的是解绑函数：React 卸载时清理，避免重复挂载累积 IPC 监听器
    return getApi().onDataChanged((entity) => {
      const keys = INVALIDATION[entity] ?? []
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    })
  }, [queryClient])
}
