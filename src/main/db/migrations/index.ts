import type { DatabaseSync } from 'node:sqlite'
import { all, get, transaction } from '../sql'
import { up as initUp } from './001-init'
import { up as inheritCategoryUp } from './002-inherit-category'
import { up as studyTimeUp } from './003-study-time'

export interface Migration {
  version: number
  name: string
  up: (db: DatabaseSync) => void
}

/**
 * 迁移列表：**只追加，不修改已发布的条目**。
 * 改历史迁移会导致老用户的库和新用户的库结构不一致，这是最难查的一类 bug。
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', up: initUp },
  { version: 2, name: 'inherit-category', up: inheritCategoryUp },
  { version: 3, name: 'study-time', up: studyTimeUp },
]

/**
 * 当前代码支持的最高 schema 版本。
 *
 * 导入备份时要拿它做上界：备份版本更高说明是更新的应用写的，
 * 老版本去打开会读到不认识的表/列，宁可拒绝也不要半读半错。
 */
export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0

/**
 * 按版本号顺序执行未应用的迁移，返回执行后的 schema 版本。
 *
 * 每条迁移单独一个事务：失败只回滚这一条，不会留下半截 schema。
 */
export function migrate(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    all<{ version: number }>(db, 'SELECT version FROM schema_version').map((row) => row.version),
  )

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue

    transaction(db, () => {
      migration.up(db)
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      )
    })
  }

  const row = get<{ version: number | null }>(
    db,
    'SELECT MAX(version) AS version FROM schema_version',
  )
  return row?.version ?? 0
}
