import { describe, expect, it } from 'vitest'
import {
  byTaskCount,
  computeProgress,
  DEFAULT_STRATEGY,
  progressPercent,
  STRATEGIES,
} from './progress'

describe('byTaskCount', () => {
  it('没有任务时是 0，不是 NaN', () => {
    // 0/0 是 NaN，会让进度条宽度变成 "NaN%" 直接不渲染
    expect(byTaskCount.compute({ taskTotal: 0, taskDone: 0 })).toBe(0)
  })

  it('完成一半是 0.5', () => {
    expect(byTaskCount.compute({ taskTotal: 8, taskDone: 4 })).toBe(0.5)
  })

  it('全部完成是 1', () => {
    expect(byTaskCount.compute({ taskTotal: 3, taskDone: 3 })).toBe(1)
  })
})

describe('computeProgress', () => {
  it('默认策略是按任务数', () => {
    expect(DEFAULT_STRATEGY).toBe(byTaskCount.key)
    expect(computeProgress({ taskTotal: 4, taskDone: 1 })).toBe(0.25)
  })

  it('未知策略回落到默认，不抛错', () => {
    // 策略 key 存在 settings 里，老版本可能存着已经删掉的 key
    expect(computeProgress({ taskTotal: 4, taskDone: 2 }, 'no_such_strategy')).toBe(0.5)
  })

  it('脏数据被夹到 [0, 1]，不画到容器外', () => {
    expect(computeProgress({ taskTotal: 3, taskDone: 5 })).toBe(1)
    expect(computeProgress({ taskTotal: 3, taskDone: -2 })).toBe(0)
  })

  it('每个注册的策略都不产生 NaN 或越界值', () => {
    const stats = [
      { taskTotal: 0, taskDone: 0 },
      { taskTotal: 1, taskDone: 0 },
      { taskTotal: 7, taskDone: 3 },
      { taskTotal: 2, taskDone: 2 },
    ]
    for (const key of Object.keys(STRATEGIES)) {
      for (const item of stats) {
        const value = computeProgress(item, key)
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('progressPercent', () => {
  it('四舍五入到整数', () => {
    expect(progressPercent({ taskTotal: 8, taskDone: 3 })).toBe(38)
  })

  it('0 和 100 是精确的，不会因为浮点误差变成 99', () => {
    expect(progressPercent({ taskTotal: 10, taskDone: 0 })).toBe(0)
    expect(progressPercent({ taskTotal: 10, taskDone: 10 })).toBe(100)
  })

  it('三分之一不会显示成 33.33', () => {
    expect(progressPercent({ taskTotal: 3, taskDone: 1 })).toBe(33)
  })
})
