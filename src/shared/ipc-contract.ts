import type { DatabaseInfo, PlanNode } from './types'

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
  plan: {
    /** 完整计划树，含每个节点的任务汇总。空库返回 [] */
    tree(): Promise<PlanNode[]>
  }
  setting: {
    all(): Promise<Record<string, string>>
    set(key: string, value: string): Promise<void>
  }
}

/**
 * IPC 通道名集中定义，避免两边手写字符串对不上。
 * 约定：`域:动作`，全小写。
 */
export const IPC = {
  appInfo: 'app:info',
  planTree: 'plan:tree',
  settingAll: 'setting:all',
  settingSet: 'setting:set',
} as const
