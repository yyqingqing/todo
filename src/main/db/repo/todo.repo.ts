import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { TodoCreateInput, TodoWithPlan } from '@shared/types'
import { all, get, transaction } from '../sql'
import { saveTask } from './task.repo'

/**
 * 带上归属计划名与分类色。
 *
 * 清单里必须能看出"这条是计划里的任务，还是临时想起来的事"：
 * 前者在推进某个长期计划，后者只是一次性的事，两者的心理权重完全不同。
 */
const TODO_SELECT = `
  SELECT
    ti.id, ti.task_id AS taskId, ti.title,
    ti.scheduled_date AS scheduledDate, ti.origin_date AS originDate,
    ti.status, ti.completed_at AS completedAt, ti.rollover_count AS rolloverCount,
    ti.sort_order AS sortOrder, ti.created_at AS createdAt, ti.updated_at AS updatedAt,
    p.title AS planTitle,
    c.color AS planColor
  FROM todo_item ti
  LEFT JOIN task t ON t.id = ti.task_id
  LEFT JOIN plan p ON p.id = t.plan_id
  LEFT JOIN category c ON c.id = p.category_id
`

export function getTodo(db: DatabaseSync, id: string): TodoWithPlan | null {
  return get<TodoWithPlan>(db, `${TODO_SELECT} WHERE ti.id = ?`, [id]) ?? null
}

export function listTodosByDate(db: DatabaseSync, date: string): TodoWithPlan[] {
  return all<TodoWithPlan>(
    db,
    `${TODO_SELECT} WHERE ti.scheduled_date = ? ORDER BY ti.sort_order ASC, ti.created_at ASC`,
    [date],
  )
}

/**
 * 新建一条待办。
 * origin_date 与 scheduled_date 同时设成今天 —— 之后顺延只改 scheduled_date，
 * origin_date 是"最初打算哪天做"的凭证，不能动。
 */
export function createTodo(db: DatabaseSync, input: TodoCreateInput): TodoWithPlan {
  const title = input.title.trim()
  if (title.length === 0) throw new Error('待办内容不能为空')

  let taskId = input.taskId ?? null

  // 指定了归属计划但没指定具体任务：在该计划下建一个同名任务再关联。
  // 这样完成这条待办时计划进度会跟着涨 —— 用户选计划就是希望「这件事推进那个计划」。
  if (taskId === null && input.planId) {
    const created = saveTask(db, { planId: input.planId, title })
    taskId = created.id
  }

  if (taskId !== null) {
    // task_id 上有 UNIQUE 约束，这里提前给中文提示，否则用户看到的是 SQLite 的英文报错
    const existing = get<{ id: string }>(db, 'SELECT id FROM todo_item WHERE task_id = ?', [taskId])
    if (existing) throw new Error('这个任务已经在清单里了')
  }

  const nextOrder =
    get<{ next: number }>(
      db,
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todo_item WHERE scheduled_date = ?',
      [input.scheduledDate],
    )?.next ?? 0

  const id = randomUUID()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO todo_item
       (id, task_id, title, scheduled_date, origin_date, status, rollover_count, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
  ).run(id, taskId, title, input.scheduledDate, input.scheduledDate, nextOrder, now, now)

  return getTodo(db, id) as TodoWithPlan
}

/**
 * 切换完成状态。
 *
 * 用"切换"而不是分开的 complete/uncomplete：界面只有一个复选框，
 * 两个方法会让调用方必须自己判断当前状态，多一处可能不同步的地方。
 */
export function toggleTodo(db: DatabaseSync, id: string): TodoWithPlan {
  const current = getTodo(db, id)
  if (!current) throw new Error('待办不存在')
  if (current.status === 'dropped') throw new Error('已放弃的待办不能标记完成')

  const now = new Date().toISOString()

  if (current.status === 'done') {
    db.prepare(
      "UPDATE todo_item SET status = 'pending', completed_at = NULL, updated_at = ? WHERE id = ?",
    ).run(now, id)
  } else {
    db.prepare(
      "UPDATE todo_item SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?",
    ).run(now, now, id)
  }

  return getTodo(db, id) as TodoWithPlan
}

export function removeTodo(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM todo_item WHERE id = ?').run(id)
}

/**
 * 顺延到指定日期。
 *
 * 三条规则，每条都有原因：
 * 1. 只动 scheduled_date，**永远不改 origin_date** —— 否则"拖延了几天"这个统计就没了
 * 2. 每次顺延都写一条 rollover_log —— 光有计数器无法回答"从哪天挪到哪天"
 * 3. 只处理 pending；已完成/已放弃的跳过，不报错 —— 批量操作里混入一条完成项是常态
 *
 * 返回实际顺延的条数，供界面反馈"顺延了几条"。
 */
export function rolloverTodos(db: DatabaseSync, ids: string[], targetDate: string): number {
  const now = new Date().toISOString()

  return transaction(db, () => {
    let moved = 0

    for (const id of ids) {
      const todo = getTodo(db, id)
      // 分成两个 if 而不是合并成 `!todo || ...`：合并后 TS 无法把 todo 收窄成非空
      if (!todo) continue
      if (todo.status !== 'pending') continue
      if (todo.scheduledDate === targetDate) continue

      db.prepare(
        `UPDATE todo_item
         SET scheduled_date = ?, rollover_count = rollover_count + 1, updated_at = ?
         WHERE id = ?`,
      ).run(targetDate, now, id)

      db.prepare(
        `INSERT INTO rollover_log (id, todo_item_id, from_date, to_date, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(randomUUID(), id, todo.scheduledDate, targetDate, now)

      moved += 1
    }

    return moved
  })
}
