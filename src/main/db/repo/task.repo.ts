import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Task, TaskInput, TaskWithState } from '@shared/types'
import { all, get, transaction } from '../sql'

const TASK_SELECT = `
  SELECT
    id, plan_id AS planId, title, note, est_minutes AS estMinutes,
    status, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
  FROM task
`

interface TaskRow extends Omit<TaskWithState, 'done'> {
  done: number
  scheduledDate: string | null
}

/**
 * 某计划下的任务（不含子计划）。
 *
 * 完成态和排期日都来自 todo_item —— task 自身没有完成态，完成判定只有一个来源。
 * 用 LEFT JOIN 一次拿两个字段，避免再写一个 EXISTS 子查询。
 */
export function listTasksByPlan(db: DatabaseSync, planId: string): TaskWithState[] {
  const rows = all<TaskRow>(
    db,
    `SELECT
       t.id, t.plan_id AS planId, t.title, t.note, t.est_minutes AS estMinutes,
       t.status, t.sort_order AS sortOrder, t.created_at AS createdAt, t.updated_at AS updatedAt,
       ti.scheduled_date AS scheduledDate,
       CASE WHEN ti.status = 'done' THEN 1 ELSE 0 END AS done
     FROM task t
     LEFT JOIN todo_item ti ON ti.task_id = t.id
     WHERE t.plan_id = ? AND t.status = 'open'
     ORDER BY t.sort_order ASC, t.created_at ASC`,
    [planId],
  )

  return rows.map((row) => ({ ...row, done: row.done === 1 }))
}

export function getTask(db: DatabaseSync, id: string): TaskWithState | null {
  const row = get<TaskRow>(
    db,
    `SELECT
       t.id, t.plan_id AS planId, t.title, t.note, t.est_minutes AS estMinutes,
       t.status, t.sort_order AS sortOrder, t.created_at AS createdAt, t.updated_at AS updatedAt,
       ti.scheduled_date AS scheduledDate,
       CASE WHEN ti.status = 'done' THEN 1 ELSE 0 END AS done
     FROM task t
     LEFT JOIN todo_item ti ON ti.task_id = t.id
     WHERE t.id = ?`,
    [id],
  )
  return row ? { ...row, done: row.done === 1 } : null
}

export function saveTask(db: DatabaseSync, input: TaskInput): Task {
  const title = input.title.trim()
  if (title.length === 0) throw new Error('任务标题不能为空')

  const now = new Date().toISOString()
  const note = input.note?.trim() ?? null
  const estMinutes = input.estMinutes ?? null

  // 排期日必须落在计划区间内。
  // 界面用 date input 的 min/max 也限制了，但那是可绕过的 —— 数据层必须自己校验。
  if (!input.id && input.scheduledDate) {
    const plan = get<{ startDate: string; endDate: string }>(
      db,
      'SELECT start_date AS startDate, end_date AS endDate FROM plan WHERE id = ?',
      [input.planId],
    )
    if (!plan) throw new Error('计划不存在')
    if (input.scheduledDate < plan.startDate || input.scheduledDate > plan.endDate) {
      throw new Error(
        `排期日必须在计划区间内（${plan.startDate} 至 ${plan.endDate}）`,
      )
    }
  }

  if (input.id) {
    const existing = getTask(db, input.id)
    if (!existing) throw new Error('任务不存在')
    db.prepare(
      'UPDATE task SET title = ?, note = ?, est_minutes = ?, updated_at = ? WHERE id = ?',
    ).run(title, note, estMinutes, now, input.id)
    return getTask(db, input.id) as Task
  }

  const id = randomUUID()
  const nextOrder =
    get<{ next: number }>(
      db,
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM task WHERE plan_id = ?',
      [input.planId],
    )?.next ?? 0

  db.prepare(
    `INSERT INTO task (id, plan_id, title, note, est_minutes, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).run(id, input.planId, title, note, estMinutes, nextOrder, now, now)

  return getTask(db, id) as Task
}

/**
 * 删除任务。
 *
 * 同时删掉它「还没完成」的待办记录：
 * 任务都被删了，清单里还留着一条变成孤儿的条目，用户会以为删除没生效。
 *
 * 已经完成的待办保留 —— 那是历史，还关联着积分流水，删掉会让账本对不上。
 * 它会在清单里显示为没有归属计划的一条记录（title 快照还在）。
 */
export function removeTask(db: DatabaseSync, id: string): void {
  transaction(db, () => {
    db.prepare("DELETE FROM todo_item WHERE task_id = ? AND status = 'pending'").run(id)
    db.prepare('DELETE FROM task WHERE id = ?').run(id)
  })
}

/** 同级排序：按给定顺序重写 sort_order，整批放在一个事务里 */
export function reorderTasks(db: DatabaseSync, planId: string, orderedIds: string[]): void {
  transaction(db, () => {
    const statement = db.prepare('UPDATE task SET sort_order = ? WHERE id = ? AND plan_id = ?')
    orderedIds.forEach((id, index) => {
      statement.run(index, id, planId)
    })
  })
}

export { TASK_SELECT }
