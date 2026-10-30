import { describe, expect, it } from 'vitest'
import { endReasonLabel, formatClock, formatDuration, overlapSeconds } from './study'

const at = (iso: string): number => Date.parse(iso)

describe('overlapSeconds', () => {
  it('完全落在区间内', () => {
    expect(
      overlapSeconds(
        at('2026-10-30T01:00:00Z'),
        at('2026-10-30T02:00:00Z'),
        at('2026-10-30T00:00:00Z'),
        at('2026-10-31T00:00:00Z'),
      ),
    ).toBe(3600)
  })

  it('跨零点只算区间内的那一段', () => {
    // 会话 23:30 - 00:30，只统计 23:30-24:00
    expect(
      overlapSeconds(
        at('2026-10-30T23:30:00Z'),
        at('2026-10-31T00:30:00Z'),
        at('2026-10-30T00:00:00Z'),
        at('2026-10-31T00:00:00Z'),
      ),
    ).toBe(1800)
  })

  it('完全在区间外返回 0', () => {
    expect(
      overlapSeconds(
        at('2026-10-29T01:00:00Z'),
        at('2026-10-29T02:00:00Z'),
        at('2026-10-30T00:00:00Z'),
        at('2026-10-31T00:00:00Z'),
      ),
    ).toBe(0)
  })

  it('分秒级重叠向下取整，不产生小数', () => {
    expect(overlapSeconds(1000, 2900, 0, 10_000)).toBe(1)
  })

  it('参数反了不产生负数', () => {
    expect(overlapSeconds(5000, 1000, 0, 10_000)).toBe(0)
  })
})

describe('formatClock', () => {
  it('补零到 HH:MM:SS', () => {
    expect(formatClock(0)).toBe('00:00:00')
    expect(formatClock(59)).toBe('00:00:59')
    expect(formatClock(3661)).toBe('01:01:01')
  })

  it('超过 99 小时继续进位', () => {
    expect(formatClock(360_000)).toBe('100:00:00')
  })
})

describe('formatDuration', () => {
  it('按量级切换单位', () => {
    expect(formatDuration(35)).toBe('35 秒')
    expect(formatDuration(12 * 60)).toBe('12 分钟')
    expect(formatDuration(80 * 60)).toBe('1 小时 20 分')
    expect(formatDuration(2 * 3600)).toBe('2 小时')
  })
})

describe('endReasonLabel', () => {
  it('异常结束有独立文案', () => {
    expect(endReasonLabel('crashed')).toBe('异常结束')
    expect(endReasonLabel('manual')).toBe('手动结束')
  })
})
