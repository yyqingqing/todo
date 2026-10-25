import type { DatabaseSync } from 'node:sqlite'

/**
 * 初始表结构。
 *
 * 几条建模决定的理由（改之前先读，否则会破坏后面阶段的统计口径）：
 *
 * 1. `todo_item.task_id` 同时 UNIQUE 且可空。UNIQUE 保证一个任务只对应一条待办
 *    （v1 不做周期任务，这个前提成立）；SQLite 允许多个 NULL，所以临时事项不受限制。
 *    任务被删时 SET NULL，记录变孤儿，但 title 快照还在，历史不会变成空白。
 *
 * 2. `task` 没有 done 状态。完成态只存在 `todo_item` 上，避免"任务已完成"和
 *    "某条待办已完成"两套语义打架。计划完成度靠 join 派生，不冗余存储。
 *
 * 3. `origin_date` 与 `scheduled_date` 分离。这是"拖延天数""按时完成率"的唯一来源，
 *    顺延永远不改 origin_date。
 *
 * 4. `score_ledger` 有两套幂等键：
 *    - event_id：客户端生成，防双击/重试导致的重复入账
 *    - unique_key：一次性成就的业务键（如 'plan_done:<id>'），普通流水为 NULL
 *    状态派生型流水靠 points 正负抵消，所以不能对 (source_id, reason) 加唯一约束，
 *    否则"取消完成后再完成"就加不上分了。
 */
export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE category (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      color       TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE plan (
      id           TEXT PRIMARY KEY,
      parent_id    TEXT REFERENCES plan(id) ON DELETE CASCADE,
      category_id  TEXT REFERENCES category(id) ON DELETE SET NULL,
      title        TEXT NOT NULL,
      note         TEXT,
      start_date   TEXT NOT NULL,
      end_date     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      CHECK (end_date >= start_date)
    );
    CREATE INDEX idx_plan_parent ON plan(parent_id);
    CREATE INDEX idx_plan_range  ON plan(start_date, end_date);

    CREATE TABLE task (
      id          TEXT PRIMARY KEY,
      plan_id     TEXT NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      note        TEXT,
      est_minutes INTEGER,
      status      TEXT NOT NULL DEFAULT 'open',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX idx_task_plan ON task(plan_id);

    CREATE TABLE todo_item (
      id             TEXT PRIMARY KEY,
      task_id        TEXT UNIQUE REFERENCES task(id) ON DELETE SET NULL,
      title          TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      origin_date    TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending',
      completed_at   TEXT,
      rollover_count INTEGER NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE INDEX idx_todo_date ON todo_item(scheduled_date, status);
    CREATE INDEX idx_todo_task ON todo_item(task_id);

    CREATE TABLE rollover_log (
      id           TEXT PRIMARY KEY,
      todo_item_id TEXT NOT NULL REFERENCES todo_item(id) ON DELETE CASCADE,
      from_date    TEXT NOT NULL,
      to_date      TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX idx_rollover_item ON rollover_log(todo_item_id);

    CREATE TABLE score_ledger (
      id           TEXT PRIMARY KEY,
      event_id     TEXT NOT NULL UNIQUE,
      unique_key   TEXT UNIQUE,
      source_type  TEXT NOT NULL,
      source_id    TEXT NOT NULL,
      reason       TEXT NOT NULL,
      points       INTEGER NOT NULL,
      occurred_at  TEXT NOT NULL,
      settled_date TEXT NOT NULL,
      meta         TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX idx_score_date ON score_ledger(settled_date);
    CREATE INDEX idx_score_src  ON score_ledger(source_type, source_id);

    CREATE TABLE setting (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}
