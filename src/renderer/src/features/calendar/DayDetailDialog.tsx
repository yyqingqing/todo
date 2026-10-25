import type { DateString } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import Dialog from '../../components/Dialog'
import { getApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDateLabel } from '../../lib/date'

interface DayDetailDialogProps {
  date: DateString | null
  onClose: () => void
}

/**
 * 点日历格子看到的那一天的清单。
 *
 * 只读：日历是回顾视图，改状态应该回今日页做，
 * 否则"在日历里补勾了三天前的事"会让积分和顺延统计变得难以解释。
 */
export default function DayDetailDialog({ date, onClose }: DayDetailDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['todo', 'by-date', date ?? 'none'],
    queryFn: () => (date ? getApi().todo.byDate(date) : Promise.resolve([])),
    enabled: date !== null,
  })

  const todos = data ?? []
  const done = todos.filter((todo) => todo.status === 'done').length

  return (
    <Dialog
      open={date !== null}
      onClose={onClose}
      title={date ? formatDateLabel(date) : ''}
      maxWidth="480px"
    >
      {isLoading ? (
        <p className="py-6 text-center text-sm text-ink-muted">加载中…</p>
      ) : todos.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">这一天没有安排。</p>
      ) : (
        <>
          <p className="tabular text-xs text-ink-muted">
            {done} / {todos.length} 项完成
          </p>
          <ul className="-mx-1 flex max-h-[360px] flex-col overflow-y-auto">
            {todos.map((todo) => {
              const isDone = todo.status === 'done'
              return (
                <li key={todo.id} className="flex items-start gap-2.5 rounded-md px-1 py-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex size-[16px] shrink-0 items-center justify-center rounded border',
                      isDone
                        ? 'border-brand bg-brand text-on-brand'
                        : 'border-line-strong bg-panel',
                    )}
                  >
                    {isDone ? <Check size={10} strokeWidth={3.2} /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        'text-sm break-words',
                        isDone ? 'text-ink-subtle line-through' : 'text-ink',
                      )}
                    >
                      {todo.title}
                    </span>
                    {todo.planTitle ? (
                      <span className="text-xs text-ink-muted">{todo.planTitle}</span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Dialog>
  )
}
