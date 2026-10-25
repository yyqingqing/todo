import type { CategoryInput, PlanInput, TaskInput } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApi } from '../../lib/api'

/**
 * 查询键集中定义。
 * 手写字符串数组是缓存失效出错的头号原因：改了一处忘另一处，
 * 表现就是"数据变了但界面没更新"，且极难定位。
 */
export const planKeys = {
  all: ['plan'] as const,
  tree: ['plan', 'tree'] as const,
  detail: (id: string) => ['plan', 'detail', id] as const,
  categories: ['category', 'list'] as const,
}

export function usePlanTree() {
  return useQuery({ queryKey: planKeys.tree, queryFn: () => getApi().plan.tree() })
}

export function usePlanDetail(id: string | null) {
  return useQuery({
    queryKey: planKeys.detail(id ?? 'none'),
    queryFn: () => (id ? getApi().plan.detail(id) : Promise.resolve(null)),
    enabled: id !== null,
  })
}

export function useCategories() {
  return useQuery({ queryKey: planKeys.categories, queryFn: () => getApi().category.list() })
}

/**
 * 所有写操作。
 *
 * 写完后主动失效本地缓存，而不是只等主进程广播：
 * 广播是 IPC 往返，本地失效是同步的，先失效体验更好；
 * React Query 会把两次触发合并成一次请求，不会打两次库。
 */
export function usePlanMutations() {
  const queryClient = useQueryClient()
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: planKeys.all })
    void queryClient.invalidateQueries({ queryKey: planKeys.categories })
  }

  const savePlan = useMutation({
    mutationFn: (input: PlanInput) => getApi().plan.save(input),
    onSuccess: invalidate,
  })

  const removePlan = useMutation({
    mutationFn: (id: string) => getApi().plan.remove(id),
    onSuccess: invalidate,
  })

  const saveTask = useMutation({
    mutationFn: (input: TaskInput) => getApi().task.save(input),
    onSuccess: invalidate,
  })

  const removeTask = useMutation({
    mutationFn: (id: string) => getApi().task.remove(id),
    onSuccess: invalidate,
  })

  const saveCategory = useMutation({
    mutationFn: (input: CategoryInput) => getApi().category.save(input),
    onSuccess: invalidate,
  })

  const removeCategory = useMutation({
    mutationFn: (id: string) => getApi().category.remove(id),
    onSuccess: invalidate,
  })

  return { savePlan, removePlan, saveTask, removeTask, saveCategory, removeCategory }
}
