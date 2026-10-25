import type { PlanStats } from '../types'

/**
 * 计划完成度计算。
 *
 * 用策略对象而不是直接写 `done / total`：用户暂时按任务数算，但后面可能换成
 * 按预估工时、按子计划权重。加一种算法 = 往 STRATEGIES 里加一个对象，
 * 调用方和 UI 一行都不用改（开闭原则的落点之一）。
 */
export interface ProgressStrategy {
  key: string
  label: string
  compute(stats: PlanStats): number
}

/** 按任务数：完成 3 / 共 8 = 0.375 */
export const byTaskCount: ProgressStrategy = {
  key: 'task_count',
  label: '按任务数',
  compute: ({ taskTotal, taskDone }) => (taskTotal === 0 ? 0 : taskDone / taskTotal),
}

/**
 * 预留：按预估工时加权。
 *
 * 暂时不实现，也不注册到 STRATEGIES —— 一个「逻辑和按任务数一样、只是 key 不同」的
 * 空壳策略比没有更糟：万一被启用，用户会以为进度是按工时算的，实际完全不是。
 * 真要做的时候在这里实现，并保证 task.est_minutes 为空时有明确回退。
 */

export const STRATEGIES: Readonly<Record<string, ProgressStrategy>> = {
  [byTaskCount.key]: byTaskCount,
}

export const DEFAULT_STRATEGY = byTaskCount.key

export function computeProgress(stats: PlanStats, strategyKey: string = DEFAULT_STRATEGY): number {
  const strategy = STRATEGIES[strategyKey] ?? byTaskCount
  // 夹到 [0, 1]，防止脏数据把进度条画到容器外
  return Math.min(1, Math.max(0, strategy.compute(stats)))
}

/** 百分比整数，用于展示（37.5% 显示为 38%） */
export function progressPercent(stats: PlanStats, strategyKey?: string): number {
  return Math.round(computeProgress(stats, strategyKey) * 100)
}
