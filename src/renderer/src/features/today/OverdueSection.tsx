import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/Button'
import { cn } from '../../lib/cn'
import { formatDateLabel } from '../../lib/date'
import { todoKeys, useOverdueTodos, useTodoMutations } from './api'

interface OverdueSectionProps {
  today: string
}

/**
 * 「更早日期还没完成」的待办。
 *
 * 解决的是这个场景：11/1 建了 3 条只做 1 条，之后几天没打开应用。
 * 11/6 打开时今日页只列 11/6 的，那 2 条就永远停在过去、也没有入口能处理。
 *
 * 刻意做得不显眼：默认只占一行、默认折叠、用弱化配色。
 * 今日页的主角是"今天的安排"，欠账是收尾工作，不该抢注意力。
 * 只有今天清单为空时才在空状态里主动提示 —— 那时它确实是用户该看的东西。
 */
export default function OverdueSection({ today }: OverdueSectionProps) {
  const [expanded, setExpanded] = useState(false)
  // 展开后先看 5 条；点「加载更多」才取最近三个月的全部
  const [showAll, setShowAll] = useState(false)
  const { data, isLoading } = useOverdueTodos(today, showAll)
  const { rollover, remove } = useTodoMutations()
  const queryClient = useQueryClient()

  const total = data?.total ?? 0
  const items = data?.items ?? []

  // 没有欠账时一行都不占
  if (isLoading || total === 0) return null

  const hiddenCount = total - items.length

  const moveToToday = async (id: string): Promise<void> => {
    await rollover.mutateAsync({ ids: [id], targetDate: today })
    await queryClient.invalidateQueries({ queryKey: todoKeys.all })
  }

  const moveAll = async (): Promise<void> => {
    await rollover.mutateAsync({ ids: items.map((item) => item.id), targetDate: today })
    await queryClient.invalidateQueries({ queryKey: todoKeys.all })
  }

  return (
    <section className="mt-2 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-xs text-ink-muted transition-colors hover:text-ink"
      >
        {expanded ? (
          <ChevronDown size={13} aria-hidden="true" />
        ) : (
          <ChevronRight size={13} aria-hidden="true" />
        )}
        {expanded ? '收起更早的未完成' : `还有 ${total} 条更早的没完成`}
      </button>

      {expanded ? (
        <div className="flex flex-col gap-1 pb-1">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-md px-1 py-1.5">
                {/* 日期用等宽数字 + 不换行：2026年11月5日 在 76px 里会折成两行 */}
                <span className="tabular w-[92px] shrink-0 whitespace-nowrap text-[11px] text-ink-subtle">
                  {formatDateLabel(item.scheduledDate)}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm text-ink-secondary"
                  title={item.title}
                >
                  {item.title}
                </span>
                {item.planTitle ? (
                  <span className="shrink-0 truncate text-[10px] text-ink-subtle">
                    {item.planTitle}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void moveToToday(item.id)}
                  className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-brand transition-colors hover:bg-brand-soft"
                >
                  挪到今天
                </button>
                <button
                  type="button"
                  onClick={() => void remove.mutateAsync(item.id)}
                  aria-label={`删除「${item.title}」`}
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded text-ink-subtle',
                    'transition-colors hover:bg-danger-soft hover:text-danger',
                  )}
                >
                  <Trash2 size={12} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <span className="text-[11px] text-ink-subtle">
              {!showAll && hiddenCount > 0 ? `还有 ${hiddenCount} 条更早的` : ''}
              {showAll && hiddenCount > 0 ? `另有 ${hiddenCount} 条超过三个月，未显示` : ''}
            </span>
            <div className="flex items-center gap-1">
              {!showAll && hiddenCount > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
                  再加载三个月内
                </Button>
              ) : null}
              {items.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => void moveAll()}>
                  全部挪到今天
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
