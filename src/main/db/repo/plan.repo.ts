import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Plan, PlanDetail, PlanInput, PlanNode, PlanStats } from '@shared/types'
import { all, get } from '../sql'
import { getCategory } from './category.repo'
import { listTasksByPlan } from './task.repo'

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

/** 单个计划（不含统计），用于详情页头部与表单回填 */
export function getPlan(db: DatabaseSync, id: string): Plan | null {
  return get<Plan>(db, `${PLAN_SELECT} WHERE id = ?`, [id]) ?? null
}

function findNode(nodes: readonly PlanNode[], id: string): PlanNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/**
 * 计划详情。
 * 复用 listPlanTree 的统计逻辑：stats 必须包含所有后代，
 * 另写一套聚合必然算出第二个口径。
 */
export function getPlanDetail(db: DatabaseSync, id: string): PlanDetail | null {
  const node = findNode(listPlanTree(db), id)
  if (!node) return null

  return {
    plan: {
      id: node.id,
      parentId: node.parentId,
      categoryId: node.categoryId,
      title: node.title,
      note: node.note,
      startDate: node.startDate,
      endDate: node.endDate,
      status: node.status,
      sortOrder: node.sortOrder,
      completedAt: node.completedAt,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    },
    category: node.categoryId ? getCategory(db, node.categoryId) : null,
    stats: node.stats,
    tasks: listTasksByPlan(db, id),
    childPlans: node.children,
  }
}

/** 沿 parentId 向上走，判断把 parentId 设成 candidate 会不会成环 */
function wouldCreateCycle(db: DatabaseSync, id: string, candidateParentId: string | null): boolean {
  let cursor = candidateParentId
  const seen = new Set<string>()

  while (cursor) {
    if (cursor === id) return true
    if (seen.has(cursor)) return true
    seen.add(cursor)
    cursor =
      get<{ parentId: string | null }>(db, 'SELECT parent_id AS parentId FROM plan WHERE id = ?', [
        cursor,
      ])?.parentId ?? null
  }

  return false
}

export function savePlan(db: DatabaseSync, input: PlanInput): Plan {
  const title = input.title.trim()
  if (title.length === 0) throw new Error('计划标题不能为空')
  if (input.startDate > input.endDate) throw new Error('结束日期不能早于开始日期')

  const now = new Date().toISOString()
  const note = input.note?.trim() ?? null

  if (input.id) {
    if (wouldCreateCycle(db, input.id, input.parentId)) {
      throw new Error('不能把计划移动到它自己或它的子计划下面')
    }
    if (!getPlan(db, input.id)) throw new Error('计划不存在')

    db.prepare(
      `UPDATE plan
       SET parent_id = ?, category_id = ?, title = ?, note = ?,
           start_date = ?, end_date = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.parentId,
      input.categoryId,
      title,
      note,
      input.startDate,
      input.endDate,
      now,
      input.id,
    )

    return getPlan(db, input.id) as Plan
  }

  const id = randomUUID()
  // parent_id 可能为 NULL，用 IS 而不是 = 才能匹配到顶级计划
  const nextOrder =
    get<{ next: number }>(
      db,
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM plan WHERE parent_id IS ?',
      [input.parentId],
    )?.next ?? 0

  db.prepare(
    `INSERT INTO plan
       (id, parent_id, category_id, title, note, start_date, end_date, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(
    id,
    input.parentId,
    input.categoryId,
    title,
    note,
    input.startDate,
    input.endDate,
    nextOrder,
    now,
    now,
  )

  return getPlan(db, id) as Plan
}

/**
 * 删除计划：子计划与任务靠外键 CASCADE 一起删除。
 * 已排期的 todo_item 会因 task 删除而 task_id 置 NULL，变成孤儿记录 —— 这是有意的：
 * 历史清单不该因为删计划就消失。
 */
export function removePlan(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM plan WHERE id = ?').run(id)
}
