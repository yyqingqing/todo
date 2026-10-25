import type {
  Category,
  CategoryInput,
  DatabaseInfo,
  DateString,
  PickableTask,
  Plan,
  PlanDetail,
  PlanInput,
  PlanNode,
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
    /** 按给定顺序重写 sort_order，用于同级排序 */
    reorder(planId: string, orderedIds: string[]): Promise<void>
  }

  todo: {
    /** 某一天的清单，按用户排序；每项带上归属计划名，临时事项为 null */
    byDate(date: DateString): Promise<TodoWithPlan[]>
    create(input: TodoCreateInput): Promise<TodoWithPlan>
    /** 完成 / 取消完成，一个方法覆盖两个方向 */
    toggle(id: string): Promise<TodoWithPlan>
    remove(id: string): Promise<void>
    reorder(date: DateString, orderedIds: string[]): Promise<void>
  }
  /** 从计划里挑任务排进清单时用 */
  pickableTasks(): Promise<PickableTask[]>

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
}

/**
 * IPC 通道名集中定义，避免两边手写字符串对不上。
 * 约定：`域:动作`，全小写。
 */
export const IPC = {
  appInfo: 'app:info',

  categoryList: 'category:list',
  categorySave: 'category:save',
  categoryRemove: 'category:remove',

  planTree: 'plan:tree',
  planDetail: 'plan:detail',
  planSave: 'plan:save',
  planRemove: 'plan:remove',

  taskSave: 'task:save',
  taskRemove: 'task:remove',
  taskReorder: 'task:reorder',

  todoByDate: 'todo:by-date',
  todoCreate: 'todo:create',
  todoToggle: 'todo:toggle',
  todoRemove: 'todo:remove',
  todoReorder: 'todo:reorder',

  pickableTasks: 'plan:pickable-tasks',

  settingAll: 'setting:all',
  settingSet: 'setting:set',

  /** 主 → 渲染 的单向广播 */
  dataChanged: 'data:changed',
} as const

/** 广播的实体名。渲染进程用它决定失效哪些 query */
export type DataEntity = 'plan' | 'task' | 'category' | 'todo' | 'score'
