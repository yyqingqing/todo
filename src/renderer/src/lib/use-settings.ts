import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getApi } from './api'

/**
 * 设置项。
 *
 * 所有设置都存在同一张 key-value 表里，这里一次性读全量：
 * 设置项很少（个位数），按单个 key 查询反而要多写一层缓存管理。
 */
export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => getApi().setting.all() })
}

/** 悬浮窗状态（是否可见 / 锁定 / 折叠） */
export function useOverlayState() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['overlay-state'],
    queryFn: () => getApi().overlay.getState(),
  })

  useEffect(() => {
    // 主进程在锁定/折叠变化时会广播，订阅后失效缓存
    return getApi().onOverlayStateChanged(() => {
      void queryClient.invalidateQueries({ queryKey: ['overlay-state'] })
    })
  }, [queryClient])

  return query
}

export const DEFAULT_OVERLAY_OPACITY = 0.82

/** 读出悬浮窗不透明度，非法值回退默认，避免一条脏设置把窗口搞成全透明 */
export function readOpacity(settings: Record<string, string> | undefined): number {
  const raw = Number(settings?.['overlay.opacity'])
  if (!Number.isFinite(raw) || raw < 0.35 || raw > 1) return DEFAULT_OVERLAY_OPACITY
  return raw
}
