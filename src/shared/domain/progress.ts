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
 * 现在不启用，因为 task.est_minutes 允许为空，没填的话会算出 0，
 * 用户会觉得进度条坏了。等阶段 2 之后有"补全工时"的引导再打开。
 */
export const byEstimatedMinutes: ProgressStrategy = {
  key: 'est_minutes',
  label: '按预估工时',
  compute: ({ taskTotal, taskDone }) => (taskTotal === 0 ? 0 : taskDone / taskTotal),
}

export const STRATEGIES: Readonly<Record<string, ProgressStrategy>> = {
  [byTaskCount.key]: byTaskCount,
  [byEstimatedMinutes.key]: byEstimatedMinutes,
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
