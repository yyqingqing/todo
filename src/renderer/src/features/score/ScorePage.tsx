import { reasonLabel } from '@shared/domain/score'
import type { ScoreEntry } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'
import PageHeader from '../../components/PageHeader'
import { getApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { addDays, todayStr } from '../../lib/date'

/** 热力图展示最近多少周。20 周 ≈ 5 个月，一屏能放下 */
const HEATMAP_WEEKS = 20
const LEDGER_LIMIT = 100

/** 分值等级：颜色深浅表达当天拿了多少分 */
const LEVEL_CLASS = [
  'bg-panel-sunken',
  'bg-brand/25',
  'bg-brand/45',
  'bg-brand/70',
  'bg-brand',
] as const

function levelOf(points: number): number {
  if (points <= 0) return 0
  if (points < 10) return 1
  if (points < 20) return 2
  if (points < 30) return 3
  return 4
}

export default function ScorePage() {
  const overviewQuery = useQuery({
    queryKey: ['score', 'overview'],
    queryFn: () => getApi().score.overview(),
  })
  const ledgerQuery = useQuery({
    queryKey: ['score', 'recent', LEDGER_LIMIT],
    queryFn: () => getApi().score.recent(LEDGER_LIMIT),
  })

  const overview = overviewQuery.data
  const entries = ledgerQuery.data ?? []

  // 稀疏的每日分值转成 map，供热力图按日期取
  const pointsByDate = new Map((overview?.daily ?? []).map((day) => [day.date, day.points]))
  const heatmap = buildHeatmap(pointsByDate)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="积分" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-5">
          {overviewQuery.error ? (
            <ErrorState
              message={overviewQuery.error.message}
              onRetry={() => {
                void overviewQuery.refetch()
              }}
            />
          ) : (
            <>
              {/* 汇总 */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="累计积分" value={overview?.total ?? 0} highlight />
                <StatCard label="今日" value={overview?.today ?? 0} />
                <StatCard label="近 7 天" value={overview?.week ?? 0} />
              </div>

              {/* 热力图 */}
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-ink">最近 {HEATMAP_WEEKS} 周</h2>
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-subtle">
                    <span>少</span>
                    {LEVEL_CLASS.map((className) => (
                      <span key={className} className={cn('size-2.5 rounded-[2px]', className)} />
                    ))}
                    <span>多</span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-line bg-panel p-3">
                  <div className="flex gap-1">
                    {heatmap.map((week) => (
                      <div key={week.weekStart} className="flex flex-col gap-1">
                        {week.cells.map((cell) => (
                          <span
                            key={cell.date}
                            title={`${cell.date}：${cell.points} 分`}
                            className={cn(
                              'size-3 rounded-[2px]',
                              LEVEL_CLASS[levelOf(cell.points)],
                            )}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* 流水 */}
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-ink">积分记录</h2>
                  <span className="text-xs text-ink-muted">最近 {entries.length} 条</span>
                </div>

                {ledgerQuery.error ? (
                  <ErrorState
                    message={ledgerQuery.error.message}
                    onRetry={() => {
                      void ledgerQuery.refetch()
                    }}
                  />
                ) : entries.length === 0 ? (
                  <EmptyState
                    icon={Sparkles}
                    title="还没有积分记录"
                    description="完成今日待办就会开始积累。把清单清空还能拿到额外奖励。"
                  />
                ) : (
                  <ul className="flex flex-col overflow-hidden rounded-lg border border-line">
                    {entries.map((entry) => (
                      <LedgerRow key={entry.id} entry={entry} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-panel px-4 py-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={cn('tabular text-2xl font-semibold', highlight ? 'text-brand' : 'text-ink')}>
        {value}
      </span>
    </div>
  )
}

function LedgerRow({ entry }: { entry: ScoreEntry }) {
  const positive = entry.points >= 0
  const time = new Date(entry.occurredAt)
  const timeLabel = `${time.getMonth() + 1}月${time.getDate()}日 ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`

  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-ink">
          {entry.title ?? reasonLabel(entry.reason)}
        </span>
        <span className="text-xs text-ink-muted">
          {reasonLabel(entry.reason)} · {timeLabel}
        </span>
      </div>
      <span
        className={cn('tabular shrink-0 text-sm font-medium', positive ? 'text-ok' : 'text-danger')}
      >
        {positive ? '+' : ''}
        {entry.points}
      </span>
    </li>
  )
}

/**
 * 生成热力图网格：每列一周（周一到周日），从 HEATMAP_WEEKS 周前的周一开始。
 * 用 title 属性给出精确日期和分值，避免"颜色对不上哪天"的困惑。
 */
interface HeatmapWeek {
  /** 这一周的周一日期，同时用作 React key（不能用数组下标） */
  weekStart: string
  cells: { date: string; points: number }[]
}

function buildHeatmap(pointsByDate: Map<string, number>): HeatmapWeek[] {
  const today = todayStr()
  const [year = 1970, month = 1, day = 1] = today.split('-').map(Number)
  // getDay(): 0=周日。转成「周一 = 0」
  const weekdayIndex = (new Date(year, month - 1, day).getDay() + 6) % 7
  const start = addDays(today, -((HEATMAP_WEEKS - 1) * 7 + weekdayIndex))

  const weeks: HeatmapWeek[] = []
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const weekStart = addDays(start, week * 7)
    const cells: HeatmapWeek['cells'] = []
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const date = addDays(weekStart, dayOfWeek)
      cells.push({ date, points: pointsByDate.get(date) ?? 0 })
    }
    weeks.push({ weekStart, cells })
  }
  return weeks
}
