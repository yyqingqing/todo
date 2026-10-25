import type { DatabaseSync } from 'node:sqlite'
import { computeProgress } from '@shared/domain/progress'
import type { CalendarDay, CalendarPlan, MonthView, PlanNode } from '@shared/types'
import { all } from '../sql'
import { listPlanTree } from './plan.repo'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function flatten(nodes: readonly PlanNode[]): PlanNode[] {
  const result: PlanNode[] = []
  const walk = (list: readonly PlanNode[]): void => {
    for (const node of list) {
      result.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return result
}

/**
 * 月视图数据。
 *
 * 两段查询而不是一个巨大的 join：
 * 1. 每天完成情况（稀疏，只返回有待办的日期）
 * 2. 与本月有交集的计划（用于画跨度）
 *
 * 计划的进度复用 listPlanTree 的统计结果，不另算一套 —— 日历和计划页
 * 显示的百分比必须永远一致，否则用户会怀疑到底哪个是真的。
 */
export function getMonthView(db: DatabaseSync, year: number, month: number): MonthView {
  const daysInMonth = new Date(year, month, 0).getDate()
  const first = `${year}-${pad2(month)}-01`
  const last = `${year}-${pad2(month)}-${pad2(daysInMonth)}`

  const days = all<CalendarDay>(
    db,
    `SELECT
       scheduled_date AS date,
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
     FROM todo_item
     WHERE scheduled_date BETWEEN ? AND ? AND status != 'dropped'
     GROUP BY scheduled_date
     ORDER BY scheduled_date ASC`,
    [first, last],
  )

  const categoryColors = new Map(
    all<{ id: string; color: string }>(db, 'SELECT id, color FROM category').map((row) => [
      row.id,
      row.color,
    ]),
  )

  const plans: CalendarPlan[] = flatten(listPlanTree(db))
    .filter((plan) => plan.status === 'active' && plan.startDate <= last && plan.endDate >= first)
    .map((plan) => ({
      id: plan.id,
      title: plan.title,
      startDate: plan.startDate,
      endDate: plan.endDate,
      color: plan.categoryId ? (categoryColors.get(plan.categoryId) ?? null) : null,
      progress: computeProgress(plan.stats),
    }))

  return { year, month, days, plans }
}
