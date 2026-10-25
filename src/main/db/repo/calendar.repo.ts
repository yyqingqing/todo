import type { DatabaseSync } from 'node:sqlite'
import { computeProgress } from '@shared/domain/progress'
import type { CalendarDay, CalendarPlan, MonthView, PlanNode } from '@shared/types'
import { all } from '../sql'
import { listPlanTree } from './plan.repo'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
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

  // 颜色按根计划序号分配（与时间线一致）：同一棵树同色。
  // 不用分类色 —— 未分类的计划会全部兜底成第一个颜色，几个不相干的计划看起来像同一条线。
  const roots = listPlanTree(db)
  const plans: CalendarPlan[] = []

  roots.forEach((root, rootIndex) => {
    const walk = (node: PlanNode): void => {
      const inRange = node.status === 'active' && node.startDate <= last && node.endDate >= first
      if (inRange) {
        plans.push({
          id: node.id,
          parentId: node.parentId,
          rootIndex,
          title: node.title,
          startDate: node.startDate,
          endDate: node.endDate,
          progress: computeProgress(node.stats),
        })
      }
      // 即使父计划不在本月范围内，子计划也可能在，所以继续往下走
      node.children.forEach(walk)
    }
    walk(root)
  })

  return { year, month, days, plans }
}
