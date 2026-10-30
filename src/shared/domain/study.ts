/**
 * 学习时长的纯函数。
 *
 * 这里只处理"时间区间"和"本地日历日"，不碰数据库、不碰 Electron、不碰 React ——
 * 输入是 UTC ISO 时间戳，输出是按本地日切分后的秒数，所以可以单测。
 *
 * 为什么切分必须在这里做：一个会话可能从 23:30 学到 00:30，两天的统计各算 30 分钟。
 * 拿字符串切日期、或者假设一天 86400 秒，都会在这种边界上算错（还有夏令时）。
 */
import type { StudyBucket, StudyGranularity, StudyStats } from '../types'

export interface StudySpan {
  id?: string
  /** UTC ISO */
  startedAt: string
  /** UTC ISO；进行中的会话不进统计，所以这里正常都有值 */
  endedAt: string | null
  durationSeconds: number
}

export interface DaySlice {
  /** 本地日历日 YYYY-MM-DD */
  date: string
  seconds: number
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 毫秒时间戳 -> 本地日历日 */
export function localDateOf(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 本地某一天的 0 点（毫秒）。用 Date 构造而不是 86400 倍数：夏令时那天不是 24 小时 */
export function localDayStartMs(dateStr: string): number {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

/** 按本地日历日加减 */
export function addDaysLocal(dateStr: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number)
  // 取目标日中午再取日期：夏令时可能把 0 点挪到前一天 23 点或当天 1 点
  return localDateOf(new Date(year, month - 1, day + days, 12).getTime())
}

/** 两个本地日期之间相差多少天（闭区间含首尾） */
export function daysBetween(from: string, to: string): number {
  const diff = localDayStartMs(to) - localDayStartMs(from)
  return Math.max(1, Math.round(diff / (24 * 60 * 60 * 1000)) + 1)
}

/** ISO 周的周一 */
export function startOfWeek(dateStr: string): string {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  // JS 里 0 是周日；转成「周一 = 0」
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return localDateOf(date.getTime())
}

/** ISO 周序号（周四所在的那一年决定跨年周的归属） */
function isoWeekOf(dateStr: string): { year: number; week: number } {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const thursday = new Date(date)
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)

  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)

  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return { year: thursday.getFullYear(), week }
}

/**
 * 把一个会话切成「本地日期 -> 秒数」。
 *
 * 逐日推进而不是按 24 小时整除：跨夏令时的那一天可能是 23 或 25 小时。
 * 不足一秒的余数直接丢掉 —— 统计精度到秒，不需要毫秒级误差。
 */
export function splitByLocalDay(startedAtMs: number, endedAtMs: number): DaySlice[] {
  const slices: DaySlice[] = []
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs <= startedAtMs) {
    return slices
  }

  let cursor = startedAtMs
  while (cursor < endedAtMs) {
    const date = localDateOf(cursor)
    const nextDayStart = localDayStartMs(addDaysLocal(date, 1))
    const end = Math.min(endedAtMs, nextDayStart)
    const seconds = Math.floor((end - cursor) / 1000)
    if (seconds > 0) slices.push({ date, seconds })
    cursor = end
  }

  return slices
}

function emptyBucket(granularity: StudyGranularity, startDate: string): StudyBucket {
  if (granularity === 'day') {
    return { key: startDate, label: startDate.slice(5), seconds: 0, sessionCount: 0 }
  }
  if (granularity === 'week') {
    const { year, week } = isoWeekOf(startDate)
    return { key: `${year}-W${pad2(week)}`, label: `W${pad2(week)}`, seconds: 0, sessionCount: 0 }
  }
  const month = Number(startDate.slice(5, 7))
  return { key: startDate.slice(0, 7), label: `${month}月`, seconds: 0, sessionCount: 0 }
}

/**
 * 统计主入口。
 *
 * 先按天累计（含跨天切分），再按粒度合并成桶 —— 两层分开的好处是
 * "跨天怎么算"只有 splitByLocalDay 一处实现，周/月只是在它上面做加法。
 */
