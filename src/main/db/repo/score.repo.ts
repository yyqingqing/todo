import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ScoreEntry, ScoreOverview } from '@shared/types'
import { all, get } from '../sql'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function todayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function shiftDate(dateStr: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export interface InsertScoreInput {
  sourceType: string
  sourceId: string
  reason: string
  /** 正数得分，负数冲正 */
  points: number
  occurredAt: string
  settledDate: string
  /** 一次性事件的业务键，如 `daily_clear:2026-10-25`；同键只会入账一次 */
  uniqueKey?: string | null
  /** 标题快照，写进 meta。待办改名后历史流水仍显示当时的标题 */
  title?: string | null
}

/**
 * 追加一条流水。
 *
 * 两套幂等键分工不同：
 * - event_id：防同一次操作被重复提交（双击 / 重试）
 * - unique_key：防一次性成就重复发奖（当日全清、计划完成）
 *
 * 用 INSERT OR IGNORE 而不是先查后插：唯一约束冲突时直接跳过，
 * 不会在并发/重试下冒出 UNIQUE constraint failed。
 */
export function insertScore(db: DatabaseSync, input: InsertScoreInput): void {
  const meta = input.title ? JSON.stringify({ title: input.title }) : null

  db.prepare(
    `INSERT OR IGNORE INTO score_ledger
       (id, event_id, unique_key, source_type, source_id, reason, points, occurred_at, settled_date, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    randomUUID(),
    input.uniqueKey ?? null,
    input.sourceType,
    input.sourceId,
    input.reason,
    input.points,
    input.occurredAt,
    input.settledDate,
    meta,
    new Date().toISOString(),
  )
}

/**
 * 某条来源当前的净得分。
 * 取消完成时按净分冲正，而不是删记录 —— 账本必须可追溯。
 */
export function getNetScore(db: DatabaseSync, sourceType: string, sourceId: string): number {
  return (
    get<{ net: number | null }>(
      db,
      'SELECT SUM(points) AS net FROM score_ledger WHERE source_type = ? AND source_id = ?',
      [sourceType, sourceId],
    )?.net ?? 0
  )
}

export function listRecentScores(db: DatabaseSync, limit: number): ScoreEntry[] {
  const rows = all<Omit<ScoreEntry, 'title'> & { meta: string | null }>(
    db,
    `SELECT
       id, source_type AS sourceType, source_id AS sourceId, reason, points,
       occurred_at AS occurredAt, settled_date AS settledDate, meta
     FROM score_ledger
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
  )

  return rows.map((row) => {
    let title: string | null = null
    if (row.meta) {
      try {
        const parsed = JSON.parse(row.meta) as { title?: string }
        title = parsed.title ?? null
      } catch {
        // meta 是坏数据就当作没有标题，不要让整个列表挂掉
      }
    }
    const { meta: _ignored, ...rest } = row
    return { ...rest, title }
  })
}

export function getScoreOverview(db: DatabaseSync, days = 182): ScoreOverview {
  const today = todayString()
  const weekStart = shiftDate(today, -6)
  const rangeStart = shiftDate(today, -days)

  const total =
    get<{ total: number | null }>(db, 'SELECT SUM(points) AS total FROM score_ledger')?.total ?? 0

  const todayPoints =
    get<{ points: number | null }>(
      db,
      'SELECT SUM(points) AS points FROM score_ledger WHERE settled_date = ?',
      [today],
    )?.points ?? 0

  const weekPoints =
    get<{ points: number | null }>(
      db,
      'SELECT SUM(points) AS points FROM score_ledger WHERE settled_date >= ?',
      [weekStart],
    )?.points ?? 0

  const daily = all<{ date: string; points: number }>(
    db,
    `SELECT settled_date AS date, SUM(points) AS points
     FROM score_ledger
     WHERE settled_date >= ?
     GROUP BY settled_date
     ORDER BY settled_date ASC`,
    [rangeStart],
  )

  return { total, today: todayPoints, week: weekPoints, daily }
}
