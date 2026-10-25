import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Category, CategoryInput } from '@shared/types'
import { all, get } from '../sql'

const CATEGORY_SELECT = `
  SELECT
    id, name, color,
    sort_order AS sortOrder, archived_at AS archivedAt, created_at AS createdAt
  FROM category
`

export function listCategories(db: DatabaseSync): Category[] {
  return all<Category>(
    db,
    `${CATEGORY_SELECT} WHERE archived_at IS NULL ORDER BY sort_order ASC, created_at ASC`,
  )
}

export function getCategory(db: DatabaseSync, id: string): Category | null {
  return get<Category>(db, `${CATEGORY_SELECT} WHERE id = ?`, [id]) ?? null
}

/**
 * 新建或更新分类。
 * 名称唯一由数据库约束保证，冲突时把 SQLite 的英文错误转成可读的中文提示。
 */
export function saveCategory(db: DatabaseSync, input: CategoryInput): Category {
  const name = input.name.trim()
  if (name.length === 0) throw new Error('分类名称不能为空')

  try {
    if (input.id) {
      const existing = getCategory(db, input.id)
      if (!existing) throw new Error('分类不存在')
      db.prepare('UPDATE category SET name = ?, color = ? WHERE id = ?').run(
        name,
        input.color,
        input.id,
      )
      return getCategory(db, input.id) as Category
    }

    const id = randomUUID()
    const nextOrder =
      get<{ next: number }>(db, 'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM category')
        ?.next ?? 0

    db.prepare(
      'INSERT INTO category (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, name, input.color, nextOrder, new Date().toISOString())

    return getCategory(db, id) as Category
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw new Error(`分类「${name}」已存在`)
    }
    throw error
  }
}

/**
 * 删除分类。关联计划的 category_id 因 ON DELETE SET NULL 变成「未分类」，
 * 不连带删除计划 —— 删分类是整理动作，不该有破坏性。
 */
export function removeCategory(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM category WHERE id = ?').run(id)
}
