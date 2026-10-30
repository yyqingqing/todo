import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getApi } from '../../lib/api'

export const studyKeys = {
  all: ['study'] as const,
  status: ['study', 'status'] as const,
  /** 两个函数参数也进 queryKey：换日期范围必须换缓存 */
  sessions: (from: string, to: string) => ['study', 'sessions', from, to] as const,
  stats: (from: string, to: string) => ['study', 'stats', from, to] as const,
}

/**
 * 当前计时状态。
 *
 * 不靠频繁轮询走秒：拿一次快照就够，秒数由渲染进程本地补（见 useSecondTick）。
 * 15 秒重拉一次是为了校正窗口被节流、或主进程那边因为休眠等原因结束了计时。
 */
export function useStudyStatus() {
  return useQuery({
    queryKey: studyKeys.status,
    queryFn: () => getApi().study.status(),
    refetchInterval: 15_000,
  })
}

export function useStudySessions(from: string, to: string) {
  return useQuery({
    queryKey: studyKeys.sessions(from, to),
    queryFn: () => getApi().study.sessions(from, to),
  })
}

/** 区间统计。粒度由主进程按区间长度自动选，这里不传 */
export function useStudyStats(from: string, to: string) {
  return useQuery({
    queryKey: studyKeys.stats(from, to),
    queryFn: () => getApi().study.stats({ from, to }),
  })
}

export function useStudyMutations() {
  const queryClient = useQueryClient()

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: studyKeys.all })
  }

  // 开始/结束都是幂等的，重复点不会多出记录，所以失败也不做特殊补偿
  const start = useMutation({ mutationFn: () => getApi().study.start(), onSuccess: invalidate })
  const stop = useMutation({ mutationFn: () => getApi().study.stop(), onSuccess: invalidate })

  return { start, stop }
}

/**
 * 每秒重渲染一次，用来让计时器"走字"。
 *
 * 窗口被隐藏时 Chromium 会节流这个定时器，但真实时长在主进程里，
 * 回来重新 focus 时 query 会重取一次，显示会自己对齐。
 */
export function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const onVisible = (): void => setNow(Date.now())
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return now
}
