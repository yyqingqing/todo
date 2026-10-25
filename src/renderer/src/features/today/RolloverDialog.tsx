import { useState } from 'react'
import Button from '../../components/Button'
import Dialog from '../../components/Dialog'
import { cn } from '../../lib/cn'
import { addDays, todayStr } from '../../lib/date'
import { inputClass, labelClass } from '../../lib/ui'
import { useTodoMutations } from './api'

const QUICK_PICKS = [
  { label: '明天', days: 1 },
  { label: '三天后', days: 3 },
  { label: '一周后', days: 7 },
] as const

interface RolloverDialogProps {
  open: boolean
  /** 要顺延的待办 id */
  todoIds: string[]
  onClose: () => void
  onDone: (moved: number, targetDate: string) => void
}

/**
 * 顺延对话框。
 *
 * 没有做下拉菜单而是用弹窗：自研下拉的键盘交互（方向键、Home/End、输入跳转）
 * 是可访问性问题的重灾区，而这个场景用弹窗反而更清楚——顺延是"决定一个日期"，
 * 适合给一块独立空间，而不是一个一闪而过的浮层。
 */
export default function RolloverDialog({ open, todoIds, onClose, onDone }: RolloverDialogProps) {
  const { rollover } = useTodoMutations()
  const [targetDate, setTargetDate] = useState(() => addDays(todayStr(), 1))
  const [error, setError] = useState<string | null>(null)

  const confirm = async (): Promise<void> => {
    try {
      setError(null)
      const moved = await rollover.mutateAsync({ ids: todoIds, targetDate })
      onDone(moved, targetDate)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '顺延失败')
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="顺延到"
      maxWidth="440px"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={rollover.isPending}>
            顺延
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-secondary">
        {todoIds.length} 条待办会被移到新日期。原来的计划日期会保留下来，用于统计拖延情况。
      </p>

      <div className="flex flex-wrap gap-2">
        {QUICK_PICKS.map(({ label, days }) => {
          const date = addDays(todayStr(), days)
          const active = targetDate === date
          return (
            <button
              key={label}
              type="button"
              onClick={() => setTargetDate(date)}
              aria-pressed={active}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'border-brand bg-brand-soft font-medium text-brand'
                  : 'border-line-strong text-ink-secondary hover:bg-panel-hover hover:text-ink',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rollover-date" className={labelClass}>
          目标日期
        </label>
        <input
          id="rollover-date"
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}
