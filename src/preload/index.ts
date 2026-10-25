import type { Api } from '@shared/ipc-contract'
import { IPC } from '@shared/ipc-contract'
import type { OverlayState } from '@shared/types'
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
    reorder: (planId, orderedIds) => ipcRenderer.invoke(IPC.taskReorder, planId, orderedIds),
  },

  todo: {
    byDate: (date) => ipcRenderer.invoke(IPC.todoByDate, date),
    create: (input) => ipcRenderer.invoke(IPC.todoCreate, input),
    toggle: (id) => ipcRenderer.invoke(IPC.todoToggle, id),
    remove: (id) => ipcRenderer.invoke(IPC.todoRemove, id),
    reorder: (date, orderedIds) => ipcRenderer.invoke(IPC.todoReorder, date, orderedIds),
    rollover: (ids, targetDate) => ipcRenderer.invoke(IPC.todoRollover, ids, targetDate),
  },

  pickableTasks: () => ipcRenderer.invoke(IPC.pickableTasks),

  overlay: {
    show: () => ipcRenderer.invoke(IPC.overlayShow),
    hide: () => ipcRenderer.invoke(IPC.overlayHide),
    toggleLocked: () => ipcRenderer.invoke(IPC.overlayToggleLocked),
    toggleCollapsed: () => ipcRenderer.invoke(IPC.overlayToggleCollapsed),
    getState: () => ipcRenderer.invoke(IPC.overlayGetState),
  },

  setting: {
    all: () => ipcRenderer.invoke(IPC.settingAll),
    set: (key, value) => ipcRenderer.invoke(IPC.settingSet, key, value),
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
