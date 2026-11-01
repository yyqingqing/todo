import { copyFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ExportResult, ImportResult } from '@shared/types'
import { app, dialog } from 'electron'
import { closeDatabase, getDatabasePath, getDb } from './db/connection'
import { CURRENT_SCHEMA_VERSION } from './db/migrations'

function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

/**
 * 导出：把数据库文件复制出去。
 *
 * 不做 JSON 序列化 —— 现在 9 张表，手写一遍序列化/反序列化，
 * 每个字段漏一个就丢数据，而且以后加迁移还要同步维护。
 * 数据库文件本身就是完整快照，导入时 migrate() 会自动把旧库升到当前版本。
 *
 * 复制前必须 checkpoint：WAL 模式下最近的写入可能还在 -wal 里，
 * 不合并就直接 copyFile，复制出来的是"少了最后几条"的库。
 */
export async function exportDatabase(): Promise<ExportResult> {
  getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出数据',
    defaultPath: `青青备份-${timestamp()}.db`,
    filters: [{ name: '青青数据文件', extensions: ['db'] }],
  })
  if (canceled || !filePath) return { saved: false }

  await copyFile(getDatabasePath(), filePath)
  return { saved: true, path: filePath }
}

/**
 * 校验一个文件能不能当备份导入。
 *
 * 只读打开，检查有没有 schema_version 表、版本号是否超过当前支持的上界。
 * 版本更高说明是更新的应用写的，当前代码不认识那些表/列 —— 宁可拒绝，
 * 也不要半读半错之后把用户的数据写坏。
 */
function validateBackup(path: string): { ok: true } | { ok: false; reason: string } {
  let probe: DatabaseSync | null = null
  try {
    probe = new DatabaseSync(path, { readOnly: true })
    const row = probe.prepare('SELECT MAX(version) AS version FROM schema_version').get() as
      | { version: number | null }
      | undefined

    if (!row || typeof row.version !== 'number') {
      return { ok: false, reason: '这个文件里没有版本信息，不是青青的数据文件。' }
    }
    if (row.version > CURRENT_SCHEMA_VERSION) {
      return {
        ok: false,
        reason: `这个备份来自更新的版本（数据版本 v${row.version}），当前应用只支持到 v${CURRENT_SCHEMA_VERSION}。请先升级应用。`,
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: '文件无法识别，可能已损坏或不是青青的数据文件。' }
  } finally {
    probe?.close()
  }
}

/**
 * 导入：用备份文件替换当前数据库。
 *
 * 三步，缺一不可：
 * 1. 校验文件（挡住陌生文件和更高版本的备份）
 * 2. 自动备份当前库 —— 用户选错文件时还能回去
 * 3. 关连接再替换 —— Windows 上文件被 sqlite 打开时无法覆盖
 *
 * 替换完调用方要负责重启应用：当前进程的数据库连接已经关掉了，
 * 继续用下去只会是一堆「数据库尚未初始化」。
 */
export async function importDatabase(): Promise<ImportResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '导入数据',
    properties: ['openFile'],
    filters: [{ name: '青青数据文件', extensions: ['db'] }],
  })
  const source = filePaths[0]
  if (canceled || !source) return { imported: false }

  const sourceInfo = await stat(source).catch(() => null)
  if (!sourceInfo || !sourceInfo.isFile()) {
    return { imported: false, error: '选中的不是可读文件。' }
  }

  const check = validateBackup(source)
  if (!check.ok) return { imported: false, error: check.reason }

  const dbPath = getDatabasePath()

  // 自动备份当前库：导入是破坏性的，用户点错一次不能没有退路
  const backupPath = join(dirname(dbPath), `${basename(dbPath, '.db')}-导入前-${timestamp()}.db`)
  await copyFile(dbPath, backupPath)

  closeDatabase()

  // WAL 的两个附属文件必须一起清掉，否则新库会读到旧库的未合并事务
  await rm(`${dbPath}-wal`, { force: true })
  await rm(`${dbPath}-shm`, { force: true })
  await copyFile(source, dbPath)

  return { imported: true, backupPath }
}

/** 导入成功后重启应用：数据库连接已关闭，继续跑只会到处报错 */
export function relaunchAfterImport(): void {
  app.relaunch()
  app.exit(0)
}
