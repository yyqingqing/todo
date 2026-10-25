import { contextBridge } from 'electron'

/**
 * 渲染进程唯一能触碰主进程的入口。
 * 阶段 0 是空壳；阶段 1 起按 shared/ipc-contract.ts 的定义逐个挂上方法。
 * 渲染进程永远不要直接 import electron —— 只通过 window.api。
 */
const api = {}

contextBridge.exposeInMainWorld('api', api)
