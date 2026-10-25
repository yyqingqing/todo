import type { DateString } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/Button'
import Dialog from '../../components/Dialog'
import { getApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDateLabel, todayStr } from '../../lib/date'
import { fieldErrorClass, inputClass } from '../../lib/ui'
import { useTodoMutations } from '../today/api'

interface DayDetailDialogProps {
  date: DateString | null
  onClose: () => void
}

/**
 * 点日历格子看到的那一天的清单。
 *
 * 可以「添加」，不能「改完成状态」：
 * - 添加是纯增量，不涉及历史归属，放在这里最自然（"我想在某天记一件事"）
 * - 改状态必须回今日页做。否则在日历里补勾三天前的事时，
 *   "这条算哪天完成的"就说不清了，积分归属和顺延统计都会失真
 */
export default function DayDetailDialog({ date, onClose }: DayDetailDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['todo', 'by-date', date ?? 'none'],
    queryFn: () => (date ? getApi().todo.byDate(date) : Promise.resolve([])),
    enabled: date !== null,
  })

  const { create } = useTodoMutations()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 只允许给「未来」的日期添加：
  // - 过去的日期补记没有意义，已经过去了
  // - 今天的事务走今日页，保持单一入口
  // YYYY-MM-DD 字符串比较等价于日期比较
  const canAdd = date !== null && date > todayStr()

  const todos = data ?? []
  const done = todos.filter((todo) => todo.status === 'done').length

  const add = async (): Promise<void> => {
    const trimmed = title.trim()
    if (trimmed.length === 0 || !date || !canAdd) return
    try {
      setError(null)
      await create.mutateAsync({ title: trimmed, scheduledDate: date })
      setTitle('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '添加失败')
    }
  }

  return (
    <Dialog
      open={date !== null}
      onClose={onClose}
      title={date ? formatDateLabel(date) : ''}
      maxWidth="480px"
    >
      {todos.length > 0 ? (
        <p className="tabular -mb-1 text-xs text-ink-muted">
          {done} / {todos.length} 项完成
        </p>
      ) : null}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-ink-muted">加载中…</p>
      ) : todos.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">这一天还没有安排。</p>
      ) : (
        <ul className="-mx-1 flex max-h-[300px] flex-col overflow-y-auto">
          {todos.map((todo) => {
            const isDone = todo.status === 'done'
            return (
              <li key={todo.id} className="flex items-start gap-2.5 rounded-md px-1 py-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex size-[16px] shrink-0 items-center justify-center rounded border',
                    isDone ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-panel',
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
      )}

      {canAdd ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
          className="flex gap-2 border-t border-line pt-3"
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="给这一天加一条待办"
            aria-label="新待办标题"
            autoComplete="off"
            className={cn(inputClass, 'min-w-0 flex-1')}
          />
          <Button
            type="submit"
            className="shrink-0"
            disabled={title.trim().length === 0 || create.isPending}
          >
            添加
          </Button>
        </form>
      ) : (
        <p className="border-t border-line pt-3 text-xs text-ink-muted">
          {date === todayStr() ? '今天的事项请在「今日」页添加。' : '过去的日期不能补加待办。'}
        </p>
      )}

      {error ? (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}
