import type { Api } from '@shared/ipc-contract'
import { IPC } from '@shared/ipc-contract'
import type { OverlayState, StudyStatus } from '@shared/types'
import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'

/**
 * 渲染进程唯一能触碰主进程的入口。
 *
 * 形状必须与 shared/ipc-contract.ts 的 Api 完全一致 —— 少一个方法会编译报错。
 * ipcRenderer.invoke 返回 Promise<any>，靠 Api 的类型标注把它收窄成具体类型。
 */
const api: Api = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir),
    setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC.appSetLaunchAtLogin, enabled),
    getLaunchState: () => ipcRenderer.invoke(IPC.appLaunchAtLoginState),
    isLaunchAtLoginSupported: () => ipcRenderer.invoke(IPC.appLaunchAtLoginSupported),
  },

  category: {
    list: () => ipcRenderer.invoke(IPC.categoryList),
    save: (input) => ipcRenderer.invoke(IPC.categorySave, input),
    remove: (id) => ipcRenderer.invoke(IPC.categoryRemove, id),
  },

  plan: {
    tree: () => ipcRenderer.invoke(IPC.planTree),
    detail: (id) => ipcRenderer.invoke(IPC.planDetail, id),
    save: (input) => ipcRenderer.invoke(IPC.planSave, input),
    remove: (id) => ipcRenderer.invoke(IPC.planRemove, id),
  },

  task: {
    save: (input) => ipcRenderer.invoke(IPC.taskSave, input),
    remove: (id) => ipcRenderer.invoke(IPC.taskRemove, id),
  },

  todo: {
    byDate: (date) => ipcRenderer.invoke(IPC.todoByDate, date),
    create: (input) => ipcRenderer.invoke(IPC.todoCreate, input),
    toggle: (id) => ipcRenderer.invoke(IPC.todoToggle, id),
    remove: (id) => ipcRenderer.invoke(IPC.todoRemove, id),
    rollover: (ids, targetDate) => ipcRenderer.invoke(IPC.todoRollover, ids, targetDate),
  },

  pickableTasks: () => ipcRenderer.invoke(IPC.pickableTasks),

  calendar: {
    month: (year, month) => ipcRenderer.invoke(IPC.calendarMonth, year, month),
  },

  score: {
    recent: (limit) => ipcRenderer.invoke(IPC.scoreRecent, limit),
    overview: () => ipcRenderer.invoke(IPC.scoreOverview),
  },

  overlay: {
    show: () => ipcRenderer.invoke(IPC.overlayShow),
    hide: () => ipcRenderer.invoke(IPC.overlayHide),
    toggleLocked: () => ipcRenderer.invoke(IPC.overlayToggleLocked),
    toggleCollapsed: () => ipcRenderer.invoke(IPC.overlayToggleCollapsed),
    getState: () => ipcRenderer.invoke(IPC.overlayGetState),
    beginDrag: () => ipcRenderer.invoke(IPC.overlayDragStart),
    endDrag: () => ipcRenderer.invoke(IPC.overlayDragEnd),
  },

  study: {
    start: () => ipcRenderer.invoke(IPC.studyStart),
    stop: () => ipcRenderer.invoke(IPC.studyStop),
    status: () => ipcRenderer.invoke(IPC.studyStatus),
    sessions: (from, to) => ipcRenderer.invoke(IPC.studySessions, from, to),
    stats: (query) => ipcRenderer.invoke(IPC.studyStats, query),
    onLongSession: (callback) => {
      const handler = (_event: IpcRendererEvent, status: StudyStatus): void => {
        callback(status)
      }
      ipcRenderer.on(IPC.studyLongSession, handler)
      return () => {
        ipcRenderer.removeListener(IPC.studyLongSession, handler)
      }
    },
  },

  setting: {
    all: () => ipcRenderer.invoke(IPC.settingAll),
    set: (key, value) => ipcRenderer.invoke(IPC.settingSet, key, value),
  },

  window: {
    hide: () => ipcRenderer.invoke(IPC.windowHide),
    onHidden: (callback) => {
      const handler = (): void => {
        callback()
      }
      ipcRenderer.on(IPC.windowHidden, handler)
      return () => {
        ipcRenderer.removeListener(IPC.windowHidden, handler)
      }
    },
  },

  onDataChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, entity: string): void => {
      callback(entity)
    }
    ipcRenderer.on(IPC.dataChanged, handler)

    // 必须返回解绑函数：渲染进程重复挂载（HMR、StrictMode）时不清理会累积监听器
    return () => {
      ipcRenderer.removeListener(IPC.dataChanged, handler)
    }
  },

  onOverlayStateChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, state: OverlayState): void => {
      callback(state)
    }
    ipcRenderer.on(IPC.overlayState, handler)
    return () => {
      ipcRenderer.removeListener(IPC.overlayState, handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
