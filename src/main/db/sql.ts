import type { DatabaseSync, StatementSync } from 'node:sqlite'

/**
 * node:sqlite 的薄封装。
 *
 * 为什么不用 better-sqlite3：它是 native 模块，必须用匹配 Electron ABI 重新编译，
 * 而这台机器没有 MSVC（node-gyp 报 "Could not find any Visual Studio installation"）。
 * Electron 45 内置 Node 24，自带 node:sqlite，零编译、零依赖、升级 Electron 也不会坏。
 *
 * 代价：node:sqlite 的 API 比 better-sqlite3 朴素——没有 db.transaction() 包装、
 * 没有 db.pragma()，语句返回值是 unknown。这里补上这三件事，让 repo 层保持干净。
 */

/** 与 node:sqlite 允许的绑定值对齐 */
export type SqlParam = string | number | bigint | null | Uint8Array

export function all<T>(db: DatabaseSync, sql: string, params: readonly SqlParam[] = []): T[] {
  const statement: StatementSync = db.prepare(sql)
  return statement.all(...params) as T[]
}

export function get<T>(
  db: DatabaseSync,
  sql: string,
  params: readonly SqlParam[] = [],
): T | undefined {
  const statement: StatementSync = db.prepare(sql)
  return statement.get(...params) as T | undefined
}

export function run(db: DatabaseSync, sql: string, params: readonly SqlParam[] = []): void {
  db.prepare(sql).run(...params)
}

/**
 * 事务包装。SQLite 不支持嵌套 BEGIN，所以这里不做重入处理 ——
 * 一旦出现嵌套会直接抛错，比静默地把两条语句塞进同一个事务更安全。
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
