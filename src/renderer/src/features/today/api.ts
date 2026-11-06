import type { TodoCreateInput } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApi } from '../../lib/api'
import { addDays } from '../../lib/date'

export const todoKeys = {
  all: ['todo'] as const,
  byDate: (date: string) => ['todo', 'by-date', date] as const,
  pickable: ['todo', 'pickable'] as const,
  overdue: (before: string, showAll: boolean) => ['todo', 'overdue', before, showAll] as const,
}

export function useTodos(date: string) {
  return useQuery({ queryKey: todoKeys.byDate(date), queryFn: () => getApi().todo.byDate(date) })
}

/** 「加载更多」时取最近三个月，更早的基本等于放弃了 */
const OVERDUE_WINDOW_DAYS = 90

/**
 * 更早日期里还没完成的待办。
 *
 * 两段式加载：
 * - 默认 5 条（折叠时也要查，因为标题行要显示"还有 N 条"的总数）
 * - 点「加载更多」后取最近三个月全部；更早的刻意不取，那些基本等于放弃了
 */
export function useOverdueTodos(today: string, showAll: boolean) {
  return useQuery({
    queryKey: todoKeys.overdue(today, showAll),
    queryFn: () =>
      getApi().todo.overdue(
        today,
        showAll ? { from: addDays(today, -OVERDUE_WINDOW_DAYS), limit: 200 } : { limit: 5 },
      ),
  })
}

/**
 * 可拉取到清单的计划任务。
 * 只在弹窗打开时查询：这是典型"用到才查"的数据，启动时拉一次纯属浪费。
 */
export function usePickableTasks(enabled: boolean) {
  return useQuery({
    queryKey: todoKeys.pickable,
    queryFn: () => getApi().pickableTasks(),
    enabled,
  })
}

export function useTodoMutations() {
  const queryClient = useQueryClient()

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: todoKeys.all })
    // 完成状态会影响计划进度，计划侧也要刷新
    void queryClient.invalidateQueries({ queryKey: ['plan'] })
  }

  const create = useMutation({
    mutationFn: (input: TodoCreateInput) => getApi().todo.create(input),
    onSuccess: invalidate,
  })

  const toggle = useMutation({
    mutationFn: (id: string) => getApi().todo.toggle(id),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => getApi().todo.remove(id),
    onSuccess: invalidate,
  })

  const rollover = useMutation({
    mutationFn: ({ ids, targetDate }: { ids: string[]; targetDate: string }) =>
      getApi().todo.rollover(ids, targetDate),
    onSuccess: invalidate,
  })

  return { create, toggle, remove, rollover, invalidate }
}
