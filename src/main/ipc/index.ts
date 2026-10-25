import { IPC } from '@shared/ipc-contract'
import type { CategoryInput, PlanInput, TaskInput, TodoCreateInput } from '@shared/types'
import { ipcMain } from 'electron'
import { broadcastDataChanged } from '../broadcast'
import { getDatabaseInfo, getDb } from '../db/connection'
import { getMonthView } from '../db/repo/calendar.repo'
import { listCategories, removeCategory, saveCategory } from '../db/repo/category.repo'
import {
  getPlanDetail,
  listPickableTasks,
  listPlanTree,
  removePlan,
  savePlan,
} from '../db/repo/plan.repo'
import { getScoreOverview, listRecentScores } from '../db/repo/score.repo'
import { allSettings, setSetting } from '../db/repo/setting.repo'
import { removeTask, reorderTasks, saveTask } from '../db/repo/task.repo'
import {
  createTodo,
  listTodosByDate,
  removeTodo,
  reorderTodos,
  rolloverTodos,
} from '../db/repo/todo.repo'
import { toggleTodoWithScore } from '../services/todo.service'
import {
  getOverlayState,
  hideOverlay,
  showOverlay,
  toggleOverlayCollapsed,
  toggleOverlayLocked,
} from '../windows/overlay'

/**
 * 注册所有 IPC handler。
 *
 * 约定：handler 只做「参数校验 → 调用 repo → 广播」，不写业务规则。
 * 业务规则放 shared/domain（纯函数，可单测），事务边界等出现跨表写入再抽 service 层。
 */

