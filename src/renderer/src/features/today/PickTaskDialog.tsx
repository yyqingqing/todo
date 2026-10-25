import type { DateString } from '@shared/types'
import { Check, Layers } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/Button'
import Dialog from '../../components/Dialog'
import { fieldErrorClass } from '../../lib/ui'
import { usePickableTasks, useTodoMutations } from './api'

interface PickTaskDialogProps {
  open: boolean
  date: DateString
  onClose: () => void
}

/**
 * 从计划里挑任务排进今天。
 *
 * 点一条就加入今天，弹窗不关：用户的真实动作是"把今天要做的几件事一次挑完"，
 * 每挑一条就关一次会让这个流程变得很烦。
 */
export default function PickTaskDialog({ open, date, onClose }: PickTaskDialogProps) {
  const { data, isLoading } = usePickableTasks(open)
  const { create } = useTodoMutations()
  const [error, setError] = useState<string | null>(null)
  // 记下本次已加入的，避免连点同一项时等到列表刷新才消失
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(() => new Set())

  const tasks = (data ?? []).filter((task) => !addedIds.has(task.id))

  const add = async (taskId: string, title: string): Promise<void> => {
    try {
      setError(null)
      await create.mutateAsync({ title, scheduledDate: date, taskId })
      setAddedIds((previous) => new Set(previous).add(taskId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '添加失败')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="从计划添加到今天">
      {isLoading ? (
        <p className="py-6 text-center text-sm text-ink-muted">加载中…</p>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Layers size={20} className="text-ink-subtle" aria-hidden="true" />
          <p className="text-sm text-ink-muted">
            没有可添加的任务。去「计划」里给计划加几个任务，它们就会出现在这里。
          </p>
        </div>
      ) : (
        <ul className="-mx-2 flex max-h-[320px] flex-col overflow-y-auto">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => void add(task.id, task.title)}
                disabled={create.isPending}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-panel-hover disabled:opacity-60"
              >
                <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-subtle">
                  <Check size={11} strokeWidth={3} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-ink">{task.title}</span>
                  <span className="truncate text-xs text-ink-muted">{task.planTitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      ) : null}

      <div className="flex justify-end border-t border-line pt-3">
        <Button onClick={onClose}>完成</Button>
      </div>
    </Dialog>
  )
}
