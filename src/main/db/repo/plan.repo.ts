import type { DatabaseSync } from 'node:sqlite'
import type { Plan, PlanNode, PlanStats } from '@shared/types'
import { all } from '../sql'

interface PlanRow {
  id: string
  parentId: string | null
  categoryId: string | null
  title: string
  note: string | null
  startDate: string
  endDate: string
  status: Plan['status']
  sortOrder: number
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

const PLAN_SELECT = `
  SELECT
    id, parent_id AS parentId, category_id AS categoryId, title, note,
    start_date AS startDate, end_date AS endDate, status,
    sort_order AS sortOrder, completed_at AS completedAt,
    created_at AS createdAt, updated_at AS updatedAt
  FROM plan
`

/**
 * 取完整计划树。
 *
 * 数据量是个人级（几千行），直接在应用层建树：比递归 CTE 好读，改起来也便宜。
 * 真到数据量撑不住再换闭包表，不值得现在优化。
 */
export function listPlanTree(db: DatabaseSync): PlanNode[] {
  const rows = all<PlanRow>(db, `${PLAN_SELECT} ORDER BY sort_order ASC, created_at ASC`)
  if (rows.length === 0) return []

  const statsByPlan = loadStatsByPlan(db)
  const nodeById = new Map<string, PlanNode>()

  for (const row of rows) {
    nodeById.set(row.id, { ...row, children: [], stats: { taskTotal: 0, taskDone: 0 } })
  }

  const roots: PlanNode[] = []
  for (const node of nodeById.values()) {
    const parent = node.parentId === null ? undefined : nodeById.get(node.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  // 自底向上累加：父计划的 stats 由所有后代汇总，不单独加权。
  // 否则会出现"父 50% + 子 50% = 75%"这种没人能解释的数字。
  const accumulate = (node: PlanNode): PlanStats => {
    const own = statsByPlan.get(node.id) ?? { taskTotal: 0, taskDone: 0 }
    let taskTotal = own.taskTotal
    let taskDone = own.taskDone

    for (const child of node.children) {
      const childStats = accumulate(child)
      taskTotal += childStats.taskTotal
      taskDone += childStats.taskDone
    }

    node.stats = { taskTotal, taskDone }
    return node.stats
  }

  for (const root of roots) accumulate(root)
  return roots
}

/**
 * 每个计划"直属任务"的完成情况。
 * 完成判定来自 todo_item，因为 task 自身没有 done 状态 —— 完成态只有一个来源。
 * 已归档（放弃）的任务不计入分母。
 */
function loadStatsByPlan(db: DatabaseSync): Map<string, PlanStats> {
  const rows = all<{ planId: string; taskTotal: number; taskDone: number }>(
    db,
    `SELECT
       t.plan_id AS planId,
       COUNT(*) AS taskTotal,
       SUM(CASE WHEN ti.status = 'done' THEN 1 ELSE 0 END) AS taskDone
     FROM task t
     LEFT JOIN todo_item ti ON ti.task_id = t.id
     WHERE t.status = 'open'
     GROUP BY t.plan_id`,
  )

  const map = new Map<string, PlanStats>()
  for (const row of rows) {
    map.set(row.planId, { taskTotal: row.taskTotal, taskDone: row.taskDone })
  }
  return map
}
