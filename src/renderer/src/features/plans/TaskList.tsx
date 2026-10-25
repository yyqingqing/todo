import type { TaskWithState } from '@shared/types'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/Button'
import { cn } from '../../lib/cn'
import { fieldErrorClass, inputClass } from '../../lib/ui'
import { usePlanMutations } from './api'

interface TaskListProps {
  planId: string
  tasks: TaskWithState[]
}

/** 计划下的任务。回车即加，是这个页面唯一需要"高频输入"的地方 */
export default function TaskList({ planId, tasks }: TaskListProps) {
  const { saveTask, removeTask } = usePlanMutations()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    try {
      setError(null)
      await saveTask.mutateAsync({ planId, title: trimmed })
      setTitle('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '添加失败')
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      setError(null)
      await removeTask.mutateAsync(id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败')
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium text-ink-muted">任务</h3>
        <span className="tabular text-xs text-ink-subtle">{tasks.length} 项</span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex gap-2"
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="添加一个任务，回车确认"
          aria-label="新任务标题"
          className={inputClass}
        />
        <Button
          type="submit"
          className="shrink-0"
          disabled={title.trim().length === 0 || saveTask.isPending}
        >
          添加
        </Button>
      </form>

      {error ? (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          本计划还没有直属任务。子计划里的任务会计入上面的进度，不在这里重复列出。
        </p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="group flex h-[var(--row-h)] items-center gap-3 rounded-md px-2 transition-colors hover:bg-panel-hover"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  task.done ? 'bg-ok' : 'bg-line-strong',
                )}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  task.done ? 'text-ink-subtle line-through' : 'text-ink',
                )}
              >
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => void remove(task.id)}
                aria-label={`删除任务「${task.title}」`}
                className="flex size-7 shrink-0 items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