/* ---------------- 入参校验 ---------------- */
/* IPC 入参来自渲染进程，按不可信数据处理。一个类型错误就足以让写操作静默失败。 */

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`参数校验失败：${field} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`参数校验失败：${field} 必须是非空字符串`)
  }
  return value
}

function optionalId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error('参数校验失败：id 必须是字符串')
  return value
}

function nullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`参数校验失败：${field} 必须是字符串或 null`)
  return value
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`参数校验失败：${field} 必须是数字或 null`)
  }
  return value
}

/** 只接受本地日历日格式，防止 '2026-13-45' 这种写进库后再也查不出来 */
function requireDate(value: unknown, field: string): string {
  const text = requireString(value, field)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`参数校验失败：${field} 必须是 YYYY-MM-DD 格式`)
  }
  return text
}

function parseCategoryInput(raw: unknown): CategoryInput {
  const record = asRecord(raw, 'category')
  return {
    id: optionalId(record['id']),
    name: requireString(record['name'], 'name'),
    color: requireString(record['color'], 'color'),
  }
}

function parsePlanInput(raw: unknown): PlanInput {
  const record = asRecord(raw, 'plan')
  const parentId = nullableString(record['parentId'], 'parentId')
  return {
    id: optionalId(record['id']),
    parentId,
    categoryId: nullableString(record['categoryId'], 'categoryId'),
    title: requireString(record['title'], 'title'),
    note: nullableString(record['note'], 'note'),
    startDate: requireDate(record['startDate'], 'startDate'),
    endDate: requireDate(record['endDate'], 'endDate'),
  }
}

function parseTaskInput(raw: unknown): TaskInput {
  const record = asRecord(raw, 'task')
  return {
    id: optionalId(record['id']),
    planId: requireString(record['planId'], 'planId'),
    title: requireString(record['title'], 'title'),
    note: nullableString(record['note'], 'note'),
    estMinutes: nullableNumber(record['estMinutes'], 'estMinutes'),
  }
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`参数校验失败：${field} 必须是数组`)
  return value.map((item, index) => requireString(item, `${field}[${index}]`))
}

function parseTodoInput(raw: unknown): TodoCreateInput {
  const record = asRecord(raw, 'todo')
  return {
    title: requireString(record['title'], 'title'),
    scheduledDate: requireDate(record['scheduledDate'], 'scheduledDate'),
    taskId: nullableString(record['taskId'], 'taskId'),
    planId: nullableString(record['planId'], 'planId'),
  }
}

/* ---------------- handler 注册 ---------------- */

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.appInfo, () => getDatabaseInfo())

  ipcMain.handle(IPC.categoryList, () => listCategories(getDb()))
  ipcMain.handle(IPC.categorySave, (_event, raw: unknown) => {
    const category = saveCategory(getDb(), parseCategoryInput(raw))
    broadcastDataChanged('category')
    return category
  })
  ipcMain.handle(IPC.categoryRemove, (_event, id: unknown) => {
    removeCategory(getDb(), requireString(id, 'id'))
    broadcastDataChanged('category')
  })

  ipcMain.handle(IPC.planTree, () => listPlanTree(getDb()))
  ipcMain.handle(IPC.planDetail, (_event, id: unknown) =>
    getPlanDetail(getDb(), requireString(id, 'id')),
  )
  ipcMain.handle(IPC.planSave, (_event, raw: unknown) => {
    const plan = savePlan(getDb(), parsePlanInput(raw))
    broadcastDataChanged('plan')
    return plan
  })
  ipcMain.handle(IPC.planRemove, (_event, id: unknown) => {
    removePlan(getDb(), requireString(id, 'id'))
    broadcastDataChanged('plan')
  })

  ipcMain.handle(IPC.taskSave, (_event, raw: unknown) => {
    const task = saveTask(getDb(), parseTaskInput(raw))
    broadcastDataChanged('task')
    return task
  })
  ipcMain.handle(IPC.taskRemove, (_event, id: unknown) => {
    removeTask(getDb(), requireString(id, 'id'))
    broadcastDataChanged('task')
  })
  ipcMain.handle(IPC.taskReorder, (_event, planId: unknown, orderedIds: unknown) => {
    reorderTasks(
      getDb(),
      requireString(planId, 'planId'),
      parseStringArray(orderedIds, 'orderedIds'),
    )
    broadcastDataChanged('task')
  })

  ipcMain.handle(IPC.settingAll, () => allSettings(getDb()))
  ipcMain.handle(IPC.settingSet, (_event, key: unknown, value: unknown) => {
    setSetting(getDb(), requireString(key, 'key'), requireString(value, 'value'))
    // 设置变更也要广播：悬浮窗透明度、关闭行为都依赖它
    broadcastDataChanged('setting')
  })

  ipcMain.handle(IPC.pickableTasks, () => listPickableTasks(getDb()))

  ipcMain.handle(IPC.calendarMonth, (_event, year: unknown, month: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year)) {
      throw new Error('参数校验失败：year 必须是整数')
    }
    if (typeof month !== 'number' || month < 1 || month > 12) {
      throw new Error('参数校验失败：month 必须在 1–12 之间')
    }
    return getMonthView(getDb(), year, month)
  })

  ipcMain.handle(IPC.scoreRecent, (_event, limit: unknown) => {
    const size = typeof limit === 'number' && limit > 0 ? Math.min(Math.floor(limit), 500) : 100
    return listRecentScores(getDb(), size)
  })
  ipcMain.handle(IPC.scoreOverview, () => getScoreOverview(getDb()))

  ipcMain.handle(IPC.todoByDate, (_event, date: unknown) =>
    listTodosByDate(getDb(), requireDate(date, 'date')),
  )
  ipcMain.handle(IPC.todoCreate, (_event, raw: unknown) => {
    const todo = createTodo(getDb(), parseTodoInput(raw))
    broadcastDataChanged('todo')
    return todo
  })
  // 完成状态会改变计划进度，而 data-sync 里 todo 的失效范围已经包含 plan，
  // 所以这里只广播一次 todo 就够了
  ipcMain.handle(IPC.todoToggle, (_event, id: unknown) => {
    // 走 service 而不是直接改状态：记账和改状态必须在同一个事务里
    const todo = toggleTodoWithScore(getDb(), requireString(id, 'id'))
    broadcastDataChanged('todo')
    broadcastDataChanged('score')
    return todo
  })
  ipcMain.handle(IPC.todoRemove, (_event, id: unknown) => {
    removeTodo(getDb(), requireString(id, 'id'))
    broadcastDataChanged('todo')
  })
  ipcMain.handle(IPC.todoReorder, (_event, date: unknown, orderedIds: unknown) => {
    reorderTodos(getDb(), requireDate(date, 'date'), parseStringArray(orderedIds, 'orderedIds'))
    broadcastDataChanged('todo')
  })
  ipcMain.handle(IPC.todoRollover, (_event, ids: unknown, targetDate: unknown) => {
    const moved = rolloverTodos(
      getDb(),
      parseStringArray(ids, 'ids'),
      requireDate(targetDate, 'targetDate'),
    )
    broadcastDataChanged('todo')
    return moved
  })

  ipcMain.handle(IPC.overlayShow, () => showOverlay())
  ipcMain.handle(IPC.overlayHide, () => hideOverlay())
  ipcMain.handle(IPC.overlayToggleLocked, () => toggleOverlayLocked())
  ipcMain.handle(IPC.overlayToggleCollapsed, () => toggleOverlayCollapsed())
  ipcMain.handle(IPC.overlayGetState, () => getOverlayState())
}
