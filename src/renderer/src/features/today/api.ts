import type { TodoCreateInput } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApi } from '../../lib/api'

export const todoKeys = {
  all: ['todo'] as const,
  byDate: (date: string) => ['todo', 'by-date', date] as const,
  pickable: ['todo', 'pickable'] as const,
}

export function useTodos(date: string) {
  return useQuery({ queryKey: todoKeys.byDate(date), queryFn: () => getApi().todo.byDate(date) })
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

export function useTodoMutations(date: string) {
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

  return { create, toggle, remove, invalidate, date }
}
