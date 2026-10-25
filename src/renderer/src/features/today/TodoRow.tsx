import type { TodoWithPlan } from '@shared/types'
import { Check, CornerUpRight, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { colorStyle } from '../../lib/colors'

/** 顺延超过这个次数就提示用户：可能是这件事需要拆小，或者该放弃了 */
const ROLLOVER_HINT_THRESHOLD = 3

interface TodoRowProps {
  todo: TodoWithPlan
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onRollover: (id: string) => void
  busy?: boolean
}

/**
 * 清单行。
 *
 * 复选框用原生 input 而不是 div：原生 input 自带键盘空格切换、
 * 屏幕阅读器状态播报，自己画一个要补一堆 ARIA 还容易漏。
 * 视觉上用 sr-only 藏起来，靠 peer 影响旁边的方框。
 */
export default function TodoRow({
  todo,
  onToggle,
  onRemove,
  onRollover,
  busy = false,
}: TodoRowProps) {
  const done = todo.status === 'done'
  const overdueHint = todo.rolloverCount >= ROLLOVER_HINT_THRESHOLD

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

          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {todo.planTitle ? (
              // 计划任务：分类色点 + 计划名，一眼看出它在推进哪个长期计划
              <span className="inline-flex items-center gap-1 text-ink-muted">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={colorStyle(todo.planColor)}
                  aria-hidden="true"
                />
                {todo.planTitle}
              </span>
            ) : (
              // 临时事项：明确标出来，而不是靠"没有计划名"这种空缺去暗示
              <span className="rounded-sm border border-line-strong bg-panel px-1 py-px text-[10px] leading-normal text-ink-muted">
                临时
              </span>
            )}
            {todo.rolloverCount > 0 ? (
              <span className={overdueHint ? 'text-warn' : 'text-ink-subtle'}>
                已顺延 {todo.rolloverCount} 次{overdueHint ? '，要不要拆小一点？' : ''}
              </span>
            ) : null}
          </span>
        </span>
      </label>

      {!done ? (
        <button
          type="button"
          onClick={() => onRollover(todo.id)}
          aria-label={`把「${todo.title}」顺延到以后`}
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-panel-sunken hover:text-ink focus-visible:opacity-100"
        >
          <CornerUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

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
