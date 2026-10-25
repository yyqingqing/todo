/**
 * 积分规则。
 *
 * 分值全部集中在这里，不散落在各处 —— 调整规则是产品决策，不是散弹式改动。
 * 目前是常量而不是用户可配置项：先跑通闭环，规则个性化等有真实使用反馈再做。
 *
 * 设计意图：
 * - 按时完成 10 分 > 逾期完成 6 分：顺延是有成本的，否则「挪到明天」没有代价
 * - 全清奖励 20 分要「完成率 100% 且至少 3 条」：用绝对条数会诱导用户往清单里塞简单事项凑数
 */
export const SCORE_RULES = {
  /** 当天完成的待办 */
  todoDone: 10,
  /** 逾期后补完（scheduled_date 早于完成日） */
  todoLate: 6,
  /** 当日清单全部完成，且当天至少有这么多条才有资格 */
  dailyClear: 20,
  dailyClearMinItems: 3,
} as const

/** 流水里的 reason 取值。改字符串会让历史数据对不上，只能加不能改 */
export const SCORE_REASONS = {
  todoDone: 'todo_done',
  todoLate: 'todo_late',
  dailyClear: 'daily_clear',
  /** 取消完成时的冲正，points 为负 */
  revoke: 'revoke',
} as const

const REASON_LABELS: Readonly<Record<string, string>> = {
  [SCORE_REASONS.todoDone]: '完成今日待办',
  [SCORE_REASONS.todoLate]: '完成逾期待办',
  [SCORE_REASONS.dailyClear]: '当日清单全部完成',
  [SCORE_REASONS.revoke]: '取消完成',
}

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

/**
 * 完成的待办该得多少分。
 * 逾期判定看 scheduled_date 与完成日的关系，不看 origin_date ——
 * 顺延过的任务在原计划日就不该算「按时」了，但用户会期望按「实际安排的那天」算。
 */
export function todoDonePoints(scheduledDate: string, completedDate: string): number {
  return scheduledDate < completedDate ? SCORE_RULES.todoLate : SCORE_RULES.todoDone
}

export function todoDoneReason(scheduledDate: string, completedDate: string): string {
  return scheduledDate < completedDate ? SCORE_REASONS.todoLate : SCORE_REASONS.todoDone
}
