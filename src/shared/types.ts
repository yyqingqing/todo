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

/** 侧边栏/时间线用的树节点 */
export interface PlanNode extends Plan {
  children: PlanNode[]
  stats: PlanStats
  /** 分类色 token，时间线上用来区分不同领域的计划 */
  categoryColor: string | null
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

/** 清单项 + 它属于哪个计划（临时事项为 null），用于在列表里显示归属 */
export interface TodoWithPlan extends TodoItem {
  planTitle: string | null
  /** 所属计划的分类颜色 token。用于在清单里一眼区分"计划任务"和"临时事项" */
  planColor: string | null
}

/** 数据库状态，用于设置页展示与验收 */
export interface DatabaseInfo {
  path: string
  schemaVersion: number
  sizeBytes: number
}

/* ------------------------------------------------------------------ */
/* 写操作的入参：id 存在即更新，不存在即新建（upsert）                  */
/* ------------------------------------------------------------------ */

export interface CategoryInput {
  id?: string
  name: string
  /** token 名，如 'cat-1' */
  color: string
}

export interface PlanInput {
  id?: string
  parentId: string | null
  categoryId: string | null
  title: string
  note: string | null
  startDate: DateString
  endDate: DateString
}

export interface TaskInput {
  id?: string
  planId: string
  title: string
  note?: string | null
  estMinutes?: number | null
}

/** 带完成状态的任务。done 来自 todo_item，task 自身没有完成态 */
export interface TaskWithState extends Task {
  done: boolean
}

/** 计划详情：一次 IPC 拿全，避免前端瀑布式请求 */
export interface PlanDetail {
  plan: Plan
  category: Category | null
  stats: PlanStats
  tasks: TaskWithState[]
  childPlans: PlanNode[]
}

/* ------------------------------------------------------------------ */
/* 每日清单                                                            */
/* ------------------------------------------------------------------ */

export interface TodoCreateInput {
  title: string
  scheduledDate: DateString
  /** 从计划拉取已有任务时传 */
  taskId?: string | null
  /** 新建时指定归属计划：会在该计划下建一个同名任务再排进清单 */
  planId?: string | null
}

/** 可被拉到今日清单的任务：属于某个计划，且还没有对应的待办 */
export interface PickableTask {
  id: string
  title: string
  planId: string
  planTitle: string
}

/** 悬浮窗状态。锁定时鼠标事件穿透到下层窗口，只能看不能点 */
export interface OverlayState {
  visible: boolean
  locked: boolean
  collapsed: boolean
}

/* ------------------------------------------------------------------ */
/* 日历                                                                */
/* ------------------------------------------------------------------ */

/** 某一天的完成情况。没有待办的日期不会出现在 days 里（稀疏数据） */
export interface CalendarDay {
  date: DateString
  total: number
  done: number
}

/** 与某月有交集的计划，用于画本月跨度 */
export interface CalendarPlan {
  id: string
  /** null 表示是顶层计划，非 null 是子计划。界面上要分开计数 */
  parentId: string | null
  title: string
  startDate: DateString
  endDate: DateString
  /** 分类色 token，null 表示未分类 */
  color: string | null
  /** 0–1，由 stats 算出来 */
  progress: number
}

export interface MonthView {
  year: number
  /** 1–12 */
  month: number
  days: CalendarDay[]
  plans: CalendarPlan[]
}

/* ------------------------------------------------------------------ */
/* 积分                                                                */
/* ------------------------------------------------------------------ */

/** 一条积分流水。append-only，取消完成时追加负数而不是删除原记录 */
export interface ScoreEntry {
  id: string
  sourceType: string
  sourceId: string
  /** 见 shared/domain/score.ts 的 SCORE_REASONS */
  reason: string
  /** 正数为得分，负数为冲正 */
  points: number
  occurredAt: Timestamp
  /** 入账日（本地日期），用于日/周/月榜 */
  settledDate: DateString
  /** 当时的标题快照，列表里显示「哪条待办 / 哪个计划」 */
  title: string | null
}

export interface ScoreOverview {
  total: number
  today: number
  week: number
  /** 最近若干天每天的分值，稀疏（没有得分的天不出现） */
  daily: { date: DateString; points: number }[]
}
