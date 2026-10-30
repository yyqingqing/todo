import type { DatabaseSync } from 'node:sqlite'

/**
 * 学习时长统计。
 *
 * 表里只存"一次计时的原始事实"，统计口径（跨天切分、周/月分桶）全部在
 * shared/domain/study.ts 用纯函数算 —— 时间戳只有 UTC ISO 一种表示，
 * 按本地日期分组不能靠 SQL 里切字符串。
 *
 * 为什么先落库再计时：进程被 taskkill / 断电时没有代码会执行，
 * "开始过"这件事必须先写进库，下次启动才发现得了（ended_at IS NULL）。
 */
export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE study_session (
      id               TEXT PRIMARY KEY,
      started_at       TEXT NOT NULL,
      -- 心跳。进程被强杀时，它就是最接近真实的结束时间
      last_seen_at     TEXT NOT NULL,
      ended_at         TEXT,
      -- 结束时固化，统计接口不用反复做时间相减
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      status           TEXT NOT NULL DEFAULT 'running',
      end_reason       TEXT NOT NULL DEFAULT 'running',
      -- 预留给"按计划/分类统计"（v1 恒为 NULL）。ON DELETE SET NULL：
      -- 计划被删后时长仍然保留，归入"未归类"，历史不会消失
      plan_id          TEXT REFERENCES plan(id) ON DELETE SET NULL,
      category_id      TEXT REFERENCES category(id) ON DELETE SET NULL,
      note             TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE INDEX idx_study_started  ON study_session(started_at);
    CREATE INDEX idx_study_plan     ON study_session(plan_id);
    CREATE INDEX idx_study_category ON study_session(category_id);

    -- 同一时刻只允许一个正在计时的会话：靠约束，不靠代码自觉。
    -- 不能写在 ended_at 上：SQLite 里多个 NULL 在唯一索引中互不冲突，约束不成立
    CREATE UNIQUE INDEX idx_study_running ON study_session(status) WHERE status = 'running';
  `)
}
