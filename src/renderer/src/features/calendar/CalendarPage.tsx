import type { CalendarPlan } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/Button'
import ErrorState from '../../components/ErrorState'
import PageHeader from '../../components/PageHeader'
import { getApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { colorStyle, safeColorToken } from '../../lib/colors'
import { buildMonthGrid, dayOfMonth, daysInMonth, todayStr } from '../../lib/date'
import DayDetailDialog from './DayDetailDialog'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['calendar', cursor.year, cursor.month],
    queryFn: () => getApi().calendar.month(cursor.year, cursor.month),
  })

  const today = todayStr()
  const cells = buildMonthGrid(cursor.year, cursor.month)
  const dayMap = new Map((data?.days ?? []).map((day) => [day.date, day]))

  const shiftMonth = (delta: number): void => {
    setCursor((previous) => {
      const next = new Date(previous.year, previous.month - 1 + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() + 1 }
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="日历"
        meta={`${cursor.year} 年 ${cursor.month} 月`}
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => shiftMonth(-1)} aria-label="上个月">
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const now = new Date()
                setCursor({ year: now.getFullYear(), month: now.getMonth() + 1 })
              }}
            >
              今天
            </Button>
            <Button size="sm" variant="ghost" onClick={() => shiftMonth(1)} aria-label="下个月">
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-6 py-5">
          {error ? (
            <ErrorState
              message={error.message}
              onRetry={() => {
                void refetch()
              }}
            />
          ) : (
            <>
              {/* 月历网格 */}
              <div className="overflow-hidden rounded-lg border border-line">
                <div className="grid grid-cols-7 border-b border-line bg-panel-sunken">
                  {WEEKDAYS.map((label) => (
                    <div
                      key={label}
                      className="py-1.5 text-center text-xs font-medium text-ink-muted"
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {cells.map((cell, index) => {
                    const stat = dayMap.get(cell.date)
                    const isToday = cell.date === today
                    const ratio = stat && stat.total > 0 ? stat.done / stat.total : 0
                    const allDone = Boolean(stat && stat.total > 0 && stat.done === stat.total)

                    return (
                      <button
                        key={cell.date}
                        type="button"
                        onClick={() => setSelectedDate(cell.date)}
                        aria-label={`${cell.date}${stat ? `，完成 ${stat.done}/${stat.total}` : ''}`}
                        className={cn(
                          'relative flex h-[84px] flex-col items-center gap-1 border-line pt-2 transition-colors',
                          // 网格线：右侧和下侧，最右/最下不画避免双线
                          index % 7 !== 6 && 'border-r',
                          index < cells.length - 7 && 'border-b',
                          cell.inMonth ? 'hover:bg-panel-hover' : 'bg-panel-sunken/40',
                          isToday && 'bg-brand-soft',
                        )}
                      >
                        <span
                          className={cn(
                            'tabular text-xs',
                            isToday
                              ? 'font-semibold text-brand'
                              : cell.inMonth
                                ? 'text-ink'
                                : 'text-ink-subtle',
                          )}
                        >
                          {dayOfMonth(cell.date)}
                        </span>

                        {stat ? (
                          <CompletionRing ratio={ratio} complete={allDone} />
                        ) : (
                          <span className="size-4" aria-hidden="true" />
                        )}

                        {stat ? (
                          <span className="tabular text-[10px] text-ink-subtle">
                            {stat.done}/{stat.total}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              {isLoading ? <p className="text-center text-sm text-ink-muted">加载中…</p> : null}

              {/* 本月计划跨度 */}
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-ink">本月计划</h2>
                  <span className="text-xs text-ink-muted">{data?.plans.length ?? 0} 个</span>
                </div>

                {(data?.plans.length ?? 0) === 0 ? (
                  <p className="rounded-lg border border-line bg-panel px-4 py-6 text-center text-sm text-ink-muted">
                    这个月没有进行中的计划。去「计划」建一个，它就会出现在这里。
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data?.plans.map((plan) => (
                      <PlanSpanRow
                        key={plan.id}
                        plan={plan}
                        year={cursor.year}
                        month={cursor.month}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <DayDetailDialog date={selectedDate} onClose={() => setSelectedDate(null)} />
    </div>
  )
}

/**
 * 完成度圆环。
 * 用 SVG 的 strokeDasharray 画弧，比堆 div 精确，也不用额外依赖。
 */
function CompletionRing({ ratio, complete }: { ratio: number; complete: boolean }) {
  const radius = 7
  const circumference = 2 * Math.PI * radius

  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
      {/* 底环用 line-strong：用 line 的话与画布太接近，半圈进度会看成"没有数据" */}
      <circle cx={10} cy={10} r={radius} fill="none" stroke="var(--line-strong)" strokeWidth={2.2} />
      {ratio > 0 ? (
        <circle
          cx={10}
          cy={10}
          r={radius}
          fill="none"
          stroke={complete ? 'var(--ok)' : 'var(--brand)'}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform="rotate(-90 10 10)"
        />
      ) : null}
    </svg>
  )
}

/** 本月的计划跨度：一条横条覆盖该计划在本月内的区间 */
function PlanSpanRow({ plan, year, month }: { plan: CalendarPlan; year: number; month: number }) {
  const total = daysInMonth(year, month)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(total).padStart(2, '0')}`

  // 计划可能跨出本月，跨度条要裁到本月范围内
  const startDay = dayOfMonth(plan.startDate < monthStart ? monthStart : plan.startDate)
  const endDay = dayOfMonth(plan.endDate > monthEnd ? monthEnd : plan.endDate)

  const left = ((startDay - 1) / total) * 100
  const width = ((endDay - startDay + 1) / total) * 100
  const percent = Math.round(plan.progress * 100)

  return (
    <li className="flex items-center gap-3">
      <span className="w-[180px] shrink-0 truncate text-sm text-ink" title={plan.title}>
        {plan.title}
      </span>

      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-sunken">
        <div
          className="absolute inset-y-0 rounded-full opacity-40"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            backgroundColor: `var(--${safeColorToken(plan.color)})`,
          }}
        />
        {/* 已完成的进度叠在跨度条上，一眼同时看到"区间"和"进度" */}
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${left}%`,
            width: `${(width * Math.min(1, plan.progress)).toFixed(2)}%`,
            ...colorStyle(plan.color),
          }}
        />
      </div>

      <span className="tabular w-10 shrink-0 text-right text-xs text-ink-muted">{percent}%</span>
    </li>
  )
}
