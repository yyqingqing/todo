import { Layers, ListChecks, Pin } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'
import PageHeader from '../../components/PageHeader'
import ProgressBar from '../../components/ProgressBar'
import { getApi } from '../../lib/api'
import { formatDateLabel, todayLabel } from '../../lib/date'
import { fieldErrorClass, inputClass } from '../../lib/ui'
import { useOverlayState } from '../../lib/use-settings'
import { useToday } from '../../lib/use-today'
import { useTodoMutations, useTodos } from './api'
import PickTaskDialog from './PickTaskDialog'
import RolloverDialog from './RolloverDialog'
import TodoRow from './TodoRow'

const NOTICE_DURATION_MS = 4000

export default function TodayPage() {
  const { today } = useToday()
  const { data, isLoading, error, refetch } = useTodos(today)
  const { create, toggle, remove } = useTodoMutations()
  const { data: overlayState } = useOverlayState()

  const [title, setTitle] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  /** 非 null 表示顺延对话框打开，值是本次要顺延的 id */
  const [rolloverIds, setRolloverIds] = useState<string[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const todos = data ?? []
  const total = todos.length
  const done = todos.filter((todo) => todo.status === 'done').length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const pendingIds = todos.filter((todo) => todo.status === 'pending').map((todo) => todo.id)

  // 提示条自动消失。卸载/重跑时清掉定时器，否则会对着已卸载的组件 setState
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

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
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (overlayState?.visible) void getApi().overlay.hide()
                else void getApi().overlay.show()
              }}
            >
              <Pin size={14} aria-hidden="true" />
              {overlayState?.visible ? '已钉在桌面' : '钉在桌面'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPickOpen(true)}>
              <Layers size={14} aria-hidden="true" />
              从计划添加
            </Button>
          </>
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
              {pendingIds.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => setRolloverIds(pendingIds)}
                >
                  {pendingIds.length > 1 ? `顺延未完成 ${pendingIds.length} 条` : '顺延'}
                </Button>
              ) : null}
            </div>
          ) : null}

          {notice ? (
            <p
              role="status"
              className="rounded-md border border-line bg-brand-soft px-3 py-2 text-xs text-brand"
            >
              {notice}
            </p>
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
                  onRollover={(id) => setRolloverIds([id])}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <PickTaskDialog open={pickOpen} date={today} onClose={() => setPickOpen(false)} />

      <RolloverDialog
        open={rolloverIds !== null}
        todoIds={rolloverIds ?? []}
        onClose={() => setRolloverIds(null)}
        onDone={(moved, targetDate) => {
          setRolloverIds(null)
          setNotice(
            moved > 0
              ? `已把 ${moved} 条顺延到 ${formatDateLabel(targetDate)}，原计划日期已保留`
              : '没有需要顺延的待办',
          )
        }}
      />
    </div>
  )
}
