import type {
  Category,
  CategoryInput,
  DatabaseInfo,
  DateString,
  MonthView,
  OverlayState,
  PickableTask,
  Plan,
  PlanDetail,
  PlanInput,
  PlanNode,
  ScoreEntry,
  ScoreOverview,
  Task,
  TaskInput,
  TodoCreateInput,
  TodoWithPlan,
} from './types'
/**
 * 主进程与渲染进程之间的唯一契约。
 *
 * - preload 按这个形状挂到 `window.api`
 * - main 按这个形状注册 handler
 *
 * 任何一侧改动这里，另一侧会立刻类型报错 —— 这是防止两边漂移的唯一手段。
 * 新增方法：先加到这里，再补 IPC 常量，最后两边各自实现。
 */
export interface Api {
  app: {
    info(): Promise<DatabaseInfo>
    /** 在系统文件管理器里打开数据目录，方便手动备份 qingqing.db */
    openDataDir(): Promise<void>
    /**
     * 开关开机自启。返回是否真正写入了系统（开发环境返回 false）。
     * 开发环境下 exe 是 node_modules 里的 electron.exe，注册后开机会启动一个没有
     * dev server 的空白窗口，所以只在打包后生效。
     */
    setLaunchAtLogin(enabled: boolean): Promise<boolean>
    /** 当前环境是否支持开机自启（= 是否已打包） */
    isLaunchAtLoginSupported(): Promise<boolean>
  }

  category: {
    list(): Promise<Category[]>
    save(input: CategoryInput): Promise<Category>
    remove(id: string): Promise<void>
  }

  plan: {
    /** 完整计划树，含每个节点的任务汇总。空库返回 [] */
    tree(): Promise<PlanNode[]>
    detail(id: string): Promise<PlanDetail | null>
    /** id 存在即更新，不存在即新建 */
    save(input: PlanInput): Promise<Plan>
    remove(id: string): Promise<void>
  }

  task: {
    save(input: TaskInput): Promise<Task>
    remove(id: string): Promise<void>
  }

  todo: {
    /** 某一天的清单，按用户排序；每项带上归属计划名，临时事项为 null */
    byDate(date: DateString): Promise<TodoWithPlan[]>
    create(input: TodoCreateInput): Promise<TodoWithPlan>
    /** 完成 / 取消完成，一个方法覆盖两个方向 */
    toggle(id: string): Promise<TodoWithPlan>
    remove(id: string): Promise<void>
    /**
     * 顺延到指定日期，返回实际移动的条数。
     * 只动 scheduled_date，origin_date 永远不变（"拖延几天"的统计靠它）。
     */
    rollover(ids: string[], targetDate: DateString): Promise<number>
  }
  /** 从计划里挑任务排进清单时用 */
  pickableTasks(): Promise<PickableTask[]>

  calendar: {
    /** year 如 2026，month 为 1–12 */
    month(year: number, month: number): Promise<MonthView>
  }

  score: {
    /** 最近的流水，按时间倒序 */
    recent(limit: number): Promise<ScoreEntry[]>
    overview(): Promise<ScoreOverview>
  }

  overlay: {
    show(): Promise<void>
    hide(): Promise<void>
    /** 切换点击穿透。返回切换后的锁定状态 */
    toggleLocked(): Promise<boolean>
    /** 折叠成只有标题条，或展开 */
    toggleCollapsed(): Promise<boolean>
    getState(): Promise<OverlayState>
  }

  setting: {
    all(): Promise<Record<string, string>>
    set(key: string, value: string): Promise<void>
  }

  /**
   * 订阅数据变更。主进程在每次写操作完成后广播实体名，
   * 渲染进程据此精确失效对应的 query。
   * 返回取消订阅函数 —— 调用方必须在卸载时清理，否则重复挂载会累积监听器。
   */
  onDataChanged(callback: (entity: string) => void): () => void

  /** 订阅悬浮窗状态变化（锁定 / 折叠）。同样返回解绑函数 */
  onOverlayStateChanged(callback: (state: OverlayState) => void): () => void
}

/**
 * IPC 通道名集中定义，避免两边手写字符串对不上。
 * 约定：`域:动作`，全小写。
 */
export const IPC = {
  appInfo: 'app:info',
  appOpenDataDir: 'app:open-data-dir',
  appSetLaunchAtLogin: 'app:set-launch-at-login',
  appLaunchAtLoginSupported: 'app:launch-at-login-supported',

  categoryList: 'category:list',
  categorySave: 'category:save',
  categoryRemove: 'category:remove',

  planTree: 'plan:tree',
  planDetail: 'plan:detail',
  planSave: 'plan:save',
  planRemove: 'plan:remove',

  taskSave: 'task:save',
  taskRemove: 'task:remove',

  todoByDate: 'todo:by-date',
  todoCreate: 'todo:create',
  todoToggle: 'todo:toggle',
  todoRemove: 'todo:remove',
  todoRollover: 'todo:rollover',

  pickableTasks: 'plan:pickable-tasks',

  calendarMonth: 'calendar:month',

  scoreRecent: 'score:recent',
  scoreOverview: 'score:overview',

  settingAll: 'setting:all',
  settingSet: 'setting:set',

  overlayShow: 'overlay:show',
  overlayHide: 'overlay:hide',
  overlayToggleLocked: 'overlay:toggle-locked',
  overlayToggleCollapsed: 'overlay:toggle-collapsed',
  overlayGetState: 'overlay:get-state',
  /** 主 → 渲染：悬浮窗状态变化 */
  overlayState: 'overlay:state',

  /** 主 → 渲染 的单向广播 */
  dataChanged: 'data:changed',
} as const

/** 广播的实体名。渲染进程用它决定失效哪些 query */
export type DataEntity = 'plan' | 'task' | 'category' | 'todo' | 'score' | 'setting'
