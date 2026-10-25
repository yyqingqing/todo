import { Layers, ListChecks } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'
import PageHeader from '../../components/PageHeader'
import ProgressBar from '../../components/ProgressBar'
import { todayLabel } from '../../lib/date'
import { fieldErrorClass, inputClass } from '../../lib/ui'
import { useToday } from '../../lib/use-today'
import { useTodoMutations, useTodos } from './api'
import PickTaskDialog from './PickTaskDialog'
import TodoRow from './TodoRow'

export default function TodayPage() {
  const { today } = useToday()
  const { data, isLoading, error, refetch } = useTodos(today)
  const { create, toggle, remove } = useTodoMutations(today)

  const [title, setTitle] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)

  const todos = data ?? []
  const total = todos.length
  const done = todos.filter((todo) => todo.status === 'done').length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  const addTodo = async (): Promise<void> => {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    try {
      setFormError(null)
      await create.mutateAsync({ title: trimmed, scheduledDate: today })
      setTitle('')
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '添加失败')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="今日"
        meta={todayLabel()}
        actions={
          <Button size="sm" variant="ghost" onClick={() => setPickOpen(true)}>
            <Layers size={14} aria-hidden="true" />
            从计划添加
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 限宽 720：这是专注场景，行太长会让眼睛来回扫 */}
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-6 py-5">
          {total > 0 ? (
            <div className="flex items-center gap-3">
              <ProgressBar value={percent} className="flex-1" />
              <span className="tabular shrink-0 text-xs text-ink-muted">
                {done} / {total}
              </span>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void addTodo()
            }}
            className="flex gap-2"
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="今天要做点什么？回车添加"
              aria-label="新待办"
              autoComplete="off"
              className={inputClass}
            />
            <Button
              type="submit"
              className="shrink-0"
              disabled={title.trim().length === 0 || create.isPending}
            >
              添加
            </Button>
          </form>

          {formError ? (
            <p role="alert" className={fieldErrorClass}>
              {formError}
            </p>
          ) : null}

          {isLoading ? (
            <div className="flex flex-col gap-2 pt-1">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-11 animate-pulse rounded-md bg-panel-sunken" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              message={error.message}
              onRetry={() => {
                void refetch()
              }}
            />
          ) : todos.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="今天还没有安排"
              description="在上面输入框回车即可添加一条待办；也可以从「计划」里把任务拉到今天。"
            />
          ) : (
            <ul className="flex flex-col">
              {todos.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  onToggle={(id) => {
                    void toggle.mutateAsync(id)
                  }}
                  onRemove={(id) => {
                    void remove.mutateAsync(id)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <PickTaskDialog open={pickOpen} date={today} onClose={() => setPickOpen(false)} />
    </div>
  )
}
