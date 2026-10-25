import type { DatabaseSync } from 'node:sqlite'
import { SCORE_REASONS, SCORE_RULES, todoDonePoints, todoDoneReason } from '@shared/domain/score'
import type { TodoWithPlan } from '@shared/types'
import { getNetScore, insertScore } from '../db/repo/score.repo'
import { getTodo, toggleTodo } from '../db/repo/todo.repo'
import { get, transaction } from '../db/sql'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 切换待办完成状态，并在同一个事务里记账。
 *
 * 为什么必须放一起：状态改了但流水没写（或反过来）会让账本永远对不上，
 * 而这种不一致没有任何办法事后修复 —— 你不知道当时到底是哪一步失败了。
 *
 * 用「切换」而不是分开的 complete/uncomplete：界面只有一个复选框，
 * 两个入口会让调用方必须自己判断当前状态，多一处可能不同步的地方。
 */
export function toggleTodoWithScore(db: DatabaseSync, id: string): TodoWithPlan {
  return transaction(db, () => {
    const before = getTodo(db, id)
    if (!before) throw new Error('待办不存在')

    const after = toggleTodo(db, id)

    const now = new Date()
    const today = toDateString(now)
    const occurredAt = now.toISOString()

    if (after.status === 'done') {
      insertScore(db, {
        sourceType: 'todo',
        sourceId: after.id,
        reason: todoDoneReason(after.scheduledDate, today),
        points: todoDonePoints(after.scheduledDate, today),
        occurredAt,
        settledDate: today,
        title: after.title,
      })
      maybeAwardDailyClear(db, after.scheduledDate, occurredAt)
    } else {
      // 取消完成：按净分冲正，不删原记录。账本要能回答「这 10 分是怎么来的、又是怎么没的」
      const net = getNetScore(db, 'todo', after.id)
      if (net !== 0) {
        insertScore(db, {
          sourceType: 'todo',
          sourceId: after.id,
          reason: SCORE_REASONS.revoke,
          points: -net,
          occurredAt,
          settledDate: today,
          title: after.title,
        })
      }
    }

    return after
  })
}

/**
 * 当日清单全部完成时发一次性奖励。
 *
 * 用 unique_key 保证一天只发一次，所以「全清 → 取消一条 → 再全清」不会重复发奖。
 * 反过来的问题：取消一条之后奖励不会追回，账面上会留下 +20 -10 的净 +10。
 * 这是有意的取舍 —— 追回需要反向索引到那条 daily_clear，为这点精度不值得。
 */
function maybeAwardDailyClear(db: DatabaseSync, date: string, occurredAt: string): void {
  const stats = get<{ total: number; pending: number | null }>(
    db,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM todo_item
     WHERE scheduled_date = ? AND status != 'dropped'`,
    [date],
  )

  if (!stats) return
  if (stats.total < SCORE_RULES.dailyClearMinItems) return
  if ((stats.pending ?? 0) > 0) return

  // 当天有任务被顺延走，说明清单并没有真正清空 —— 只是把没做完的挪走了。
  // 没有这条判断，用户可以先顺延掉难的任务、再做完剩下的，稳定拿全清奖励，
  // 而"全清"本来要表达的是"今天的计划全部落地"。
  const rolledAway =
    get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM rollover_log WHERE from_date = ?', [
      date,
    ])?.count ?? 0
  if (rolledAway > 0) return

  insertScore(db, {
    sourceType: 'daily',
    sourceId: date,
    reason: SCORE_REASONS.dailyClear,
    points: SCORE_RULES.dailyClear,
    occurredAt,
    // 入账到清单所属的那一天，而不是「操作发生的那天」：
    // 第二天补勾昨天的清单，奖励仍应算在昨天
    settledDate: date,
    uniqueKey: `daily_clear:${date}`,
    title: null,
  })
}
