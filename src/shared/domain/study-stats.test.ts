import { describe, expect, it } from 'vitest'
import { computeStudyStats, pickGranularity, splitByLocalDay, startOfWeek } from './study'

const at = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
  new Date(year, month - 1, day, hour, minute).getTime()

const iso = (ms: number): string => new Date(ms).toISOString()

describe('splitByLocalDay', () => {
  it('跨零点切成两段，各算一半', () => {
    expect(splitByLocalDay(at(2026, 10, 30, 23, 30), at(2026, 10, 31, 0, 30))).toEqual([
      { date: '2026-10-30', seconds: 1800 },
      { date: '2026-10-31', seconds: 1800 },
    ])
  })

  it('同一天内不切', () => {
    expect(splitByLocalDay(at(2026, 10, 30, 9), at(2026, 10, 30, 10))).toEqual([
      { date: '2026-10-30', seconds: 3600 },
    ])
  })

  it('零长度和反序都返回空', () => {
    expect(splitByLocalDay(at(2026, 10, 30, 9), at(2026, 10, 30, 9))).toEqual([])
    expect(splitByLocalDay(at(2026, 10, 30, 10), at(2026, 10, 30, 9))).toEqual([])
  })

  it('跨多天时每天各一段', () => {
    const slices = splitByLocalDay(at(2026, 10, 29, 22), at(2026, 11, 1, 2))
    expect(slices.map((slice) => slice.date)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(slices.reduce((sum, slice) => sum + slice.seconds, 0)).toBe(52 * 3600)
  })
})

describe('startOfWeek', () => {
  it('周一是本周第一天', () => {
    // 2026-10-30 是周五，所在周的周一是 10-26
    expect(startOfWeek('2026-10-30')).toBe('2026-10-26')
    expect(startOfWeek('2026-10-26')).toBe('2026-10-26')
    // 周日算上一周
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26')
  })
})

describe('computeStudyStats', () => {
  const crossMidnight = [
    {
      id: 'a',
      startedAt: iso(at(2026, 10, 30, 23, 30)),
      endedAt: iso(at(2026, 10, 31, 0, 30)),
      durationSeconds: 3600,
    },
  ]

  it('日粒度：跨零点会话分到两天各 30 分钟', () => {
    const stats = computeStudyStats(crossMidnight, '2026-10-30', '2026-10-31', 'day')
    expect(stats.totalSeconds).toBe(3600)
    expect(stats.buckets.map((bucket) => [bucket.key, bucket.seconds])).toEqual([
      ['2026-10-30', 1800],
      ['2026-10-31', 1800],
    ])
    expect(stats.sessionCount).toBe(1)
    expect(stats.longestSeconds).toBe(3600)
  })

  it('日粒度：区间内没有记录的日子补 0', () => {
    const stats = computeStudyStats(crossMidnight, '2026-10-29', '2026-11-01', 'day')
    expect(stats.buckets.map((bucket) => bucket.seconds)).toEqual([0, 1800, 1800, 0])
  })

  it('周粒度：同一周合并成一个桶', () => {
    const spans = [
      {
        id: 'a',
        startedAt: iso(at(2026, 10, 26, 9)),
        endedAt: iso(at(2026, 10, 26, 10)),
        durationSeconds: 3600,
      },
      {
        id: 'b',
        startedAt: iso(at(2026, 10, 30, 9)),
        endedAt: iso(at(2026, 10, 30, 10, 30)),
        durationSeconds: 5400,
      },
      {
        id: 'c',
        startedAt: iso(at(2026, 11, 1, 9)),
        endedAt: iso(at(2026, 11, 1, 10)),
        durationSeconds: 3600,
      },
    ]
    // 10-26 ~ 11-01 是同一个 ISO 周
    const stats = computeStudyStats(spans, '2026-10-26', '2026-11-01', 'week')
    expect(stats.buckets).toHaveLength(1)
    expect(stats.buckets[0]?.seconds).toBe(3600 + 5400 + 3600)
    expect(stats.buckets[0]?.sessionCount).toBe(3)
  })

  it('月粒度：跨月分成两个桶', () => {
    const spans = [
      {
        id: 'a',
        startedAt: iso(at(2026, 10, 31, 20)),
        endedAt: iso(at(2026, 10, 31, 22)),
        durationSeconds: 7200,
      },
      {
        id: 'b',
        startedAt: iso(at(2026, 11, 1, 8)),
        endedAt: iso(at(2026, 11, 1, 9)),
        durationSeconds: 3600,
      },
    ]
    const stats = computeStudyStats(spans, '2026-10-01', '2026-11-30', 'month')
    expect(stats.buckets.map((bucket) => [bucket.key, bucket.seconds])).toEqual([
      ['2026-10', 7200],
      ['2026-11', 3600],
    ])
  })

  it('只统计落在区间内的那部分', () => {
    // 会话从 10-29 22:00 到 10-30 02:00，只查 10-30 这一天
    const spans = [
      {
        id: 'a',
        startedAt: iso(at(2026, 10, 29, 22)),
        endedAt: iso(at(2026, 10, 30, 2)),
        durationSeconds: 4 * 3600,
      },
    ]
    const stats = computeStudyStats(spans, '2026-10-30', '2026-10-30', 'day')
    expect(stats.totalSeconds).toBe(2 * 3600)
    expect(stats.longestSeconds).toBe(2 * 3600)
  })

  it('日均按区间天数算，不是按有记录的天数', () => {
    const spans = [
      {
        id: 'a',
        startedAt: iso(at(2026, 10, 30, 9)),
        endedAt: iso(at(2026, 10, 30, 10)),
        durationSeconds: 3600,
      },
    ]
    const stats = computeStudyStats(spans, '2026-10-29', '2026-10-30', 'day')
    expect(stats.averageSeconds).toBe(1800)
  })
})

describe('pickGranularity', () => {
  it('短区间按天、中区间按周、长区间按月', () => {
    expect(pickGranularity('2026-10-01', '2026-10-31')).toBe('day')
    expect(pickGranularity('2026-01-01', '2026-04-01')).toBe('week')
    expect(pickGranularity('2026-01-01', '2026-12-31')).toBe('month')
  })
})
