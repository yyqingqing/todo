import { progressPercent } from '@shared/domain/progress'
import type { PlanNode } from '@shared/types'
import { CATEGORY_COLORS } from '../../lib/colors'
import { addDays, todayStr } from '../../lib/date'

/** 时间线窗口：今天往前 2 个月、往后 10 个月，一年跨度 */
const MONTHS_BEFORE = 2
const MONTHS_AFTER = 10
const WINDOW_MONTHS = MONTHS_BEFORE + MONTHS_AFTER

interface PlanTimelineProps {
  nodes: PlanNode[]
  onSelect: (id: string) => void
}

interface TimelineRow {
  plan: PlanNode
  depth: number
  /** 所属根计划在列表里的序号，决定颜色 */
  rootIndex: number
}

function toDate(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * 计划时间线（简化甘特图）。
 *
 * 为什么不再用「本月计划跨度」：那个只看一个月，用户看不出「一年的计划怎么排的」。
 * 这里是固定 12 个月窗口 —— 起点由今天推出来，而不是由计划边界推出来，
 * 这样每次打开看到的横向尺度一致，跨年比较也不会变形。
 *
 * 超出窗口的计划会被裁剪，所以条的两端不一定是计划的真实首尾。
 * 用 title 提示真实区间，并在条上标注是否被裁剪。
 */
export default function PlanTimeline({ nodes, onSelect }: PlanTimelineProps) {
  const today = todayStr()
  const windowStart = addDays(today, -30 * MONTHS_BEFORE)
  const windowEnd = addDays(today, 30 * MONTHS_AFTER)

  const totalDays = Math.max(1, daysBetween(toDate(windowStart), toDate(windowEnd)))

  // 按树形顺序取行（全部展开：时间线的价值在于看全，折叠会藏掉信息）
  //
  // 颜色按「根计划」分配，不用分类色：时间线的主视觉单元是一棵计划树，
  // 同一棵树的子计划必须同色，否则看不出它们是一伙的。
  // 分类色还留着另一个问题 —— 未分类的计划都会兜底成第一个色，
  // 几个毫不相干的计划看起来像同一条线。
  const rows: TimelineRow[] = []
  const walk = (list: readonly PlanNode[], depth: number, rootIndex: number): void => {
    for (const plan of list) {
      rows.push({ plan, depth, rootIndex })
      walk(plan.children, depth + 1, rootIndex)
    }
  }
  nodes.forEach((root, index) => {
    walk([root], 0, index)
  })

  const todayPercent = (daysBetween(toDate(windowStart), toDate(today)) / totalDays) * 100

  // 横向刻度：每 2 个月一条
  const ticks: { percent: number; label: string }[] = []
  const windowStartDate = toDate(windowStart)
  for (let month = 0; month <= WINDOW_MONTHS; month += 2) {
    const date = new Date(windowStartDate.getFullYear(), windowStartDate.getMonth() + month, 1)
    ticks.push({
      percent: (daysBetween(windowStartDate, date) / totalDays) * 100,
      label: `${date.getMonth() + 1}月`,
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel">
      {/* 刻度轴 */}
      <div className="flex shrink-0 border-b border-line bg-panel-sunken">
        <div className="w-[220px] shrink-0 px-3 py-1.5 text-[11px] text-ink-muted">计划</div>
        <div className="relative min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick.label + tick.percent}
              className="absolute top-1.5 -translate-x-1/2 text-[11px] text-ink-subtle"
              style={{ left: `${tick.percent}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        <div className="w-[52px] shrink-0" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            还没有计划。去「计划」建一个，时间线会显示它覆盖的时间段。
          </p>
        ) : (
          rows.map(({ plan, depth, rootIndex }) => {
            const start = plan.startDate < windowStart ? windowStart : plan.startDate
            const end = plan.endDate > windowEnd ? windowEnd : plan.endDate
            const offsetDays = Math.max(0, daysBetween(toDate(windowStart), toDate(start)))
            const spanDays = Math.max(1, daysBetween(toDate(start), toDate(end)))
            const left = (offsetDays / totalDays) * 100
            const width = Math.min(100 - left, (spanDays / totalDays) * 100)
            const color = CATEGORY_COLORS[rootIndex % CATEGORY_COLORS.length] ?? 'cat-1'
            // 同色系按层级递减透明度：一棵树内部也能看出主次，但颜色仍然一致
            const opacity = Math.max(0.45, 1 - depth * 0.2)

            return (
              <div key={plan.id} className="flex items-center border-b border-line last:border-b-0">
                <div className="w-[220px] shrink-0 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => onSelect(plan.id)}
                    className="flex w-full items-center gap-1.5 text-left"
                    style={{ paddingLeft: `${depth * 12}px` }}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-ink" title={plan.title}>
                      {plan.title}
                    </span>
                  </button>
                </div>

                <div className="relative h-9 min-w-0 flex-1">
                  {/* 今天的竖线贯穿整个时间区 */}
                  <span
                    className="pointer-events-none absolute inset-y-0 w-px bg-brand/40"
                    style={{ left: `${todayPercent}%` }}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => onSelect(plan.id)}
                    title={`${plan.title}：${plan.startDate} ~ ${plan.endDate}`}
                    className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full transition-opacity hover:opacity-80"
                    style={{
                      left: `${left}%`,
                      width: `${Math.max(width, 0.8)}%`,
                      backgroundColor: `var(--${color})`,
                      opacity,
                    }}
                    aria-label={`${plan.title}，${plan.startDate} 到 ${plan.endDate}`}
                  />
                </div>

                <div className="w-[52px] shrink-0 pr-3 text-right">
                  <span className="tabular text-[11px] text-ink-muted">
                    {progressPercent(plan.stats)}%
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
