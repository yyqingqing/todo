import type { Api } from '@shared/ipc-contract'
import { IPC } from '@shared/ipc-contract'
import { contextBridge, ipcRenderer } from 'electron'

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
  plan: {
    tree: () => ipcRenderer.invoke(IPC.planTree),
  },
  setting: {
    all: () => ipcRenderer.invoke(IPC.settingAll),
    set: (key, value) => ipcRenderer.invoke(IPC.settingSet, key, value),
  },
}

contextBridge.exposeInMainWorld('api', api)
