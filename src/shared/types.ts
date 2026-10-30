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

/**
 * 开机自启的真实状态。
 *
 * enabled 是「系统里实际有没有注册」，不是设置表里记的偏好 ——
 * 安全软件可能拦掉注册表写入，那时 setLoginItemSettings 不抛错但也没生效，
 * 界面必须显示实际值，否则用户以为开机会启动、实际不会。
 */
export interface LaunchState {
  enabled: boolean
  /** 开发环境不支持（exe 在 node_modules 里），打包后才为 true */
  supported: boolean
}
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
  /**
   * 可选：直接排到某一天。
   * 会给这个任务同时创建当天的待办，到那天自动出现在今日清单里，
   * 之后也不会再出现在「从计划添加」的候选里。
   */
  scheduledDate?: DateString | null
}

/** 带完成状态的任务。done 与 scheduledDate 都来自 todo_item */
export interface TaskWithState extends Task {
  done: boolean
  /** 已排期的日期；null 表示还没安排到某一天 */
  scheduledDate: DateString | null
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

/** 悬浮球吸附在哪条边。null = 没有吸附，浮在桌面上任意位置 */
export type OverlayDock = 'left' | 'right'

/**
 * 悬浮窗状态。锁定时鼠标事件穿透到下层窗口，只能看不能点。
 *
 * 两个"收起"状态要分清：
 * - collapsed：用户把它收成了球（意图，会落库）；
 * - hoverExpanded：球吸在屏幕边缘时鼠标移上去的临时展开（临时，不落库）。
 */
export interface OverlayState {
  visible: boolean
  locked: boolean
  collapsed: boolean
  dock: OverlayDock | null
  hoverExpanded: boolean
}

/* ------------------------------------------------------------------ */
/* 学习时间                                                            */
/* ------------------------------------------------------------------ */

/**
 * 计时结束的原因。
 *
 * - manual：用户点了「结束计时」
 * - quit：应用正常退出时收尾
 * - suspend：系统休眠时收尾
 * - crashed：进程被杀 / 断电，下次启动时按最后心跳回收
 */
export type StudyEndReason = 'manual' | 'quit' | 'suspend' | 'crashed'

/** 一次计时的记录。endedAt 为 null 表示还在进行中 */
export interface StudySession {
  id: string
  /** UTC ISO */
  startedAt: string
  /** UTC ISO，进行中为 null */
  endedAt: string | null
  durationSeconds: number
  endReason: StudyEndReason
  planId: string | null
  categoryId: string | null
}

/**
 * 当前计时状态。
 *
 * elapsedSeconds 是主进程给的快照，渲染进程拿它 + 本地时钟自己走秒；
 * 不每秒走 IPC，窗口隐藏时也不需要主进程推。
 */
export interface StudyStatus {
  running: boolean
  /** UTC ISO，没在计时时为 null */
  startedAt: string | null
  elapsedSeconds: number
}

/** 统计分桶粒度 */
export type StudyGranularity = 'day' | 'week' | 'month'

/** 统计图里的一根柱子 */
export interface StudyBucket {
  /** 稳定 key：2026-10-30 / 2026-W44 / 2026-10 */
  key: string
  /** 轴上的短标签：10-30 / W44 / 10月 */
  label: string
  seconds: number
  sessionCount: number
}

export interface StudyStats {
  from: DateString
  to: DateString
  granularity: StudyGranularity
  totalSeconds: number
  sessionCount: number
  /** 单次最长（只算落在区间内的部分） */
  longestSeconds: number
  /** 日均：总时长 ÷ 区间天数，不是 ÷ 有记录的天数 */
  averageSeconds: number
  /** 空桶也补 0，保证柱子连续 */
  buckets: StudyBucket[]
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
  /** 所属根计划的序号，决定跨条颜色（与时间线一致：同一棵树同色） */
  rootIndex: number
  title: string
  startDate: DateString
  endDate: DateString
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
