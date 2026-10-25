/**
 * 主进程与渲染进程共享的实体类型。
 *
 * 两个约定（贯穿全项目，改之前先看这里）：
 * 1. 日期用本地日历日字符串 `YYYY-MM-DD`，表示"哪一天"，不能用时间戳反推
 * 2. 时间戳用 UTC ISO 字符串，表示"何时发生"
 * 两者不混用：`scheduled_date` 是日期，`completed_at` 是时间戳。
 */

/** 本地日历日，YYYY-MM-DD */
export type DateString = string
/** UTC ISO 时间戳 */
export type Timestamp = string

export type PlanStatus = 'active' | 'done' | 'archived'
export type TaskStatus = 'open' | 'archived'
export type TodoStatus = 'pending' | 'done' | 'dropped'

/** 分类：横向维度，平的，只管配色与筛选 */
export interface Category {
  id: string
  name: string
  /** token 名（如 'cat-1'），不存裸 hex */
  color: string
  sortOrder: number
  archivedAt: Timestamp | null
  createdAt: Timestamp
}

/** 计划：可嵌套的树，有起止时间 */
export interface Plan {
  id: string
  parentId: string | null
  categoryId: string | null
  title: string
  note: string | null
  startDate: DateString
  endDate: DateString
  status: PlanStatus
  sortOrder: number
  completedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** 计划的任务汇总。父计划由子计划累加得到，不单独加权 */
export interface PlanStats {
  taskTotal: number
  taskDone: number
}

/** 侧边栏用的树节点 */
export interface PlanNode extends Plan {
  children: PlanNode[]
  stats: PlanStats
}

/** 任务：计划的叶子，必须归属一个计划。完成状态由 todo_item 派生，自身没有 done */
export interface Task {
  id: string
  planId: string
  title: string
  note: string | null
  estMinutes: number | null
  status: TaskStatus
  sortOrder: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** 每日待办：task 在某一天的实例；临时事项 taskId 为 null */
export interface TodoItem {
  id: string
  taskId: string | null
  title: string
  scheduledDate: DateString
  /** 首次排期日，顺延不改它 —— 这是"拖延"统计的唯一来源 */
  originDate: DateString
  status: TodoStatus
  completedAt: Timestamp | null
  rolloverCount: number
  sortOrder: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** 数据库状态，用于设置页展示与验收 */
export interface DatabaseInfo {
  path: string
  schemaVersion: number
  sizeBytes: number
}
