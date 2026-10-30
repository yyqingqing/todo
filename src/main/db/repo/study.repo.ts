import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { StudyEndReason, StudySession } from '@shared/types'
import { all, transaction } from '../sql'

interface SessionRow {
  id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  end_reason: StudyEndReason
  plan_id: string | null
  category_id: string | null
}

const SELECT_COLUMNS = `id, started_at, ended_at, duration_seconds, end_reason, plan_id, category_id`

function toSession(row: SessionRow): StudySession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    endReason: row.end_reason,
    planId: row.plan_id,
    categoryId: row.category_id,
  }
}

/** 秒数差，负数（系统时间被回拨）一律按 0 处理 */
function secondsBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.floor((to - from) / 1000))
}

/**
 * 开一条计时记录。
 *
 * 先落库再开始计时：进程被强杀时数据库里必须已经有这一行，
 * 否则"开始过"这件事彻底消失，统计就少了一段。
 */
export function insertSession(db: DatabaseSync, startedAt: string): { id: string } {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO study_session
       (id, started_at, last_seen_at, ended_at, duration_seconds, status, end_reason, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 0, 'running', 'running', ?, ?)`,
  ).run(id, startedAt, startedAt, now, now)
  return { id }
}

/** 心跳。每 15 秒一次，崩溃时它就是最接近真实的结束时间 */
export function touchSession(db: DatabaseSync, id: string, at: string): void {
  db.prepare(
    `UPDATE study_session SET last_seen_at = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL`,
  ).run(at, at, id)
}

export function closeSession(
  db: DatabaseSync,
  id: string,
  input: { endedAt: string; durationSeconds: number; endReason: StudyEndReason },
): void {
  db.prepare(
    `UPDATE study_session
        SET ended_at = ?, duration_seconds = ?, status = 'stopped', end_reason = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    input.endedAt,
    Math.max(0, Math.floor(input.durationSeconds)),
    input.endReason,
    input.endedAt,
    id,
  )
}

/**
 * 回收上次没正常结束的会话。
 *
 * 正常停止/退出/休眠都会写 ended_at，所以这里扫到的就是「被强杀、断电、关机来不及写」
 * 那几种情况。结束时间取 last_seen_at 而不是当前时间 —— 否则关机后 8 小时会被算成学习。
 *
 * 返回回收的条数（正常启动时是 0）。
 */
export function recoverOpenSessions(db: DatabaseSync): number {
  return transaction(db, () => {
    const rows = all<{ id: string; started_at: string; last_seen_at: string }>(
      db,
      `SELECT id, started_at, last_seen_at FROM study_session
        WHERE ended_at IS NULL AND status = 'running'`,
    )

    const now = new Date().toISOString()
    for (const row of rows) {
      db.prepare(
        `UPDATE study_session
            SET ended_at = ?, duration_seconds = ?, status = 'stopped', end_reason = 'crashed', updated_at = ?
          WHERE id = ?`,
      ).run(row.last_seen_at, secondsBetween(row.started_at, row.last_seen_at), now, row.id)
    }

    return rows.length
  })
}

/**
 * 取与 [fromIso, toIso) 有交集的已结束会话，按开始时间倒序。
 * 跨零点的会话会完整返回，由调用方按需裁剪（统计口径在纯函数层）。
 */
export function listSessionsBetween(
  db: DatabaseSync,
  fromIso: string,
  toIso: string,
): StudySession[] {
  const rows = all<SessionRow>(
    db,
    `SELECT ${SELECT_COLUMNS} FROM study_session
      WHERE ended_at IS NOT NULL AND ended_at > ? AND started_at < ?
      ORDER BY started_at DESC`,
    [fromIso, toIso],
  )
  return rows.map(toSession)
}
