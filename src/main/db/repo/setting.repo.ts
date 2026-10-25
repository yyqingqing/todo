import type { DatabaseSync } from 'node:sqlite'
import { all } from '../sql'

/**
 * 设置项统一以 JSON 字符串存 value。
 * 用 key-value 而不是固定列：加一个设置项不需要迁移，符合"对扩展开放"。
 */
export function allSettings(db: DatabaseSync): Record<string, string> {
  const rows = all<{ key: string; value: string }>(db, 'SELECT key, value FROM setting')
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}
