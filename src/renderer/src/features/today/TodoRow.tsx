import type { TodoWithPlan } from '@shared/types'
import { Check, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'

interface TodoRowProps {
  todo: TodoWithPlan
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  busy?: boolean
}

/**
 * 清单行。
 *
 * 复选框用原生 input 而不是 div：原生 input 自带键盘空格切换、
 * 屏幕阅读器状态播报，自己画一个要补一堆 ARIA 还容易漏。
 * 视觉上用 sr-only 藏起来，靠 peer 影响旁边的方框。
 */
export default function TodoRow({ todo, onToggle, onRemove, busy = false }: TodoRowProps) {
  const done = todo.status === 'done'

  return (
    <li className="group flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-panel-hover">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={() => onToggle(todo.id)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-1',
            done
              ? 'border-brand bg-brand text-on-brand'
              : 'border-line-strong bg-panel group-hover:border-ink-subtle',
          )}
        >
          {done ? <Check size={12} strokeWidth={3.2} /> : null}
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              'text-sm break-words transition-colors',
              done ? 'text-ink-subtle line-through' : 'text-ink',
            )}
          >
            {todo.title}
          </span>
          {todo.planTitle ? <span className="text-xs text-ink-muted">{todo.planTitle}</span> : null}
        </span>
      </label>

      <button
        type="button"
        onClick={() => onRemove(todo.id)}
        aria-label={`删除待办「${todo.title}」`}
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100"
      >
        <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </li>
  )
}
