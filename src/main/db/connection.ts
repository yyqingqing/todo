import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DatabaseInfo } from '@shared/types'
import { app } from 'electron'
import { migrate } from './migrations'
import { get } from './sql'

let instance: DatabaseSync | null = null
let databasePath = ''

/**
 * 数据库放在哪。
 *
 * 打包后放在**安装目录的上一级**：`<安装目录>\..\Qingqing-Data`。
 *
 * 为什么不放在安装目录里面：electron-builder 的卸载器会 `RMDir /r $INSTDIR`
 * 把整个安装目录删干净，而「覆盖安装」= 先卸载再装 —— 数据在 $INSTDIR 里
 * 就意味着每次更新版本都会丢数据。试过在 customUnInstall 里把 data 挪走
 * 再挪回来，实测靠不住（那个钩子在覆盖安装流程里拿不到可靠时机）。
 * 放在同级目录，卸载器根本碰不到，这是最稳的。
 *
 * 装到 Program Files 这类只读位置时，上一级同样不可写，会回落到 userData ——
 * 宁可数据在 C 盘，也不能起来就崩。写权限用探针文件实测，不靠猜。
 *
 * 开发时仍用 userData，避免污染仓库。
 */
function resolveDatabaseDir(): string {
  if (!app.isPackaged) return app.getPath('userData')

  const exeDir = dirname(app.getPath('exe'))
  const portableDir = join(exeDir, '..', 'Qingqing-Data')
  try {
    mkdirSync(portableDir, { recursive: true })
    const probe = join(portableDir, '.writable')
    writeFileSync(probe, '')
    unlinkSync(probe)
    return portableDir
  } catch {
    return app.getPath('userData')
  }
}

/**
 * 打开数据库并跑迁移。必须在 app ready 之后调用（依赖 app.getPath 与可执行文件位置）。
 *
 * 单连接是刻意的：所有写操作都在主进程串行执行，
 * 天然避免两个窗口并发写导致 SQLITE_BUSY。渲染进程一律通过 IPC 访问。
 */
export function openDatabase(): void {
  if (instance) return

  databasePath = join(resolveDatabaseDir(), 'qingqing.db')
  const db = new DatabaseSync(databasePath)

  // WAL：读写不互相阻塞，崩库后恢复也更稳
  db.exec('PRAGMA journal_mode = WAL')
  // 外键默认应为开启，显式写一遍防止将来默认值变化导致 ON DELETE CASCADE 静默失效
  db.exec('PRAGMA foreign_keys = ON')
  // WAL 下 NORMAL 是性能与安全的平衡点（FULL 每次提交都 fsync，太慢）
  db.exec('PRAGMA synchronous = NORMAL')

  migrate(db)
  instance = db
}

export function getDb(): DatabaseSync {
  if (!instance) {
    throw new Error('数据库尚未初始化：openDatabase() 必须在 app ready 之后调用')
  }
  return instance
}

export function closeDatabase(): void {
  instance?.close()
  instance = null
}

export function getDatabaseInfo(): DatabaseInfo {
  const db = getDb()
  const versionRow = get<{ version: number | null }>(
    db,
    'SELECT MAX(version) AS version FROM schema_version',
  )
  const pageCount = get<{ page_count: number }>(db, 'PRAGMA page_count')?.page_count ?? 0
  const pageSize = get<{ page_size: number }>(db, 'PRAGMA page_size')?.page_size ?? 0

  return {
    path: databasePath,
    schemaVersion: versionRow?.version ?? 0,
    sizeBytes: pageCount * pageSize,
  }
}