export function computeStudyStats(
  spans: readonly StudySpan[],
  from: string,
  to: string,
  granularity: StudyGranularity,
): StudyStats {
  const rangeStart = localDayStartMs(from)
  const rangeEnd = localDayStartMs(addDaysLocal(to, 1))

  const secondsByDay = new Map<string, number>()
  const sessionsByDay = new Map<string, Set<string>>()

  let totalSeconds = 0
  let sessionCount = 0
  let longestSeconds = 0

  for (const [index, span] of spans.entries()) {
    const startedAt = Date.parse(span.startedAt)
    const endedAt = span.endedAt ? Date.parse(span.endedAt) : Number.NaN
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) continue
    if (endedAt <= rangeStart || startedAt >= rangeEnd) continue

    const slices = splitByLocalDay(Math.max(startedAt, rangeStart), Math.min(endedAt, rangeEnd))
    if (slices.length === 0) continue

    const spanId = span.id ?? `span-${index}`
    let spanSeconds = 0
    for (const slice of slices) {
      spanSeconds += slice.seconds
      secondsByDay.set(slice.date, (secondsByDay.get(slice.date) ?? 0) + slice.seconds)
      const daySessions = sessionsByDay.get(slice.date) ?? new Set<string>()
      daySessions.add(spanId)
      sessionsByDay.set(slice.date, daySessions)
    }

    totalSeconds += spanSeconds
    sessionCount += 1
    longestSeconds = Math.max(longestSeconds, spanSeconds)
  }

  const buckets: StudyBucket[] = []

  /** 把 [startDate, endDate] 这些天的秒数和会话数并进一个桶 */
  const collect = (
    startDate: string,
    endDate: string,
  ): Pick<StudyBucket, 'seconds' | 'sessionCount'> => {
    let seconds = 0
    const sessions = new Set<string>()
    let cursor = startDate
    while (cursor <= endDate) {
      seconds += secondsByDay.get(cursor) ?? 0
      for (const id of sessionsByDay.get(cursor) ?? []) sessions.add(id)
      cursor = addDaysLocal(cursor, 1)
    }
    return { seconds, sessionCount: sessions.size }
  }

  if (granularity === 'day') {
    let cursor = from
    while (cursor <= to) {
      buckets.push({ ...emptyBucket('day', cursor), ...collect(cursor, cursor) })
      cursor = addDaysLocal(cursor, 1)
    }
  } else if (granularity === 'week') {
    let weekStart = startOfWeek(from)
    while (weekStart <= to) {
      const weekEnd = addDaysLocal(weekStart, 6)
      const bucket = emptyBucket('week', weekStart)
      buckets.push({
        ...bucket,
        ...collect(weekStart < from ? from : weekStart, weekEnd > to ? to : weekEnd),
      })
      weekStart = addDaysLocal(weekStart, 7)
    }
  } else {
    const [fromYear = 1970, fromMonth = 1] = from.split('-').map(Number)
    const [toYear = 1970, toMonth = 1] = to.split('-').map(Number)
    let year = fromYear
    let month = fromMonth

    while (year < toYear || (year === toYear && month <= toMonth)) {
      const monthStart = `${year}-${pad2(month)}-01`
      const nextMonthStart = month === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month + 1)}-01`
      const monthEnd = addDaysLocal(nextMonthStart, -1)
      const bucket = emptyBucket('month', monthStart)
      buckets.push({
        ...bucket,
        ...collect(monthStart < from ? from : monthStart, monthEnd > to ? to : monthEnd),
      })

      month += 1
      if (month > 12) {
        month = 1
        year += 1
      }
    }
  }

  return {
    from,
    to,
    granularity,
    totalSeconds,
    sessionCount,
    longestSeconds,
    averageSeconds: Math.round(totalSeconds / daysBetween(from, to)),
    buckets,
  }
}

/** 按区间长度自动选粒度：柱子太多就没法看了 */
export function pickGranularity(from: string, to: string): StudyGranularity {
  const days = daysBetween(from, to)
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

/* ------------------------------------------------------------------ */
/* 展示与裁剪                                                          */
/* ------------------------------------------------------------------ */

/** 两个时间区间重叠的秒数。没有交集、或参数反了，都返回 0 */
export function overlapSeconds(
  fromMs: number,
  toMs: number,
  rangeFromMs: number,
  rangeToMs: number,
): number {
  const start = Math.max(fromMs, rangeFromMs)
  const end = Math.min(toMs, rangeToMs)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.floor((end - start) / 1000))
}

/** HH:MM:SS，计时器大字用。超过 99 小时不截断，直接往前进位 */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return [hours, minutes, rest].map((value) => pad2(value)).join(':')
}

/** 人类可读时长："35 秒" / "12 分钟" / "1 小时 20 分" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return `${seconds} 秒`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}

/** 结束原因的中文标签。明细列表用，异常结束要能一眼看出来 */
export function endReasonLabel(reason: 'manual' | 'quit' | 'suspend' | 'crashed'): string {
  switch (reason) {
    case 'manual':
      return '手动结束'
    case 'quit':
      return '应用退出'
    case 'suspend':
      return '系统休眠'
    case 'crashed':
      return '异常结束'
  }
}
