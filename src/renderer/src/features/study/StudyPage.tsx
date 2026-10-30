import {
  endReasonLabel,
  formatClock,
  formatDuration,
  localDayStartMs,
  overlapSeconds,
  startOfWeek,
} from '@shared/domain/study'
import type { StudyBucket } from '@shared/types'
import { Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'
import PageHeader from '../../components/PageHeader'
import { cn } from '../../lib/cn'
import { addDays, todayLabel } from '../../lib/date'
import { useToday } from '../../lib/use-today'
import {
  useSecondTick,
  useStudyMutations,
  useStudySessions,
  useStudyStats,
  useStudyStatus,
} from './api'

/** "09:12" —— 明细里只看时分，日期由分区标题交代 */
function clockLabel(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

type Preset = 'today' | 'week' | 'month' | 'custom'

const PRESETS: readonly { key: Preset; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'custom', label: '自定义' },
]

const GRANULARITY_LABEL = { day: '按天', week: '按周', month: '按月' } as const

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-panel px-3 py-2.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="tabular text-lg font-semibold text-ink">{value}</span>
    </div>
  )
}

/**
 * 纯 CSS 柱状图。
 *
 * 不为一张图引图表库：项目现在零图表依赖，ECharts/Recharts 都是几百 KB，
 * 而"每段多少分钟"这个场景只需要柱高 + hover 数值。
 */
