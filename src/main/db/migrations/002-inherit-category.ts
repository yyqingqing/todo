import type { DatabaseSync } from 'node:sqlite'

/**
 * 让所有子计划的分类对齐它的根计划。
 *
 * 规则从这一版开始是「子计划继承根计划的分类，不可单独设置」，
 * 但之前的数据允许子计划有自己的分类 —— 这里一次性对齐，避免界面显示与规则矛盾。
 *
 * 用递归 CTE 从根往下传 category_id：多层嵌套时也能拿到真正的根分类，
 * 而不是只看父计划（父计划本身也可能是子计划）。
 */
export function up(db: DatabaseSync): void {
  db.exec(`
    WITH RECURSIVE root_category(id, category_id) AS (
      SELECT id, category_id FROM plan WHERE parent_id IS NULL
      UNION ALL
      SELECT p.id, r.category_id
      FROM plan p
      JOIN root_category r ON p.parent_id = r.id
    )
    UPDATE plan
    SET category_id = (
      SELECT category_id FROM root_category WHERE root_category.id = plan.id
    )
    WHERE parent_id IS NOT NULL;
  `)
}
