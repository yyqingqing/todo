import type {
  Category,
  CategoryInput,
  DatabaseInfo,
  DateString,
  LaunchState,
  MonthView,
  OverlayState,
  PickableTask,
  Plan,
  PlanDetail,
  PlanInput,
  PlanNode,
  ScoreEntry,
  ScoreOverview,
  StudyGranularity,
  StudySession,
  StudyStats,
  StudyStatus,
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
     * 设置开机自启。返回系统的**实际**状态（不是传入的意图）：
     * 安全软件拦截时写入会静默失败，界面必须按返回值显示，否则就是在骗用户。
     */
    setLaunchAtLogin(enabled: boolean): Promise<LaunchState>
    /** 读系统里的真实状态。开关显示这个，而不是设置表里的偏好值 */
    getLaunchState(): Promise<LaunchState>
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

  study: {
    /** 开始计时。已经在计时时直接返回当前状态（幂等，双击不会产生两条记录） */
    start(): Promise<StudyStatus>
    /** 结束计时。没在计时时也正常返回 */
    stop(): Promise<StudyStatus>
    status(): Promise<StudyStatus>
    /**
     * 按本地日期闭区间取**已结束**的会话，按开始时间倒序。
     * 跨零点的会话会完整返回，由调用方按需裁剪。
     */
    sessions(from: DateString, to: DateString): Promise<StudySession[]>
    /**
     * 区间统计。granularity 省略时按区间长度自动选（≤31 天按天、≤180 天按周、否则按月）。
     * 跨零点的会话在服务端按本地日切分，不会重复计算。
     */
    stats(query: {
      from: DateString
      to: DateString
      granularity?: StudyGranularity
    }): Promise<StudyStats>
    /**
     * 单次会话超过 4 小时时主进程推一次提醒。
     * 只是提醒，不会自动结束 —— 用户可能在长视频课里。
     */
    onLongSession(callback: (status: StudyStatus) => void): () => void
  }

  overlay: {
    show(): Promise<void>
    hide(): Promise<void>
    /** 切换点击穿透。返回切换后的锁定状态 */
    toggleLocked(): Promise<boolean>
    /** 收起成悬浮球，或展开回面板 */
    toggleCollapsed(): Promise<boolean>
    getState(): Promise<OverlayState>
    /**
     * 开始拖动悬浮球。
     *
     * 球是拖拽区就收不到 click，所以不用 -webkit-app-region，改成
     * 渲染进程按下时通知主进程，由主进程按光标位移搬窗口 —— 这样
     * "拖一下"和"点一下"能靠位移量区分开。
     */
    beginDrag(): Promise<void>
    /** 结束拖动。返回这次是否真的移动过（没移动就是一次点击） */
    endDrag(): Promise<boolean>
  }

  setting: {
    all(): Promise<Record<string, string>>
    set(key: string, value: string): Promise<void>
  }

  /**
   * 主窗口自身的事件。
   *
   * onHidden：窗口被隐藏（缩到托盘）时触发。
   * 界面上有弹窗打开时，光把窗口藏起来并不会重置 React 状态 ——
   * 从托盘恢复后弹窗会原样回来，用户会以为"关不掉"。收到这个事件就关掉弹窗。
   */
  window: {
    onHidden(callback: () => void): () => void
    /**
     * 把发起调用的窗口藏起来（不是关闭）。
     *
     * 用于「钉在桌面」：悬浮窗起来之后主窗口就该退到后台，
     * 走托盘图标随时能回来。不能用 window.close() 代替 ——
     * 关闭行为受设置里的「关闭按钮时」影响，用户选了"直接退出"时会直接把应用关掉。
     */
    hide(): Promise<void>
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
  appLaunchAtLoginState: 'app:launch-at-login-state',

  /** 主窗口被隐藏时主进程 -> 渲染进程的单向通知 */
  windowHidden: 'window:hidden',
  /** 渲染进程 -> 主进程：把发起调用的窗口藏起来 */
  windowHide: 'window:hide',

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

  studyStart: 'study:start',
  studyStop: 'study:stop',
  studyStatus: 'study:status',
  studySessions: 'study:sessions',
  studyStats: 'study:stats',
  /** 主 → 渲染：单次会话过长（4 小时）的提醒 */
  studyLongSession: 'study:long-session',

  settingAll: 'setting:all',
  settingSet: 'setting:set',

  overlayShow: 'overlay:show',
  overlayHide: 'overlay:hide',
  overlayToggleLocked: 'overlay:toggle-locked',
  overlayToggleCollapsed: 'overlay:toggle-collapsed',
  overlayGetState: 'overlay:get-state',
  overlayDragStart: 'overlay:drag-start',
  overlayDragEnd: 'overlay:drag-end',
  /** 主 → 渲染：悬浮窗状态变化 */
  overlayState: 'overlay:state',

  /** 主 → 渲染 的单向广播 */
  dataChanged: 'data:changed',
} as const

/** 广播的实体名。渲染进程用它决定失效哪些 query */
export type DataEntity = 'plan' | 'task' | 'category' | 'todo' | 'score' | 'setting' | 'study'