function BucketChart({ buckets }: { buckets: StudyBucket[] }) {
  const max = Math.max(...buckets.map((bucket) => bucket.seconds), 1)
  // 柱子多的时候隔几个标一次，否则标签会挤成一团
  const labelStep = Math.max(1, Math.ceil(buckets.length / 8))

  return (
    <div className="flex h-40 items-end gap-1">
      {buckets.map((bucket, index) => {
        const percent = bucket.seconds === 0 ? 0 : Math.max(4, (bucket.seconds / max) * 100)
        return (
          <div key={bucket.key} className="flex h-full flex-1 flex-col items-center justify-end">
            <div
              className={cn(
                'w-full rounded-t transition-colors',
                bucket.seconds > 0 ? 'bg-brand/70 hover:bg-brand' : 'bg-panel-sunken',
              )}
              style={{ height: bucket.seconds > 0 ? `${percent}%` : '2px' }}
              title={`${bucket.label} · ${formatDuration(bucket.seconds)}`}
            />
            <span className="mt-1 h-3 text-[10px] leading-3 whitespace-nowrap text-ink-subtle">
              {index % labelStep === 0 || index === buckets.length - 1 ? bucket.label : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function StudyPage() {
  const { today } = useToday()

  const statusQuery = useStudyStatus()
  const sessionsQuery = useStudySessions(today, today)
  const { start, stop } = useStudyMutations()

  const status = statusQuery.data
  const now = useSecondTick()

  // 主进程给的是"取数那一刻"的秒数，两次刷新之间靠本地时钟补上
  const sinceFetch =
    status?.running && statusQuery.dataUpdatedAt > 0
      ? Math.max(0, Math.floor((now - statusQuery.dataUpdatedAt) / 1000))
      : 0
  const elapsed = status?.running ? (status.elapsedSeconds ?? 0) + sinceFetch : 0

  const sessions = sessionsQuery.data ?? []
  const dayFrom = localDayStartMs(today)
  const dayTo = localDayStartMs(addDays(today, 1))

  // 今天的累计 = 已结束会话落在今天的那部分 + 正在跑的这一段
  const closedSeconds = sessions.reduce(
    (sum, session) =>
      sum +
      overlapSeconds(
        Date.parse(session.startedAt),
        session.endedAt ? Date.parse(session.endedAt) : Date.now(),
        dayFrom,
        dayTo,
      ),
    0,
  )
  const todaySeconds = closedSeconds + elapsed

  /* ---------------- 统计区间 ---------------- */

  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(() => addDays(today, -6))
  const [customTo, setCustomTo] = useState(today)

  const range = useMemo(() => {
    if (preset === 'today') return { from: today, to: today }
    if (preset === 'week') return { from: startOfWeek(today), to: today }
    if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
    // 用户可能把起止选反了，这里纠正而不是报错
    return customFrom <= customTo
      ? { from: customFrom, to: customTo }
      : { from: customTo, to: customFrom }
  }, [preset, today, customFrom, customTo])

  const statsQuery = useStudyStats(range.from, range.to)
  const stats = statsQuery.data

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="学习时间" meta={todayLabel()} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-6">
          {/* 计时器 */}
          <section className="flex flex-col items-center gap-4 rounded-xl border border-line bg-panel px-6 py-9">
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  status?.running ? 'animate-pulse bg-brand' : 'bg-ink-subtle/50',
                )}
                aria-hidden="true"
              />
              {status?.running ? '正在计时' : '未开始'}
            </span>

            <span className="tabular text-6xl font-semibold tracking-tight text-ink">
              {formatClock(elapsed)}
            </span>

            {status?.running ? (
              <Button
                variant="primary"
                onClick={() => {
                  stop.mutate()
                }}
                disabled={stop.isPending}
              >
                结束计时
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  start.mutate()
                }}
                disabled={start.isPending}
              >
                <Timer size={15} aria-hidden="true" />
                开始计时
              </Button>
            )}

            <p className="text-xs text-ink-muted">
              今日累计 <span className="tabular text-ink">{formatDuration(todaySeconds)}</span>
            </p>
          </section>

          {/* 统计 */}
          <section className="flex flex-col gap-4 rounded-xl border border-line bg-panel px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-ink">统计</h2>
              <div className="flex items-center gap-1">
                {PRESETS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPreset(item.key)}
                    className={cn(
                      'h-7 rounded-md px-2.5 text-xs transition-colors',
                      preset === item.key
                        ? 'bg-brand-soft font-medium text-brand'
                        : 'text-ink-secondary hover:bg-panel-hover hover:text-ink',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {preset === 'custom' ? (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="h-8 rounded-md border border-line-strong bg-panel px-2 text-xs text-ink"
                  aria-label="开始日期"
                />
                <span>至</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="h-8 rounded-md border border-line-strong bg-panel px-2 text-xs text-ink"
                  aria-label="结束日期"
                />
              </div>
            ) : null}

            {statsQuery.error ? (
              <ErrorState
                message={statsQuery.error.message}
                onRetry={() => {
                  void statsQuery.refetch()
                }}
              />
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <Metric label="总时长" value={formatDuration(stats?.totalSeconds ?? 0)} />
                  <Metric label="日均" value={formatDuration(stats?.averageSeconds ?? 0)} />
                  <Metric label="会话" value={`${stats?.sessionCount ?? 0} 次`} />
                  <Metric label="最长一次" value={formatDuration(stats?.longestSeconds ?? 0)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-xs text-ink-muted">
                    <span>
                      {range.from === range.to ? range.from : `${range.from} – ${range.to}`}
                    </span>
                    <span>{stats ? GRANULARITY_LABEL[stats.granularity] : ''}</span>
                  </div>

                  {stats && stats.totalSeconds > 0 ? (
                    <BucketChart buckets={stats.buckets} />
                  ) : (
                    <p className="py-8 text-center text-xs text-ink-muted">
                      这段时间还没有计时记录
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* 今日记录 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-ink">今日记录</h2>
              <span className="text-xs text-ink-subtle">{sessions.length} 段</span>
            </div>

            {sessionsQuery.error ? (
              <ErrorState
                message={sessionsQuery.error.message}
                onRetry={() => {
                  void sessionsQuery.refetch()
                }}
              />
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={Timer}
                title="今天还没有计时记录"
                description="点上面的「开始计时」，结束时会自动生成一条记录。"
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-panel">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="tabular text-sm text-ink">
                        {clockLabel(session.startedAt)}
                        {session.endedAt ? ` – ${clockLabel(session.endedAt)}` : ''}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-sm border px-1 py-px text-[10px] leading-normal',
                          session.endReason === 'crashed' || session.endReason === 'suspend'
                            ? 'border-warn/40 bg-warn-soft text-warn'
                            : 'border-line-strong bg-panel-sunken text-ink-muted',
                        )}
                      >
                        {endReasonLabel(session.endReason)}
                      </span>
                    </div>
                    <span className="tabular shrink-0 text-sm text-ink-secondary">
                      {formatDuration(session.durationSeconds)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
